import type { ShiftType } from "@/domain/types";

export const SHIFT_COLOR_PAIRS = [
  { main: "#4FCB68", soft: "#DDF4E2" },
  { main: "#F05C68", soft: "#F9DDE0" },
  { main: "#F2A93B", soft: "#FCEBCC" },
  { main: "#31A7C3", soft: "#D8F0F5" },
  { main: "#2F80ED", soft: "#DCEAFE" },
  { main: "#D95F9A", soft: "#F7DDEC" },
  { main: "#F09A3E", soft: "#FBE8D3" },
  { main: "#858A8E", soft: "#E5E7E8" },
  { main: "#9B59D0", soft: "#EBDCF4" },
  { main: "#4267D5", soft: "#DDE4F7" },
  { main: "#2AA0B8", soft: "#D8EFF3" },
  { main: "#8BCB33", soft: "#EBF5D9" },
  { main: "#F2C230", soft: "#FAF1CE" },
  { main: "#E36B37", soft: "#F8E0D6" },
  { main: "#B27A66", soft: "#EDE1DC" },
] as const;

export const SHIFT_COLORS = SHIFT_COLOR_PAIRS.map((pair) => pair.main);

export const APPOINTMENT_COLOR = "#2F80ED";
export const HOLIDAY_COLOR = "#8B5BD1";
export const DEFAULT_TEMPLATE_COLOR = "#D95F9A";

export const SHIFT_TYPE_COLORS: Readonly<Record<ShiftType, string>> = {
  EARLY: "#4FCB68",
  LATE: "#F05C68",
  NIGHT: "#F2A93B",
  DAY: "#31A7C3",
  TRAINING: "#2F80ED",
  VACATION: "#858A8E",
  SICK: "#F09A3E",
  FREE: "#858A8E",
  CUSTOM: "#D95F9A",
};
