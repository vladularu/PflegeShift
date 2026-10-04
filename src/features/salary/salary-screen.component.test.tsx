import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render } from "@testing-library/react-native";
import * as MockReact from "react";
import { StyleSheet } from "react-native";
import { router } from "expo-router";
import type { useRemunerationData } from "@/application/remuneration-provider";
import type {
  CalendarEntry,
  MonthlyTariffDecision,
  TvoedWorkPatternSettings,
  UserProfile,
} from "@/domain/types";
import { history, resolver, shift, work } from "@/engine/remuneration-test-fixtures";
import { calculateAssessedMonthlyRemuneration } from "@/engine/remuneration-month";
import { DARK_PALETTE, LIGHT_PALETTE } from "@/theme/palette-values";
import { PremiumDetailsScreen } from "@/features/analysis/premium-details-screen";
import { remunerationEuro } from "./remuneration-presentation";
import { SalaryScreen } from "./salary-screen";
import { ownRemunerationFixture } from "@/domain/own-remuneration-test-fixtures";
import { tariffAnnualFixture } from "@/engine/tariff-annual-test-fixtures";
import { tvlProfile, tvlRules } from "@/engine/tvl-shift-work-test-fixtures";
import tvalValue from "../../../rules/packages/reviewed/tval-pflege-tdl/2026-04.json";
import sueValue from "../../../rules/packages/reviewed/tvoed-vka-sue-bt-b/2026-05-01-draft1.json";
import annexAValue from "../../../rules/packages/reviewed/tvoed-vka-anlage-a/2026-05-01-draft1.json";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";

let mockHistory: ReturnType<typeof useRemunerationData>;
let mockProfile: UserProfile;
let mockEntries: readonly CalendarEntry[];
let mockDecisions: readonly MonthlyTariffDecision[];
let mockSettings: TvoedWorkPatternSettings;
let mockResolver = resolver();
let mockMonth = "2026-09";
let mockRouteMonth: string | undefined;
let mockRootError: string | null;
let mockPalette = LIGHT_PALETTE;
const mockReload = jest.fn<() => Promise<void>>();
const mockRootReload = jest.fn<() => Promise<void>>();
const mockCoordinator = {
  getMonth: () => mockMonth,
  setMonth: jest.fn((month: string) => {
    mockMonth = month;
  }),
};
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ month: mockRouteMonth }),
  useFocusEffect: (effect: () => void) => MockReact.useEffect(effect, [effect]),
}));
jest.mock("@/navigation/active-month", () => ({
  useActiveMonthCoordinator: () => mockCoordinator,
}));
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
  usePflegeShiftStatus: () => ({ ready: true, error: mockRootError, reload: mockRootReload }),
  usePflegeShiftTariff: () => ({
    tariffDecisions: mockDecisions,
    workPatternSettings: mockSettings,
  }),
  usePflegeShiftTestData: () => ({ testMonths: ["2026-09"] }),
}));
jest.mock("@/theme/palette", () => ({ usePalette: () => mockPalette }));
jest.mock("@/ui/haptics", () => ({ selectionFeedback: jest.fn() }));

function result() {
  return calculateAssessedMonthlyRemuneration({
    month: mockMonth,
    workProfile: mockProfile,
    shifts: mockEntries.filter((entry) => entry.kind === "SHIFT"),
    history: mockHistory.profiles,
    settings: mockSettings,
    resolver: mockResolver,
    decisions: mockHistory.allowanceDecisions.find((item) => item.month === mockMonth)?.decisions,
    legacyDecision: mockDecisions.find((item) => item.month === mockMonth),
  });
}
beforeEach(() => {
  jest.clearAllMocks();
  mockMonth = "2026-09";
  mockRouteMonth = "2026-09";
  mockRootError = null;
  mockEntries = [];
  mockDecisions = [];
  mockResolver = resolver();
  mockPalette = LIGHT_PALETTE;
  mockProfile = { ...work, tariff: { ...work.tariff!, payGroup: "P9", payLevel: 5 } };
  mockSettings = { workplaceCoverage: "UNKNOWN", assignment: "UNKNOWN", updatedAt: null };
  mockReload.mockResolvedValue(undefined);
  mockRootReload.mockResolvedValue(undefined);
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
    reload: mockReload,
    saveProfile: jest.fn<ReturnType<typeof useRemunerationData>["saveProfile"]>(),
    saveAllowanceDecisions:
      jest.fn<ReturnType<typeof useRemunerationData>["saveAllowanceDecisions"]>(),
  };
});
describe("dated salary detail integration", () => {
  it("opens Caritas month facts for the displayed dated selection without claiming gross", async () => {
    const selected: DatedRemunerationProfile = {
      ...history(),
      data: {
        version: 1,
        weeklyMinutes: 2340,
        selection: {
          kind: "tariff",
          packageId: "avr-caritas-p-bw",
          variant: "ANLAGE_31",
          region: "BW",
          group: "p6",
          level: "1",
          fullTimeWeeklyMinutes: 2340,
        },
      },
    };
    mockHistory = { ...mockHistory, profiles: [selected] };
    const view = await render(<SalaryScreen />);
    expect(view.queryByText("BRUTTO-SCHÄTZUNG")).toBeNull();
    await fireEvent.press(
      view.getByRole("button", { name: "Caritas-Monatsangaben (Entwurf) bestätigen" }),
    );
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/caritas-month-facts",
      params: { month: "2026-09" },
    });
    mockHistory = { ...mockHistory, profiles: [history()] };
    await view.rerender(<SalaryScreen />);
    expect(
      view.queryByRole("button", { name: "Caritas-Monatsangaben (Entwurf) bestätigen" }),
    ).toBeNull();
  });

  it.each([LIGHT_PALETTE, DARK_PALETTE])(
    "explains missing personal annual inputs without an invented revision or zero payment",
    async (palette) => {
      mockPalette = palette;
      mockMonth = "2026-11";
      mockRouteMonth = "2026-11";
      mockResolver = resolver([tariffAnnualFixture().pkg]);
      const view = await render(<SalaryScreen />);
      const card = view.getByRole("button", { name: "Jahressonderzahlung, Details öffnen" });
      expect(card.props.accessibilityValue.text).toBe("Nicht berechenbar");
      await fireEvent.press(card);
      expect(
        view.getAllByText(/Persönliche Angaben zur tariflichen Jahressonderzahlung fehlen/),
      ).toHaveLength(2);
      await fireEvent.press(
        view.getByRole("button", { name: /^Berechnungsgrundlage: Tarifliche Jahressonderzahlung/ }),
      );
      expect(view.getByText("Persönliche Jahresangaben noch nicht erfasst")).toBeTruthy();
      expect(view.queryByText(/Persönliche Anspruchsangaben · Revision/)).toBeNull();
    },
  );
  it.each([LIGHT_PALETTE, DARK_PALETTE])(
    "separates tariff estimates from confirmed actual payments in details",
    async (palette) => {
      mockPalette = palette;
      const { claim, pkg } = tariffAnnualFixture();
      mockMonth = "2026-11";
      mockRouteMonth = "2026-11";
      mockResolver = resolver([pkg]);
      const row = {
        claim,
        actualPayment: null,
        revoked: false,
        revision: 1,
        updatedAt: work.updatedAt,
      };
      mockHistory = { ...mockHistory, tariffAnnualClaims: [row] };
      const view = await render(<SalaryScreen />);
      await fireEvent.press(
        view.getByRole("button", { name: "Jahressonderzahlung, Details öffnen" }),
      );
      await fireEvent.press(
        view.getByRole("button", { name: /^Berechnungsgrundlage: Tarifliche Jahressonderzahlung/ }),
      );
      expect(view.getByText("Bemessungsmonate: 07.2026, 08.2026, 09.2026")).toBeTruthy();
      expect(view.getByText("Persönliche Anspruchsangaben · Revision 1")).toBeTruthy();
      expect(view.getByText(`Regelfassungen: ${pkg.versionId}`)).toBeTruthy();
      mockHistory = {
        ...mockHistory,
        tariffAnnualClaims: [
          { ...row, actualPayment: { grossCents: 12345, payoutMonth: "2026-11" } },
        ],
      };
      await view.rerender(<SalaryScreen />);
      expect(view.getByText("Persönlich bestätigte tatsächliche Bruttozahlung")).toBeTruthy();
      expect(view.getByText("Quelle: persönliche Angaben")).toBeTruthy();
      expect(view.queryByText(/^Regelfassungen:/)).toBeNull();
      expect(view.queryByText(/^Angefragt, nicht verfügbar:/)).toBeNull();
    },
  );
  it.each([LIGHT_PALETTE, DARK_PALETTE])(
    "shows own annual payment separately with an expandable calculation",
    async (palette) => {
      mockPalette = palette;
      mockMonth = "2026-11";
      mockRouteMonth = "2026-11";
      mockHistory = {
        ...mockHistory,
        profiles: [
          {
            ...history("2026-01-01"),
            data: {
              version: 2,
              weeklyMinutes: 1155,
              selection: {
                kind: "own-configured",
                configuration: {
                  ...ownRemunerationFixture(),
                  fixedAllowances: [],
                  timePremiums: null,
                  overtime: null,
                },
              },
            },
          },
        ],
      };
      const screen = await render(<SalaryScreen />);
      const card = screen.getByRole("button", { name: "Jahressonderzahlung, Details öffnen" });
      await fireEvent.press(
        screen.getByRole("button", { name: "Jahressonderzahlungen bearbeiten" }),
      );
      expect(router.push).toHaveBeenCalledWith({
        pathname: "/annual-payment",
        params: { month: "2026-11" },
      });
      expect(card.props.accessibilityValue.text).toBe("750,00 € · Geschätzt");
      await fireEvent.press(card);
      await fireEvent.press(
        screen.getByRole("button", { name: /^Berechnungsgrundlage: Jahressonderzahlung,/ }),
      );
      const basis = screen.getByText("Anspruch: 6 von 12 Monaten");
      expect(basis.props.numberOfLines).toBeUndefined();
      expect(basis.props.allowFontScaling).not.toBe(false);
      expect(screen.getByText("Bestätigte Grundlage: 2.000,00 €")).toBeTruthy();
      mockRouteMonth = "2026-10";
      await screen.rerender(<SalaryScreen />);
      expect(
        screen.queryByRole("button", { name: "Jahressonderzahlung, Details öffnen" }),
      ).toBeNull();
    },
  );
  it("offers absence confirmation for hourly pay and keeps the displayed month", async () => {
    const screen = await render(<SalaryScreen />);
    expect(
      screen.queryByRole("button", { name: "Bezahlte Abwesenheitsstunden bestätigen" }),
    ).toBeNull();
    mockHistory = {
      ...mockHistory,
      profiles: [
        {
          ...history(),
          data: {
            version: 2,
            weeklyMinutes: 1155,
            selection: {
              kind: "own-configured",
              configuration: {
                base: { kind: "hourly", centsPerHour: 2000 },
                percentageBasisHourlyCents: null,
                timePremiums: null,
                overtime: null,
                fixedAllowances: [],
                specialPayments: [],
              },
            },
          },
        },
      ],
    };
    await screen.rerender(<SalaryScreen />);
    await fireEvent.press(
      screen.getByRole("button", { name: "Bezahlte Abwesenheitsstunden bestätigen" }),
    );
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/paid-absence",
      params: { month: "2026-09" },
    });
  });
  it("opens the allocation editor for the displayed month", async () => {
    const screen = await render(<SalaryScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Überstunden den Tagen zuordnen" }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/overtime-allocation",
      params: { month: "2026-09" },
    });
  });
  it("offers service confirmation for TV-L and TVA-L, not unrelated remuneration", async () => {
    const screen = await render(<SalaryScreen />);
    expect(screen.queryByRole("button", { name: "TV-L-Dienstangaben bestätigen" })).toBeNull();
    mockHistory = { ...mockHistory, profiles: [tvlProfile()] };
    mockResolver = tvlRules;
    await screen.rerender(<SalaryScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "TV-L-Dienstangaben bestätigen" }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/tvl-shift-work",
      params: { month: "2026-09" },
    });
    mockHistory = {
      ...mockHistory,
      profiles: [
        {
          ...history(),
          data: {
            version: 7,
            weeklyMinutes: 2310,
            selection: {
              kind: "tariff",
              packageId: "tval-pflege-tdl",
              variant: "CARE",
              region: "WEST_38_5",
              group: "regular",
              level: "1",
              fullTimeWeeklyMinutes: 2310,
              tvalEmployerScope: null,
              tvlEmploymentCategory: null,
            },
          },
        },
      ],
    };
    mockResolver = resolver([tvalValue as RuleTariffPackage]);
    await screen.rerender(<SalaryScreen />);
    expect(screen.queryByRole("button", { name: "TV-L-Dienstangaben bestätigen" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "TVA-L-Dienstangaben bestätigen" }));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/tvl-shift-work",
      params: { month: "2026-09" },
    });
  });
  it("offers SuE month answers only for the matching draft tariff", async () => {
    const screen = await render(<SalaryScreen />);
    expect(screen.queryByRole("button", { name: /SuE-Monatsangaben/ })).toBeNull();
    const sueProfile: DatedRemunerationProfile = {
      effectiveFrom: "2026-09-01",
      revision: 1,
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-01T00:00:00Z",
      data: {
        version: 1,
        weeklyMinutes: 2340,
        selection: {
          kind: "tariff",
          packageId: "tvoed-vka-sue-bt-b",
          variant: "BT_B",
          region: "VKA",
          group: "S8A",
          level: "3",
          fullTimeWeeklyMinutes: 2340,
        },
      },
    };
    mockHistory = { ...mockHistory, profiles: [sueProfile] };
    mockResolver = resolver([sueValue as RuleTariffPackage]);
    await screen.rerender(<SalaryScreen />);
    await fireEvent.press(
      screen.getByRole("button", { name: "SuE-Monatsangaben (Entwurf) bestätigen" }),
    );
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/sue-month",
      params: { month: "2026-09" },
    });
    mockHistory = {
      ...mockHistory,
      profiles: [sueProfile, { ...sueProfile, effectiveFrom: "2026-09-16", revision: 2 }],
    };
    await screen.rerender(<SalaryScreen />);
    expect(screen.queryByRole("button", { name: /SuE-Monatsangaben/ })).toBeNull();
  });
  it("offers Anlage A month answers only for one matching draft tariff", async () => {
    const screen = await render(<SalaryScreen />);
    expect(screen.queryByRole("button", { name: /TVöD-Anlage-A-Monatsangaben/ })).toBeNull();
    const annexProfile: DatedRemunerationProfile = {
      effectiveFrom: "2026-09-01",
      revision: 1,
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-01T00:00:00Z",
      data: {
        version: 1,
        weeklyMinutes: 2340,
        selection: {
          kind: "tariff",
          packageId: "tvoed-vka-anlage-a",
          variant: "BT_K",
          region: "VKA",
          group: "EG8",
          level: "3",
          fullTimeWeeklyMinutes: 2340,
        },
      },
    };
    mockHistory = { ...mockHistory, profiles: [annexProfile] };
    mockResolver = resolver([annexAValue as RuleTariffPackage]);
    await screen.rerender(<SalaryScreen />);
    await fireEvent.press(
      screen.getByRole("button", { name: "TVöD-Anlage-A-Monatsangaben (Entwurf) bestätigen" }),
    );
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/annex-a-month",
      params: { month: "2026-09" },
    });
    mockHistory = {
      ...mockHistory,
      profiles: [annexProfile, { ...annexProfile, effectiveFrom: "2026-09-16", revision: 2 }],
    };
    await screen.rerender(<SalaryScreen />);
    expect(screen.queryByRole("button", { name: /TVöD-Anlage-A-Monatsangaben/ })).toBeNull();
  });
  it("uses the dated P5 profile instead of the legacy P9 profile and exposes its rule source", async () => {
    const screen = await render(<SalaryScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Grundentgelt, Details öffnen" }));
    expect(screen.getAllByText(/2.907,18/).length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByRole("button", { name: /^Berechnungsgrundlage:/ }));
    expect(screen.getByText("Vergütungsprofil ab 2026-01-01 · Revision 1")).toBeTruthy();
    expect(screen.getByText("Regelpaket: tvoed-vka-bt-k · 2026-05-r3")).toBeTruthy();
    expect(screen.getByText(/Vollzeit-Wochenstunden: 38,5/)).toBeTruthy();
    expect(mockHistory.saveProfile).not.toHaveBeenCalled();
    expect(mockHistory.saveAllowanceDecisions).not.toHaveBeenCalled();
  });
  it("shows a known subtotal instead of gross while workplace assumptions are incomplete", async () => {
    const screen = await render(<SalaryScreen />);
    expect(screen.getByText("BERECHNUNG UNVOLLSTÄNDIG")).toBeTruthy();
    expect(screen.getByText(new RegExp("Bekannter Teilbetrag:.*kein Gesamtbrutto"))).toBeTruthy();
    expect(screen.queryByText("BRUTTO-SCHÄTZUNG")).toBeNull();
  });
  it("recalculates when the stored scoped decision changes without writing or requiring a remount", async () => {
    const screen = await render(<SalaryScreen />);
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
    await screen.rerender(<SalaryScreen />);
    expect(screen.getByText("BRUTTO-SCHÄTZUNG")).toBeTruthy();
    expect(screen.getByText(remunerationEuro(result().estimatedGrossCents))).toBeTruthy();
    expect(screen.queryByText("BERECHNUNG UNVOLLSTÄNDIG")).toBeNull();
  });
  it("never borrows the old profile for undated or missing historical data", async () => {
    mockHistory = { ...mockHistory, profiles: [{ ...history(), effectiveFrom: null }] };
    const screen = await render(<SalaryScreen />);
    expect(screen.getByText(/Gültigkeitsbeginn.*noch nicht bestätigt/)).toBeTruthy();
    expect(screen.queryByText("BRUTTO-SCHÄTZUNG")).toBeNull();
    expect(screen.queryByText(/2.907,18/)).toBeNull();
    mockHistory = { ...mockHistory, profiles: [] };
    await screen.rerender(<SalaryScreen />);
    expect(screen.queryByText("BRUTTO-SCHÄTZUNG")).toBeNull();
  });
  it("recalculates group changes and catalog replacement without displaying stale base money", async () => {
    const screen = await render(<SalaryScreen />);
    mockHistory = { ...mockHistory, profiles: [history("2026-01-01", "P6")] };
    await screen.rerender(<SalaryScreen />);
    expect(screen.getAllByText(/3.012,49/).length).toBeGreaterThan(0);
    mockResolver = resolver([]);
    await screen.rerender(<SalaryScreen />);
    expect(screen.queryByText(/3.012,49/)).toBeNull();
    expect(screen.getByText("BERECHNUNG UNVOLLSTÄNDIG")).toBeTruthy();
  });
  it("hides old amounts during loading and errors, then reloads only the remuneration snapshot", async () => {
    const screen = await render(<SalaryScreen />);
    mockHistory = { ...mockHistory, status: "loading" };
    await screen.rerender(<SalaryScreen />);
    expect(screen.queryByText("Zusammensetzung")).toBeNull();
    mockHistory = {
      ...mockHistory,
      status: "error",
      error: "Vergütungsdaten konnten nicht geladen werden.",
    };
    await screen.rerender(<SalaryScreen />);
    expect(screen.getByText("Vergütungsdaten konnten nicht geladen werden.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: /Erneut/ }));
    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(mockRootReload).not.toHaveBeenCalled();
  });
  it("keeps navigation and premium links on the exact displayed month", async () => {
    const screen = await render(<SalaryScreen />);
    await fireEvent.press(screen.getByRole("button", { name: /Nächster Monat/ }));
    expect(mockCoordinator.setMonth).toHaveBeenLastCalledWith("2026-10");
    await fireEvent.press(screen.getByRole("button", { name: "Zeitzuschläge, Details öffnen" }));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/premium-details",
      params: { month: "2026-10" },
    });
  });
  it("retains the previous-day shift carry-in in the dated premiums", async () => {
    mockEntries = [shift({ date: "2026-08-31" })];
    const screen = await render(<PremiumDetailsScreen />);
    const premiums = result().timePremiums;
    expect(premiums.totalCents).toBeGreaterThan(0);
    expect(screen.getByText(remunerationEuro(premiums.totalCents))).toBeTruthy();
    expect(screen.getAllByText("01.09.2026").length).toBeGreaterThan(0);
    expect(screen.queryByText("31.08.2026")).toBeNull();
  });
  it("does not calculate own-pay premiums from an implicit TVöD formula", async () => {
    mockEntries = [shift()];
    mockHistory = {
      ...mockHistory,
      profiles: [
        {
          ...history(),
          data: {
            version: 1,
            weeklyMinutes: 1200,
            selection: { kind: "own-monthly", monthlyGrossCents: 180000 },
          },
        },
      ],
    };
    const screen = await render(<PremiumDetailsScreen />);
    expect(
      screen.getAllByText("Für die eigene Vergütung sind noch keine Zuschlagsparameter bestätigt.")
        .length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Nicht berechenbar").length).toBeGreaterThan(0);
    expect(screen.queryByText("0,00 €")).toBeNull();
  });
  it("preserves partial months and explains each dated base segment", async () => {
    mockHistory = { ...mockHistory, profiles: [history(), history("2026-09-16", "P6")] };
    const screen = await render(<SalaryScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Grundentgelt, Details öffnen" }));
    expect(screen.getByText("01.09.2026 – 15.09.2026")).toBeTruthy();
    expect(screen.getByText("16.09.2026 – 30.09.2026")).toBeTruthy();
    await fireEvent.press(screen.getAllByRole("button", { name: /^Berechnungsgrundlage:/ })[0]);
    expect(screen.getByText("Zeitanteil: 15 von 30 Kalendertagen")).toBeTruthy();
  });
  it("keeps a legacy monthly confirmation unbound until explicitly reconfirmed", async () => {
    mockDecisions = [
      {
        month: "2026-09",
        allowanceStatus: "SHIFT_MONTHLY",
        revision: 1,
        confirmedAt: work.updatedAt,
        updatedAt: work.updatedAt,
      },
    ];
    const screen = await render(<SalaryScreen />);
    expect(
      screen.getByText(
        "Die bisherige Monatsbestätigung hat keine Tarifzuordnung. Bitte für diesen Vergütungsstand erneut bestätigen.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("BRUTTO-SCHÄTZUNG")).toBeNull();
  });
  it("follows theme changes without fixed lines and rejects invalid routes", async () => {
    const screen = await render(<SalaryScreen />);
    mockPalette = DARK_PALETTE;
    await screen.rerender(<SalaryScreen />);
    const title = screen.getByText("Zusammensetzung");
    expect(StyleSheet.flatten(title.props.style).color).toBe(DARK_PALETTE.text);
    expect(title.props.numberOfLines).toBeUndefined();
    mockRouteMonth = "bad";
    await screen.rerender(<SalaryScreen />);
    expect(
      screen.getByText("Der Link zur Gehaltsauswertung enthält keinen gültigen Monat."),
    ).toBeTruthy();
    expect(screen.queryByText("Zusammensetzung")).toBeNull();
  });
});
