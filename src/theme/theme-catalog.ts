import type { ThemeId } from "@/domain/appearance";
import { DARK_PALETTE, LIGHT_PALETTE, type Palette } from "./palette-values";

const COLOR_THEMES = {
  mint: {
    name: "Minzbrise",
    description: "Salbei · Sand · Staubblau",
    light: {
      soft: "#EAF0E9",
      accent: "#4D685B",
      secondary: "#B6AA98",
      tertiary: "#A0AEBC",
      secondarySoft: "#EAF3EE",
      tertiarySoft: "#ECF0F3",
      ink: "#FFFFFF",
    },
    dark: {
      soft: "#2B3931",
      accent: "#B0C5B6",
      secondary: "#B9AD98",
      tertiary: "#A5B3C2",
      secondarySoft: "#20352C",
      tertiarySoft: "#2B323A",
      ink: "#202D25",
    },
  },
  lavender: {
    name: "Lavendelruhe",
    description: "Lavendel · Salbei · Rosé",
    light: {
      soft: "#EEEBF3",
      accent: "#68637D",
      secondary: "#A9B1A4",
      tertiary: "#BFA5AD",
      secondarySoft: "#F0ECF7",
      tertiarySoft: "#F3ECEF",
      ink: "#FFFFFF",
    },
    dark: {
      soft: "#343040",
      accent: "#C1B9D0",
      secondary: "#AEB6A7",
      tertiary: "#C6B0B9",
      secondarySoft: "#302A40",
      tertiarySoft: "#352E34",
      ink: "#2A2634",
    },
  },
  rose: {
    name: "Rosenleinen",
    description: "Rosé · Eukalyptus · Leinen",
    light: {
      soft: "#F3E9E9",
      accent: "#795F69",
      secondary: "#A5B4AA",
      tertiary: "#C2B39D",
      secondarySoft: "#F8ECEF",
      tertiarySoft: "#F3EFE8",
      ink: "#FFFFFF",
    },
    dark: {
      soft: "#3B2F35",
      accent: "#CEB5BE",
      secondary: "#ACBEB2",
      tertiary: "#C9BCA6",
      secondarySoft: "#3B2835",
      tertiarySoft: "#343029",
      ink: "#31262B",
    },
  },
  sea: {
    name: "Meeresluft",
    description: "Küstenblau · Sand · Nebelgrau",
    light: {
      soft: "#E7EFF0",
      accent: "#496B77",
      secondary: "#C2AC9A",
      tertiary: "#A8B1C4",
      secondarySoft: "#EAF2F7",
      tertiarySoft: "#ECEFF5",
      ink: "#FFFFFF",
    },
    dark: {
      soft: "#293A42",
      accent: "#AEC7D0",
      secondary: "#C5B09C",
      tertiary: "#AFBDD0",
      secondarySoft: "#20323F",
      tertiarySoft: "#2D3340",
      ink: "#233139",
    },
  },
} as const;

export const THEME_OPTIONS = [
  { id: "standard", name: "LUNA Standard", description: "Vertraut und zurückhaltend" },
  ...Object.entries(COLOR_THEMES).map(([id, theme]) => ({
    id: id as ThemeId,
    name: theme.name,
    description: theme.description,
  })),
] as const;

function themedPalette(id: Exclude<ThemeId, "standard">, dark: boolean): Palette {
  const base = dark ? DARK_PALETTE : LIGHT_PALETTE;
  const c = COLOR_THEMES[id][dark ? "dark" : "light"];
  return Object.freeze({
    ...base,
    dark,
    accent: c.accent,
    onAccent: c.ink,
    primarySoft: c.soft,
    secondarySoft: c.secondarySoft,
    tertiarySoft: c.tertiarySoft,
    calendarYearAccent: c.accent,
    calendarSelection: c.soft,
    onCalendarSelection: base.text,
    floatingAction: c.accent,
    onFloatingAction: c.ink,
  });
}
const PALETTES = Object.fromEntries(
  THEME_OPTIONS.map(({ id }) => [
    id,
    {
      light: id === "standard" ? LIGHT_PALETTE : themedPalette(id, false),
      dark: id === "standard" ? DARK_PALETTE : themedPalette(id, true),
    },
  ]),
) as Record<ThemeId, { light: Palette; dark: Palette }>;
export function resolvePalette(themeId: ThemeId, dark: boolean): Palette {
  return PALETTES[themeId][dark ? "dark" : "light"];
}
export function themeSwatches(themeId: ThemeId, dark: boolean): readonly string[] {
  if (themeId === "standard") {
    const palette = resolvePalette(themeId, dark);
    return [palette.accent, palette.secondarySoft, palette.tertiarySoft];
  }
  const c = COLOR_THEMES[themeId][dark ? "dark" : "light"];
  return [c.accent, c.secondary, c.tertiary];
}
