import { act, renderHook } from "@testing-library/react-native";
import { afterEach, describe, expect, it, jest } from "@jest/globals";

import type {
  CalendarEntry,
  MonthlyTariffDecision,
  TvoedWorkPatternSettings,
  UserProfile,
} from "@/domain/types";
import { useDeferredAnnualReport } from "@/features/analysis/use-annual-report";

jest.mock("@/features/analysis/use-local-reference-date", () => ({
  useLocalReferenceDate: () => "2026-08-04",
}));

jest.mock("@/ui/schedule-idle-work", () => ({
  scheduleIdleWork: (work: () => void) => {
    const handle = setTimeout(work, 0);
    return () => clearTimeout(handle);
  },
}));

const PROFILE: UserProfile = {
  federalState: "NW",
  holidayRegion: "NONE",
  weeklyMinutes: 2_400,
  timeZone: "Europe/Berlin",
  regularRotatingNightWork: false,
  sundayHolidayWorkEligible: true,
  allEmploymentWorkRecorded: true,
  tariff: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const WORK_PATTERN: TvoedWorkPatternSettings = {
  workplaceCoverage: "UNKNOWN",
  assignment: "UNKNOWN",
  updatedAt: null,
};
const ENTRIES: readonly CalendarEntry[] = [];
const DECISIONS: readonly MonthlyTariffDecision[] = [];

describe("useDeferredAnnualReport", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("does not commit a stale year after the request changes", async () => {
    jest.useFakeTimers();
    const screen = await renderHook(
      ({ year }: { readonly year: number }) =>
        useDeferredAnnualReport({
          enabled: true,
          entries: ENTRIES,
          profile: PROFILE,
          tariffDecisions: DECISIONS,
          workPatternSettings: WORK_PATTERN,
          year,
        }),
      { initialProps: { year: 2026 } },
    );

    await act(async () => {
      jest.advanceTimersToNextTimer();
    });
    await screen.rerender({ year: 2027 });
    await act(async () => {
      jest.runAllTimers();
    });

    expect(screen.result.current.report?.year).toBe(2027);
    expect(screen.result.current.error).toBeNull();
  });
});
