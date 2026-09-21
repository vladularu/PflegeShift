export interface Palette {
  readonly dark: boolean;
  readonly background: string;
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
  background: "#F6F5F3",
  onboardingBackground: "#F6F5F3",
  groupedBackground: "#F6F5F3",
  surface: "#FFFFFF",
  surfaceRaised: "#FFFFFF",
  surfaceMuted: "#F0EFED",
  text: "#08090A",
  textSecondary: "#17191B",
  textMuted: "#35383D",
  border: "#77777D",
  separator: "#E3E1DF",
  accent: "#C93443",
  onAccent: "#FFFFFF",
  primary: "#C93443",
  primarySoft: "#F8F0F0",
  secondarySoft: "#F3F0EB",
  tertiarySoft: "#F0F0F4",
  onPrimary: "#FFFFFF",
  onDanger: "#FFFFFF",
  info: "#3B6F7D",
  success: "#2F6B4C",
  warning: "#8B570F",
  danger: "#A33F3F",
  weekend: "#F3F2F0",
  outsideMonth: "#F0EFED",
  tabBar: "#F6F5F3",
  calendarToday: "#242426",
  calendarYearAccent: "#C93443",
  onCalendarToday: "#FFFFFF",
  calendarSelection: "#F8F0F0",
  onCalendarSelection: "#111315",
  floatingAction: "#C93443",
  onFloatingAction: "#FFFFFF",
  overlay: "rgba(16, 22, 20, 0.32)",
  overlaySubtle: "rgba(16, 22, 20, 0.08)",
  shadow: "rgba(22, 34, 30, 0.07)",
};

export const DARK_PALETTE: Palette = {
  dark: true,
  calendarYearAccent: "#C93443",
  background: "#111315",
  onboardingBackground: "#111315",
  groupedBackground: "#111315",
  surface: "#25272A",
  surfaceRaised: "#2C2F32",
  surfaceMuted: "#303336",
  text: "#FFFFFF",
  textSecondary: "#FFFFFF",
  textMuted: "#ECEDEF",
  border: "#8A8A90",
  separator: "#393C3F",
  accent: "#C93443",
  onAccent: "#FFFFFF",
  primary: "#FFFFFF",
  primarySoft: "#33282C",
  secondarySoft: "#2E2C29",
  tertiarySoft: "#2C2C33",
  onPrimary: "#111315",
  onDanger: "#1F0807",
  info: "#84B7C5",
  success: "#75C5A4",
  warning: "#E3AC61",
  danger: "#F0807B",
  weekend: "#242629",
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
