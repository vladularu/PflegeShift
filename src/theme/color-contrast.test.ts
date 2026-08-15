import { describe, expect, it } from "vitest";

import {
  accessibleChipBackgroundColor,
  calendarChipPalette,
  chipTextColor,
  colorContrastRatio,
  MINIMUM_TEXT_CONTRAST,
  MINIMUM_UI_CONTRAST,
} from "@/theme/color-contrast";
import { DARK_PALETTE, LIGHT_PALETTE, type Palette } from "@/theme/palette-values";

describe("accessible service chips", () => {
  it("keeps the label color consistently white", () => {
    expect(chipTextColor).toBe("#FFFFFF");
  });

  it("keeps dark colors and tones down bright colors only for display", () => {
    expect(accessibleChipBackgroundColor("#7E57C2")).toBe("#7E57C2");
    expect(accessibleChipBackgroundColor("#F2A93B")).not.toBe("#F2A93B");
    expect(accessibleChipBackgroundColor("transparent")).toBe("transparent");
  });

  it.each([false, true])("builds readable two-line calendar chips in dark=%s", (dark) => {
    for (const color of ["#62B94C", "#F05C59", "#31A7C3", "#D95F9A"]) {
      const chip = calendarChipPalette(color, dark);
      expect(chip.onMain).toBe("#FFFFFF");
      expect(chip.onDetail).toBe("#FFFFFF");
      expect(colorContrastRatio(chip.onMain, chip.main)).toBeGreaterThanOrEqual(
        MINIMUM_TEXT_CONTRAST,
      );
      expect(colorContrastRatio(chip.onDetail, chip.detail)).toBeGreaterThanOrEqual(
        MINIMUM_TEXT_CONTRAST,
      );
    }
  });
});

const TEXT_COLORS = [
  "text",
  "textSecondary",
  "textMuted",
  "primary",
  "info",
  "success",
  "warning",
  "danger",
] as const satisfies readonly (keyof Palette)[];

const CONTENT_BACKGROUNDS = [
  "background",
  "groupedBackground",
  "surface",
  "surfaceRaised",
  "surfaceMuted",
  "primarySoft",
] as const satisfies readonly (keyof Palette)[];

describe.each([
  ["light", LIGHT_PALETTE],
  ["dark", DARK_PALETTE],
] as const)("%s palette contrast", (_, palette) => {
  it.each(TEXT_COLORS)("keeps %s readable on content surfaces", (foreground) => {
    for (const background of CONTENT_BACKGROUNDS) {
      expect(
        colorContrastRatio(palette[foreground] as string, palette[background] as string),
        `${foreground} on ${background}`,
      ).toBeGreaterThanOrEqual(MINIMUM_TEXT_CONTRAST);
    }
  });

  it("keeps primary actions readable", () => {
    expect(colorContrastRatio(palette.onPrimary, palette.primary)).toBeGreaterThanOrEqual(
      MINIMUM_TEXT_CONTRAST,
    );
  });

  it("keeps destructive actions readable", () => {
    expect(colorContrastRatio(palette.onDanger, palette.danger)).toBeGreaterThanOrEqual(
      MINIMUM_TEXT_CONTRAST,
    );
  });

  it.each(CONTENT_BACKGROUNDS)("keeps control borders visible on %s", (background) => {
    expect(
      colorContrastRatio(palette.border, palette[background] as string),
      `border on ${background}`,
    ).toBeGreaterThanOrEqual(MINIMUM_UI_CONTRAST);
  });
});
