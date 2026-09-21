import { fireEvent, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import type { MonthlyComplianceResult } from "@/domain/types";
import { ComplianceDetailsScreen } from "@/features/analysis/compliance-details-screen";

const mockCompliance: MonthlyComplianceResult = {
  month: "2026-08",
  criticalCount: 2,
  warningCount: 1,
  infoCount: 0,
  affectedDates: [],
  issues: [0, 1, 2].map((index) => ({
    id: String(index),
    kind: index === 2 ? "PLANNING" : "LEGAL",
    severity: index === 2 ? "warning" : "critical",
    rule: "TEST",
    title: "Hinweis",
    description: "Test",
    date: "2026-08-01",
    relatedShiftIds: [],
  })),
};
let mockPlanning = true;
let mockResult: MonthlyComplianceResult | null = mockCompliance;
jest.mock("@/features/settings/check-preferences", () => ({
  useCheckPreferences: () => ({ enabled: mockPlanning, error: null }),
}));

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({ month: "2026-08" }),
}));

jest.mock("@/application/pflegeshift-provider", () => ({
  usePflegeShiftEntries: () => ({ entries: [] }),
  usePflegeShiftProfile: () => ({
    profile: {
      federalState: "NW",
      weeklyMinutes: 2_400,
      timeZone: "Europe/Berlin",
      tariff: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  }),
  usePflegeShiftStatus: () => ({ error: null, ready: true, reload: jest.fn() }),
}));

jest.mock("@/application/rule-catalog-runtime-provider", () => {
  const { bundledRuleResolver } =
    jest.requireActual<typeof import("@/rules/rule-resolver")>("@/rules/rule-resolver");
  return { useRuleCatalogRuntime: () => ({ resolver: bundledRuleResolver }) };
});

jest.mock("@/features/analysis/use-monthly-compliance", () => ({
  useDeferredMonthlyCompliance: () => ({
    error: null,
    result: mockResult,
    retry: jest.fn(),
  }),
}));

describe("ComplianceDetailsScreen", () => {
  beforeEach(() => {
    mockPlanning = true;
    mockResult = mockCompliance;
  });
  it("filters the detail summary but keeps legal critical findings", async () => {
    mockPlanning = false;
    const screen = await render(<ComplianceDetailsScreen />);
    expect(screen.queryByRole("header", { name: /Meldungen/ })).toBeNull();
    expect(screen.queryByText("Freiwillige Planung")).toBeNull();
    expect(screen.getByText(/Planungshinweise ausgeblendet/)).toBeVisible();
  });
  it("shows one neutral total and reserves color for its severity", async () => {
    const screen = await render(<ComplianceDetailsScreen />);

    expect(screen.queryByRole("header", { name: /Meldungen/ })).toBeNull();
    expect(screen.queryByText("0 Hinweise")).toBeNull();
    expect(screen.getAllByText("Gesetzlich")).toHaveLength(2);
    expect(screen.getByText("Planung")).toBeVisible();
  });

  it("shows a single quiet legal status for a planning-only result", async () => {
    mockResult = {
      ...mockCompliance,
      issues: mockCompliance.issues.filter((issue) => issue.kind === "PLANNING"),
    };
    const screen = await render(<ComplianceDetailsScreen />);
    expect(screen.queryByRole("header", { name: "1 Meldung" })).toBeNull();
    expect(screen.queryByText("Gesetzliche Prüfung")).toBeNull();
    expect(screen.getByRole("button", { name: /Hinweis, Planung, Warnung/ })).toBeVisible();
  });

  it("keeps the explanation reachable without repeating it in the summary", async () => {
    const screen = await render(<ComplianceDetailsScreen />);
    expect(screen.queryByText(/ersetzen keine Rechtsberatung/)).toBeNull();
    const disclosure = screen.getByRole("button", { name: "Über die Prüfung" });
    expect(disclosure.props.accessibilityState.expanded).toBe(false);
    await fireEvent.press(disclosure);
    expect(
      screen.getByRole("button", { name: "Über die Prüfung" }).props.accessibilityState.expanded,
    ).toBe(true);
    expect(screen.getByText(/ersetzen keine Rechtsberatung/)).toBeVisible();
    await fireEvent.press(disclosure);
    expect(screen.queryByText(/ersetzen keine Rechtsberatung/)).toBeNull();
  });

  it("does not announce a clear check before the calculation has completed", async () => {
    mockResult = null;
    const screen = await render(<ComplianceDetailsScreen />);
    expect(screen.queryByText("Keine Meldungen")).toBeNull();
    expect(screen.queryByText("Keine Auffälligkeiten")).toBeNull();
    expect(screen.queryByText("Keine sichtbaren Auffälligkeiten")).toBeNull();
    mockResult = { ...mockCompliance, issues: [] };
    await screen.rerender(<ComplianceDetailsScreen />);
    expect(screen.getByText("Keine Auffälligkeiten")).toBeVisible();
  });
});
