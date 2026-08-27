import type {
  PflegeShiftDiagnosticsPort,
  PflegeShiftNotificationPort,
} from "@/application/pflegeshift-ports";
import type { CalendarEntry } from "@/domain/types";

export interface NotificationReconciliationDependencies {
  readonly notifications: Pick<PflegeShiftNotificationPort, "syncEntry">;
  readonly diagnostics: PflegeShiftDiagnosticsPort;
}

export async function reconcileLoadedEntryNotifications(
  entries: readonly CalendarEntry[],
  timeZone: string,
  { notifications, diagnostics }: NotificationReconciliationDependencies,
): Promise<boolean> {
  const results = await Promise.allSettled(
    entries
      .filter(
        (entry) =>
          entry.notification != null || (entry.kind === "SHIFT" && entry.alarmEnabled === true),
      )
      .map((entry) => notifications.syncEntry(entry, timeZone)),
  );
  let failed = false;
  for (const result of results) {
    if (result.status !== "rejected") continue;
    failed = true;
    diagnostics.record("notifications", "ENTRY_NOTIFICATION_RECONCILE_FAILED", result.reason);
  }
  return failed;
}
