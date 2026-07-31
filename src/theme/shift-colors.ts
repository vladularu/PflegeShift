import type { ShiftType } from "@/domain/types";

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
