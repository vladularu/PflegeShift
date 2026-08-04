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
  readonly info: string;
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
  background: "#F6F7F6",
  groupedBackground: "#F0F2F1",
  surface: "#FFFFFF",
  surfaceRaised: "#FFFFFF",
  surfaceMuted: "#F1F3F2",
  text: "#1B211F",
  textSecondary: "#505A56",
  textMuted: "#76807C",
  border: "#DFE4E1",
  separator: "#E8ECEA",
  primary: "#287565",
  primarySoft: "#E3F0EC",
  onPrimary: "#FFFFFF",
  info: "#447A8A",
  success: "#3B7D60",
  warning: "#A96D20",
  danger: "#B94C4C",
  weekend: "#FAFBFA",
  outsideMonth: "#F1F3F2",
  tabBar: "#FCFDFC",
  overlay: "rgba(16, 22, 20, 0.32)",
  shadow: "rgba(22, 34, 30, 0.07)",
};

const dark: Palette = {
  dark: true,
  background: "#111412",
  groupedBackground: "#0E110F",
  surface: "#191E1C",
  surfaceRaised: "#202522",
  surfaceMuted: "#252B28",
  text: "#F2F6F4",
  textSecondary: "#C5CECA",
  textMuted: "#98A49F",
  border: "#303834",
  separator: "#29302D",
  primary: "#76CBB5",
  primarySoft: "#18372F",
  onPrimary: "#0D211B",
  info: "#84B7C5",
  success: "#75C5A4",
  warning: "#E3AC61",
  danger: "#F0807B",
  weekend: "#151917",
  outsideMonth: "#121614",
  tabBar: "#151917",
  overlay: "rgba(0, 0, 0, 0.52)",
  shadow: "rgba(0, 0, 0, 0.34)",
};

export function usePalette(): Palette {
  return useColorScheme() === "dark" ? dark : light;
}
