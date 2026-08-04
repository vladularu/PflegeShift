import type { ShiftType } from "@/domain/types";

export const SHIFT_COLOR_PAIRS = [
  { main: "#7E57C2", soft: "#E9DDF8" },
  { main: "#2FA36B", soft: "#D8F0E3" },
  { main: "#EA5B55", soft: "#FADBD9" },
  { main: "#2F80ED", soft: "#DCEAFE" },
  { main: "#F2A93B", soft: "#FCEBCC" },
  { main: "#D95F9A", soft: "#F7DDEC" },
  { main: "#21A0A0", soft: "#D6F0F0" },
  { main: "#7A8793", soft: "#E2E6E9" },
] as const;

export const SHIFT_COLORS = SHIFT_COLOR_PAIRS.map((pair) => pair.main);

export const APPOINTMENT_COLOR = "#2F80ED";
export const HOLIDAY_COLOR = "#8B5BD1";
export const DEFAULT_TEMPLATE_COLOR = SHIFT_COLOR_PAIRS[6].main;

export const SHIFT_TYPE_COLORS: Readonly<Record<ShiftType, string>> = {
  EARLY: "#62B94C",
  LATE: "#F05C59",
  NIGHT: "#8B5BD1",
  DAY: "#31A7C3",
  TRAINING: "#2F80ED",
  VACATION: "#25A9A4",
  SICK: "#F09A3E",
  FREE: "#8A9490",
  CUSTOM: "#D95F9A",
};
