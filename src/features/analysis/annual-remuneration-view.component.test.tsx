import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { router } from "expo-router";
import { Temporal } from "@js-temporal/polyfill";
import { history, shift, work } from "@/engine/remuneration-test-fixtures";
import { calculateAssessedMonthlyRemuneration } from "@/engine/remuneration-month";
import { bundledRuleResolver } from "@/rules/rule-resolver";
import { DARK_PALETTE, LIGHT_PALETTE } from "@/theme/palette-values";
import { remunerationEuro } from "@/features/salary/remuneration-presentation";
import { annualDetailsRoute } from "@/navigation/routes";
import { buildAnnualCoreReport } from "./annual-core-report";
import { AnnualReportDetails, AnnualReportScreen } from "./annual-report-view";
import { summarizeAnnualRemuneration } from "./annual-remuneration";
import { ownRemunerationFixture } from "@/domain/own-remuneration-test-fixtures";
import { tariffAnnualFixture } from "@/engine/tariff-annual-test-fixtures";

let mockPalette = LIGHT_PALETTE;
let mockFontScale = 1;
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("@/features/settings/check-preferences", () => ({
  useCheckPreferences: () => ({ enabled: true, error: null }),
}));
jest.mock("@/theme/palette", () => ({
  ...jest.requireActual<typeof import("@/theme/palette")>("@/theme/palette"),
  usePalette: () => mockPalette,
}));
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: 430, height: 932, scale: 3, fontScale: mockFontScale }),
}));
function report({ confirmed = true, empty = false } = {}) {
  const months = Array.from({ length: 12 }, (_, index) => {
    const from = Temporal.PlainDate.from({ year: 2026, month: index + 1, day: 1 });
    const month = from.toString().slice(0, 7);
    return {
      month,
      result: calculateAssessedMonthlyRemuneration({
        month,
        shifts: [shift()],
        workProfile: work,
        history: empty ? [] : [history()],
        settings: { workplaceCoverage: "UNKNOWN", assignment: "UNKNOWN", updatedAt: null },
        resolver: bundledRuleResolver,
        tariffAnnualClaims: confirmed
          ? [
              {
                claim: tariffAnnualFixture().claim,
                actualPayment: { grossCents: 0, payoutMonth: "2026-11" },
                revoked: false,
                revision: 1,
                updatedAt: work.updatedAt,
              },
            ]
          : [],
        decisions: confirmed
          ? [
              {
                from: from.toString(),
                through: from.with({ day: from.daysInMonth }).toString(),
                tariff: { packageId: "tvoed-vka-bt-k", variant: "BT_K", region: "OTHER" },
                allowanceStatus: "NONE",
                revision: 1,
                confirmedAt: work.updatedAt,
                updatedAt: work.updatedAt,
              },
            ]
          : [],
      }),
    };
  });
  // Sentinel legacy fields prove the dated views never use them as a fallback.
  return {
    ...buildAnnualCoreReport(2026, [], work),
    salarySource: "MANUAL" as const,
    estimatedGrossAmount: 999999,
    availablePayMonthCount: 12,
    remuneration: summarizeAnnualRemuneration(2026, "ready", months),
  };
}
const onSelectMonth = jest.fn();
const common = { testMonths: [], onSelectMonth };
beforeEach(() => {
  jest.clearAllMocks();
  mockPalette = LIGHT_PALETTE;
  mockFontScale = 1;
});
describe("annual dated remuneration presentation", () => {
  it("shows actual annual payment once as a separate component at large text size", async () => {
    const value = report();
    const months = value.remuneration.months.map(({ month }) => ({
      month,
      result: calculateAssessedMonthlyRemuneration({
        month,
        shifts: [],
        workProfile: work,
        history: [
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
                  specialPayments: ownRemunerationFixture().specialPayments.slice(0, 1),
                },
              },
            },
          },
        ],
        settings: { workplaceCoverage: "UNKNOWN", assignment: "UNKNOWN", updatedAt: null },
        actualAnnualPayments: [
          {
            version: 1,
            paymentId: "annual",
            entitlementYear: 2026,
            payoutMonth: "2026-12",
            title: "Weihnachtsgeld",
            grossCents: 87654,
            revision: 1,
          },
        ],
      }),
    }));
    value.remuneration = summarizeAnnualRemuneration(2026, "ready", months);
    mockFontScale = 2.5;
    mockPalette = DARK_PALETTE;
    const screen = await render(<AnnualReportDetails report={value} section="PAY" {...common} />);
    const row = screen.getByLabelText("Jahressonderzahlung: 876,54 €");
    expect(StyleSheet.flatten(row.props.style).flexDirection).toBe("column");
    expect(screen.getAllByText("Jahressonderzahlung")).toHaveLength(1);
    expect(value.remuneration.estimatedGrossCents).toBe(2487654);
  });
  it("shows only the dated yearly sum and retains the pay route", async () => {
    const value = report();
    const screen = await render(
      <AnnualReportScreen
        report={value}
        testMonths={[]}
        onBackToMonth={jest.fn()}
        onMoveYear={jest.fn()}
      />,
    );
    expect(
      screen.getByLabelText(
        "Jahresbrutto: " + remunerationEuro(value.remuneration.estimatedGrossCents),
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/999.999/)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: /^Gehalt,/ }));
    expect(router.push).toHaveBeenLastCalledWith(annualDetailsRoute(2026, "PAY"));
  });
  it("explains partial totals without replacing them with legacy gross", async () => {
    const value = report({ confirmed: false });
    const screen = await render(<AnnualReportDetails report={value} section="PAY" {...common} />);
    expect(screen.getByText(/Teilbeträge sind kein Jahresbrutto/)).toBeTruthy();
    expect(
      screen.getByLabelText(
        "Bekannter Teilbetrag: " + remunerationEuro(value.remuneration.knownSubtotalCents),
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Jahresbrutto")).toBeNull();
    expect(screen.queryByText(/999.999/)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: /^September 2026:/ }));
    expect(onSelectMonth).toHaveBeenLastCalledWith("2026-09");
  });
  it("shows time premiums independently of unknown allowances or legacy MANUAL source", async () => {
    const value = report({ confirmed: false });
    const screen = await render(
      <AnnualReportDetails report={value} section="PREMIUM" {...common} />,
    );
    expect(value.remuneration.estimatedGrossCents).toBeNull();
    expect(
      screen.getByLabelText(
        "Gesamt: " + remunerationEuro(value.remuneration.timePremiums.totalCents),
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Keine tarifliche Berechnung")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: /^September 2026:/ }));
    expect(onSelectMonth).toHaveBeenLastCalledWith("2026-09");
  });
  it.each(["loading", "error"] as const)(
    "does not expose stale amounts during %s and retains month links for reload",
    async (status) => {
      const value = report();
      const screen = await render(<AnnualReportDetails report={value} section="PAY" {...common} />);
      const next = {
        ...value,
        remuneration: summarizeAnnualRemuneration(2026, status, value.remuneration.months),
      };
      await screen.rerender(<AnnualReportDetails report={next} section="PAY" {...common} />);
      expect(screen.queryByText("Jahresbrutto")).toBeNull();
      expect(screen.queryByText("Grundgehalt")).toBeNull();
      expect(screen.queryByText(/999.999/)).toBeNull();
      await fireEvent.press(screen.getByRole("button", { name: /^September 2026:/ }));
      expect(onSelectMonth).toHaveBeenLastCalledWith("2026-09");
    },
  );
  it("does not turn missing base profiles into zero base pay or full gross", async () => {
    const value = report({ empty: true, confirmed: false });
    const screen = await render(<AnnualReportDetails report={value} section="PAY" {...common} />);
    expect(screen.queryByText("Jahresbrutto")).toBeNull();
    expect(screen.getByLabelText("Grundgehalt: Nicht berechenbar")).toBeTruthy();
    expect(screen.queryByLabelText("Grundgehalt: 0,00 €")).toBeNull();
    expect(screen.getAllByText("Nicht berechenbar").length).toBeGreaterThan(0);
  });
  it("keeps the detailed premiums route and scales rows with theme changes", async () => {
    const value = report();
    const screen = await render(<AnnualReportDetails report={value} section="PAY" {...common} />);
    await fireEvent.press(screen.getByRole("button", { name: /^Zeitzuschläge:/ }));
    expect(router.push).toHaveBeenLastCalledWith(annualDetailsRoute(2026, "PREMIUM"));
    mockPalette = DARK_PALETTE;
    mockFontScale = 2.5;
    await screen.rerender(<AnnualReportDetails report={value} section="PAY" {...common} />);
    expect(
      StyleSheet.flatten(screen.getByLabelText(/^Grundgehalt:/).props.style).flexDirection,
    ).toBe("column");
    const amount = screen.getByText(remunerationEuro(value.remuneration.estimatedGrossCents));
    expect(StyleSheet.flatten(amount.props.style).color).toBe(DARK_PALETTE.text);
    expect(amount.props.numberOfLines).toBeUndefined();
    expect(amount.props.allowFontScaling).not.toBe(false);
  });
});
