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
  readonly onDanger: string;
  readonly info: string;
  readonly success: string;
  readonly warning: string;
  readonly danger: string;
  readonly weekend: string;
  readonly outsideMonth: string;
  readonly tabBar: string;
  readonly overlay: string;
  readonly overlaySubtle: string;
  readonly shadow: string;
}

export const LIGHT_PALETTE: Palette = {
  dark: false,
  background: "#F6F7F6",
  groupedBackground: "#F0F2F1",
  surface: "#FFFFFF",
  surfaceRaised: "#FFFFFF",
  surfaceMuted: "#F1F3F2",
  text: "#1B211F",
  textSecondary: "#505A56",
  textMuted: "#626B68",
  border: "#7A8580",
  separator: "#E8ECEA",
  primary: "#287565",
  primarySoft: "#E3F0EC",
  onPrimary: "#FFFFFF",
  onDanger: "#FFFFFF",
  info: "#3B6F7D",
  success: "#2F6B4C",
  warning: "#8B570F",
  danger: "#A33F3F",
  weekend: "#FAFBFA",
  outsideMonth: "#F1F3F2",
  tabBar: "#FCFDFC",
  overlay: "rgba(16, 22, 20, 0.32)",
  overlaySubtle: "rgba(16, 22, 20, 0.08)",
  shadow: "rgba(22, 34, 30, 0.07)",
};

export const DARK_PALETTE: Palette = {
  dark: true,
  background: "#111412",
  groupedBackground: "#0E110F",
  surface: "#191E1C",
  surfaceRaised: "#202522",
  surfaceMuted: "#252B28",
  text: "#F2F6F4",
  textSecondary: "#C5CECA",
  textMuted: "#98A49F",
  border: "#74817B",
  separator: "#29302D",
  primary: "#76CBB5",
  primarySoft: "#18372F",
  onPrimary: "#0D211B",
  onDanger: "#1F0807",
  info: "#84B7C5",
  success: "#75C5A4",
  warning: "#E3AC61",
  danger: "#F0807B",
  weekend: "#151917",
  outsideMonth: "#121614",
  tabBar: "#151917",
  overlay: "rgba(0, 0, 0, 0.52)",
  overlaySubtle: "rgba(0, 0, 0, 0.24)",
  shadow: "rgba(0, 0, 0, 0.34)",
};
