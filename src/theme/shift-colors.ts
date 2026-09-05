import type { ShiftType } from "@/domain/types";

export const SHIFT_COLOR_PAIRS = [
  { main: "#59CA50", soft: "#DDF4D9" },
  { main: "#E74C55", soft: "#F8D8DA" },
  { main: "#FFA338", soft: "#FFE7C4" },
  { main: "#25A3B9", soft: "#D4EFF3" },
  { main: "#347ED1", soft: "#D9E8FA" },
  { main: "#D95F9A", soft: "#F7DDEC" },
  { main: "#F09A3E", soft: "#FBE8D3" },
  { main: "#929292", soft: "#E7E7E7" },
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
  EARLY: "#59CA50",
  LATE: "#E74C55",
  NIGHT: "#FFA338",
  DAY: "#25A3B9",
  TRAINING: "#347ED1",
  VACATION: "#929292",
  SICK: "#F09A3E",
  FREE: "#929292",
  CUSTOM: "#D95F9A",
};
