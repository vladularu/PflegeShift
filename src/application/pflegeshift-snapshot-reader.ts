import { withDataLoadFailureCode } from "@/domain/data-load-failure";
import type {
  CalendarEntryRange,
  PflegeShiftSnapshot,
  PflegeShiftSnapshotRepository,
} from "./pflegeshift-snapshot";

export async function readPflegeShiftSnapshot(
  repository: PflegeShiftSnapshotRepository,
  range: CalendarEntryRange,
): Promise<PflegeShiftSnapshot> {
  const [profile, templates, entries, tariffDecisions, workPatternSettings] = await Promise.all([
    withDataLoadFailureCode("LOAD_PROFILE_FAILED", () => repository.loadProfile()),
    withDataLoadFailureCode("LOAD_TEMPLATES_FAILED", () => repository.listTemplates()),
    withDataLoadFailureCode("LOAD_CALENDAR_FAILED", () =>
      repository.listCalendarEntries(range.startDate, range.endDate),
    ),
    withDataLoadFailureCode("LOAD_TARIFF_DECISIONS_FAILED", () =>
      repository.listMonthlyTariffDecisions(),
    ),
    withDataLoadFailureCode("LOAD_WORK_PATTERN_FAILED", () =>
      repository.loadTvoedWorkPatternSettings(),
    ),
  ]);

  return Object.freeze({ profile, templates, entries, tariffDecisions, workPatternSettings });
}
