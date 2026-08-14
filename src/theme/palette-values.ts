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
  readonly calendarToday: string;
  readonly onCalendarToday: string;
  readonly calendarSelection: string;
  readonly onCalendarSelection: string;
  readonly floatingAction: string;
  readonly onFloatingAction: string;
  readonly overlay: string;
  readonly overlaySubtle: string;
  readonly shadow: string;
}

export const LIGHT_PALETTE: Palette = {
  dark: false,
  background: "#F5F5F7",
  groupedBackground: "#F2F2F7",
  surface: "#FFFFFF",
  surfaceRaised: "#FFFFFF",
  surfaceMuted: "#ECECEF",
  text: "#151517",
  textSecondary: "#505057",
  textMuted: "#626268",
  border: "#77777D",
  separator: "#E2E2E5",
  primary: "#287565",
  primarySoft: "#E3F0EC",
  onPrimary: "#FFFFFF",
  onDanger: "#FFFFFF",
  info: "#3B6F7D",
  success: "#2F6B4C",
  warning: "#8B570F",
  danger: "#A33F3F",
  weekend: "#FFFFFF",
  outsideMonth: "#F3F3F5",
  tabBar: "#FBFBFC",
  calendarToday: "#242426",
  onCalendarToday: "#FFFFFF",
  calendarSelection: "#E1E1E4",
  onCalendarSelection: "#151517",
  floatingAction: "#242426",
  onFloatingAction: "#FFFFFF",
  overlay: "rgba(16, 22, 20, 0.32)",
  overlaySubtle: "rgba(16, 22, 20, 0.08)",
  shadow: "rgba(22, 34, 30, 0.07)",
};

export const DARK_PALETTE: Palette = {
  dark: true,
  background: "#000000",
  groupedBackground: "#000000",
  surface: "#242426",
  surfaceRaised: "#2C2C2E",
  surfaceMuted: "#38383A",
  text: "#F5F5F7",
  textSecondary: "#C7C7CC",
  textMuted: "#A3A3A9",
  border: "#8A8A90",
  separator: "#3A3A3D",
  primary: "#76CBB5",
  primarySoft: "#18372F",
  onPrimary: "#0D211B",
  onDanger: "#1F0807",
  info: "#84B7C5",
  success: "#75C5A4",
  warning: "#E3AC61",
  danger: "#F0807B",
  weekend: "#242426",
  outsideMonth: "#1C1C1E",
  tabBar: "#1C1C1E",
  calendarToday: "#F2F2F4",
  onCalendarToday: "#19191B",
  calendarSelection: "#C7C7CC",
  onCalendarSelection: "#19191B",
  floatingAction: "#F2F2F4",
  onFloatingAction: "#19191B",
  overlay: "rgba(0, 0, 0, 0.52)",
  overlaySubtle: "rgba(0, 0, 0, 0.24)",
  shadow: "rgba(0, 0, 0, 0.34)",
};
