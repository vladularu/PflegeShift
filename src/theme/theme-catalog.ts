import type { ThemeId } from "@/domain/appearance";
import { DARK_PALETTE, LIGHT_PALETTE, type Palette } from "./palette-values";

const COLOR_THEMES = {
  mint: {
    name: "Minzbrise",
    description: "Salbei · Sand · Staubblau",
    light: {
      bg: "#F5F6F3",
      surface: "#FDFEFC",
      raised: "#FFFFFF",
      neutral: "#EDF0EB",
      border: "#767F76",
      separator: "#DDE3DA",
      soft: "#EAF0E9",
      accent: "#4D685B",
      secondary: "#B6AA98",
      tertiary: "#A0AEBC",
      secondarySoft: "#F2EEE7",
      tertiarySoft: "#ECF0F3",
      ink: "#FFFFFF",
    },
    dark: {
      bg: "#181C1A",
      surface: "#242A26",
      raised: "#2B322D",
      neutral: "#2D342F",
      border: "#89958C",
      separator: "#39433C",
      soft: "#2B3931",
      accent: "#B0C5B6",
      secondary: "#B9AD98",
      tertiary: "#A5B3C2",
      secondarySoft: "#322F29",
      tertiarySoft: "#2B323A",
      ink: "#202D25",
    },
  },
  lavender: {
    name: "Lavendelruhe",
    description: "Lavendel · Salbei · Rosé",
    light: {
      bg: "#F5F5F7",
      surface: "#FDFDFE",
      raised: "#FFFFFF",
      neutral: "#EFEEF2",
      border: "#7D7B87",
      separator: "#E2E0E7",
      soft: "#EEEBF3",
      accent: "#68637D",
      secondary: "#A9B1A4",
      tertiary: "#BFA5AD",
      secondarySoft: "#EEF0EA",
      tertiarySoft: "#F3ECEF",
      ink: "#FFFFFF",
    },
    dark: {
      bg: "#1A191F",
      surface: "#28262F",
      raised: "#302D37",
      neutral: "#322F3A",
      border: "#928E9D",
      separator: "#413D49",
      soft: "#343040",
      accent: "#C1B9D0",
      secondary: "#AEB6A7",
      tertiary: "#C6B0B9",
      secondarySoft: "#2E322D",
      tertiarySoft: "#352E34",
      ink: "#2A2634",
    },
  },
  rose: {
    name: "Rosenleinen",
    description: "Rosé · Eukalyptus · Leinen",
    light: {
      bg: "#F7F5F4",
      surface: "#FFFCFB",
      raised: "#FFFFFF",
      neutral: "#F1ECEB",
      border: "#867879",
      separator: "#E7DEDD",
      soft: "#F3E9E9",
      accent: "#795F69",
      secondary: "#A5B4AA",
      tertiary: "#C2B39D",
      secondarySoft: "#EDF1EC",
      tertiarySoft: "#F3EFE8",
      ink: "#FFFFFF",
    },
    dark: {
      bg: "#1F1A1C",
      surface: "#2C2629",
      raised: "#342D30",
      neutral: "#372F32",
      border: "#9B8B91",
      separator: "#463C40",
      soft: "#3B2F35",
      accent: "#CEB5BE",
      secondary: "#ACBEB2",
      tertiary: "#C9BCA6",
      secondarySoft: "#2D3430",
      tertiarySoft: "#343029",
      ink: "#31262B",
    },
  },
  sea: {
    name: "Meeresluft",
    description: "Küstenblau · Sand · Nebelgrau",
    light: {
      bg: "#F3F6F6",
      surface: "#FCFEFD",
      raised: "#FFFFFF",
      neutral: "#EAEFF0",
      border: "#738086",
      separator: "#DAE3E5",
      soft: "#E7EFF0",
      accent: "#496B77",
      secondary: "#C2AC9A",
      tertiary: "#A8B1C4",
      secondarySoft: "#F2EEE8",
      tertiarySoft: "#ECEFF5",
      ink: "#FFFFFF",
    },
    dark: {
      bg: "#181D21",
      surface: "#232C31",
      raised: "#2A343A",
      neutral: "#2B373D",
      border: "#86989F",
      separator: "#35464D",
      soft: "#293A42",
      accent: "#AEC7D0",
      secondary: "#C5B09C",
      tertiary: "#AFBDD0",
      secondarySoft: "#333029",
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
    background: c.bg,
    onboardingBackground: c.bg,
    groupedBackground: c.bg,
    surface: c.surface,
    surfaceRaised: c.raised,
    surfaceMuted: c.neutral,
    border: c.border,
    separator: c.separator,
    accent: c.accent,
    onAccent: c.ink,
    primary: c.accent,
    primarySoft: c.soft,
    onPrimary: c.ink,
    secondarySoft: c.secondarySoft,
    tertiarySoft: c.tertiarySoft,
    weekend: c.neutral,
    outsideMonth: c.bg,
    tabBar: c.surface,
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
