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
  /** Brand fill is identical in both modes; use primary for readable standalone text. */
  readonly accent: string;
  readonly onAccent: string;
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
  background: "#F7F6F3",
  onboardingBackground: "#F7F6F3",
  groupedBackground: "#F2F2F7",
  surface: "#FFFFFF",
  surfaceRaised: "#FFFFFF",
  surfaceMuted: "#F1F1F3",
  text: "#111315",
  textSecondary: "#505057",
  textMuted: "#64666D",
  border: "#77777D",
  separator: "#E2E2E5",
  accent: "#C93443",
  onAccent: "#FFFFFF",
  primary: "#C93443",
  primarySoft: "#FCEFF0",
  onPrimary: "#FFFFFF",
  onDanger: "#FFFFFF",
  info: "#3B6F7D",
  success: "#2F6B4C",
  warning: "#8B570F",
  danger: "#A33F3F",
  weekend: "#F8F8FA",
  outsideMonth: "#F3F3F5",
  tabBar: "#FBFBFC",
  calendarToday: "#242426",
  calendarYearAccent: "#C93443",
  onCalendarToday: "#FFFFFF",
  calendarSelection: "#FCEFF0",
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
  surface: "#292B30",
  surfaceRaised: "#2C2C2E",
  surfaceMuted: "#38383A",
  text: "#FFFFFF",
  textSecondary: "#C7C7CC",
  textMuted: "#B8BAC2",
  border: "#8A8A90",
  separator: "#3A3A3D",
  accent: "#C93443",
  onAccent: "#FFFFFF",
  primary: "#FFFFFF",
  primarySoft: "#39252A",
  onPrimary: "#111315",
  onDanger: "#1F0807",
  info: "#84B7C5",
  success: "#75C5A4",
  warning: "#E3AC61",
  danger: "#F0807B",
  weekend: "#29292B",
  outsideMonth: "#1C1C1E",
  tabBar: "#1C1C1E",
  calendarToday: "#F2F2F4",
  onCalendarToday: "#19191B",
  calendarSelection: "#39252A",
  onCalendarSelection: "#FFFFFF",
  floatingAction: "#C93443",
  onFloatingAction: "#FFFFFF",
  overlay: "rgba(0, 0, 0, 0.52)",
  overlaySubtle: "rgba(0, 0, 0, 0.24)",
  shadow: "rgba(0, 0, 0, 0.34)",
};
