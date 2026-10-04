import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import type { PropsWithChildren } from "react";
import { ActionSheetIOS } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { validateSavedCaritasMonthFacts } from "@/domain/saved-caritas-month-facts";
import { LIGHT_PALETTE, DARK_PALETTE } from "@/theme/palette-values";
import { CaritasMonthFactsForm } from "./caritas-month-facts-form";

let mockPalette = LIGHT_PALETTE;
jest.mock("@/theme/palette", () => ({ usePalette: () => mockPalette }));
jest.mock("@/ui/haptics", () => ({ successFeedback: jest.fn() }));

const saved = validateSavedCaritasMonthFacts({
  month: "2026-09",
  profileEffectiveFrom: "2026-09-01",
  profileRevision: 2,
  packageId: "avr-caritas-p-bw",
  ruleVersionId: "2026-02-01-draft1",
  variantId: "ANLAGE_31",
  regionId: "BW",
  fullMonthEmploymentConfirmed: true,
  fullMonthlyBaseEntitlementConfirmed: true,
  fixedAllowanceClaim: "ENTITLED",
  careAllowanceClaim: "NOT_ENTITLED",
  localAgreement: "NONE_CONFIRMED",
  revision: 3,
  confirmedAt: "2026-09-22T00:00:00Z",
  updatedAt: "2026-09-22T00:00:00Z",
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

async function setup(current = true) {
  jest.spyOn(ActionSheetIOS, "showActionSheetWithOptions").mockImplementation(() => {});
  const onSave = jest.fn(async () => ({ ...saved, revision: 4 }));
  const onReload = jest.fn();
  const screen = await render(
    <CaritasMonthFactsForm
      month="2026-09"
      profileEffectiveFrom="2026-09-01"
      profileRevision={2}
      ruleVersionId="2026-02-01-draft1"
      saved={saved}
      current={current}
      onSave={onSave}
      onReload={onReload}
    />,
    { wrapper: TestContext },
  );
  return { screen, onSave, onReload };
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

describe("Caritas monthly facts form", () => {
  it("preserves independent answers and writes the bound profile and rule revision", async () => {
    const { screen, onSave } = await setup();
    await choose(screen, /^Im gesamten Monat beschäftigt/, "Nein");
    await choose(screen, /^Grundentgelt für den gesamten Monat/, "Ungeklärt");
    await choose(screen, /^Anspruch auf feste Zulage/, "Nein");
    await choose(screen, /^Anspruch auf Pflegezulage/, "Ja");
    await choose(
      screen,
      /^Abweichende Dienstvereinbarung zu Zeitzuschlägen/,
      "Abweichende Regelung bekannt",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Angaben speichern" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({
      month: "2026-09",
      profileEffectiveFrom: "2026-09-01",
      expectedProfileRevision: 2,
      ruleVersionId: "2026-02-01-draft1",
      fullMonthEmploymentConfirmed: false,
      fullMonthlyBaseEntitlementConfirmed: null,
      fixedAllowanceClaim: "NOT_ENTITLED",
      careAllowanceClaim: "ENTITLED",
      localAgreement: "DIFFERENT",
      expectedRevision: 3,
    });
    expect(screen.getByText(/Angaben gespeichert/)).toBeTruthy();
  });

  it("does not silently reuse stale claims and keeps the concurrency revision", async () => {
    const { screen, onSave } = await setup(false);
    expect(screen.getByText(/älteren Vergütungs- oder Regelstand/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Angaben speichern" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        fullMonthEmploymentConfirmed: null,
        fullMonthlyBaseEntitlementConfirmed: null,
        fixedAllowanceClaim: "UNKNOWN",
        careAllowanceClaim: "UNKNOWN",
        localAgreement: "UNKNOWN",
        expectedRevision: 3,
      }),
    );
  });

  it.each([LIGHT_PALETTE, DARK_PALETTE])(
    "shows errors and an explicit reload action",
    async (palette) => {
      mockPalette = palette;
      const { screen, onSave, onReload } = await setup();
      onSave.mockRejectedValueOnce(new Error("Die Monatsbestätigung wurde inzwischen geändert."));
      await fireEvent.press(screen.getByRole("button", { name: "Angaben speichern" }));
      await waitFor(() =>
        expect(
          screen.getByText("Speichern fehlgeschlagen. Bitte aktuellen Stand laden."),
        ).toBeTruthy(),
      );
      await fireEvent.press(screen.getByRole("button", { name: "Aktuellen Stand laden" }));
      expect(onReload).toHaveBeenCalledTimes(1);
    },
  );
});
