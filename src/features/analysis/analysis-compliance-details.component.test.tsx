import { fireEvent, render } from "@testing-library/react-native";
import { describe, expect, it } from "@jest/globals";

import type { MonthlyComplianceResult, ShiftEntry } from "@/domain/types";
import { AssessmentSummaryCard, ComplianceDetails } from "@/features/analysis/analysis-screen";

function shift(
  id: string,
  date: string,
  title: string,
  startTime: string,
  endTime: string,
): ShiftEntry {
  return {
    kind: "SHIFT",
    id,
    date,
    templateId: null,
    title,
    type: "DAY",
    startTime,
    endTime,
    breakMinutes: 30,
    color: "#2F80ED",
    symbol: "D",
    note: null,
    overtimeMinutes: 0,
    holidayPremiumMode: "WITH_TIME_OFF",
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  };
}

const shifts = [
  shift("late", "2026-08-04", "Spät", "14:00", "22:00"),
  shift("early-a", "2026-08-05", "Früh", "06:00", "14:00"),
  shift("early-b", "2026-08-06", "Früh", "06:00", "14:00"),
];

const compliance: MonthlyComplianceResult = {
  month: "2026-08",
  criticalCount: 3,
  warningCount: 0,
  infoCount: 0,
  affectedDates: ["2026-08-05", "2026-08-06", "2026-08-12"],
  issues: [
    {
      id: "rest-a",
      severity: "critical",
      kind: "LEGAL",
      rule: "ARBZG_5_REST_10H",
      title: "Ruhezeit unter 10 Stunden",
      description: "Zwischen den Diensten liegen nur 8 h Ruhezeit.",
      relatedShiftIds: ["late", "early-a"],
      date: "2026-08-05",
    },
    {
      id: "rest-b",
      severity: "critical",
      kind: "LEGAL",
      rule: "ARBZG_5_REST_10H",
      title: "Ruhezeit unter 10 Stunden",
      description: "Zwischen den Diensten liegen nur 9 h Ruhezeit.",
      relatedShiftIds: ["early-a", "early-b"],
      date: "2026-08-06",
    },
    {
      id: "overlap",
      severity: "critical",
      kind: "LEGAL",
      rule: "SHIFT_OVERLAP",
      title: "Dienste überschneiden sich",
      description: "Zwei arbeitszeitrelevante Einträge liegen zeitlich übereinander.",
      relatedShiftIds: ["early-a", "early-b"],
      date: "2026-08-12",
    },
  ],
};

describe("analysis compliance details", () => {
  it("shows one neutral total whose color carries the severity", async () => {
    const mixedCompliance: MonthlyComplianceResult = {
      ...compliance,
      criticalCount: 2,
      warningCount: 1,
      issues: compliance.issues.map((item, index) => ({
        ...item,
        severity: index === 2 ? "warning" : "critical",
      })),
    };
    const screen = await render(
      <AssessmentSummaryCard
        compliance={mixedCompliance}
        expanded={false}
        onToggle={() => undefined}
        shifts={shifts}
      />,
    );

    expect(screen.getByRole("button", { name: "Prüfung, 3 Meldungen" })).toBeTruthy();
    expect(screen.getByText("3", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText("Meldungen")).toBeTruthy();
    expect(screen.queryByText(/kritisch/i)).toBeNull();
    expect(screen.queryByText(/\+1 Meldung/)).toBeNull();
  });

  it("groups repeated issues and reveals readable case details by rule", async () => {
    const screen = await render(
      <ComplianceDetails compliance={compliance} embedded shifts={shifts} />,
    );

    expect(screen.getAllByText("Ruhezeitverletzung")).toHaveLength(1);
    expect(screen.queryByText("Ruhezeit unter 10 Stunden")).toBeNull();
    expect(screen.queryByText("+2 Meldungen")).toBeNull();
    expect(screen.queryByText("+1 Meldung")).toBeNull();
    expect(screen.getByText("2", { includeHiddenElements: true })).toHaveStyle({
      fontVariant: ["tabular-nums"],
    });
    expect(screen.getByText("1", { includeHiddenElements: true })).toHaveStyle({
      fontVariant: ["tabular-nums"],
    });
    expect(screen.queryByText(/Tage? betroffen/)).toBeNull();
    expect(screen.queryByText(/ArbZG/)).toBeNull();
    expect(screen.queryByText("Zwischen den Diensten liegen nur 8 h Ruhezeit.")).toBeNull();

    const restGroup = screen.getByRole("button", {
      name: "Ruhezeitverletzung, 2 Meldungen",
    });
    expect(restGroup).toHaveStyle({ minHeight: 64 });
    await fireEvent.press(restGroup);

    expect(screen.getByText("Zwischen den Diensten liegen nur 8 h Ruhezeit.")).toBeTruthy();
    expect(screen.getByText("Zwischen den Diensten liegen nur 9 h Ruhezeit.")).toBeTruthy();
    expect(screen.getAllByText(/05\. Aug/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/06\. Aug/).length).toBeGreaterThan(0);
    expect(screen.getByText("Spät")).toBeTruthy();
    expect(screen.getAllByText("Früh").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/14:00–22:00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/06:00–14:00/).length).toBeGreaterThan(0);
  });
});
