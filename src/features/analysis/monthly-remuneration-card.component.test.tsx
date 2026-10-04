import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, renderHook } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";
import { router } from "expo-router";
import type { useRemunerationData } from "@/application/remuneration-provider";
import type { CalendarEntry, UserProfile } from "@/domain/types";
import { DEFAULT_ANALYSIS_VIEW, type AnalysisViewPreferences } from "@/domain/analysis-view";
import { history, resolver, shift, work } from "@/engine/remuneration-test-fixtures";
import * as remuneration from "@/engine/remuneration-month";
import { DARK_PALETTE, LIGHT_PALETTE } from "@/theme/palette-values";
import { remunerationEuro } from "@/features/salary/remuneration-presentation";
import { settingsEditorRoute } from "@/navigation/routes";
import { AnalysisDashboard } from "./dashboard-cards";
import { MonthlyRemunerationCard } from "./monthly-remuneration-card";
import { useMonthlyRemuneration } from "./use-monthly-remuneration";
import { ownRemunerationFixture } from "@/domain/own-remuneration-test-fixtures";
import { tariffAnnualFixture } from "@/engine/tariff-annual-test-fixtures";
import type { SavedTariffAnnualClaim } from "@/domain/saved-tariff-annual-claim";

let mockHistory: ReturnType<typeof useRemunerationData>;
let mockProfile: UserProfile;
let mockEntries: readonly CalendarEntry[];
let mockResolver = resolver();
let mockPalette = LIGHT_PALETTE;
let mockPreferences: AnalysisViewPreferences;
let mockFontScale = 1;
it("refreshes tariff payments after same-revision restore, payout-month change and revocation", async () => {
  const record: SavedTariffAnnualClaim = {
    claim: tariffAnnualFixture().claim,
    actualPayment: { grossCents: 54321, payoutMonth: "2026-11" },
    revoked: false,
    revision: 1,
    updatedAt: work.updatedAt,
  };
  const screen = await renderHook(({ month }: { month: string }) => useMonthlyRemuneration(month), {
    initialProps: { month: "2026-11" },
  });
  const annualTotal = () => {
    const result = screen.result.current.calculation;
    if (!result?.ok) throw new Error("Missing monthly calculation");
    return result.value.annualPayments.totalCents;
  };
  expect(annualTotal()).toBeNull();
  for (const grossCents of [54321, 12345, 0]) {
    mockHistory = {
      ...mockHistory,
      tariffAnnualClaims: [{ ...record, actualPayment: { grossCents, payoutMonth: "2026-11" } }],
    };
    await screen.rerender({ month: "2026-11" });
    expect(annualTotal()).toBe(grossCents);
  }
  mockHistory = {
    ...mockHistory,
    tariffAnnualClaims: [
      { ...record, actualPayment: { grossCents: 54321, payoutMonth: "2027-01" } },
    ],
  };
  await screen.rerender({ month: "2026-11" });
  expect(annualTotal()).toBe(0);
  await screen.rerender({ month: "2027-01" });
  expect(annualTotal()).toBeNull();
  const january = screen.result.current.calculation;
  if (!january?.ok) throw new Error("Missing January calculation");
  expect(january.value.annualPayments.knownSubtotalCents).toBe(54321);
  expect(
    january.value.annualPayments.positions.filter((position) => position.amountCents === 54321),
  ).toHaveLength(1);
  expect(
    january.value.annualPayments.positions.some(
      (position) => position.issue?.code === "ANNUAL_RULE_MISSING",
    ),
  ).toBe(true);
  mockHistory = { ...mockHistory, tariffAnnualClaims: [{ ...record, revoked: true }] };
  await screen.rerender({ month: "2026-11" });
  expect(annualTotal()).toBeNull();
  expect(mockHistory.saveTariffAnnualClaim).not.toHaveBeenCalled();
  expect(mockHistory.revokeTariffAnnualClaim).not.toHaveBeenCalled();
});
it("recalculates tariff estimates on claim-content and active-catalog changes", async () => {
  const { pkg, claim } = tariffAnnualFixture();
  mockResolver = resolver([pkg]);
  const record: SavedTariffAnnualClaim = {
    claim,
    actualPayment: null,
    revoked: false,
    revision: 1,
    updatedAt: work.updatedAt,
  };
  mockHistory = { ...mockHistory, tariffAnnualClaims: [record] };
  const screen = await renderHook(() => useMonthlyRemuneration("2026-11"));
  const result = () => {
    const r = screen.result.current.calculation;
    if (!r?.ok) throw new Error("Missing monthly calculation");
    return r.value.annualPayments;
  };
  expect(result().totalCents).toBe(270000);
  mockHistory = {
    ...mockHistory,
    tariffAnnualClaims: [
      { ...record, claim: { ...claim, selection: { ...claim.selection, confirmed: false } } },
    ],
  };
  await screen.rerender(undefined);
  expect(result().totalCents).toBeNull();
  mockHistory = { ...mockHistory, tariffAnnualClaims: [record] };
  mockResolver = resolver([]);
  await screen.rerender(undefined);
  expect(result().positions[0].issue?.code).toBe("ANNUAL_RULE_MISSING");
  mockHistory = { ...mockHistory, status: "loading" };
  await screen.rerender(undefined);
  expect(screen.result.current.calculation).toBeNull();
});
const mockSettings = { workplaceCoverage: "UNKNOWN", assignment: "UNKNOWN", updatedAt: null };

it("updates monthly paid absence amounts from saved snapshot contents without writes", async () => {
  const absence = shift({
    date: "2026-09-15",
    type: "VACATION",
    allDay: true,
    startTime: null,
    endTime: null,
    breakMinutes: 0,
  });
  mockEntries = [absence];
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
  const screen = await renderHook(() => useMonthlyRemuneration("2026-09"));
  const baseTotal = () => {
    const calculation = screen.result.current.calculation;
    if (!calculation || !calculation.ok) throw new Error("Missing monthly calculation");
    return calculation.value.base.totalCents;
  };
  expect(baseTotal()).toBeNull();
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
    expect(baseTotal()).toBe(amount);
  }
  expect(mockHistory.savePaidAbsence).not.toHaveBeenCalled();
});
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("@/application/remuneration-provider", () => ({
  useRemunerationData: () => mockHistory,
}));
jest.mock("@/application/training-provider", () => ({
  useTrainingData: () => ({ status: "ready", shifts: [] }),
}));
jest.mock("@/application/rule-catalog-runtime-provider", () => ({
  useRuleCatalogRuntime: () => ({ resolver: mockResolver }),
}));
jest.mock("@/application/pflegeshift-provider", () => ({
  usePflegeShiftEntries: () => ({ entries: mockEntries }),
  usePflegeShiftProfile: () => ({ profile: mockProfile }),
  usePflegeShiftStatus: () => ({ ready: true, error: null }),
  usePflegeShiftTariff: () => ({ tariffDecisions: [], workPatternSettings: mockSettings }),
}));
jest.mock("./analysis-view-preferences", () => ({
  useAnalysisView: () => ({ preferences: mockPreferences }),
}));
jest.mock("@/theme/palette", () => ({ usePalette: () => mockPalette }));
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: 430, height: 932, scale: 3, fontScale: mockFontScale }),
}));
jest.mock("@/ui/haptics", () => ({ selectionFeedback: jest.fn() }));

function confirmNone() {
  mockHistory = {
    ...mockHistory,
    allowanceDecisions: [
      {
        month: "2026-09",
        revision: 1,
        updatedAt: work.updatedAt,
        decisions: [
          {
            from: "2026-09-01",
            through: "2026-09-30",
            allowanceStatus: "NONE",
            tariff: { packageId: "tvoed-vka-bt-k", variant: "BT_K", region: "OTHER" },
            revision: 1,
            confirmedAt: work.updatedAt,
            updatedAt: work.updatedAt,
          },
        ],
      },
    ],
  };
}
function Dashboard() {
  return (
    <AnalysisDashboard
      cards={{
        PAY: <MonthlyRemunerationCard month="2026-09" />,
        WORK: <Text>Arbeitszeit bleibt sichtbar</Text>,
        CHECK: null,
        SHIFTS: null,
      }}
    />
  );
}
beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  mockEntries = [];
  mockResolver = resolver();
  mockPalette = LIGHT_PALETTE;
  mockFontScale = 1;
  mockPreferences = DEFAULT_ANALYSIS_VIEW;
  mockProfile = { ...work, tariff: { ...work.tariff!, payGroup: "P9", payLevel: 5 } };
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
describe("monthly dated remuneration card", () => {
  it("replaces an annual estimate, refreshes equal-revision contents and restores the estimate on revocation", async () => {
    mockHistory = {
      ...mockHistory,
      profiles: [
        {
          ...history("2026-01-01"),
          data: {
            version: 2,
            weeklyMinutes: 2310,
            selection: { kind: "own-configured", configuration: ownRemunerationFixture() },
          },
        },
      ],
    };
    const screen = await renderHook(() => useMonthlyRemuneration("2026-11"));
    const total = () => {
      const calculation = screen.result.current.calculation;
      if (!calculation?.ok) throw new Error("Missing monthly calculation");
      return calculation.value.annualPayments.totalCents;
    };
    expect(total()).toBe(75000);
    const record = {
      payment: {
        version: 1 as const,
        revision: 1,
        paymentId: "annual",
        entitlementYear: 2026,
        payoutMonth: "2026-11",
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
      await screen.rerender(undefined);
      expect(total()).toBe(amount);
    }
    mockHistory = {
      ...mockHistory,
      actualAnnualPayments: [{ ...record, payment: { ...record.payment, payoutMonth: "2027-01" } }],
    };
    await screen.rerender(undefined);
    expect(total()).toBe(0);
    mockHistory = { ...mockHistory, actualAnnualPayments: [{ ...record, revoked: true }] };
    await screen.rerender(undefined);
    expect(total()).toBe(75000);
    mockHistory = { ...mockHistory, status: "loading" };
    await screen.rerender(undefined);
    expect(screen.result.current.calculation).toBeNull();
    expect(mockHistory.saveActualAnnualPayment).not.toHaveBeenCalled();
  });
  it("refreshes stored day allocations and rejects stale or cleared confirmations in the real card", async () => {
    confirmNone();
    const service = shift({
      date: "2026-09-30",
      overtimeMinutes: 60,
      tariffOvertimeConfirmed: true,
    });
    mockEntries = [service];
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
    const screen = await render(<MonthlyRemunerationCard month="2026-09" />);
    expect(screen.getByLabelText("Überstundenvergütung: 7,71 €")).toBeTruthy();
    expect(screen.getByText("Brutto gesamt")).toBeTruthy();
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
    await screen.rerender(<MonthlyRemunerationCard month="2026-09" />);
    expect(screen.getByLabelText("Überstundenvergütung: 15,42 €")).toBeTruthy();
    mockEntries = [{ ...service, revision: 2 }];
    await screen.rerender(<MonthlyRemunerationCard month="2026-09" />);
    expect(screen.queryByText("Brutto gesamt")).toBeNull();
    expect(screen.getByRole("button", { name: "Gehalt, Nicht verfügbar" })).toBeTruthy();
    mockHistory = {
      ...mockHistory,
      overtimeAllocations: [{ ...record, shiftRevision: 2, revision: 2 }],
    };
    await screen.rerender(<MonthlyRemunerationCard month="2026-09" />);
    expect(screen.getByLabelText("Überstundenvergütung: 7,71 €")).toBeTruthy();
    mockHistory = {
      ...mockHistory,
      overtimeAllocations: [{ ...record, shiftRevision: 2, allocations: null }],
    };
    await screen.rerender(<MonthlyRemunerationCard month="2026-09" />);
    expect(screen.queryByText("Brutto gesamt")).toBeNull();
    expect(screen.getByText("Bekannter Teilbetrag")).toBeTruthy();
    expect(mockHistory.saveOvertimeAllocation).not.toHaveBeenCalled();
  });

  it("shows a dated P5 subtotal instead of the legacy P9 salary when assessment is incomplete", async () => {
    const screen = await render(<MonthlyRemunerationCard month="2026-09" />);
    expect(screen.getByLabelText("Grundgehalt: 2.907,18 €")).toBeTruthy();
    expect(screen.getByText("Bekannter Teilbetrag")).toBeTruthy();
    expect(screen.queryByText("Brutto gesamt")).toBeNull();
    expect(screen.getByRole("button", { name: "Gehalt, Nicht verfügbar" })).toBeTruthy();
    expect(mockHistory.saveProfile).not.toHaveBeenCalled();
    expect(mockHistory.saveAllowanceDecisions).not.toHaveBeenCalled();
  });
  it("uses the same full result as the shared engine after a scoped confirmation", async () => {
    confirmNone();
    mockEntries = [shift({ date: "2026-08-31" })];
    const result = remuneration.calculateAssessedMonthlyRemuneration({
      month: "2026-09",
      workProfile: mockProfile,
      shifts: mockEntries.filter((entry) => entry.kind === "SHIFT"),
      history: mockHistory.profiles,
      resolver: mockResolver,
      settings: { workplaceCoverage: "UNKNOWN", assignment: "UNKNOWN", updatedAt: null },
      decisions: mockHistory.allowanceDecisions[0].decisions,
    });
    expect(result.complete).toBe(true);
    const screen = await render(<MonthlyRemunerationCard month="2026-09" />);
    expect(
      screen.getByLabelText("Brutto gesamt: " + remunerationEuro(result.estimatedGrossCents)),
    ).toBeTruthy();
    expect(
      screen.getByLabelText("Zeitzuschläge: " + remunerationEuro(result.timePremiums.totalCents)),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: /^Gehalt,/ }));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/salary",
      params: { month: "2026-09" },
    });
  });
  it("refreshes totals after decisions and dated profiles change", async () => {
    const screen = await render(<MonthlyRemunerationCard month="2026-09" />);
    confirmNone();
    await screen.rerender(<MonthlyRemunerationCard month="2026-09" />);
    expect(screen.getByText("Brutto gesamt")).toBeTruthy();
    mockHistory = { ...mockHistory, profiles: [history("2026-01-01", "P6")] };
    await screen.rerender(<MonthlyRemunerationCard month="2026-09" />);
    expect(screen.getByLabelText("Grundgehalt: 3.012,49 €")).toBeTruthy();
    expect(screen.queryByLabelText("Grundgehalt: 2.907,18 €")).toBeNull();
  });
  it("does not retain stale amounts after a catalog replacement", async () => {
    confirmNone();
    const screen = await render(<MonthlyRemunerationCard month="2026-09" />);
    mockResolver = resolver([]);
    await screen.rerender(<MonthlyRemunerationCard month="2026-09" />);
    expect(screen.queryByText("Brutto gesamt")).toBeNull();
    expect(screen.queryByText(/2.907,18/)).toBeNull();
    expect(screen.getByLabelText("Grundgehalt: Nicht berechenbar")).toBeTruthy();
  });
  it.each(["loading", "error"] as const)(
    "hides stale money while snapshot is %s",
    async (status) => {
      confirmNone();
      const screen = await render(<MonthlyRemunerationCard month="2026-09" />);
      mockHistory = { ...mockHistory, status, error: status === "error" ? "Lesefehler" : null };
      await screen.rerender(<MonthlyRemunerationCard month="2026-09" />);
      expect(screen.queryByText("Grundgehalt")).toBeNull();
      expect(screen.queryByText(/2.907,18/)).toBeNull();
      expect(
        screen.getByRole("button", {
          name: "Gehalt, " + (status === "loading" ? "Wird berechnet …" : "Nicht verfügbar"),
        }),
      ).toBeTruthy();
    },
  );
  it("offers setup when no dated remuneration exists and never borrows the legacy profile", async () => {
    mockHistory = { ...mockHistory, profiles: [] };
    const screen = await render(<MonthlyRemunerationCard month="2026-09" />);
    await fireEvent.press(screen.getByRole("button", { name: "Gehalt, Gehalt einrichten" }));
    expect(router.push).toHaveBeenLastCalledWith(settingsEditorRoute("TARIFF"));
    expect(screen.queryByText("Brutto gesamt")).toBeNull();
    expect(screen.queryByText(/2.907,18/)).toBeNull();
  });
  it("does not resolve an undated legacy snapshot to a full gross amount", async () => {
    mockHistory = { ...mockHistory, profiles: [{ ...history(), effectiveFrom: null }] };
    const screen = await render(<MonthlyRemunerationCard month="2026-09" />);
    expect(screen.queryByText("Brutto gesamt")).toBeNull();
    expect(screen.queryByText(/2.907,18/)).toBeNull();
  });
  it("does not calculate hidden pay cards, including after an unmount", async () => {
    const calculate = jest.spyOn(remuneration, "calculateAssessedMonthlyRemuneration");
    mockPreferences = { ...DEFAULT_ANALYSIS_VIEW, hidden: ["PAY"] };
    const screen = await render(<Dashboard />);
    expect(calculate).not.toHaveBeenCalled();
    expect(screen.getByText("Arbeitszeit bleibt sichtbar")).toBeTruthy();
    mockPreferences = DEFAULT_ANALYSIS_VIEW;
    await screen.rerender(<Dashboard />);
    expect(calculate).toHaveBeenCalled();
    mockPreferences = { ...DEFAULT_ANALYSIS_VIEW, hidden: ["PAY"] };
    await screen.rerender(<Dashboard />);
    calculate.mockClear();
    mockHistory = { ...mockHistory, profiles: [history("2026-01-01", "P6")] };
    await screen.rerender(<Dashboard />);
    expect(calculate).not.toHaveBeenCalled();
    expect(screen.queryByText("Gehalt")).toBeNull();
  });
  it("updates theme and stacks readable values at large font sizes without clipping text", async () => {
    const screen = await render(<MonthlyRemunerationCard month="2026-09" />);
    mockPalette = DARK_PALETTE;
    mockFontScale = 2.5;
    await screen.rerender(<MonthlyRemunerationCard month="2026-09" />);
    expect(
      StyleSheet.flatten(screen.getByLabelText("Grundgehalt: 2.907,18 €").props.style)
        .flexDirection,
    ).toBe("column");
    expect(StyleSheet.flatten(screen.getAllByText("2.907,18 €")[0].props.style).color).toBe(
      DARK_PALETTE.text,
    );
    for (const text of screen.getAllByText(/.+/)) {
      expect(text.props.numberOfLines).toBeUndefined();
      expect(text.props.allowFontScaling).not.toBe(false);
    }
  });
});
