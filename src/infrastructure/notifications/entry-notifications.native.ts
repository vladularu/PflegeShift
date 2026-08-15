import { Temporal } from "@js-temporal/polyfill";
import * as Notifications from "expo-notifications";
import type { SQLiteDatabase } from "expo-sqlite";

import type { CalendarEntry, EntryNotification } from "@/domain/types";
import { expandAppointmentSeries } from "@/engine/recurrence";
import {
  listScheduledNotificationIds,
  replaceScheduledNotifications,
} from "@/infrastructure/notifications/notification-schedule-repository";

const MAX_PENDING_FOR_ENTRY = 48;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function offsetMinutes(rule: EntryNotification): number {
  const multiplier =
    rule.unit === "MINUTE" ? 1 : rule.unit === "HOUR" ? 60 : rule.unit === "DAY" ? 1_440 : 10_080;
  const direction = rule.direction === "BEFORE" ? -1 : 1;
  return rule.amount * multiplier * direction;
}

function scheduledInstant(
  entry: CalendarEntry,
  occurrenceDate: string,
  rule: EntryNotification,
  timeZone: string,
): Date {
  const localDate = Temporal.PlainDate.from(occurrenceDate);
  const referenceTime = entry.allDay
    ? "00:00"
    : rule.reference === "END"
      ? (entry.endTime ?? entry.startTime ?? "00:00")
      : (entry.startTime ?? "00:00");
  const [hour, minute] = referenceTime.split(":").map(Number);
  const instant = Temporal.ZonedDateTime.from({
    timeZone,
    year: localDate.year,
    month: localDate.month,
    day: localDate.day,
    hour,
    minute,
  }).add({ minutes: offsetMinutes(rule) });
  return new Date(instant.epochMilliseconds);
}

function occurrenceDates(entry: CalendarEntry, today: string, endDate: string): readonly string[] {
  if (entry.kind === "SHIFT")
    return entry.date >= today ? Object.freeze([entry.date]) : Object.freeze([]);
  return Object.freeze(
    expandAppointmentSeries(entry, today, endDate)
      .slice(0, MAX_PENDING_FOR_ENTRY)
      .map((occurrence) => occurrence.date),
  );
}

export async function cancelEntryNotifications(
  db: SQLiteDatabase,
  entry: Pick<CalendarEntry, "id" | "kind">,
): Promise<void> {
  const ids = await listScheduledNotificationIds(db, entry);
  await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
  await replaceScheduledNotifications(db, entry, []);
}

export async function syncEntryNotifications(
  db: SQLiteDatabase,
  entry: CalendarEntry,
  timeZone: string,
): Promise<void> {
  await cancelEntryNotifications(db, entry);
  const rule = entry.notification ?? null;
  if (rule === null || entry.deletedAt !== null) return;

  const currentPermission = await Notifications.getPermissionsAsync();
  const permission = currentPermission.granted
    ? currentPermission
    : await Notifications.requestPermissionsAsync();
  if (!permission.granted) return;

  const now = Temporal.Now.zonedDateTimeISO(timeZone);
  const today = now.toPlainDate().toString();
  const endDate = now.add({ years: 2 }).toPlainDate().toString();
  const schedules: { occurrenceDate: string; notificationId: string }[] = [];

  try {
    for (const occurrenceDate of occurrenceDates(entry, today, endDate)) {
      const triggerDate = scheduledInstant(entry, occurrenceDate, rule, timeZone);
      if (triggerDate.getTime() <= Date.now()) continue;
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: entry.title,
          body:
            entry.kind === "SHIFT"
              ? "Erinnerung an deinen Dienst."
              : "Erinnerung an deinen Termin.",
          data: { entryId: entry.id, entryKind: entry.kind, occurrenceDate },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
        },
      });
      schedules.push({ occurrenceDate, notificationId });
    }
  } finally {
    await replaceScheduledNotifications(db, entry, schedules);
  }
}
