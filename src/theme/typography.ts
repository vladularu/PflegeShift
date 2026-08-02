import type { TextStyle } from "react-native";

export const TEXT_MAX_SCALE = 1.6;

export const TYPOGRAPHY = {
  hero: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  screenTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  sectionTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800",
  },
  value: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "500",
  },
  bodyStrong: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "700",
  },
  button: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "800",
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  caption: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  footnote: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
  },
  overline: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
} as const satisfies Readonly<Record<string, TextStyle>>;
