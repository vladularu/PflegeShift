import { act, fireEvent, render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import type { ComponentProps, PropsWithChildren } from "react";
import { ActionSheetIOS } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { validateSavedTvoedSueMonthConfirmation } from "@/domain/saved-tvoed-sue-month-confirmation";
import { validateSavedTvoedSueAllowanceConfirmation } from "@/domain/saved-tvoed-sue-allowance-confirmation";
import { LIGHT_PALETTE } from "@/theme/palette-values";
import { SueMonthForm } from "./sue-month-form";

const mockPalette = LIGHT_PALETTE;
jest.mock("@/theme/palette", () => ({ usePalette: () => mockPalette }));
jest.mock("@/ui/haptics", () => ({ successFeedback: jest.fn() }));

const savedBase = validateSavedTvoedSueMonthConfirmation({
  month: "2026-09",
  profileEffectiveFrom: "2026-09-01",
  profileRevision: 2,
  packageId: "tvoed-vka-sue-bt-b",
  ruleVersionId: "2026-05-01-draft1",
  variantId: "BT_B",
  regionId: "VKA",
  groupId: "s15",
  stepId: "s3",
  contractedWeeklyMinutes: 2340,
  standardFullTimeWeeklyMinutes: 2340,
  tariffApplicabilityConfirmed: true,
  sueClassificationConfirmed: true,
  standardFullTimeConfirmed: true,
  fullMonthBaseEntitlementConfirmed: true,
  fullMonthSameContractConfirmed: true,
  revision: 3,
  confirmedAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
});
const savedAllowance = validateSavedTvoedSueAllowanceConfirmation({
  month: "2026-09",
  profileEffectiveFrom: "2026-09-01",
  profileRevision: 2,
  packageId: "tvoed-vka-sue-bt-b",
  ruleVersionId: "2026-05-01-draft1",
  variantId: "BT_B",
  regionId: "VKA",
  groupId: "s15",
  stepId: "s3",
  contractedWeeklyMinutes: 2340,
  standardFullTimeWeeklyMinutes: 2340,
  sectionXxivClassificationConfirmed: true,
  fullMonthAllowanceEntitlementConfirmed: true,
  caseGroup: "6",
  conversionDays: "NONE_CONFIRMED",
  revision: 4,
  confirmedAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
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

async function setup({
  current = true,
  groupId = "s15",
  withSaved = true,
}: {
  current?: boolean;
  groupId?: string;
  withSaved?: boolean;
} = {}) {
  jest.spyOn(ActionSheetIOS, "showActionSheetWithOptions").mockImplementation(() => {});
  const onSaveBase = jest.fn(async () => ({ ...savedBase, revision: savedBase.revision + 1 }));
  const onSaveAllowance = jest.fn(async () => ({
    ...savedAllowance,
    revision: savedAllowance.revision + 1,
  }));
  const props: ComponentProps<typeof SueMonthForm> = {
    month: "2026-09",
    profileEffectiveFrom: "2026-09-01",
    profileRevision: 2,
    ruleVersionId: "2026-05-01-draft1",
    groupId,
    savedBase: withSaved ? savedBase : null,
    savedAllowance: withSaved ? savedAllowance : null,
    currentBase: current && withSaved,
    currentAllowance: current && withSaved,
    onSaveBase,
    onSaveAllowance,
    onReload: jest.fn(),
  };
  const screen = await render(<SueMonthForm {...props} />, { wrapper: TestContext });
  const rerender = (changes: Partial<ComponentProps<typeof SueMonthForm>>) =>
    screen.rerender(<SueMonthForm {...props} {...changes} />);
  return { screen, onSaveBase, onSaveAllowance, rerender };
}

async function choose(
  screen: Awaited<ReturnType<typeof setup>>["screen"],
  field: RegExp,
  label: string,
) {
  await fireEvent.press(screen.getByRole("button", { name: field }));
  const [options, select] = jest
    .mocked(ActionSheetIOS.showActionSheetWithOptions)
    .mock.calls.at(-1)!;
  const index = options.options.indexOf(label);
  expect(index).toBeGreaterThanOrEqual(0);
  await act(async () => select(index));
}

describe("SuE draft month form", () => {
  it("keeps every unanswered fact unknown and binds both saves to the exact month and rule", async () => {
    const { screen, onSaveBase, onSaveAllowance } = await setup({ withSaved: false });
    await fireEvent.press(screen.getByText("Grundentgelt-Angaben speichern"));
    expect(onSaveBase).toHaveBeenCalledWith({
      month: "2026-09",
      profileEffectiveFrom: "2026-09-01",
      expectedProfileRevision: 2,
      ruleVersionId: "2026-05-01-draft1",
      tariffApplicabilityConfirmed: null,
      sueClassificationConfirmed: null,
      standardFullTimeConfirmed: null,
      fullMonthBaseEntitlementConfirmed: null,
      fullMonthSameContractConfirmed: null,
      expectedRevision: 0,
    });
    await fireEvent.press(screen.getByText("Zulagen-Angaben speichern"));
    expect(onSaveAllowance).toHaveBeenCalledWith({
      month: "2026-09",
      profileEffectiveFrom: "2026-09-01",
      expectedProfileRevision: 2,
      ruleVersionId: "2026-05-01-draft1",
      sectionXxivClassificationConfirmed: null,
      fullMonthAllowanceEntitlementConfirmed: null,
      caseGroup: null,
      conversionDays: null,
      expectedRevision: 0,
    });
  });

  it("does not silently reuse stale yes answers but preserves conflict revisions", async () => {
    const { screen, onSaveBase, onSaveAllowance } = await setup({ current: false });
    expect(screen.getByText(/Frühere Angaben gehören zu einem anderen Profil/)).toBeTruthy();
    await fireEvent.press(screen.getByText("Grundentgelt-Angaben speichern"));
    expect(onSaveBase).toHaveBeenCalledWith(
      expect.objectContaining({ tariffApplicabilityConfirmed: null, expectedRevision: 3 }),
    );
    await fireEvent.press(screen.getByText("Zulagen-Angaben speichern"));
    expect(onSaveAllowance).toHaveBeenCalledWith(
      expect.objectContaining({
        sectionXxivClassificationConfirmed: null,
        caseGroup: null,
        expectedRevision: 4,
      }),
    );
  });

  it("keeps S15 case group and conversion days explicit", async () => {
    const { screen, onSaveAllowance } = await setup();
    await choose(screen, /^Fallgruppe S15/, "Andere Fallgruppe");
    await choose(screen, /^Umwandlungstage/, "Umwandlungstage genommen");
    await fireEvent.press(screen.getByText("Zulagen-Angaben speichern"));
    expect(onSaveAllowance).toHaveBeenCalledWith(
      expect.objectContaining({ caseGroup: "OTHER", conversionDays: "TAKEN", expectedRevision: 4 }),
    );
  });

  it("never sends an S15 fall group for another SuE group", async () => {
    const { screen, onSaveAllowance } = await setup({ groupId: "s8a", withSaved: false });
    expect(screen.queryByRole("button", { name: /^Fallgruppe S15/ })).toBeNull();
    await fireEvent.press(screen.getByText("Zulagen-Angaben speichern"));
    expect(onSaveAllowance).toHaveBeenCalledWith(expect.objectContaining({ caseGroup: null }));
  });

  it("preserves an unsaved allowance draft across a base save and loading cycle", async () => {
    const { screen, onSaveAllowance, rerender } = await setup({ withSaved: false });
    await choose(screen, /^Tätigkeit nach Abschnitt XXIV/, "Ja");
    await rerender({ savedBase, currentBase: true, disabled: true });
    expect(screen.getByRole("button", { name: /Tätigkeit nach Abschnitt XXIV.*Ja/ })).toBeTruthy();
    await fireEvent.press(screen.getByText("Zulagen-Angaben speichern"));
    expect(onSaveAllowance).not.toHaveBeenCalled();
    await rerender({ savedBase, currentBase: true, disabled: false });
    await fireEvent.press(screen.getByText("Zulagen-Angaben speichern"));
    expect(onSaveAllowance).toHaveBeenCalledWith(
      expect.objectContaining({ sectionXxivClassificationConfirmed: true }),
    );
  });

  it("preserves an unsaved base draft when the allowance record changes", async () => {
    const { screen, onSaveBase, rerender } = await setup({ withSaved: false });
    await choose(screen, /^Tarifgeltung für mich bestätigt/, "Ja");
    await rerender({ savedAllowance, currentAllowance: true });
    await fireEvent.press(screen.getByText("Grundentgelt-Angaben speichern"));
    expect(onSaveBase).toHaveBeenCalledWith(
      expect.objectContaining({ tariffApplicabilityConfirmed: true }),
    );
  });
});
