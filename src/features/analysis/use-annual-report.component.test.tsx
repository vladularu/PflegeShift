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
import { useAnnualReportInputs } from "@/features/analysis/use-annual-report-inputs";
import { reconcileCalendarRange } from "@/application/calendar-entry-loading";
import { entryRangeForYear } from "@/application/pflegeshift-snapshot";
import type {
  RuleHolidayPackage,
  RuleLegalPackage,
  RuleTariffPackage,
} from "@/rules/contracts.generated";
import { createRuleResolver } from "@/rules/rule-resolver";
import { scheduleIdleWork } from "@/ui/schedule-idle-work";

let mockReferenceDate = "2026-08-04";

jest.mock("@/features/analysis/use-local-reference-date", () => ({
  useLocalReferenceDate: () => mockReferenceDate,
}));

jest.mock("@/ui/schedule-idle-work", () => ({
  scheduleIdleWork: jest.fn((work: () => void) => {
    const handle = setTimeout(work, 0);
    return () => clearTimeout(handle);
  }),
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
    mockReferenceDate = "2026-08-04";
  });

  it("reuses 2026 after the real selection and range reconciliation reload fresh objects", async () => {
    jest.useFakeTimers();
    const database: readonly CalendarEntry[] = [
      { ...FUTURE_ENTRIES[0], id: "lookback", date: "2025-12-28" },
      { ...FUTURE_ENTRIES[0], id: "previous-year", date: "2026-01-03" },
      ...FUTURE_ENTRIES,
      { ...FUTURE_ENTRIES[0], id: "lookahead", date: "2028-01-03" },
    ];
    const loadRange = (year: number) => {
      const range = entryRangeForYear(year);
      return (JSON.parse(JSON.stringify(database)) as CalendarEntry[])
        .filter((entry) => entry.date >= range.startDate && entry.date <= range.endDate)
        .map(
          (entry) =>
            Object.fromEntries(Object.entries(entry).reverse()) as unknown as CalendarEntry,
        );
    };
    let current: readonly CalendarEntry[] = loadRange(2026);
    const screen = await renderHook(
      ({
        year,
        ready,
        entries,
      }: {
        year: number;
        ready: boolean;
        entries: readonly CalendarEntry[];
      }) => {
        const selected = useAnnualReportInputs(year, entries, DECISIONS);
        return useDeferredAnnualReport({
          enabled: ready && selected?.ok === true,
          entries: selected?.ok ? selected.value.entries : entries,
          profile: PROFILE,
          tariffDecisions: DECISIONS,
          workPatternSettings: WORK_PATTERN,
          year,
        });
      },
      { initialProps: { year: 2026, ready: true, entries: current } },
    );
    await act(async () => {
      jest.runAllTimers();
    });
    const first = screen.result.current.report;
    expect(first).not.toBeNull();
    for (const year of [2027, 2026]) {
      await screen.rerender({ year, ready: false, entries: current });
      const loaded = loadRange(year);
      current = reconcileCalendarRange(loaded, current, current, entryRangeForYear(year));
      const scheduled = jest.mocked(scheduleIdleWork).mock.calls.length;
      await screen.rerender({ year, ready: true, entries: current });
      if (year === 2026) {
        expect(screen.result.current.report).toBe(first);
        expect(jest.mocked(scheduleIdleWork).mock.calls.length).toBe(scheduled);
      }
      await act(async () => {
        jest.runAllTimers();
      });
    }
    // A template-provided title can change without changing the entry revision.
    current = current.map((entry) =>
      entry.id === "previous-year" ? { ...entry, title: "Geänderte Vorlage" } : entry,
    );
    await screen.rerender({ year: 2026, ready: true, entries: current });
    expect(screen.result.current.report).toBeNull();
    await act(async () => {
      jest.runAllTimers();
    });
    expect(screen.result.current.report).not.toBe(first);
    // A restore can replace times at unchanged id/revision: never serve stale totals.
    current = current.map((entry) =>
      entry.id === "previous-year" && entry.kind === "SHIFT"
        ? { ...entry, endTime: "15:00" }
        : entry,
    );
    await screen.rerender({ year: 2026, ready: true, entries: current });
    expect(screen.result.current.report).toBeNull();
    await act(async () => {
      jest.runAllTimers();
    });
    expect(screen.result.current.report?.actualMinutes).toBe(390);
  });

  it("reuses completed years with equivalent selected arrays and bounds the cache", async () => {
    jest.useFakeTimers();
    const screen = await renderHook(
      ({ year }: { year: number }) =>
        useDeferredAnnualReport({
          enabled: true,
          entries: [...FUTURE_ENTRIES],
          profile: PROFILE,
          tariffDecisions: [...DECISIONS],
          workPatternSettings: WORK_PATTERN,
          year,
        }),
      { initialProps: { year: 2026 } },
    );
    await act(async () => {
      jest.runAllTimers();
    });
    const first = screen.result.current.report;
    for (const year of [2027, 2028]) {
      await screen.rerender({ year });
      await act(async () => {
        jest.runAllTimers();
      });
    }
    const scheduled = jest.mocked(scheduleIdleWork).mock.calls.length;
    await screen.rerender({ year: 2026 });
    expect(screen.result.current.report).toBe(first);
    expect(jest.mocked(scheduleIdleWork).mock.calls.length).toBe(scheduled);
    await screen.rerender({ year: 2029 });
    await act(async () => {
      jest.runAllTimers();
    });
    await screen.rerender({ year: 2026 });
    expect(screen.result.current.report).toBeNull();
  });

  it("batches small steps and invalidates the cached report at local midnight", async () => {
    jest.useFakeTimers();
    const scheduled = jest.mocked(scheduleIdleWork).mock.calls.length;
    const screen = await renderHook(() =>
      useDeferredAnnualReport({
        enabled: true,
        entries: ENTRIES,
        profile: PROFILE,
        tariffDecisions: DECISIONS,
        workPatternSettings: WORK_PATTERN,
        year: 2026,
      }),
    );
    await act(async () => {
      jest.runAllTimers();
    });
    expect(screen.result.current.report).not.toBeNull();
    // Empty year previously required 145 separate idle callbacks.
    expect(jest.mocked(scheduleIdleWork).mock.calls.length - scheduled).toBeLessThan(10);
    mockReferenceDate = "2026-08-05";
    await screen.rerender({});
    expect(screen.result.current.report).toBeNull();
    await act(async () => {
      jest.runAllTimers();
    });
    expect(screen.result.current.report).not.toBeNull();
  });

  it("invalidates results when entries, profile, decisions, settings or resolver change", async () => {
    jest.useFakeTimers();
    const initial = {
      enabled: true,
      entries: FUTURE_ENTRIES,
      profile: PROFILE,
      tariffDecisions: DECISIONS,
      workPatternSettings: WORK_PATTERN,
      ruleResolver: GENERATION_ONE_REVIEWED_RESOLVER,
      year: 2027,
    };
    const screen = await renderHook((props: typeof initial) => useDeferredAnnualReport(props), {
      initialProps: initial,
    });
    await act(async () => {
      jest.runAllTimers();
    });
    let props = initial;
    for (const change of [
      { entries: FUTURE_ENTRIES.map((item) => ({ ...item, deletedAt: "2027-01-04T00:00:00Z" })) },
      { profile: { ...PROFILE, weeklyMinutes: 1800 } },
      {
        tariffDecisions: [
          {
            month: "2027-01",
            allowanceStatus: "NONE",
            revision: 1,
            confirmedAt: "2027-01-04T00:00:00Z",
            updatedAt: "2027-01-04T00:00:00Z",
          } satisfies MonthlyTariffDecision,
        ],
      },
      { workPatternSettings: { ...WORK_PATTERN, updatedAt: "2027-01-04T00:00:00Z" } },
      { ruleResolver: { ...GENERATION_ONE_REVIEWED_RESOLVER } },
    ]) {
      props = { ...props, ...change };
      await screen.rerender(props);
      expect(screen.result.current.report).toBeNull();
      await act(async () => {
        jest.runAllTimers();
      });
      expect(screen.result.current.report).not.toBeNull();
    }
    expect(screen.result.current.report?.entryCount).toBe(0);
  });

  it("cancels pending work when disabled and resumes without committing partial results", async () => {
    jest.useFakeTimers();
    const screen = await renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useDeferredAnnualReport({
          enabled,
          entries: ENTRIES,
          profile: PROFILE,
          tariffDecisions: DECISIONS,
          workPatternSettings: WORK_PATTERN,
          year: 2026,
        }),
      { initialProps: { enabled: true } },
    );
    await act(async () => {
      jest.advanceTimersToNextTimer();
    });
    expect(screen.result.current.report).toBeNull();
    await screen.rerender({ enabled: false });
    expect(screen.result.current.coreReport).toBeNull();
    await act(async () => {
      jest.runAllTimers();
    });
    expect(screen.result.current.report).toBeNull();
    await screen.rerender({ enabled: true });
    await act(async () => {
      jest.runAllTimers();
    });
    expect(screen.result.current.report?.year).toBe(2026);
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
    expect(screen.result.current.coreReport?.year).toBe(2026);
    expect(screen.result.current.report).toBeNull();
    await screen.rerender({ year: 2027 });
    expect(screen.result.current.coreReport).toBeNull();
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
