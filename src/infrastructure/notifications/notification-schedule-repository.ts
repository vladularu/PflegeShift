import type { SQLiteDatabase } from "expo-sqlite";

import type { CalendarEntry } from "@/domain/types";

export async function listAllScheduledNotificationIds(
  db: SQLiteDatabase,
): Promise<readonly string[]> {
  const rows = await db.getAllAsync<{ notification_id: string }>(
    "SELECT notification_id FROM scheduled_entry_notifications ORDER BY notification_id",
  );
  return Object.freeze(rows.map((row) => row.notification_id));
}

export async function listScheduledNotificationIds(
  db: SQLiteDatabase,
  entry: Pick<CalendarEntry, "id" | "kind">,
): Promise<readonly string[]> {
  const rows = await db.getAllAsync<{ notification_id: string }>(
    `SELECT notification_id FROM scheduled_entry_notifications
     WHERE entry_kind=? AND entry_id=?`,
    entry.kind,
    entry.id,
  );
  return Object.freeze(rows.map((row) => row.notification_id));
}

export async function replaceScheduledNotifications(
  db: SQLiteDatabase,
  entry: Pick<CalendarEntry, "id" | "kind">,
  schedules: readonly { readonly occurrenceDate: string; readonly notificationId: string }[],
): Promise<void> {
  await db.runAsync(
    "DELETE FROM scheduled_entry_notifications WHERE entry_kind=? AND entry_id=?",
    entry.kind,
    entry.id,
  );
  for (const schedule of schedules) {
    await db.runAsync(
      `INSERT INTO scheduled_entry_notifications(
        entry_kind,entry_id,occurrence_date,notification_id
      ) VALUES(?,?,?,?)`,
      entry.kind,
      entry.id,
      schedule.occurrenceDate,
      schedule.notificationId,
    );
  }
}
