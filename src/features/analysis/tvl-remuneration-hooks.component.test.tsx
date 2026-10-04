import { act, renderHook } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { useRemunerationData } from "@/application/remuneration-provider";
import { work, history, resolver } from "@/engine/remuneration-test-fixtures";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import tvalApril from "../../../rules/packages/reviewed/tval-pflege-tdl/2026-04.json";
import tvalNovember from "../../../rules/packages/reviewed/tval-pflege-tdl/2025-11.json";
import { tvlRules, tvlSaturday, tvlProfile, tvlFact } from "@/engine/tvl-shift-work-test-fixtures";
import { useMonthlyRemuneration } from "./use-monthly-remuneration";
import { useDeferredAnnualReport } from "./use-annual-report";

let mockHistory: ReturnType<typeof useRemunerationData>;
let mockEntries = [tvlSaturday];
let mockRules = tvlRules;
const mockProfile = work;
const mockTraining = { status: "ready", error: null, profiles: [], shifts: [] };
const mockSettings = {
  workplaceCoverage: "UNKNOWN",
  assignment: "UNKNOWN",
  updatedAt: null,
} as const;
jest.mock("@/application/remuneration-provider", () => ({
  useRemunerationData: () => mockHistory,
}));
jest.mock("@/application/pflegeshift-provider", () => ({
  usePflegeShiftEntries: () => ({ entries: mockEntries }),
  usePflegeShiftProfile: () => ({ profile: mockProfile }),
  usePflegeShiftStatus: () => ({ ready: true, error: null }),
  usePflegeShiftTariff: () => ({ tariffDecisions: [], workPatternSettings: mockSettings }),
}));
jest.mock("@/application/rule-catalog-runtime-provider", () => ({
  useRuleCatalogRuntime: () => ({ resolver: mockRules }),
}));
jest.mock("@/application/training-provider", () => ({ useTrainingData: () => mockTraining }));
jest.mock("./use-local-reference-date", () => ({ useLocalReferenceDate: () => "2026-12-31" }));
jest.mock("@/ui/schedule-idle-work", () => ({
  scheduleIdleWork: (work: () => void) => {
    const id = setTimeout(work, 0);
    return () => clearTimeout(id);
  },
}));
const unexpected = async (): Promise<never> => {
  throw new Error("Unexpected write");
};
const inputs = {
  enabled: true,
  entries: [tvlSaturday],
  profile: work,
  ruleResolver: tvlRules,
  tariffDecisions: [],
  workPatternSettings: mockSettings,
  year: 2026,
};
beforeEach(() => {
  jest.useFakeTimers();
  mockRules = tvlRules;
  mockEntries = [tvlSaturday];
  mockHistory = {
    status: "ready",
    error: null,
    profiles: [tvlProfile()],
    tvlShiftWork: [tvlFact(true)],
    caritasMonthFacts: [],
    tvoedAnnexAMonthConfirmations: [],
    drkEmployeeMonthConfirmations: [],
    drkTrainingMonthConfirmations: [],
    tvoedAnnexAPremiumFacts: [],
    tvoedSueMonthConfirmations: [],
    tvoedSueAllowanceConfirmations: [],
    allowanceDecisions: [],
    overtimeAllocations: [],
    paidAbsences: [],
    actualAnnualPayments: [],
    tariffAnnualClaims: [],
    saveTvlShiftWork: unexpected,
    saveCaritasMonthFacts: unexpected,
    saveTvoedAnnexAMonthConfirmation: unexpected,
    saveDrkEmployeeMonthConfirmation: unexpected,
    saveDrkTrainingMonthConfirmation: unexpected,
    saveTvoedAnnexAPremiumFacts: unexpected,
    saveTvoedSueMonthConfirmation: unexpected,
    saveTvoedSueAllowanceConfirmation: unexpected,
    saveProfile: unexpected,
    saveAllowanceDecisions: unexpected,
    saveOvertimeAllocation: unexpected,
    savePaidAbsence: unexpected,
    saveActualAnnualPayment: unexpected,
    revokeActualAnnualPayment: unexpected,
    saveTariffAnnualClaim: unexpected,
    revokeTariffAnnualClaim: unexpected,
    reload: jest.fn(async () => {}),
  };
});
afterEach(() => {
  jest.useRealTimers();
});
const flush = () =>
  act(async () => {
    jest.runAllTimers();
  });
describe("TV-L facts in real monthly and annual hooks", () => {
  // Each case computes twelve real tariff months and then repeats after a snapshot change.
  const annualHookTimeoutMs = 15_000;
  it.each(["rates", "restore", "revocation"] as const)(
    "keeps TVA-L yearly %s consistent",
    async (scenario) => {
      mockRules = resolver([tvalNovember, tvalApril] as RuleTariffPackage[]);
      mockEntries = [];
      const selection = {
        kind: "tariff" as const,
        packageId: "tval-pflege-tdl",
        variant: "CARE",
        region: "WEST_38_5",
        group: "regular",
        level: "1",
        fullTimeWeeklyMinutes: 2310,
        tvalEmployerScope:
          scenario === "revocation" ? ("GENERAL" as const) : ("SECTION_43" as const),
      };
      const months = Array.from(
        { length: 12 },
        (_, index) => "2026-" + String(index + 1).padStart(2, "0"),
      );
      mockHistory = {
        ...mockHistory,
        tvlShiftWork: [],
        profiles: [{ ...history(), data: { version: 6, weeklyMinutes: 2310, selection } }],
        allowanceDecisions: months.map((month) => ({
          month,
          revision: 1,
          updatedAt: work.updatedAt,
          decisions: [
            {
              from: month + "-01",
              through:
                month +
                "-" +
                String(new Date(Date.UTC(2026, Number(month.slice(5)), 0)).getUTCDate()),
              tariff: {
                packageId: selection.packageId,
                variant: selection.variant,
                region: selection.region,
              },
              allowanceStatus: "ALTERNATING_MONTHLY" as const,
              revision: 1,
              confirmedAt: work.updatedAt,
              updatedAt: work.updatedAt,
            },
          ],
        })),
      };
      const screen = await renderHook(() => ({
        month: useMonthlyRemuneration("2026-09"),
        year: useDeferredAnnualReport({ ...inputs, entries: [], ruleResolver: mockRules }),
      }));
      await flush();
      const yearly = () =>
        screen.result.current.year.report!.remuneration!.months.map(
          (month) =>
            month.result!.allowances.positions.find((position) =>
              position.id.startsWith("tval-shift-allowance:"),
            )!.amountCents,
        );
      const monthly = () => {
        const calculation = screen.result.current.month.calculation;
        if (!calculation?.ok) throw new Error("Missing month");
        return calculation.value.allowances.positions.find((position) =>
          position.id.startsWith("tval-shift-allowance:"),
        )!.amountCents;
      };
      expect(yearly()).toEqual(
        scenario === "revocation"
          ? [...Array(6).fill(7875), ...Array(6).fill(15000)]
          : [...Array(6).fill(11250), ...Array(6).fill(18750)],
      );
      expect(yearly().reduce<number>((sum, cents) => sum + (cents ?? 0), 0)).toBe(
        scenario === "revocation" ? 137250 : 180000,
      );
      expect(monthly()).toBe(scenario === "revocation" ? 15000 : 18750);
      if (scenario === "rates") {
        await screen.unmount();
        return;
      }
      if (scenario === "restore") {
        mockHistory = {
          ...mockHistory,
          profiles: [
            {
              ...mockHistory.profiles[0],
              data: {
                version: 6,
                weeklyMinutes: 2310,
                selection: { ...selection, tvalEmployerScope: "GENERAL" },
              },
            },
          ],
        };
        await screen.rerender({});
        await flush();
        expect(yearly()).toEqual([...Array(6).fill(7875), ...Array(6).fill(15000)]);
        expect(monthly()).toBe(15000);
        await screen.unmount();
        return;
      }
      mockHistory = {
        ...mockHistory,
        allowanceDecisions: mockHistory.allowanceDecisions.map((row) =>
          row.month === "2026-09" ? { ...row, decisions: [] } : row,
        ),
      };
      await screen.rerender({});
      await flush();
      expect(monthly()).toBeNull();
      expect(yearly()[8]).toBeNull();
      expect(yearly()[7]).toBe(15000);
      await screen.unmount();
    },
    annualHookTimeoutMs,
  );
  it.each([
    [false, 380, false],
    [null, null, false],
    [true, 64, false],
    [true, null, true],
  ] as [boolean | null, number | null, boolean][])(
    "refreshes both views: value=%s cents=%s edited=%s",
    async (value, cents, edited) => {
      const screen = await renderHook(() => ({
        month: useMonthlyRemuneration("2026-09"),
        year: useDeferredAnnualReport(inputs),
      }));
      const totals = () => {
        const month = screen.result.current.month.calculation;
        if (!month?.ok) throw new Error("Monthly calculation missing");
        const year = screen.result.current.year.report!.remuneration!;
        return [
          month.value.timePremiums.totalCents,
          year.months.find((m) => m.month === "2026-09")!.result!.timePremiums.totalCents,
        ];
      };
      await flush();
      expect(totals()).toEqual([64, 64]);
      mockHistory = { ...mockHistory, tvlShiftWork: [tvlFact(value)] };
      if (edited) mockEntries = [{ ...tvlSaturday, revision: 2 }];
      await screen.rerender({});
      await flush();
      expect(totals()).toEqual([cents, cents]);
    },
    annualHookTimeoutMs,
  );
  it("does not expose calculable money while the shared snapshot is loading or failed", async () => {
    const screen = await renderHook(() => useMonthlyRemuneration("2026-09"));
    expect(screen.result.current.calculation?.ok).toBe(true);
    for (const status of ["loading", "error"] as const) {
      mockHistory = { ...mockHistory, status };
      await screen.rerender({});
      expect(screen.result.current.calculation).toBeNull();
    }
  });
});
