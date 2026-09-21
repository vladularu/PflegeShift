export interface Palette {
  readonly dark: boolean;
  readonly background: string;
  readonly calendarBackground: string;
  readonly onboardingBackground: string;
  readonly groupedBackground: string;
  readonly surface: string;
  readonly surfaceRaised: string;
  readonly surfaceMuted: string;
  readonly text: string;
  readonly textSecondary: string;
  readonly textMuted: string;
  readonly border: string;
  readonly separator: string;
  /** Action fill; use primary for readable standalone text. */
  readonly accent: string;
  readonly onAccent: string;
  readonly primary: string;
  readonly primarySoft: string;
  readonly secondarySoft: string;
  readonly tertiarySoft: string;
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

export const LIGHT_PALETTE: Palette = {
  dark: false,
  calendarBackground: "#FFFFFF",
  background: "#F5F5F7",
  onboardingBackground: "#F5F5F7",
  groupedBackground: "#F5F5F7",
  surface: "#FFFFFF",
  surfaceRaised: "#FFFFFF",
  surfaceMuted: "#F0F0F2",
  text: "#08090A",
  textSecondary: "#17191B",
  textMuted: "#35383D",
  border: "#77777D",
  separator: "#E5E5EA",
  accent: "#C93443",
  onAccent: "#FFFFFF",
  primary: "#08090A",
  primarySoft: "#F8F0F0",
  secondarySoft: "#F9E9EB",
  tertiarySoft: "#F0F0F4",
  onPrimary: "#FFFFFF",
  onDanger: "#FFFFFF",
  info: "#3B6F7D",
  success: "#2F6B4C",
  warning: "#8B570F",
  danger: "#A33F3F",
  weekend: "#F5F5F7",
  outsideMonth: "#F0F0F2",
  tabBar: "#F5F5F7",
  calendarToday: "#242426",
  calendarYearAccent: "#C93443",
  onCalendarToday: "#FFFFFF",
  calendarSelection: "#F8F0F0",
  onCalendarSelection: "#000000",
  floatingAction: "#C93443",
  onFloatingAction: "#FFFFFF",
  overlay: "rgba(16, 22, 20, 0.32)",
  overlaySubtle: "rgba(16, 22, 20, 0.08)",
  shadow: "rgba(22, 34, 30, 0.07)",
};

export const DARK_PALETTE: Palette = {
  dark: true,
  calendarBackground: "#000000",
  calendarYearAccent: "#C93443",
  background: "#000000",
  onboardingBackground: "#000000",
  groupedBackground: "#000000",
  surface: "#1C1C1E",
  surfaceRaised: "#2C2C2E",
  surfaceMuted: "#303033",
  text: "#FFFFFF",
  textSecondary: "#FFFFFF",
  textMuted: "#ECEDEF",
  border: "#8A8A90",
  separator: "#343438",
  accent: "#C93443",
  onAccent: "#FFFFFF",
  primary: "#FFFFFF",
  primarySoft: "#33282C",
  secondarySoft: "#25252B",
  tertiarySoft: "#2C2C33",
  onPrimary: "#000000",
  onDanger: "#1F0807",
  info: "#84B7C5",
  success: "#75C5A4",
  warning: "#E3AC61",
  danger: "#F0807B",
  weekend: "#141416",
  outsideMonth: "#1C1C1E",
  tabBar: "#1C1C1E",
  calendarToday: "#F2F2F4",
  onCalendarToday: "#19191B",
  calendarSelection: "#33282C",
  onCalendarSelection: "#FFFFFF",
  floatingAction: "#C93443",
  onFloatingAction: "#FFFFFF",
  overlay: "rgba(0, 0, 0, 0.52)",
  overlaySubtle: "rgba(0, 0, 0, 0.24)",
  shadow: "rgba(0, 0, 0, 0.34)",
};
