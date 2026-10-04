import { act, renderHook } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { useRemunerationData } from "@/application/remuneration-provider";
import type { CalendarEntry } from "@/domain/types";
import { history, resolver, shift, work } from "@/engine/remuneration-test-fixtures";
import { tariffAnnualFixture } from "@/engine/tariff-annual-test-fixtures";
import type { SavedTariffAnnualClaim } from "@/domain/saved-tariff-annual-claim";
import { bundledRuleResolver } from "@/rules/rule-resolver";
import { scheduleIdleWork } from "@/ui/schedule-idle-work";
import { useDeferredAnnualReport } from "./use-annual-report";
import { ownRemunerationFixture } from "@/domain/own-remuneration-test-fixtures";

let mockHistory: ReturnType<typeof useRemunerationData>;
let mockLoadedEntries: readonly CalendarEntry[] = [];
const mockTraining = { status: "ready", error: null, profiles: [], shifts: [] };
jest.mock("@/application/training-provider", () => ({
  useTrainingData: () => mockTraining,
}));
jest.mock("@/application/remuneration-provider", () => ({
  useRemunerationData: () => mockHistory,
}));
jest.mock("@/application/pflegeshift-provider", () => ({
  usePflegeShiftEntries: () => ({ entries: mockLoadedEntries }),
}));
jest.mock("./use-local-reference-date", () => ({ useLocalReferenceDate: () => "2026-12-31" }));
jest.mock("@/ui/schedule-idle-work", () => ({
  scheduleIdleWork: jest.fn((work: () => void) => {
    const id = setTimeout(work, 0);
    return () => clearTimeout(id);
  }),
}));
const inputs = {
  enabled: true,
  entries: [] as readonly CalendarEntry[],
  profile: work,
  tariffDecisions: [],
  workPatternSettings: {
    workplaceCoverage: "UNKNOWN",
    assignment: "UNKNOWN",
    updatedAt: null,
  } as const,
  year: 2026,
  ruleResolver: bundledRuleResolver,
};
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockLoadedEntries = [];
  mockHistory = {
    status: "ready",
    error: null,
    profiles: [history()],
    allowanceDecisions: [],
    overtimeAllocations: [],
    paidAbsences: [],
    actualAnnualPayments: [],
    tariffAnnualClaims: [],
    tvlShiftWork: [],
    caritasMonthFacts: [],
    tvoedAnnexAMonthConfirmations: [],
    drkEmployeeMonthConfirmations: [],
    drkTrainingMonthConfirmations: [],
    tvoedAnnexAPremiumFacts: [],
    tvoedSueMonthConfirmations: [],
    tvoedSueAllowanceConfirmations: [],
    saveTvlShiftWork: jest.fn<ReturnType<typeof useRemunerationData>["saveTvlShiftWork"]>(),
    saveTvoedAnnexAMonthConfirmation:
      jest.fn<ReturnType<typeof useRemunerationData>["saveTvoedAnnexAMonthConfirmation"]>(),
    saveDrkEmployeeMonthConfirmation:
      jest.fn<ReturnType<typeof useRemunerationData>["saveDrkEmployeeMonthConfirmation"]>(),
    saveDrkTrainingMonthConfirmation:
      jest.fn<ReturnType<typeof useRemunerationData>["saveDrkTrainingMonthConfirmation"]>(),
    saveTvoedAnnexAPremiumFacts:
      jest.fn<ReturnType<typeof useRemunerationData>["saveTvoedAnnexAPremiumFacts"]>(),
    saveTvoedSueMonthConfirmation:
      jest.fn<ReturnType<typeof useRemunerationData>["saveTvoedSueMonthConfirmation"]>(),
    saveTvoedSueAllowanceConfirmation:
      jest.fn<ReturnType<typeof useRemunerationData>["saveTvoedSueAllowanceConfirmation"]>(),
    saveCaritasMonthFacts:
      jest.fn<ReturnType<typeof useRemunerationData>["saveCaritasMonthFacts"]>(),
    saveTariffAnnualClaim:
      jest.fn<ReturnType<typeof useRemunerationData>["saveTariffAnnualClaim"]>(),
    revokeTariffAnnualClaim:
      jest.fn<ReturnType<typeof useRemunerationData>["revokeTariffAnnualClaim"]>(),
    saveActualAnnualPayment:
      jest.fn<ReturnType<typeof useRemunerationData>["saveActualAnnualPayment"]>(),
    revokeActualAnnualPayment:
      jest.fn<ReturnType<typeof useRemunerationData>["revokeActualAnnualPayment"]>(),
    savePaidAbsence: jest.fn<ReturnType<typeof useRemunerationData>["savePaidAbsence"]>(),
    saveOvertimeAllocation:
      jest.fn<ReturnType<typeof useRemunerationData>["saveOvertimeAllocation"]>(),
    reload: jest.fn<ReturnType<typeof useRemunerationData>["reload"]>(),
    saveProfile: jest.fn<ReturnType<typeof useRemunerationData>["saveProfile"]>(),
    saveAllowanceDecisions:
      jest.fn<ReturnType<typeof useRemunerationData>["saveAllowanceDecisions"]>(),
  };
});
afterEach(() => {
  jest.useRealTimers();
});
const flush = () =>
  act(async () => {
    jest.runAllTimers();
  });
describe("annual remuneration provider integration", () => {
  it("never reports a complete annual zero when personal tariff inputs are missing or revoked", async () => {
    const { pkg, claim } = tariffAnnualFixture();
    const rules = resolver([pkg]);
    const row: SavedTariffAnnualClaim = {
      claim,
      actualPayment: null,
      revoked: false,
      revision: 1,
      updatedAt: work.updatedAt,
    };
    const screen = await renderHook(() =>
      useDeferredAnnualReport({ ...inputs, ruleResolver: rules }),
    );
    await flush();
    expect(screen.result.current.report!.remuneration!.annualPayments.totalCents).toBeNull();
    mockHistory = { ...mockHistory, tariffAnnualClaims: [row] };
    await screen.rerender(undefined);
    await flush();
    expect(screen.result.current.report!.remuneration!.annualPayments.totalCents).toBe(270000);
    mockHistory = { ...mockHistory, tariffAnnualClaims: [{ ...row, revoked: true }] };
    await screen.rerender(undefined);
    await flush();
    expect(screen.result.current.report!.remuneration!.annualPayments.totalCents).toBeNull();
    expect(mockHistory.saveTariffAnnualClaim).not.toHaveBeenCalled();
  });
  it("invalidates every cached tariff payment after restore and keeps cash years separate", async () => {
    const record: SavedTariffAnnualClaim = {
      claim: tariffAnnualFixture().claim,
      actualPayment: { grossCents: 54321, payoutMonth: "2026-12" },
      revoked: false,
      revision: 1,
      updatedAt: work.updatedAt,
    };
    mockHistory = { ...mockHistory, tariffAnnualClaims: [record] };
    const screen = await renderHook(
      ({ year }: { year: number }) => useDeferredAnnualReport({ ...inputs, year }),
      {
        initialProps: { year: 2026 },
      },
    );
    await flush();
    expect(screen.result.current.report!.remuneration!.annualPayments.totalCents).toBe(54321);
    for (const grossCents of [12345, 0]) {
      mockHistory = {
        ...mockHistory,
        tariffAnnualClaims: [{ ...record, actualPayment: { grossCents, payoutMonth: "2026-12" } }],
      };
      await screen.rerender({ year: 2026 });
      expect(screen.result.current.report).toBeNull();
      await flush();
      expect(screen.result.current.report!.remuneration!.annualPayments.totalCents).toBe(
        grossCents,
      );
    }
    mockHistory = {
      ...mockHistory,
      tariffAnnualClaims: [
        { ...record, actualPayment: { grossCents: 54321, payoutMonth: "2027-01" } },
      ],
    };
    await screen.rerender({ year: 2026 });
    await flush();
    expect(screen.result.current.report!.remuneration!.annualPayments.totalCents).toBe(0);
    await screen.rerender({ year: 2027 });
    await flush();
    const year = screen.result.current.report!.remuneration!;
    expect(year.annualPayments.totalCents).toBe(54321);
    expect(year.months[0].result!.annualPayments.positions).toHaveLength(1);
    expect(year.months.slice(1).flatMap((m) => m.result!.annualPayments.positions)).toEqual([]);
    mockHistory = { ...mockHistory, tariffAnnualClaims: [{ ...record, revoked: true }] };
    await screen.rerender({ year: 2027 });
    await flush();
    expect(screen.result.current.report!.remuneration!.annualPayments.totalCents).toBe(0);
    expect(mockHistory.saveTariffAnnualClaim).not.toHaveBeenCalled();
  });
  it("recomputes the annual estimate after same-revision basis restoration", async () => {
    const { pkg, claim } = tariffAnnualFixture();
    const rules = resolver([pkg]);
    const row: SavedTariffAnnualClaim = {
      claim,
      actualPayment: null,
      revoked: false,
      revision: 1,
      updatedAt: work.updatedAt,
    };
    mockHistory = { ...mockHistory, tariffAnnualClaims: [row] };
    const screen = await renderHook(() =>
      useDeferredAnnualReport({ ...inputs, ruleResolver: rules }),
    );
    await flush();
    expect(screen.result.current.report!.remuneration!.annualPayments.totalCents).toBe(270000);
    mockHistory = {
      ...mockHistory,
      tariffAnnualClaims: [
        {
          ...row,
          claim: {
            ...claim,
            basis: {
              ...claim.basis,
              months: claim.basis.months.map((m) => ({ ...m, baseCents: 600000 })),
            },
          },
        },
      ],
    };
    await screen.rerender(undefined);
    expect(screen.result.current.report).toBeNull();
    await flush();
    expect(screen.result.current.report!.remuneration!.annualPayments.totalCents).toBe(540000);
    mockHistory = { ...mockHistory, status: "error", error: "Lesefehler" };
    await screen.rerender(undefined);
    await flush();
    expect(screen.result.current.report!.remuneration!.annualPayments.totalCents).toBeNull();
  });
  it("invalidates annual totals on same-revision restore, payout-year change and revocation", async () => {
    mockHistory = {
      ...mockHistory,
      profiles: [
        {
          ...history("2026-01-01"),
          data: {
            version: 2,
            weeklyMinutes: 2310,
            selection: {
              kind: "own-configured",
              configuration: {
                ...ownRemunerationFixture(),
                specialPayments: [ownRemunerationFixture().specialPayments[0]],
              },
            },
          },
        },
      ],
    };
    const screen = await renderHook(
      ({ year }: { year: number }) => useDeferredAnnualReport({ ...inputs, year }),
      {
        initialProps: { year: 2026 },
      },
    );
    await flush();
    expect(screen.result.current.report!.remuneration!.annualPayments.totalCents).toBe(75000);
    const record = {
      payment: {
        version: 1 as const,
        revision: 1,
        paymentId: "annual",
        entitlementYear: 2026,
        payoutMonth: "2026-12",
        title: "Sonderzahlung",
        grossCents: 54321,
      },
      revoked: false,
      updatedAt: work.updatedAt,
    };
    for (const amount of [54321, 12345, 0]) {
      mockHistory = {
        ...mockHistory,
        actualAnnualPayments: [{ ...record, payment: { ...record.payment, grossCents: amount } }],
      };
      await screen.rerender({ year: 2026 });
      expect(screen.result.current.report).toBeNull();
      await flush();
      const result = screen.result.current.report!.remuneration!;
      expect(result.annualPayments.totalCents).toBe(amount);
      expect(result.months[10].result?.annualPayments.totalCents).toBe(0);
      expect(result.months[11].result?.annualPayments.totalCents).toBe(amount);
    }
    mockHistory = {
      ...mockHistory,
      actualAnnualPayments: [{ ...record, payment: { ...record.payment, payoutMonth: "2027-01" } }],
    };
    await screen.rerender({ year: 2026 });
    await flush();
    expect(screen.result.current.report!.remuneration!.annualPayments.totalCents).toBe(0);
    await screen.rerender({ year: 2027 });
    await flush();
    expect(
      screen.result.current.report!.remuneration!.months[0].result?.annualPayments.totalCents,
    ).toBe(54321);
    mockHistory = { ...mockHistory, actualAnnualPayments: [{ ...record, revoked: true }] };
    await screen.rerender({ year: 2026 });
    await flush();
    expect(screen.result.current.report!.remuneration!.annualPayments.totalCents).toBe(75000);
    expect(mockHistory.saveActualAnnualPayment).not.toHaveBeenCalled();
  });
  it("recomputes paid absences after a same-revision restore, zero and revocation", async () => {
    const absence = shift({
      date: "2026-09-15",
      type: "VACATION",
      allDay: true,
      startTime: null,
      endTime: null,
      breakMinutes: 0,
    });
    mockLoadedEntries = [absence];
    mockHistory = {
      ...mockHistory,
      profiles: [
        {
          ...history(),
          data: {
            version: 2,
            weeklyMinutes: 2310,
            selection: {
              kind: "own-configured",
              configuration: {
                ...ownRemunerationFixture(),
                base: { kind: "hourly", centsPerHour: 2000 },
                percentageBasisHourlyCents: null,
                timePremiums: null,
                fixedAllowances: [],
                overtime: null,
                specialPayments: [],
              },
            },
          },
        },
      ],
    };
    const screen = await renderHook(() => useDeferredAnnualReport(inputs));
    await flush();
    expect(screen.result.current.report!.remuneration!.base.totalCents).toBeNull();
    const record = {
      shiftId: absence.id,
      shiftRevision: absence.revision,
      shiftDate: absence.date,
      shiftUpdatedAt: absence.updatedAt,
      timeZone: work.timeZone,
      paidMinutes: 462 as number | null,
      revision: 1,
      confirmedAt: absence.updatedAt,
      updatedAt: absence.updatedAt,
    };
    for (const [minutes, amount] of [
      [462, 15400],
      [60, 2000],
      [0, 0],
      [null, null],
    ] as const) {
      mockHistory = { ...mockHistory, paidAbsences: [{ ...record, paidMinutes: minutes }] };
      await screen.rerender(undefined);
      expect(screen.result.current.report).toBeNull();
      await flush();
      expect(screen.result.current.report!.remuneration!.base.totalCents).toBe(amount);
      expect(screen.result.current.report!.remuneration!.months[8].result?.base.totalCents).toBe(
        amount,
      );
    }
    expect(mockHistory.savePaidAbsence).not.toHaveBeenCalled();
  });
  it("refreshes saved overtime contents at equal revision and hides revoked cached pay", async () => {
    const service = shift({
      date: "2026-09-30",
      overtimeMinutes: 60,
      tariffOvertimeConfirmed: true,
    });
    mockLoadedEntries = [service];
    const record = {
      shiftId: service.id,
      shiftRevision: service.revision,
      timeZone: work.timeZone,
      allocations: [
        { date: "2026-09-30", minutes: 20 },
        { date: "2026-10-01", minutes: 40 },
      ],
      revision: 1,
      confirmedAt: work.updatedAt,
      updatedAt: work.updatedAt,
    };
    mockHistory = { ...mockHistory, overtimeAllocations: [record] };
    const screen = await renderHook(() => useDeferredAnnualReport(inputs));
    await flush();
    expect(screen.result.current.report!.remuneration!.months[8].result?.overtime.totalCents).toBe(
      771,
    );
    const first = screen.result.current.report;
    mockHistory = { ...mockHistory, overtimeAllocations: JSON.parse(JSON.stringify([record])) };
    await screen.rerender(undefined);
    expect(screen.result.current.report).toBe(first);
    mockHistory = {
      ...mockHistory,
      overtimeAllocations: [
        {
          ...record,
          allocations: [
            { date: "2026-09-30", minutes: 40 },
            { date: "2026-10-01", minutes: 20 },
          ],
        },
      ],
    };
    await screen.rerender(undefined);
    expect(screen.result.current.report).toBeNull();
    await flush();
    expect(screen.result.current.report!.remuneration!.months[8].result?.overtime.totalCents).toBe(
      1542,
    );
    mockHistory = { ...mockHistory, overtimeAllocations: [{ ...record, allocations: null }] };
    await screen.rerender(undefined);
    expect(screen.result.current.report).toBeNull();
    await flush();
    expect(screen.result.current.report!.remuneration!.overtime.totalCents).toBeNull();
    expect(mockHistory.saveOvertimeAllocation).not.toHaveBeenCalled();
  });

  it("uses dated history without writes and refreshes a same-revision restore", async () => {
    const screen = await renderHook(() => useDeferredAnnualReport(inputs));
    await flush();
    const first = screen.result.current.report!.remuneration!;
    expect(first.base.totalCents).toBeGreaterThan(0);
    mockHistory = { ...mockHistory, profiles: [history("2026-01-01", "P6")] };
    await screen.rerender(undefined);
    expect(screen.result.current.report).toBeNull();
    await flush();
    expect(screen.result.current.report!.remuneration!.base.totalCents).not.toBe(
      first.base.totalCents,
    );
    expect(mockHistory.saveProfile).not.toHaveBeenCalled();
    expect(mockHistory.saveAllowanceDecisions).not.toHaveBeenCalled();
  });
  it("reuses completed work after equal-content database reloads", async () => {
    const screen = await renderHook(() => useDeferredAnnualReport(inputs));
    await flush();
    const first = screen.result.current.report;
    const scheduled = jest.mocked(scheduleIdleWork).mock.calls.length;
    mockHistory = { ...mockHistory, profiles: JSON.parse(JSON.stringify(mockHistory.profiles)) };
    await screen.rerender(undefined);
    expect(screen.result.current.report).toBe(first);
    expect(jest.mocked(scheduleIdleWork).mock.calls.length).toBe(scheduled);
  });
  it.each(["loading", "error"] as const)(
    "immediately hides old pay on %s and keeps completed work data available",
    async (status) => {
      mockLoadedEntries = [shift()];
      const screen = await renderHook(() =>
        useDeferredAnnualReport({ ...inputs, entries: mockLoadedEntries }),
      );
      await flush();
      const first = screen.result.current.report!;
      mockHistory = { ...mockHistory, status, error: status === "error" ? "Lesefehler" : null };
      await screen.rerender(undefined);
      expect(screen.result.current.report).toBeNull();
      await flush();
      const next = screen.result.current.report!;
      expect(next.actualMinutes).toBe(first.actualMinutes);
      expect(next.remuneration!.estimatedGrossCents).toBeNull();
      expect(next.remuneration!.status).toBe(status);
      expect(next.remuneration!.months.every((item) => item.result === null)).toBe(true);
    },
  );
  it("does not lose previous-year carry-in to the legacy annual input selector", async () => {
    mockLoadedEntries = [shift({ date: "2025-12-31" })];
    const screen = await renderHook(() => useDeferredAnnualReport(inputs));
    await flush();
    expect(
      screen.result.current.report!.remuneration!.months[0].result!.timePremiums.totalCents,
    ).toBeGreaterThan(0);
  });
  it("does not commit stale profile work after a snapshot changes mid-calculation", async () => {
    const screen = await renderHook(() => useDeferredAnnualReport(inputs));
    await act(async () => {
      jest.advanceTimersToNextTimer();
    });
    mockHistory = { ...mockHistory, profiles: [] };
    await screen.rerender(undefined);
    await flush();
    const pay = screen.result.current.report!.remuneration!;
    expect(pay.base.totalCents).toBeNull();
    expect(pay.estimatedGrossCents).toBeNull();
    expect(pay.knownSubtotalCents).toBe(0);
  });
  it("does not schedule annual pay while disabled", async () => {
    const screen = await renderHook(() => useDeferredAnnualReport({ ...inputs, enabled: false }));
    await flush();
    expect(scheduleIdleWork).not.toHaveBeenCalled();
    expect(screen.result.current.report).toBeNull();
  });
});
