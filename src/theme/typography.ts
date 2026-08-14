import type { TextStyle } from "react-native";

// React Native uses 0 to mean that no maximum font multiplier is applied.
export const TEXT_MAX_SCALE = 0;
// Dense calendar glyphs are redundant with complete accessibility labels.
export const COMPACT_TEXT_MAX_SCALE = 2;

export const TYPOGRAPHY = {
  hero: {
    fontSize: 34,
    lineHeight: 41,
    fontWeight: "700",
    letterSpacing: -0.8,
  },
  screenTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  sectionTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
  },
  value: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "400",
  },
  bodyStrong: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
  },
  button: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  caption: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
  },
  footnote: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "400",
  },
  overline: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
    letterSpacing: 0.4,
  },
} as const satisfies Readonly<Record<string, TextStyle>>;
