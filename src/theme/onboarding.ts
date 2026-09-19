import { type TextStyle } from "react-native";
import { usePalette } from "./palette";
import { TYPOGRAPHY } from "./typography";

// Share functional colors with the app; pastels remain decorative onboarding assets.
export function useOnboardingPalette() {
  const palette = usePalette();
  const { dark } = palette;
  return {
    dark,
    canvas: palette.onboardingBackground,
    surface: palette.surface,
    text: palette.text,
    muted: palette.textMuted,
    accent: palette.accent,
    onAccent: palette.onAccent,
    accentText: palette.primary,
    selectionBorder: dark ? palette.border : palette.accent,
    error: palette.danger,
    border: palette.separator,
    control: palette.border,
    overlay: palette.overlay,
    rose: dark ? "#39252A" : "#F7DFE2",
    apricot: dark ? "#352C25" : "#F5E5D5",
    lavender: dark ? "#2D293A" : "#E8E3F3",
  };
}
export const ONBOARDING_TYPOGRAPHY = {
  body: { fontSize: 17, lineHeight: 24 },
  label: { fontSize: 15, lineHeight: 20, fontWeight: "500" },
  caption: { ...TYPOGRAPHY.highlightSummary, fontWeight: "400" },
  title: { fontSize: 28, lineHeight: 34, fontWeight: "600", letterSpacing: -0.7 },
  display: { fontSize: 34, lineHeight: 40, fontWeight: "600", letterSpacing: -1 },
  numericInput: { fontSize: 48, lineHeight: 56, fontWeight: "400", fontVariant: ["tabular-nums"] },
  button: { ...TYPOGRAPHY.highlightTitle, letterSpacing: 0 },
} as const satisfies Readonly<Record<string, TextStyle>>;
