import { useColorScheme, type TextStyle } from "react-native";
import { TYPOGRAPHY } from "./typography";

// Scoped to the approved red onboarding; existing app palettes remain unchanged.
export function useOnboardingPalette() {
  const dark = useColorScheme() === "dark";
  return {
    dark,
    canvas: dark ? "#111315" : "#F7F6F3",
    surface: dark ? "#292B30" : "#FFFFFF",
    text: dark ? "#FFFFFF" : "#111315",
    muted: dark ? "#B8BAC2" : "#64666D",
    accent: dark ? "#FF8591" : "#C93443",
    onAccent: dark ? "#111315" : "#FFFFFF",
    border: dark ? "#44464D" : "#D9DADD",
    control: dark ? "#93969E" : "#767880",
    overlay: "rgba(17, 19, 21, 0.5)",
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
