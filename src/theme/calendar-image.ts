import type { Palette } from "./palette-values";
import { CALENDAR_IMAGE_OVERLAY_OPACITY } from "./theme-catalog";

export const CALENDAR_IMAGE_STRENGTH_OPTIONS = [
  { value: "subtle", label: "Dezent", overlayOpacity: CALENDAR_IMAGE_OVERLAY_OPACITY },
  { value: "medium", label: "Mittel", overlayOpacity: 0.75 },
  { value: "strong", label: "Kräftig", overlayOpacity: 0.6 },
] as const;
export type CalendarImageStrength = (typeof CALENDAR_IMAGE_STRENGTH_OPTIONS)[number]["value"];
export const DEFAULT_CALENDAR_IMAGE_STRENGTH: CalendarImageStrength = "medium";

export function parseCalendarImageStrength(value: unknown): CalendarImageStrength {
  return (
    CALENDAR_IMAGE_STRENGTH_OPTIONS.find((option) => option.value === value)?.value ??
    DEFAULT_CALENDAR_IMAGE_STRENGTH
  );
}
export function calendarImageOverlayOpacity(strength: CalendarImageStrength): number {
  return (
    CALENDAR_IMAGE_STRENGTH_OPTIONS.find((option) => option.value === strength)?.overlayOpacity ??
    0.75
  );
}
export function calendarImageLabelColor(palette: Palette, strength: CalendarImageStrength): string {
  return strength === "subtle" ? palette.textMuted : palette.text;
}
