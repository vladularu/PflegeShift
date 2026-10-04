import { createProfilePorts } from "./create-profile-ports";
import type { SQLiteDatabase } from "expo-sqlite";

import type { PflegeShiftPorts } from "@/application/pflegeshift-ports";
import {
  deleteCalendarEntry,
  deleteTemplate,
  listCalendarEntries,
  listMonthlyTariffDecisions,
  listTemplates,
  loadTvoedWorkPatternSettings,
  restoreCalendarEntry,
  restoreTemplate,
  saveAppointment,
  saveMonthlyTariffDecision,
  saveShift,
  saveTemplate,
  saveTvoedWorkPatternSettings,
  swapTemplateSortOrder,
} from "@/infrastructure/database/repository";
import { listTestBackupMonths } from "@/infrastructure/database/test-backup-status-repository";
import { DEV_TOOLS_AVAILABLE, shouldLoadDevToolState } from "@/infrastructure/dev-tools-policy";
import { recordDiagnostic } from "@/infrastructure/diagnostics";
import {
  cancelEntryNotifications,
  syncEntryNotifications,
} from "@/infrastructure/notifications/entry-notifications";

export function createPflegeShiftPorts(db: SQLiteDatabase): PflegeShiftPorts {
  const profilePorts = createProfilePorts(db);
  return {
    ...profilePorts,
    repository: {
      ...profilePorts.repository,
      listTemplates: () => listTemplates(db),
      saveTemplate: (input) => saveTemplate(db, input),
      deleteTemplate: (id, expectedRevision) => deleteTemplate(db, id, expectedRevision),
      restoreTemplate: (template) => restoreTemplate(db, template),
      swapTemplateSortOrder: (first, second) => swapTemplateSortOrder(db, first, second),
      listCalendarEntries: (startDate, endDate) => listCalendarEntries(db, startDate, endDate),
      saveShift: (input) => saveShift(db, input),
      saveAppointment: (input) => saveAppointment(db, input),
      deleteCalendarEntry: (entry) => deleteCalendarEntry(db, entry),
      restoreCalendarEntry: (entry) => restoreCalendarEntry(db, entry),
      listMonthlyTariffDecisions: () => listMonthlyTariffDecisions(db),
      saveMonthlyTariffDecision: (input) => saveMonthlyTariffDecision(db, input),
      loadTvoedWorkPatternSettings: () => loadTvoedWorkPatternSettings(db),
      saveTvoedWorkPatternSettings: (input) => saveTvoedWorkPatternSettings(db, input),
    },
    notifications: {
      syncEntry: (entry, timeZone) => syncEntryNotifications(db, entry, timeZone),
      cancelEntry: (entry) => cancelEntryNotifications(db, entry),
    },
    diagnostics: {
      record: (source, code, error) => {
        recordDiagnostic(source, code, error);
      },
    },
    devTools: {
      shouldLoadState: (ready, revision) =>
        shouldLoadDevToolState(DEV_TOOLS_AVAILABLE, ready, revision),
      listBackupMonths: () => listTestBackupMonths(db),
    },
  };
}
