import { render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import type { MonthlyComplianceResult } from "@/domain/types";
import { ComplianceDetailsScreen } from "@/features/analysis/compliance-details-screen";
import { LIGHT_PALETTE } from "@/theme/palette";

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
    result: mockCompliance,
    retry: jest.fn(),
  }),
}));

jest.mock("@/features/analysis/analysis-screen", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Text } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    ComplianceDetails: ({ heading }: { readonly heading?: string }) =>
      React.createElement(Text, null, heading),
  };
});

describe("ComplianceDetailsScreen", () => {
  beforeEach(() => {
    mockPlanning = true;
  });
  it("filters the detail summary but keeps legal critical findings", async () => {
    mockPlanning = false;
    const screen = await render(<ComplianceDetailsScreen />);
    expect(screen.getByRole("header", { name: "2 Meldungen" })).toHaveStyle({
      color: LIGHT_PALETTE.danger,
    });
  });
  it("shows one neutral total and reserves color for its severity", async () => {
    const screen = await render(<ComplianceDetailsScreen />);

    expect(screen.getByRole("header", { name: "3 Meldungen" })).toHaveStyle({
      color: LIGHT_PALETTE.danger,
    });
    expect(screen.queryByText(/kritisch/i)).toBeNull();
    expect(screen.getByText("Meldungen")).toBeVisible();
  });
});
