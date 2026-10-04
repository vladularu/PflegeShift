import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { router } from "expo-router";
import source from "../../../rules/packages/reviewed/avr-caritas-p-bw/2026-02-01-draft1.json";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import { validateSavedCaritasMonthFacts } from "@/domain/saved-caritas-month-facts";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { createRuleResolver } from "@/rules/rule-resolver";
import { LIGHT_PALETTE } from "@/theme/palette-values";
import { CaritasMonthFactsScreen } from "./caritas-month-facts-screen";

let mockResolver = createRuleResolver({
  tariff: [source as RuleTariffPackage],
  legal: [],
  holiday: [],
});
let mockMonth: string | undefined = "2026-09";
let mockHistory: Record<string, unknown>;
jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({ month: mockMonth }),
}));
jest.mock("@/application/remuneration-provider", () => ({
  useRemunerationData: () => mockHistory,
}));
jest.mock("@/application/rule-catalog-runtime-provider", () => ({
  useRuleCatalogRuntime: () => ({ resolver: mockResolver }),
}));
const mockPalette = LIGHT_PALETTE;
jest.mock("@/theme/palette", () => ({ usePalette: () => mockPalette }));
jest.mock("@/ui/haptics", () => ({ successFeedback: jest.fn() }));

const stamp = "2026-09-01T00:00:00Z";
const profile: DatedRemunerationProfile = {
  effectiveFrom: "2026-09-01",
  revision: 2,
  createdAt: stamp,
  updatedAt: stamp,
  data: {
    version: 1,
    weeklyMinutes: 2340,
    selection: {
      kind: "tariff",
      packageId: source.packageId,
      variant: "ANLAGE_31",
      region: "BW",
      group: "p6",
      level: "1",
      fullTimeWeeklyMinutes: 2340,
    },
  },
};
const saved = validateSavedCaritasMonthFacts({
  month: "2026-09",
  profileEffectiveFrom: profile.effectiveFrom,
  profileRevision: profile.revision,
  packageId: source.packageId,
  ruleVersionId: source.versionId,
  variantId: "ANLAGE_31",
  regionId: "BW",
  fullMonthEmploymentConfirmed: true,
  fullMonthlyBaseEntitlementConfirmed: true,
  fixedAllowanceClaim: "ENTITLED",
  careAllowanceClaim: "NOT_ENTITLED",
  localAgreement: "NONE_CONFIRMED",
  revision: 3,
  confirmedAt: stamp,
  updatedAt: stamp,
});
function TestContext({ children }: PropsWithChildren) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { width: 430, height: 932, x: 0, y: 0 },
        insets: { top: 59, bottom: 34, left: 0, right: 0 },
      }}
    >
      {children}
    </SafeAreaProvider>
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  mockMonth = "2026-09";
  mockResolver = createRuleResolver({
    tariff: [source as RuleTariffPackage],
    legal: [],
    holiday: [],
  });
  mockHistory = {
    status: "ready",
    error: null,
    profiles: [profile],
    caritasMonthFacts: [saved],
    saveCaritasMonthFacts: jest.fn(async () => ({ ...saved, revision: 4 })),
    reload: jest.fn(async () => {}),
  };
});
const open = () => render(<CaritasMonthFactsScreen />, { wrapper: TestContext });
describe("Caritas month facts entry", () => {
  it("opens the real month form and saves only the bound personal facts", async () => {
    const view = await open();
    expect(view.getByText(/erscheint nicht als fertige/)).toBeTruthy();
    expect(view.getByRole("button", { name: /Im gesamten Monat beschäftigt: Ja/ })).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Angaben speichern" }));
    expect(mockHistory.saveCaritasMonthFacts).toHaveBeenCalledWith({
      month: "2026-09",
      profileEffectiveFrom: "2026-09-01",
      expectedProfileRevision: 2,
      ruleVersionId: source.versionId,
      fullMonthEmploymentConfirmed: true,
      fullMonthlyBaseEntitlementConfirmed: true,
      fixedAllowanceClaim: "ENTITLED",
      careAllowanceClaim: "NOT_ENTITLED",
      localAgreement: "NONE_CONFIRMED",
      expectedRevision: 3,
    });
  });
  it.each([undefined, "2026-13"])(
    "rejects missing/invalid month %s before an input form",
    async (month) => {
      mockMonth = month;
      const view = await open();
      expect(view.queryByTestId("caritas-month-facts-form")).toBeNull();
      await fireEvent.press(view.getByRole("button", { name: "Schließen" }));
      expect(router.back).toHaveBeenCalled();
    },
  );
  it("hides old facts while loading and on errors, and reloads the remuneration snapshot", async () => {
    const view = await open();
    mockHistory = { ...mockHistory, status: "loading" };
    await view.rerender(<CaritasMonthFactsScreen />);
    expect(view.queryByTestId("caritas-month-facts-form")).toBeNull();
    mockHistory = {
      ...mockHistory,
      status: "error",
      error: "Monatsangaben konnten nicht geladen werden.",
    };
    await view.rerender(<CaritasMonthFactsScreen />);
    await fireEvent.press(view.getByRole("button", { name: /Erneut/ }));
    expect(mockHistory.reload).toHaveBeenCalledTimes(1);
    expect(mockHistory.saveCaritasMonthFacts).not.toHaveBeenCalled();
  });
  it("does not open missing/split history or a missing source", async () => {
    mockHistory = {
      ...mockHistory,
      profiles: [profile, { ...profile, effectiveFrom: "2026-09-15", revision: 3 }],
    };
    const view = await open();
    expect(view.queryByTestId("caritas-month-facts-form")).toBeNull();
    mockHistory = { ...mockHistory, profiles: [profile] };
    mockResolver = createRuleResolver({ tariff: [], legal: [], holiday: [] });
    await view.rerender(<CaritasMonthFactsScreen />);
    expect(view.queryByTestId("caritas-month-facts-form")).toBeNull();
  });
  it("reopens stale facts as unknown and keeps their optimistic revision", async () => {
    mockHistory = { ...mockHistory, profiles: [{ ...profile, revision: 3 }] };
    const view = await open();
    expect(view.getByText(/älteren Vergütungs-/)).toBeTruthy();
    expect(
      view.getByRole("button", { name: /Im gesamten Monat beschäftigt: Ungeklärt/ }),
    ).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Angaben speichern" }));
    expect(mockHistory.saveCaritasMonthFacts).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedProfileRevision: 3,
        expectedRevision: 3,
        fullMonthEmploymentConfirmed: null,
        fixedAllowanceClaim: "UNKNOWN",
      }),
    );
  });
  it("refreshes facts restored at the same revision instead of saving stale answers", async () => {
    const view = await open();
    mockHistory = {
      ...mockHistory,
      caritasMonthFacts: [
        { ...saved, fullMonthEmploymentConfirmed: false, fixedAllowanceClaim: "NOT_ENTITLED" },
      ],
    };
    await view.rerender(<CaritasMonthFactsScreen />);
    expect(view.getByRole("button", { name: /Im gesamten Monat beschäftigt: Nein/ })).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Angaben speichern" }));
    expect(mockHistory.saveCaritasMonthFacts).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRevision: 3,
        fullMonthEmploymentConfirmed: false,
        fixedAllowanceClaim: "NOT_ENTITLED",
      }),
    );
  });
  it.each([{ facts: [saved, saved] }, { facts: [{ ...saved, revision: -1 }] }])(
    "rejects ambiguous or invalid restored month facts",
    async ({ facts }) => {
      mockHistory = { ...mockHistory, caritasMonthFacts: facts };
      const view = await open();
      expect(view.queryByTestId("caritas-month-facts-form")).toBeNull();
      expect(view.getByText(/nicht eindeutig geprüft/)).toBeTruthy();
    },
  );
});
