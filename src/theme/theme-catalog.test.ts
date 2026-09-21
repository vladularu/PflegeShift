import { describe, expect, it } from "vitest";
import { THEME_IDS } from "@/domain/appearance";
import { colorContrastRatio } from "./color-contrast";
import { LIGHT_PALETTE, DARK_PALETTE } from "./palette-values";
import { resolvePalette, THEME_OPTIONS } from "./theme-catalog";

describe("theme catalog", () => {
  it("retains the current LUNA default and offers the four agreed themes", () => {
    expect(resolvePalette("standard", false)).toBe(LIGHT_PALETTE);
    expect(resolvePalette("standard", true)).toBe(DARK_PALETTE);
    expect(THEME_OPTIONS.map((theme) => theme.name)).toEqual([
      "LUNA Standard",
      "Minzbrise",
      "Lavendelruhe",
      "Rosenleinen",
      "Meeresluft",
    ]);
  });
  it.each(THEME_IDS)(
    "%s supports readable light and dark surfaces without changing semantic status colors",
    (id) => {
      for (const dark of [false, true]) {
        const palette = resolvePalette(id, dark);
        const standard = dark ? DARK_PALETTE : LIGHT_PALETTE;
        expect([palette.text, palette.textSecondary, palette.textMuted]).toEqual([
          standard.text,
          standard.textSecondary,
          standard.textMuted,
        ]);
        for (const surface of [
          palette.background,
          palette.surface,
          palette.surfaceRaised,
          palette.surfaceMuted,
          palette.primarySoft,
          palette.secondarySoft,
          palette.tertiarySoft,
        ]) {
          expect(colorContrastRatio(palette.text, surface)).toBeGreaterThanOrEqual(4.5);
          expect(colorContrastRatio(palette.textSecondary, surface)).toBeGreaterThanOrEqual(4.5);
          expect(colorContrastRatio(palette.textMuted, surface)).toBeGreaterThanOrEqual(4.5);
          expect(colorContrastRatio(palette.primary, surface)).toBeGreaterThanOrEqual(4.5);
          expect(colorContrastRatio(palette.border, surface)).toBeGreaterThanOrEqual(3);
          for (const foreground of ["info", "success", "warning", "danger"] as const) {
            expect(
              colorContrastRatio(palette[foreground], surface),
              `${id} ${dark ? "dark" : "light"}: ${foreground} on ${surface}`,
            ).toBeGreaterThanOrEqual(4.5);
          }
        }
        expect(colorContrastRatio(palette.onAccent, palette.accent)).toBeGreaterThanOrEqual(4.5);
        expect([palette.danger, palette.success, palette.warning]).toEqual([
          standard.danger,
          standard.success,
          standard.warning,
        ]);
      }
    },
  );
});
