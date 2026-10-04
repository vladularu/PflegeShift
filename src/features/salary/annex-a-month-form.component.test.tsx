import { act, fireEvent, render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import type { ComponentProps, PropsWithChildren } from "react";
import { ActionSheetIOS } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { validateSavedTvoedAnnexAMonthConfirmation } from "@/domain/saved-tvoed-annex-a-month-confirmation";
import { LIGHT_PALETTE } from "@/theme/palette-values";
import { AnnexAMonthForm } from "./annex-a-month-form";

const mockPalette = LIGHT_PALETTE;
jest.mock("@/theme/palette", () => ({ usePalette: () => mockPalette }));
jest.mock("@/ui/haptics", () => ({ successFeedback: jest.fn() }));

const saved = validateSavedTvoedAnnexAMonthConfirmation({
  month: "2026-09",
  profileEffectiveFrom: "2026-09-01",
  profileRevision: 2,
  packageId: "tvoed-vka-anlage-a",
  ruleVersionId: "2026-05-01-draft1",
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
  revision: 3,
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
  current = false,
  withSaved = false,
}: { current?: boolean; withSaved?: boolean } = {}) {
  jest.spyOn(ActionSheetIOS, "showActionSheetWithOptions").mockImplementation(() => {});
  const onSave = jest.fn(async () => ({ ...saved, revision: saved.revision + 1 }));
  const props: ComponentProps<typeof AnnexAMonthForm> = {
    month: "2026-09",
    profileEffectiveFrom: "2026-09-01",
    profileRevision: 2,
    ruleVersionId: "2026-05-01-draft1",
    saved: withSaved ? saved : null,
    current,
    onSave,
    onReload: jest.fn(),
  };
  const screen = await render(<AnnexAMonthForm {...props} />, { wrapper: TestContext });
  const rerender = (changes: Partial<ComponentProps<typeof AnnexAMonthForm>>) =>
    screen.rerender(<AnnexAMonthForm {...props} {...changes} />);
  return { screen, onSave, rerender };
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

describe("TVöD Anlage A draft month form", () => {
  it("saves all unanswered facts as null against the exact month and rule", async () => {
    const { screen, onSave } = await setup();
    await fireEvent.press(screen.getByText("Monatsangaben speichern"));
    expect(onSave).toHaveBeenCalledWith({
      month: "2026-09",
      profileEffectiveFrom: "2026-09-01",
      expectedProfileRevision: 2,
      ruleVersionId: "2026-05-01-draft1",
      applicabilityConfirmed: null,
      comparableFullTimeConfirmed: null,
      fullMonthBaseEntitlementConfirmed: null,
      fullMonthSameContractConfirmed: null,
      expectedRevision: 0,
    });
  });

  it("does not reuse stale yes answers but retains their conflict revision", async () => {
    const { screen, onSave } = await setup({ withSaved: true });
    expect(screen.getByText(/Frühere Angaben gehören zu einem anderen Profil/)).toBeTruthy();
    await fireEvent.press(screen.getByText("Monatsangaben speichern"));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ applicabilityConfirmed: null, expectedRevision: 3 }),
    );
  });

  it("preserves a draft through unchanged reloads and blocks writing during loading", async () => {
    const { screen, onSave, rerender } = await setup();
    await choose(screen, /^Tarifgeltung für mich bestätigt/, "Ja");
    await rerender({ disabled: true });
    expect(
      screen.getByRole("button", { name: /Tarifgeltung für mich bestätigt.*Ja/ }),
    ).toBeTruthy();
    await fireEvent.press(screen.getByText("Monatsangaben speichern"));
    expect(onSave).not.toHaveBeenCalled();
    await rerender({ disabled: false });
    await fireEvent.press(screen.getByText("Monatsangaben speichern"));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ applicabilityConfirmed: true }));
  });

  it("replaces a restored answer even if its revision and timestamp match", async () => {
    const { screen, rerender } = await setup({ withSaved: true, current: true });
    expect(
      screen.getByRole("button", { name: /Tarifgeltung für mich bestätigt.*Ja/ }),
    ).toBeTruthy();
    await rerender({ saved: { ...saved, applicabilityConfirmed: false } });
    expect(
      screen.getByRole("button", { name: /Tarifgeltung für mich bestätigt.*Nein/ }),
    ).toBeTruthy();
  });
});
