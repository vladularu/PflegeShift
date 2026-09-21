import { fireEvent, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { router } from "expo-router";
import { annualDetailsRoute } from "@/navigation/routes";

import type { ShiftType } from "@/domain/types";
import type { AnnualReport } from "@/features/analysis/annual-report";
import { AnnualReportScreen, AnnualReportDetails } from "@/features/analysis/annual-report-view";

const report: AnnualReport = {
  year: 2026,
  salarySource: "TARIFF",
  months: Array.from({ length: 12 }, (_, index) => ({
    month: `2026-${String(index + 1).padStart(2, "0")}`,
    entryCount: index === 7 ? 20 : 0,
    targetMinutes: 9_600,
    actualMinutes: index === 7 ? 9_570 : 0,
    balanceMinutes: index === 7 ? -30 : -9_600,
    estimatedGrossAmount: index < 7 ? 4_100 : null,
    premiumAmount: index < 7 ? 210 : 0,
    criticalCount: index === 7 ? 1 : 0,
    warningCount: index === 7 ? 2 : 0,
  })),
  targetMinutes: 115_200,
  actualMinutes: 108_000,
  balanceMinutes: -7_200,
  workMinutes: 106_000,
  trainingMinutes: 2_000,
  vacationDays: 24,
  sickDays: 3,
  freeDays: 90,
  entryCount: 190,
  activeMonthCount: 8,
  availablePayMonthCount: 7,
  estimatedGrossAmount: 28_700,
  premiumAmount: 1_470,
  overtimeAmount: 300,
  allowanceAmount: 1_750,
  criticalCount: 1,
  warningCount: 2,
  distribution: new Map<ShiftType, number>([["EARLY", 90]]),
  worktimeCoverageComplete: true,
  complianceCoverageComplete: true,
};

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
let mockPlanning = true;
jest.mock("@/features/settings/check-preferences", () => ({
  useCheckPreferences: () => ({ enabled: mockPlanning, error: null }),
}));

const props = { report, testMonths: [], onBackToMonth: jest.fn(), onMoveYear: jest.fn() };

describe("annual report view", () => {
  beforeEach(() => {
    mockPlanning = true;
  });
  it("uses calm list cards and retains the selected year", async () => {
    const screen = await render(<AnnualReportScreen {...props} />);
    expect(screen.getByRole("header", { name: "Auswertung" })).toBeTruthy();
    expect(screen.getByTestId("analysis-year-toolbar")).toBeTruthy();
    expect(screen.queryByText("Dienstverteilung")).toBeNull();
    expect(screen.queryByText("Jahresverlauf")).toBeNull();
    expect(screen.queryByText("Berücksichtigte Monate")).toBeNull();
    expect(screen.getByLabelText("Ist: 1800:00 h")).toBeTruthy();
    expect(screen.getByLabelText("Soll: 1920:00 h")).toBeTruthy();
    expect(screen.getByLabelText("Stundensaldo: −120:00 h")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Stunden,/ })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Prüfung, 3 Meldungen" }));
    expect(router.push).toHaveBeenLastCalledWith(annualDetailsRoute(2026, "CHECK"));
    await fireEvent.press(screen.getByRole("button", { name: /^Gehalt,/ }));
    expect(router.push).toHaveBeenLastCalledWith(annualDetailsRoute(2026, "PAY"));
    expect(screen.queryByRole("button", { name: "Schichten: Details öffnen" })).toBeNull();
    await fireEvent.press(screen.getByLabelText(/Nächstes Jahr, aktuell/));
    expect(props.onMoveYear).toHaveBeenCalledWith(1);
    await fireEvent.press(screen.getByLabelText(/Vorheriges Jahr, aktuell/));
    expect(props.onMoveYear).toHaveBeenCalledWith(-1);
    await fireEvent.press(screen.getByLabelText("Monatsauswertung öffnen"));
    expect(props.onBackToMonth).toHaveBeenCalled();
  });

  it("does not show provisional pay or checks as finished results", async () => {
    const screen = await render(<AnnualReportScreen {...props} pending />);
    expect(screen.getByRole("button", { name: "Prüfung, Wird geprüft …" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Gehalt, Wird berechnet …" })).toBeTruthy();
    expect(screen.getByLabelText("Soll: Wird berechnet")).toBeTruthy();
    expect(screen.getByLabelText("Stundensaldo: Wird berechnet")).toBeTruthy();
    expect(screen.queryByText("28.700,00 €")).toBeNull();
    expect(screen.queryByText("3 Meldungen")).toBeNull();
  });

  it("retains hours and shift details with month navigation", async () => {
    const onSelectMonth = jest.fn();
    const screen = await render(
      <AnnualReportDetails
        report={report}
        testMonths={["2026-08"]}
        section="WORK"
        onSelectMonth={onSelectMonth}
      />,
    );
    expect(screen.getByText("Jahresverlauf")).toBeTruthy();
    expect(screen.getByText("Dienstverteilung")).toBeTruthy();
    expect(screen.getByLabelText("1 Testmonate enthalten")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: /^August 2026,/ }));
    expect(onSelectMonth).toHaveBeenCalledWith("2026-08");
  });

  it("opens the affected month from the full year check details", async () => {
    const onSelectMonth = jest.fn();
    const screen = await render(
      <AnnualReportDetails
        report={report}
        testMonths={[]}
        section="CHECK"
        onSelectMonth={onSelectMonth}
      />,
    );
    expect(screen.queryByRole("header", { name: "3 Meldungen" })).toBeNull();
    expect(screen.getByText("2026")).toBeVisible();

    expect(screen.queryByText("0 Hinweise")).toBeNull();
    expect(screen.queryByText("Deine Jahresprüfung")).toBeNull();
    expect(screen.getByRole("header", { name: "Monate mit Meldungen" })).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: /^August 2026, 3 Meldungen/ }));
    expect(onSelectMonth).toHaveBeenCalledWith("2026-08");
  });

  it("keeps legal and optional planning counts consistent in the compact summary", async () => {
    const classified: AnnualReport = {
      ...report,
      months: report.months.map((month) => ({
        ...month,
        checkCounts: {
          legal: { criticalCount: month.criticalCount, warningCount: 0, infoCount: 0 },
          planning: { criticalCount: 0, warningCount: month.warningCount, infoCount: 0 },
        },
      })),
    };
    const details = (
      <AnnualReportDetails
        report={classified}
        testMonths={[]}
        section="CHECK"
        onSelectMonth={jest.fn()}
      />
    );
    const screen = await render(details);
    expect(screen.getByRole("button", { name: /^August 2026, 3 Meldungen/ })).toBeVisible();
    mockPlanning = false;
    await screen.rerender(
      <AnnualReportDetails
        report={classified}
        testMonths={[]}
        section="CHECK"
        onSelectMonth={jest.fn()}
      />,
    );
    expect(screen.queryByRole("header", { name: "1 Meldung" })).toBeNull();
    expect(screen.queryByText("Freiwillige Planung: 2")).toBeNull();
    expect(screen.queryByText("2 Warnungen")).toBeNull();
    expect(screen.getByRole("button", { name: /^August 2026, 1 Meldung/ })).toBeVisible();
  });

  it("withholds a provisional year result and its month destinations", async () => {
    const screen = await render(
      <AnnualReportDetails
        report={report}
        pending
        testMonths={[]}
        section="CHECK"
        onSelectMonth={jest.fn()}
      />,
    );
    expect(screen.getByText("Die Jahresprüfung wird berechnet …")).toBeVisible();
    expect(screen.queryByRole("header", { name: "3 Meldungen" })).toBeNull();
    expect(screen.queryByText("Monate mit Meldungen")).toBeNull();
    expect(screen.queryByText("Keine sichtbaren Auffälligkeiten")).toBeNull();
    expect(screen.getByRole("button", { name: "Über die Prüfung" })).toBeVisible();
  });

  it("shows the existing year salary sum and all twelve month destinations", async () => {
    const onSelectMonth = jest.fn();
    const screen = await render(
      <AnnualReportDetails
        report={report}
        testMonths={[]}
        section="PAY"
        onSelectMonth={onSelectMonth}
      />,
    );
    expect(screen.getByText("28.700,00 €")).toBeTruthy();
    expect(screen.getByText("7 von 12")).toBeTruthy();
    expect(screen.getByText("1.470,00 €")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /2026,/ })).toHaveLength(12);
    expect(screen.getByRole("button", { name: /^Zeitzuschläge:/ })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: /^Juli 2026,/ }));
    expect(onSelectMonth).toHaveBeenCalledWith("2026-07");
    expect(screen.getByRole("button", { name: "August 2026, Nicht verfügbar" })).toBeTruthy();
  });

  it("labels unavailable sections and never invents zero values or a clear check", async () => {
    const partial: AnnualReport = {
      ...report,
      targetMinutes: null,
      balanceMinutes: null,
      availablePayMonthCount: 0,
      estimatedGrossAmount: 0,
      worktimeCoverageComplete: false,
      complianceCoverageComplete: false,
      months: report.months.map((month) => ({ ...month, estimatedGrossAmount: null })),
    };
    const screen = await render(<AnnualReportScreen {...props} report={partial} />);
    expect(screen.getByLabelText("Soll: Nicht verfügbar")).toBeTruthy();
    expect(screen.getByLabelText("Stundensaldo: Nicht verfügbar")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Prüfung, Nicht verfügbar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Gehalt, Nicht verfügbar" })).toBeTruthy();
    expect(screen.queryByText("Keine sichtbaren Auffälligkeiten")).toBeNull();
    await screen.rerender(
      <AnnualReportDetails
        report={partial}
        testMonths={[]}
        section="PAY"
        onSelectMonth={jest.fn()}
      />,
    );
    expect(screen.getByText(/keine Beträge ausgewiesen/)).toBeTruthy();
    expect(screen.queryByText("0,00 €")).toBeNull();
    await screen.rerender(
      <AnnualReportDetails
        report={partial}
        testMonths={[]}
        section="CHECK"
        onSelectMonth={jest.fn()}
      />,
    );
    expect(screen.getByText(/benötigt vollständige Regelstände/)).toBeTruthy();
    expect(screen.queryByText(/keine Auffälligkeiten erkannt/)).toBeNull();
  });
});

it("opens yearly premiums separately and keeps the selected month for the detailed calculation", async () => {
  const withPremiums: AnnualReport = {
    ...report,
    salarySource: "TARIFF",
    months: report.months.map((month, index) => ({
      ...month,
      timePremiumAmount: index < 7 ? 210 : null,
    })),
  };
  const overview = await render(<AnnualReportScreen {...props} report={withPremiums} />);
  expect(overview.queryByRole("button", { name: /^Zeitzuschläge:/ })).toBeNull();
  await overview.rerender(
    <AnnualReportDetails
      report={withPremiums}
      testMonths={[]}
      section="PAY"
      onSelectMonth={jest.fn()}
    />,
  );
  await fireEvent.press(overview.getByRole("button", { name: /^Zeitzuschläge:/ }));
  expect(router.push).toHaveBeenLastCalledWith(annualDetailsRoute(2026, "PREMIUM"));
  await overview.unmount();
  const onSelectMonth = jest.fn();
  const details = await render(
    <AnnualReportDetails
      report={withPremiums}
      pending={false}
      testMonths={[]}
      section="PREMIUM"
      onSelectMonth={onSelectMonth}
    />,
  );
  expect(details.getByLabelText("Gesamt: 1.470,00 €")).toBeTruthy();
  await fireEvent.press(details.getByRole("button", { name: "Juli 2026: 210,00 €" }));
  expect(onSelectMonth).toHaveBeenCalledWith("2026-07");
  expect(details.queryByRole("button", { name: /August 2026/ })).toBeNull();
  await details.rerender(
    <AnnualReportDetails
      report={{ ...withPremiums, salarySource: "MANUAL" }}
      testMonths={[]}
      section="PREMIUM"
      onSelectMonth={onSelectMonth}
    />,
  );
  expect(details.getByText("Keine tarifliche Berechnung")).toBeTruthy();
  expect(details.queryByText("0,00 €")).toBeNull();
});

it("shows manual annual gross without invented supplement rows", async () => {
  const screen = await render(
    <AnnualReportDetails
      report={{
        ...report,
        salarySource: "MANUAL",
        premiumAmount: 0,
        allowanceAmount: 0,
        overtimeAmount: 0,
      }}
      testMonths={[]}
      section="PAY"
      onSelectMonth={jest.fn()}
    />,
  );
  expect(screen.getByText("28.700,00 €")).toBeTruthy();
  expect(screen.queryByText("Zeitzuschläge")).toBeNull();
  expect(screen.queryByText("Zulagen")).toBeNull();
});
