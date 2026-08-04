import type { RefObject } from "react";
import { AccessibilityInfo, type TextInput } from "react-native";

export function requiredFieldError(value: string, label: string): string | null {
  return value.trim().length === 0 ? `${label} darf nicht leer sein.` : null;
}

export function integerRangeFieldError(
  value: string,
  label: string,
  minimum: number,
  maximum: number,
): string | null {
  const parsed = Number(value);
  if (value.trim().length === 0 || !Number.isInteger(parsed)) {
    return `${label} muss eine ganze Zahl sein.`;
  }
  if (parsed < minimum || parsed > maximum) {
    return `${label} muss zwischen ${minimum} und ${maximum} liegen.`;
  }
  return null;
}

export function weeklyHoursFieldError(value: string): string | null {
  const hours = Number(value.replace(",", "."));
  if (!Number.isFinite(hours)) return "Bitte gültige Wochenstunden angeben.";
  const minutes = Math.round(hours * 60);
  if (minutes < 60 || minutes > 80 * 60) {
    return "Die Wochenarbeitszeit muss zwischen 1 und 80 Stunden liegen.";
  }
  return null;
}

export function focusInvalidField(field: RefObject<TextInput | null>, message: string): void {
  setTimeout(() => {
    field.current?.focus();
    AccessibilityInfo.announceForAccessibility(message);
  }, 0);
}
