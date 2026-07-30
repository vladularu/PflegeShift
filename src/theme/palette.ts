import { useColorScheme } from "react-native";

export interface Palette {
  readonly dark: boolean;
  readonly background: string;
  readonly surface: string;
  readonly surfaceRaised: string;
  readonly text: string;
  readonly textMuted: string;
  readonly border: string;
  readonly primary: string;
  readonly primarySoft: string;
  readonly danger: string;
  readonly weekend: string;
  readonly outsideMonth: string;
  readonly tabBar: string;
}

const light: Palette = {
  dark: false,
  background: "#F5F7F6",
  surface: "#FFFFFF",
  surfaceRaised: "#FFFFFF",
  text: "#18201E",
  textMuted: "#6D7975",
  border: "#DFE5E2",
  primary: "#207A68",
  primarySoft: "#DFF3ED",
  danger: "#C84242",
  weekend: "#FAFBFA",
  outsideMonth: "#F1F3F2",
  tabBar: "#FCFDFC",
};

const dark: Palette = {
  dark: true,
  background: "#101312",
  surface: "#181D1B",
  surfaceRaised: "#202624",
  text: "#F2F6F4",
  textMuted: "#9EAAA5",
  border: "#313A36",
  primary: "#64D4B6",
  primarySoft: "#173A31",
  danger: "#FF7A75",
  weekend: "#151917",
  outsideMonth: "#121614",
  tabBar: "#151917",
};

export function usePalette(): Palette {
  return useColorScheme() === "dark" ? dark : light;
}

export const SHIFT_COLORS = [
  "#7E57C2",
  "#2FA36B",
  "#EA5B55",
  "#2F80ED",
  "#F2A93B",
  "#D95F9A",
  "#21A0A0",
  "#7A8793",
] as const;
