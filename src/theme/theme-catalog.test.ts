import { describe, expect, it } from "vitest";
import { THEME_IDS } from "@/domain/appearance";
import { colorContrastRatio } from "./color-contrast";
import { LIGHT_PALETTE, DARK_PALETTE } from "./palette-values";
import { resolvePalette, THEME_OPTIONS } from "./theme-catalog";

describe("theme catalog", () => {
  it.each(THEME_IDS)("%s keeps content neutral while retaining themed actions", (id) => {
    for (const dark of [false, true]) {
      const palette = resolvePalette(id, dark);
      const standard = dark ? DARK_PALETTE : LIGHT_PALETTE;
      for (const key of [
        "background",
        "calendarBackground",
        "surface",
        "surfaceRaised",
        "surfaceMuted",
        "border",
        "separator",
        "tabBar",
        "primary",
        "onPrimary",
      ] as const) {
        expect(palette[key], `${id}: ${key}`).toBe(standard[key]);
      }
      expect(palette.calendarBackground).toBe(dark ? "#000000" : "#FFFFFF");
      expect(palette.background).toBe(dark ? "#000000" : "#F5F5F7");
      expect(palette.surface).toBe(dark ? "#1C1C1E" : "#FFFFFF");
      expect(palette.primary).toBe(palette.text);
      expect(colorContrastRatio(palette.onPrimary, palette.primary)).toBeGreaterThanOrEqual(4.5);
      expect(colorContrastRatio(palette.text, palette.calendarBackground)).toBeGreaterThanOrEqual(
        4.5,
      );
      if (id !== "standard") expect(palette.accent).not.toBe(standard.accent);
    }
  });
  it("retains the current LUNA default and offers the four agreed themes", () => {
    expect(resolvePalette("standard", false)).toBe(LIGHT_PALETTE);
    expect(resolvePalette("standard", true)).toBe(DARK_PALETTE);
    expect(resolvePalette("standard", false).secondarySoft).toBe("#F9E9EB");
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
