import { fireEvent, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { PropsWithChildren } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import candidate from "../../../rules/packages/reviewed/tvoed-vka-anlage-a/2026-05-01-draft1.json";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import { validateSavedTvoedAnnexAMonthConfirmation } from "@/domain/saved-tvoed-annex-a-month-confirmation";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { BUNDLED_HOLIDAY_RULES, BUNDLED_LEGAL_RULES } from "@/rules/bundled-rules";
import { createRuleResolver } from "@/rules/rule-resolver";
import { LIGHT_PALETTE } from "@/theme/palette-values";
import { AnnexAMonthScreen } from "./annex-a-month-screen";

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
      packageId: "tvoed-vka-anlage-a",
      variant: "BT_K",
      region: "VKA",
      group: "EG8",
      level: "3",
      fullTimeWeeklyMinutes: 2340,
    },
  },
};
const stale = validateSavedTvoedAnnexAMonthConfirmation({
  month: "2026-05",
  profileEffectiveFrom: "2026-05-01",
  profileRevision: 2,
  packageId: "tvoed-vka-anlage-a",
  ruleVersionId: candidate.versionId,
  variantId: "BT_K",
  regionId: "VKA",
  groupId: "eg8",
  stepId: "s3",
  contractedWeeklyMinutes: 2340,
  comparableFullTimeWeeklyMinutes: 2340,
  applicabilityConfirmed: true,
  comparableFullTimeConfirmed: true,
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
    tvoedAnnexAMonthConfirmations: [],
    saveTvoedAnnexAMonthConfirmation: jest.fn(),
    reload: jest.fn(),
  };
});

describe("TVöD Anlage A month route", () => {
  it("opens one exact full-month draft context", async () => {
    const screen = await render(<AnnexAMonthScreen />, { wrapper: TestContext });
    expect(screen.getByTestId("annex-a-month-form")).toBeTruthy();
  });

  it("rejects a profile split within the month", async () => {
    mockHistory.profiles = [profile, { ...profile, effectiveFrom: "2026-05-16", revision: 2 }];
    const screen = await render(<AnnexAMonthScreen />, { wrapper: TestContext });
    expect(screen.queryByTestId("annex-a-month-form")).toBeNull();
    expect(screen.getByText(/kein eindeutiger TVöD-Anlage-A-Entwurf/)).toBeTruthy();
  });

  it("marks an old profile revision stale without preselecting yes", async () => {
    mockHistory.tvoedAnnexAMonthConfirmations = [stale];
    const screen = await render(<AnnexAMonthScreen />, { wrapper: TestContext });
    expect(screen.getByText(/Frühere Angaben gehören zu einem anderen Profil/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Tarifgeltung für mich bestätigt.*Ungeklärt/ }),
    ).toBeTruthy();
  });

  it("keeps the form visible but blocks writes while the snapshot reloads", async () => {
    const screen = await render(<AnnexAMonthScreen />, { wrapper: TestContext });
    mockHistory = { ...mockHistory, status: "loading" };
    await screen.rerender(<AnnexAMonthScreen />);
    expect(screen.getByTestId("annex-a-month-form")).toBeTruthy();
    await fireEvent.press(screen.getByText("Monatsangaben speichern"));
    expect(mockHistory.saveTvoedAnnexAMonthConfirmation).not.toHaveBeenCalled();
  });

  it("clears an answer after a same-revision group change in restored data", async () => {
    const current = { ...stale, profileRevision: 1 };
    mockHistory.tvoedAnnexAMonthConfirmations = [current];
    const screen = await render(<AnnexAMonthScreen />, { wrapper: TestContext });
    expect(
      screen.getByRole("button", { name: /Tarifgeltung für mich bestätigt.*Ja/ }),
    ).toBeTruthy();
    const selection = profile.data.selection;
    if (selection.kind !== "tariff") throw new Error("Expected a tariff profile.");
    mockHistory = {
      ...mockHistory,
      profiles: [
        { ...profile, data: { ...profile.data, selection: { ...selection, group: "EG9A" } } },
      ],
    };
    await screen.rerender(<AnnexAMonthScreen />);
    expect(
      screen.getByRole("button", { name: /Tarifgeltung für mich bestätigt.*Ungeklärt/ }),
    ).toBeTruthy();
  });

  it("rejects an invalid month link before reading tariff data", async () => {
    mockMonth = "2026-13";
    const screen = await render(<AnnexAMonthScreen />, { wrapper: TestContext });
    expect(screen.queryByTestId("annex-a-month-form")).toBeNull();
    expect(screen.getByText(/keinen gültigen Monat/)).toBeTruthy();
  });
});
