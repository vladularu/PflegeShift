export interface Palette {
  readonly dark: boolean;
  readonly background: string;
  readonly calendarBackground: string;
  readonly onboardingBackground: string;
  readonly groupedBackground: string;
  readonly surface: string;
  readonly surfaceRaised: string;
  readonly surfaceMuted: string;
  readonly cardHeader: string;
  readonly text: string;
  readonly textSecondary: string;
  readonly textMuted: string;
  readonly border: string;
  readonly separator: string;
  readonly cardSeparator: string;
  /** Action fill; use primary for readable standalone text. */
  readonly accent: string;
  readonly onAccent: string;
  readonly primary: string;
  readonly primarySoft: string;
  readonly secondarySoft: string;
  readonly tertiarySoft: string;
  readonly onPrimary: string;
  readonly sortAction: string;
  readonly onSortAction: string;
  readonly onDanger: string;
  readonly info: string;
  readonly success: string;
  readonly warning: string;
  readonly danger: string;
  readonly weekend: string;
  readonly outsideMonth: string;
  readonly tabBar: string;
  readonly calendarToday: string;
  readonly calendarYearAccent: string;
  readonly onCalendarToday: string;
  readonly calendarSelection: string;
  readonly onCalendarSelection: string;
  readonly floatingAction: string;
  readonly onFloatingAction: string;
  readonly overlay: string;
  readonly overlaySubtle: string;
  readonly shadow: string;
}

export const LUNA_LIGHT_BLUE = "#0088FF";
export const LUNA_LIGHT_BLUE_TEXT = "#0065BE";

export const LIGHT_PALETTE: Palette = {
  dark: false,
  calendarBackground: "#FFFFFF",
  background: "#F3F2F8",
  onboardingBackground: "#F3F2F8",
  groupedBackground: "#F3F2F8",
  surface: "#FFFFFF",
  surfaceRaised: "#FFFFFF",
  surfaceMuted: "#E5E5E5",
  cardHeader: "#F3F2F8",
  text: "#0D0D0D",
  textSecondary: "#404040",
  textMuted: "#66666C",
  border: "#77777D",
  separator: "#E5E5E5",
  cardSeparator: "#E5E5E5",
  accent: LUNA_LIGHT_BLUE,
  onAccent: "#0D0D0D",
  primary: LUNA_LIGHT_BLUE_TEXT,
  primarySoft: "#E5E5E5",
  secondarySoft: "#E5E5E5",
  tertiarySoft: "#F3F2F8",
  onPrimary: "#FFFFFF",
  sortAction: LUNA_LIGHT_BLUE,
  onSortAction: "#FFFFFF",
  onDanger: "#FFFFFF",
  info: "#386B79",
  success: "#2F6B4C",
  warning: "#8B570F",
  danger: "#A33F3F",
  weekend: "#E5E5E5",
  outsideMonth: "#F2F2F2",
  tabBar: "#FFFFFF",
  calendarToday: "#0D0D0D",
  calendarYearAccent: LUNA_LIGHT_BLUE,
  onCalendarToday: "#FFFFFF",
  calendarSelection: "#E5E5E5",
  onCalendarSelection: "#0D0D0D",
  floatingAction: "#0D0D0D",
  onFloatingAction: "#FFFFFF",
  overlay: "rgba(16, 22, 20, 0.32)",
  overlaySubtle: "rgba(16, 22, 20, 0.08)",
  shadow: "rgba(22, 34, 30, 0.07)",
};

export const DARK_PALETTE: Palette = {
  dark: true,
  calendarBackground: "#030303",
  calendarYearAccent: "#FFE637",
  background: "#030303",
  onboardingBackground: "#030303",
  groupedBackground: "#030303",
  surface: "#262628",
  surfaceRaised: "#303033",
  surfaceMuted: "#303033",
  cardHeader: "#262628",
  text: "#F2F2F2",
  textSecondary: "#BFBFBF",
  textMuted: "#B5B5B8",
  border: "#8A8A90",
  separator: "#404040",
  cardSeparator: "#111113",
  accent: "#FFE637",
  onAccent: "#0D0D0D",
  primary: "#FFE637",
  primarySoft: "#303033",
  secondarySoft: "#303033",
  tertiarySoft: "#303033",
  onPrimary: "#0D0D0D",
  sortAction: "#FFE637",
  onSortAction: "#0D0D0D",
  onDanger: "#1F0807",
  info: "#84B7C5",
  success: "#75C5A4",
  warning: "#E3AC61",
  danger: "#F0807B",
  weekend: "#303033",
  outsideMonth: "#1F1F21",
  tabBar: "#262628",
  calendarToday: "#FFE637",
  onCalendarToday: "#0D0D0D",
  calendarSelection: "#262626",
  onCalendarSelection: "#F2F2F2",
  floatingAction: "#FFE637",
  onFloatingAction: "#0D0D0D",
  overlay: "rgba(0, 0, 0, 0.52)",
  overlaySubtle: "rgba(0, 0, 0, 0.24)",
  shadow: "rgba(0, 0, 0, 0.34)",
};
