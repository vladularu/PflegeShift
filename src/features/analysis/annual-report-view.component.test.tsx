import { fireEvent, render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

import type { ShiftType } from "@/domain/types";
import type { AnnualReport } from "@/features/analysis/annual-report";
import { AnnualReportScreen } from "@/features/analysis/annual-report-view";

const report: AnnualReport = {
  year: 2026,
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

describe("annual report view", () => {
  it("keeps the card style and expands check and salary details inline", async () => {
    const onSelectMonth = jest.fn();
    const screen = await render(
      <AnnualReportScreen
        onBackToMonth={jest.fn()}
        onMoveYear={jest.fn()}
        onSelectMonth={onSelectMonth}
        report={report}
        testMonths={[]}
      />,
    );

    expect(screen.getByRole("header", { name: "Auswertung" })).toBeTruthy();
    expect(screen.getByTestId("analysis-year-toolbar")).toBeTruthy();
    expect(screen.getAllByText("Arbeitszeit")).not.toHaveLength(0);
    expect(screen.getByText("Jahresverlauf")).toBeTruthy();
    expect(screen.getByText("Dienstverteilung")).toBeTruthy();
    expect(screen.queryByText("Berücksichtigte Monate")).toBeNull();
    expect(screen.getByRole("button", { name: "Prüfung, 3 Meldungen" })).toBeTruthy();
    expect(screen.queryByText(/kritisch/i)).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: /Prüfung/ }));
    expect(screen.getByText("3 Meldungen")).toBeTruthy();
    await fireEvent.press(screen.getByText("August 2026"));
    expect(onSelectMonth).toHaveBeenCalledWith("2026-08", "CHECK");

    await fireEvent.press(screen.getByRole("button", { name: /Gehalt/ }));
    expect(screen.getByText("Berücksichtigte Monate")).toBeTruthy();
    expect(screen.getByText("7 von 12")).toBeTruthy();
    expect(screen.getByText("28.700,00 €")).toBeTruthy();
  });

  it("keeps the year navigable and labels unavailable rule-bound sections", async () => {
    const partialReport: AnnualReport = {
      ...report,
      targetMinutes: null,
      balanceMinutes: null,
      availablePayMonthCount: 0,
      estimatedGrossAmount: 0,
      worktimeCoverageComplete: false,
      complianceCoverageComplete: false,
    };
    const screen = await render(
      <AnnualReportScreen
        onBackToMonth={jest.fn()}
        onMoveYear={jest.fn()}
        onSelectMonth={jest.fn()}
        report={partialReport}
        testMonths={[]}
      />,
    );

    expect(screen.getByTestId("analysis-year-toolbar")).toBeTruthy();
    expect(screen.getByLabelText("Soll: Nicht verfügbar")).toBeTruthy();
    expect(screen.getByLabelText("Saldo: Nicht verfügbar")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Gehalt, Nicht verfügbar/ })).toBeTruthy();
    expect(screen.getAllByText(/vollständige Regelstände/)).not.toHaveLength(0);
    expect(screen.queryByText("In keinem Monat wurden Auffälligkeiten erkannt.")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: /Gehalt, Nicht verfügbar/ }));
    expect(screen.getByText(/keine Beträge ausgewiesen/)).toBeTruthy();
    expect(screen.queryByText("0,00 €")).toBeNull();
  });
});
