import { Temporal } from "@js-temporal/polyfill";

import type { PflegeShiftRepositoryPort } from "@/application/pflegeshift-ports";
import type {
  CalendarEntry,
  MonthlyTariffDecision,
  ShiftTemplate,
  TvoedWorkPatternSettings,
  UserProfile,
} from "@/domain/types";

export interface CalendarEntryRange {
  readonly startDate: string;
  readonly endDate: string;
}

export type PflegeShiftSnapshotRepository = Pick<
  PflegeShiftRepositoryPort,
  | "loadProfile"
  | "listTemplates"
  | "listCalendarEntries"
  | "listMonthlyTariffDecisions"
  | "loadTvoedWorkPatternSettings"
>;

export interface PflegeShiftSnapshot {
  readonly profile: UserProfile | null;
  readonly templates: readonly ShiftTemplate[];
  readonly entries: readonly CalendarEntry[];
  readonly tariffDecisions: readonly MonthlyTariffDecision[];
  readonly workPatternSettings: TvoedWorkPatternSettings;
}

export const EMPTY_WORK_PATTERN_SETTINGS: TvoedWorkPatternSettings = Object.freeze({
  workplaceCoverage: "UNKNOWN",
  assignment: "UNKNOWN",
  updatedAt: null,
});

export function entryRangeForActiveMonth(activeMonth: string): CalendarEntryRange {
  return entryRangeForYear(Temporal.PlainYearMonth.from(activeMonth).year);
}

export function entryRangeForYear(year: number): CalendarEntryRange {
  return Object.freeze({
    startDate: `${year - 1}-11-01`,
    endDate: `${year + 1}-01-31`,
  });
}

export async function loadPflegeShiftSnapshot(
  repository: PflegeShiftSnapshotRepository,
  range: CalendarEntryRange,
): Promise<PflegeShiftSnapshot> {
  const [profile, templates, entries, tariffDecisions, workPatternSettings] = await Promise.all([
    repository.loadProfile(),
    repository.listTemplates(),
    repository.listCalendarEntries(range.startDate, range.endDate),
    repository.listMonthlyTariffDecisions(),
    repository.loadTvoedWorkPatternSettings(),
  ]);

  return Object.freeze({ profile, templates, entries, tariffDecisions, workPatternSettings });
}
