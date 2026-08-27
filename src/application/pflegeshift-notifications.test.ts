import { describe, expect, it, vi } from "vitest";

import {
  reconcileLoadedEntryNotifications,
  type NotificationReconciliationDependencies,
} from "@/application/pflegeshift-notifications";
import type { CalendarEntry } from "@/domain/types";

const plainEntry = {
  id: "plain",
  kind: "APPOINTMENT",
  notification: null,
} as CalendarEntry;
const alarmEntry = {
  id: "alarm",
  kind: "SHIFT",
  alarmEnabled: true,
  notification: null,
} as CalendarEntry;
const reminderEntry = {
  id: "reminder",
  kind: "APPOINTMENT",
  notification: { amount: 15, unit: "MINUTE", direction: "BEFORE", reference: "START" },
} as CalendarEntry;

describe("notification reconciliation", () => {
  it("syncs only configured entries and reports individual failures", async () => {
    const dependencies: NotificationReconciliationDependencies = {
      notifications: {
        syncEntry: vi
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(new Error("scheduler unavailable")),
      },
      diagnostics: { record: vi.fn() },
    };

    await expect(
      reconcileLoadedEntryNotifications(
        [plainEntry, alarmEntry, reminderEntry],
        "Europe/Berlin",
        dependencies,
      ),
    ).resolves.toBe(true);
    expect(dependencies.notifications.syncEntry).toHaveBeenCalledTimes(2);
    expect(dependencies.diagnostics.record).toHaveBeenCalledWith(
      "notifications",
      "ENTRY_NOTIFICATION_RECONCILE_FAILED",
      expect.any(Error),
    );
  });
});
