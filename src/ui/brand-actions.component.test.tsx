import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render } from "@testing-library/react-native";

import { DARK_PALETTE, LIGHT_PALETTE } from "@/theme/palette-values";
import { HeaderAction } from "@/ui/design-system";
import { PrimaryButton, SecondaryButton } from "@/ui/form-controls";

let mockPalette = LIGHT_PALETTE;
jest.mock("@/theme/palette", () => ({ usePalette: () => mockPalette }));

describe("shared brand actions", () => {
  it.each([LIGHT_PALETTE, DARK_PALETTE])(
    "keeps red fills, white labels and readable secondary text in dark=$dark",
    async (palette) => {
      mockPalette = palette;
      const onPress = jest.fn();
      const screen = await render(
        <>
          <PrimaryButton onPress={onPress}>Speichern</PrimaryButton>
          <SecondaryButton onPress={() => undefined}>Abbrechen</SecondaryButton>
          <HeaderAction emphasis label="Fertig" onPress={onPress} />
        </>,
      );
      expect(screen.getByRole("button", { name: "Speichern" })).toHaveStyle({
        backgroundColor: "#C93443",
      });
      for (const name of ["Speichern", "Fertig"]) {
        expect(screen.getByText(name)).toHaveStyle({ color: "#FFFFFF" });
        await fireEvent.press(screen.getByRole("button", { name }));
      }
      expect(screen.getByText("Abbrechen")).toHaveStyle({ color: palette.primary });
      expect(onPress).toHaveBeenCalledTimes(2);
    },
  );
});
