import { useColorScheme } from "react-native";

export { SHIFT_COLORS, SHIFT_COLOR_PAIRS, SHIFT_TYPE_COLORS } from "@/theme/shift-colors";

export interface Palette {
  readonly dark: boolean;
  readonly background: string;
  readonly groupedBackground: string;
  readonly surface: string;
  readonly surfaceRaised: string;
  readonly surfaceMuted: string;
  readonly text: string;
  readonly textSecondary: string;
  readonly textMuted: string;
  readonly border: string;
  readonly separator: string;
  readonly primary: string;
  readonly primarySoft: string;
  readonly onPrimary: string;
  readonly success: string;
  readonly warning: string;
  readonly danger: string;
  readonly weekend: string;
  readonly outsideMonth: string;
  readonly tabBar: string;
  readonly overlay: string;
  readonly shadow: string;
}

const light: Palette = {
  dark: false,
  background: "#F5F7F6",
  groupedBackground: "#EFF3F1",
  surface: "#FFFFFF",
  surfaceRaised: "#FFFFFF",
  surfaceMuted: "#F0F4F2",
  text: "#18201E",
  textSecondary: "#47534F",
  textMuted: "#6D7975",
  border: "#DFE5E2",
  separator: "#E7ECE9",
  primary: "#207A68",
  primarySoft: "#DFF3ED",
  onPrimary: "#FFFFFF",
  success: "#2E8B63",
  warning: "#C77B16",
  danger: "#C84242",
  weekend: "#FAFBFA",
  outsideMonth: "#F1F3F2",
  tabBar: "#FCFDFC",
  overlay: "rgba(13, 20, 18, 0.28)",
  shadow: "rgba(24, 32, 30, 0.08)",
};

const dark: Palette = {
  dark: true,
  background: "#101312",
  groupedBackground: "#0D100F",
  surface: "#181D1B",
  surfaceRaised: "#202624",
  surfaceMuted: "#242B28",
  text: "#F2F6F4",
  textSecondary: "#C5CECA",
  textMuted: "#9EAAA5",
  border: "#313A36",
  separator: "#29312E",
  primary: "#64D4B6",
  primarySoft: "#173A31",
  onPrimary: "#0D211B",
  success: "#64D4B6",
  warning: "#F2B45C",
  danger: "#FF7A75",
  weekend: "#151917",
  outsideMonth: "#121614",
  tabBar: "#151917",
  overlay: "rgba(0, 0, 0, 0.52)",
  shadow: "rgba(0, 0, 0, 0.34)",
};

export function usePalette(): Palette {
  return useColorScheme() === "dark" ? dark : light;
}
