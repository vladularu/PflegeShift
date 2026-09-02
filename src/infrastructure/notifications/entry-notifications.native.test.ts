import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQLiteDatabase } from "expo-sqlite";

import type { ShiftEntry } from "@/domain/types";
import { syncEntryNotifications } from "@/infrastructure/notifications/entry-notifications.native";

const notificationMocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  getPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  schedule: vi.fn(),
  setHandler: vi.fn(),
}));
const repositoryMocks = vi.hoisted(() => ({
  listIds: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("expo-notifications", () => ({
  SchedulableTriggerInputTypes: { DATE: "date" },
  cancelScheduledNotificationAsync: notificationMocks.cancel,
  getPermissionsAsync: notificationMocks.getPermissions,
  requestPermissionsAsync: notificationMocks.requestPermissions,
  scheduleNotificationAsync: notificationMocks.schedule,
  setNotificationHandler: notificationMocks.setHandler,
}));

vi.mock("@/infrastructure/notifications/notification-schedule-repository", () => ({
  listScheduledNotificationIds: repositoryMocks.listIds,
  replaceScheduledNotifications: repositoryMocks.replace,
}));

const baseShift: ShiftEntry = {
  kind: "SHIFT",
  id: "shift-alarm",
  date: "2099-08-20",
  templateId: null,
  title: "Spätdienst",
  type: "LATE",
  allDay: false,
  startTime: "13:00",
  endTime: "21:30",
  breakMinutes: 30,
  color: "#F05C68",
  symbol: "S",
  note: null,
  notification: null,
  alarmEnabled: true,
  location: null,
  overtimeMinutes: 0,
  holidayPremiumMode: "WITH_TIME_OFF",
  revision: 1,
  createdAt: "2026-08-01T08:00:00.000Z",
  updatedAt: "2026-08-01T08:00:00.000Z",
  deletedAt: null,
};

describe("entry alarms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositoryMocks.listIds.mockResolvedValue([]);
    repositoryMocks.replace.mockResolvedValue(undefined);
    notificationMocks.getPermissions.mockResolvedValue({ granted: true });
    notificationMocks.schedule
      .mockResolvedValueOnce("notification-1")
      .mockResolvedValueOnce("alarm-1");
  });

  it("schedules an audible alarm independently from an earlier notification", async () => {
    await syncEntryNotifications(
      {} as SQLiteDatabase,
      {
        ...baseShift,
        notification: {
          amount: 15,
          unit: "MINUTE",
          direction: "BEFORE",
          reference: "START",
        },
      },
      "Europe/Berlin",
    );

    expect(notificationMocks.schedule).toHaveBeenCalledTimes(2);
    expect(notificationMocks.schedule.mock.calls[0]?.[0].content).toMatchObject({
      title: "LUNA Shift",
      body: "Deine Erinnerung ist fällig.",
      sound: undefined,
      data: { reminderKind: "NOTIFICATION" },
    });
    expect(notificationMocks.schedule.mock.calls[1]?.[0].content).toMatchObject({
      title: "LUNA Shift",
      body: "Dein Dienst beginnt jetzt.",
      sound: "default",
      data: { reminderKind: "ALARM" },
    });
    expect(JSON.stringify(notificationMocks.schedule.mock.calls)).not.toContain(baseShift.title);
    expect(notificationMocks.schedule.mock.calls[0]?.[0].content.data).toEqual({
      reminderKind: "NOTIFICATION",
    });
  });

  it("deduplicates a notification that already occurs at shift start", async () => {
    await syncEntryNotifications(
      {} as SQLiteDatabase,
      {
        ...baseShift,
        notification: {
          amount: 0,
          unit: "MINUTE",
          direction: "BEFORE",
          reference: "START",
        },
      },
      "Europe/Berlin",
    );

    expect(notificationMocks.schedule).toHaveBeenCalledTimes(1);
    expect(notificationMocks.schedule.mock.calls[0]?.[0].content).toMatchObject({
      sound: "default",
      data: { reminderKind: "ALARM" },
    });
  });
});
