import { fireEvent, render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

import type { MonthlyPayEstimate } from "@/domain/types";
import {
  AnalysisMonthHeader,
  AnalysisYearHeader,
  ExpandableHighlightCard,
  formatMonthRangeLabel,
  SalarySummaryCard,
  ShiftTypeCountCard,
  ShiftTypeHoursCard,
} from "@/features/analysis/analysis-overview-cards";
import type { MonthlyShiftTypeAnalysis } from "@/features/analysis/analysis-metrics";

jest.mock("@/ui/shift-symbol", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Text } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    ShiftSymbol: ({ value }: { readonly value: string }) => React.createElement(Text, null, value),
  };
});

const analysis: MonthlyShiftTypeAnalysis = {
  items: [
    { type: "EARLY", count: 2, minutes: 930 },
    { type: "FREE", count: 1, minutes: 0 },
  ],
  totalCount: 3,
  totalMinutes: 930,
};

const pay: MonthlyPayEstimate = {
  month: "2026-08",
  tariffLabel: "TVöD-P P9 · Stufe 4",
  available: true,
  fullTimeTableAmount: 4_500,
  personalBaseAmount: 4_000,
  shiftBreakdowns: [],
  timePremiumAmount: 120,
  overtimeAmount: 20,
  allowanceAmount: 100,
  tvoedAllowanceAmount: 25,
  careAllowanceAmount: 141.82,
  estimatedGrossAmount: 4_406.82,
  assessment: {
    shiftWork: "DETECTED",
    alternatingShiftWork: "NOT_DETECTED",
    criteria: [],
    suggestedAllowance: "SHIFT_MONTHLY",
    evidence: [],
    requiresConfirmation: false,
  },
  confirmedAllowance: "SHIFT_MONTHLY",
};

describe("analysis overview cards", () => {
  it("formats the selected month as a compact date range", () => {
    expect(formatMonthRangeLabel("2026-08")).toBe("Sa. 1. Aug. - 31. Aug. 2026");
  });

  it("shows count and credited-hour reports without a zero-hour row", async () => {
    const screen = await render(
      <>
        <ShiftTypeCountCard analysis={analysis} />
        <ShiftTypeHoursCard analysis={analysis} />
      </>,
    );

    expect(screen.getByLabelText("Früh: 2")).toBeTruthy();
    expect(screen.getByLabelText("Frei: 1")).toBeTruthy();
    expect(screen.getByLabelText("Früh: 15:30 Stunden")).toBeTruthy();
    expect(screen.queryByLabelText("Frei: 0:00 Stunden")).toBeNull();
    expect(screen.getByLabelText("Stunden pro Schicht, Gesamt 15:30 h")).toBeTruthy();
  });

  it("uses the refined shared typography for Prüfung and Gehalt", async () => {
    const screen = await render(
      <ExpandableHighlightCard
        accent="#B14A4A"
        countBadge={7}
        expanded={false}
        icon="warning-outline"
        onToggle={jest.fn()}
        title="Prüfung"
        value="Meldungen"
      >
        <></>
      </ExpandableHighlightCard>,
    );

    expect(screen.getByText("Prüfung")).toHaveStyle({
      fontSize: 17,
      lineHeight: 22,
      fontWeight: "600",
      letterSpacing: -0.2,
    });
    expect(screen.getByText("7", { includeHiddenElements: true })).toHaveStyle({
      fontSize: 24,
      lineHeight: 29,
      fontWeight: "700",
      letterSpacing: -0.4,
      fontVariant: ["tabular-nums"],
    });
    expect(screen.getByText("Meldungen")).toHaveStyle({
      fontSize: 22,
      lineHeight: 28,
      fontWeight: "600",
      letterSpacing: -0.3,
    });
    expect(screen.getByRole("button", { name: "Prüfung, 7 Meldungen" })).toBeTruthy();
  });

  it("opens annual details and expands salary details in place", async () => {
    const onOpenYear = jest.fn();
    const onOpenAllowance = jest.fn();
    const onToggleSalary = jest.fn();
    const screen = await render(
      <>
        <AnalysisMonthHeader
          label="Sa. 1. Aug. - 31. Aug. 2026"
          onNext={jest.fn()}
          onOpenYear={onOpenYear}
          onPrevious={jest.fn()}
        />
        <SalarySummaryCard
          expanded={false}
          onOpenAllowance={onOpenAllowance}
          onSetup={jest.fn()}
          onToggle={onToggleSalary}
          pay={pay}
          tariffReady
        />
      </>,
    );

    expect(screen.getByRole("header", { name: "Auswertung" })).toHaveStyle({
      fontSize: 34,
      lineHeight: 41,
    });
    expect(screen.getByTestId("analysis-month-toolbar")).toHaveStyle({
      minHeight: 44,
      marginHorizontal: -8,
    });
    expect(screen.getByRole("button", { name: /Vorheriger Monat/ })).toHaveStyle({
      width: 44,
      height: 44,
    });
    const yearButton = screen.getByRole("button", { name: "Jahresauswertung öffnen" });
    expect(yearButton).toHaveStyle({ width: 44, height: 44, borderRadius: 999 });
    await fireEvent.press(yearButton);
    expect(screen.queryByText("Grundentgelt")).toBeNull();
    const salaryButton = screen.getByRole("button", { name: /Gehalt/ });
    expect(salaryButton).toHaveStyle({
      minHeight: 100,
      gap: 8,
      paddingHorizontal: 20,
      paddingVertical: 12,
    });
    expect(screen.getByText("Gehalt")).toHaveStyle({
      fontSize: 17,
      lineHeight: 22,
      fontWeight: "600",
      letterSpacing: -0.2,
    });
    expect(screen.getByText("4.406,82 €")).toHaveStyle({
      fontSize: 32,
      lineHeight: 38,
      fontWeight: "700",
      letterSpacing: -0.6,
    });
    expect(screen.queryByText("Brutto-Schätzung · TVöD-P P9 · Stufe 4")).toBeNull();
    await fireEvent.press(salaryButton);

    expect(onOpenYear).toHaveBeenCalledTimes(1);
    expect(onToggleSalary).toHaveBeenCalledTimes(1);
    expect(screen.getByText("4.406,82 €")).toBeTruthy();

    await screen.rerender(
      <SalarySummaryCard
        expanded
        onOpenAllowance={onOpenAllowance}
        onSetup={jest.fn()}
        onToggle={onToggleSalary}
        pay={pay}
        tariffReady
      />,
    );

    expect(screen.getByText("Grundentgelt")).toBeTruthy();
    expect(screen.getByText("TVöD-P P9 · Stufe 4")).toBeTruthy();
    expect(screen.getByText("Zeitzuschläge")).toBeTruthy();
    expect(screen.getByText("Pflegezulage TVöD-P")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: /Schichtzulage/ }));
    expect(onOpenAllowance).toHaveBeenCalledTimes(1);
  });

  it("keeps salary setup and missing-rule states actionable", async () => {
    const onSetup = jest.fn();
    const sharedProps = {
      expanded: true,
      onOpenAllowance: jest.fn(),
      onSetup,
      onToggle: jest.fn(),
    } as const;
    const screen = await render(
      <SalarySummaryCard {...sharedProps} pay={null} tariffReady={false} />,
    );

    const setupButton = screen.getByRole("button", { name: "Tarifprofil einrichten" });
    expect(setupButton).toBeTruthy();
    await fireEvent.press(setupButton);
    expect(onSetup).toHaveBeenCalledTimes(1);

    await screen.rerender(<SalarySummaryCard {...sharedProps} pay={null} tariffReady />);

    expect(
      screen.getByText(/Für die Gehaltsberechnung fehlt ein geprüfter Tarifstand/),
    ).toBeTruthy();
  });

  it("uses the same compact page header for the annual view", async () => {
    const onOpenMonth = jest.fn();
    const screen = await render(
      <AnalysisYearHeader
        activeMonthCount={4}
        onNext={jest.fn()}
        onOpenMonth={onOpenMonth}
        onPrevious={jest.fn()}
        year={2026}
      />,
    );

    expect(screen.getByRole("header", { name: "Auswertung" })).toHaveStyle({
      fontSize: 34,
      lineHeight: 41,
    });
    expect(screen.getByTestId("analysis-year-toolbar")).toHaveStyle({
      minHeight: 44,
      marginHorizontal: -8,
    });
    expect(screen.getByText("4 Monate mit Einträgen")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Monatsauswertung öffnen" }));
    expect(onOpenMonth).toHaveBeenCalledTimes(1);
  });
});
