import { fireEvent, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { PropsWithChildren } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import candidate from "../../../rules/packages/reviewed/tvoed-vka-sue-bt-b/2026-05-01-draft1.json";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import { validateSavedTvoedSueMonthConfirmation } from "@/domain/saved-tvoed-sue-month-confirmation";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { BUNDLED_HOLIDAY_RULES, BUNDLED_LEGAL_RULES } from "@/rules/bundled-rules";
import { createRuleResolver } from "@/rules/rule-resolver";
import { LIGHT_PALETTE } from "@/theme/palette-values";
import { SueMonthScreen } from "./sue-month-screen";

const mockResolver = createRuleResolver({
  tariff: [candidate as RuleTariffPackage],
  legal: BUNDLED_LEGAL_RULES,
  holiday: BUNDLED_HOLIDAY_RULES,
});
const mockPalette = LIGHT_PALETTE;
let mockMonth = "2026-05";
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
jest.mock("@/theme/palette", () => ({ usePalette: () => mockPalette }));
jest.mock("@/ui/haptics", () => ({ successFeedback: jest.fn() }));

const profile: DatedRemunerationProfile = {
  effectiveFrom: "2026-05-01",
  revision: 1,
  createdAt: "2026-05-01T00:00:00Z",
  updatedAt: "2026-05-01T00:00:00Z",
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
const stale = validateSavedTvoedSueMonthConfirmation({
  month: "2026-05",
  profileEffectiveFrom: "2026-05-01",
  profileRevision: 2,
  packageId: "tvoed-vka-sue-bt-b",
  ruleVersionId: candidate.versionId,
  variantId: "BT_B",
  regionId: "VKA",
  groupId: "s8a",
  stepId: "s3",
  contractedWeeklyMinutes: 2340,
  standardFullTimeWeeklyMinutes: 2340,
  tariffApplicabilityConfirmed: true,
  sueClassificationConfirmed: true,
  standardFullTimeConfirmed: true,
  fullMonthBaseEntitlementConfirmed: true,
  fullMonthSameContractConfirmed: true,
  revision: 2,
  confirmedAt: "2026-05-01T00:00:00Z",
  updatedAt: "2026-05-01T00:00:00Z",
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
  mockMonth = "2026-05";
  mockHistory = {
    status: "ready",
    error: null,
    profiles: [profile],
    tvoedSueMonthConfirmations: [],
    tvoedSueAllowanceConfirmations: [],
    saveTvoedSueMonthConfirmation: jest.fn(),
    saveTvoedSueAllowanceConfirmation: jest.fn(),
    reload: jest.fn(),
  };
});

describe("SuE month route", () => {
  it("opens an exact full-month SuE draft", async () => {
    const ready = await render(<SueMonthScreen />, { wrapper: TestContext });
    expect(ready.getByTestId("sue-month-form")).toBeTruthy();
  });

  it("keeps the form mounted but blocks writes while a saved snapshot reloads", async () => {
    const screen = await render(<SueMonthScreen />, { wrapper: TestContext });
    mockHistory = { ...mockHistory, status: "loading" };
    await screen.rerender(<SueMonthScreen />);
    expect(screen.getByTestId("sue-month-form")).toBeTruthy();
    await fireEvent.press(screen.getByText("Grundentgelt-Angaben speichern"));
    expect(mockHistory.saveTvoedSueMonthConfirmation).not.toHaveBeenCalled();
  });

  it("rejects a profile split within the month", async () => {
    mockHistory.profiles = [profile, { ...profile, effectiveFrom: "2026-05-16", revision: 2 }];
    const split = await render(<SueMonthScreen />, { wrapper: TestContext });
    expect(split.queryByTestId("sue-month-form")).toBeNull();
    expect(split.getByText(/kein eindeutiger SuE-Tabellenentwurf/)).toBeTruthy();
  });

  it("marks a previous profile revision stale instead of preselecting its yes answers", async () => {
    mockHistory.tvoedSueMonthConfirmations = [stale];
    const screen = await render(<SueMonthScreen />, { wrapper: TestContext });
    expect(screen.getByText(/Frühere Angaben gehören zu einem anderen Profil/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Tarifgeltung für mich bestätigt.*Ungeklärt/ }),
    ).toBeTruthy();
  });

  it("refreshes a restored answer even when its revision and timestamp are unchanged", async () => {
    const current = { ...stale, profileRevision: 1 };
    mockHistory.tvoedSueMonthConfirmations = [current];
    const screen = await render(<SueMonthScreen />, { wrapper: TestContext });
    expect(
      screen.getByRole("button", { name: /Tarifgeltung für mich bestätigt.*Ja/ }),
    ).toBeTruthy();
    mockHistory = {
      ...mockHistory,
      tvoedSueMonthConfirmations: [{ ...current, tariffApplicabilityConfirmed: false }],
    };
    await screen.rerender(<SueMonthScreen />);
    expect(
      screen.getByRole("button", { name: /Tarifgeltung für mich bestätigt.*Nein/ }),
    ).toBeTruthy();
  });

  it("clears old answers after a same-revision group change from restored data", async () => {
    const current = { ...stale, profileRevision: 1 };
    mockHistory.tvoedSueMonthConfirmations = [current];
    const screen = await render(<SueMonthScreen />, { wrapper: TestContext });
    expect(
      screen.getByRole("button", { name: /Tarifgeltung für mich bestätigt.*Ja/ }),
    ).toBeTruthy();
    const selection = profile.data.selection;
    if (selection.kind !== "tariff") throw new Error("Expected a tariff profile.");
    mockHistory = {
      ...mockHistory,
      profiles: [
        { ...profile, data: { ...profile.data, selection: { ...selection, group: "S15" } } },
      ],
    };
    await screen.rerender(<SueMonthScreen />);
    expect(
      screen.getByRole("button", { name: /Tarifgeltung für mich bestätigt.*Ungeklärt/ }),
    ).toBeTruthy();
    expect(screen.getByText(/Frühere Angaben gehören zu einem anderen Profil/)).toBeTruthy();
  });

  it("rejects an invalid month link before loading tariff data", async () => {
    mockMonth = "2026-13";
    const screen = await render(<SueMonthScreen />, { wrapper: TestContext });
    expect(screen.queryByTestId("sue-month-form")).toBeNull();
    expect(screen.getByText(/keinen gültigen Monat/)).toBeTruthy();
  });
});
