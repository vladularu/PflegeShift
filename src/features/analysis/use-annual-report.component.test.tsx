import { act, renderHook } from "@testing-library/react-native";
import { afterEach, describe, expect, it, jest } from "@jest/globals";

import holidayPackageValue from "../../../rules/packages/reviewed/de-holidays/2026.json";
import legalPackageValue from "../../../rules/packages/reviewed/de-arbzg-care/2026-01.json";
import tariffPackageValue from "../../../rules/packages/reviewed/tvoed-vka-bt-k/2026-05.json";
import type {
  CalendarEntry,
  MonthlyTariffDecision,
  TvoedWorkPatternSettings,
  UserProfile,
} from "@/domain/types";
import { useDeferredAnnualReport } from "@/features/analysis/use-annual-report";
import type {
  RuleHolidayPackage,
  RuleLegalPackage,
  RuleTariffPackage,
} from "@/rules/contracts.generated";
import { createRuleResolver } from "@/rules/rule-resolver";

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
const FUTURE_ENTRIES: readonly CalendarEntry[] = [
  {
    kind: "SHIFT",
    id: "future-day-shift",
    date: "2027-01-03",
    templateId: null,
    title: "Tagdienst",
    type: "DAY",
    startTime: "08:00",
    endTime: "16:00",
    breakMinutes: 30,
    color: "#207A68",
    symbol: "D",
    note: null,
    overtimeMinutes: 0,
    holidayPremiumMode: "WITH_TIME_OFF",
    revision: 1,
    createdAt: "2027-01-01T00:00:00.000Z",
    updatedAt: "2027-01-01T00:00:00.000Z",
    deletedAt: null,
  },
];
const DECISIONS: readonly MonthlyTariffDecision[] = [];
const GENERATION_ONE_REVIEWED_RESOLVER = createRuleResolver(
  {
    tariff: [tariffPackageValue as RuleTariffPackage],
    legal: [legalPackageValue as RuleLegalPackage],
    holiday: [holidayPackageValue as RuleHolidayPackage],
  },
  {
    tariff: "tvoed-vka-bt-k",
    legal: "de-arbzg-care",
    holiday: "de-holidays",
  },
);

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

  it("keeps annual core data when Generation 1 rule coverage ends", async () => {
    jest.useFakeTimers();
    const screen = await renderHook(() =>
      useDeferredAnnualReport({
        enabled: true,
        entries: FUTURE_ENTRIES,
        profile: PROFILE,
        ruleResolver: GENERATION_ONE_REVIEWED_RESOLVER,
        tariffDecisions: DECISIONS,
        workPatternSettings: WORK_PATTERN,
        year: 2027,
      }),
    );

    await act(async () => {
      jest.runAllTimers();
    });

    expect(screen.result.current.report).toMatchObject({
      year: 2027,
      actualMinutes: 450,
      entryCount: 1,
      worktimeCoverageComplete: false,
      complianceCoverageComplete: false,
    });
    expect(screen.result.current.ruleFailure).toBeNull();
    expect(screen.result.current.fatalError).toBeNull();
    expect(screen.result.current.error).toBeNull();
  });

  it("returns unexpected annual computation errors as fatal", async () => {
    jest.useFakeTimers();
    const fatalError = new Error("unexpected annual computation failure");
    const resolver = {
      ...GENERATION_ONE_REVIEWED_RESOLVER,
      resolveHoliday: () => {
        throw fatalError;
      },
    };
    const screen = await renderHook(() =>
      useDeferredAnnualReport({
        enabled: true,
        entries: ENTRIES,
        profile: PROFILE,
        ruleResolver: resolver,
        tariffDecisions: DECISIONS,
        workPatternSettings: WORK_PATTERN,
        year: 2027,
      }),
    );

    await act(async () => {
      jest.runAllTimers();
    });

    expect(screen.result.current.fatalError).toBe(fatalError);
    expect(screen.result.current.error).toBeNull();
  });
});
