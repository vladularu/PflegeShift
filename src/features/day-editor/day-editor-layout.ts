import type { ShiftType } from "@/domain/types";

export const SHIFT_TYPE_GRID_STYLE = Object.freeze({
  flexDirection: "row" as const,
  flexWrap: "wrap" as const,
  gap: 8,
});

export const DAY_EDITOR_SHIFT_TYPES: readonly ShiftType[] = Object.freeze([
  "CUSTOM",
  "EARLY",
  "LATE",
  "NIGHT",
  "DAY",
  "TRAINING",
  "VACATION",
  "SICK",
  "FREE",
]);
