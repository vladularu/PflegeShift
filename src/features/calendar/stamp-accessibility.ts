import { formatDateTitle } from "@/engine/calendar";

export function stampDayAccessibilityHint(label: string | null): string {
  if (label === null) {
    return "Wählt diesen Tag. Wähle danach unten eine Vorlage aus.";
  }
  return `Trägt ${label} ein oder entfernt vorhandene passende Einträge.`;
}

export function stampToolSelectedAnnouncement(label: string): string {
  return `${label} ausgewählt. Wähle jetzt einen oder mehrere Kalendertage.`;
}

export function stampResultAnnouncement(label: string, date: string, removedCount: number): string {
  const dateTitle = formatDateTitle(date);
  if (removedCount === 0) return `${label} am ${dateTitle} hinzugefügt.`;
  if (removedCount === 1) return `${label} am ${dateTitle} entfernt.`;
  return `${removedCount} passende Einträge für ${label} am ${dateTitle} entfernt.`;
}

export function announceStampResult(
  announce: (message: string) => void,
  label: string,
  date: string,
  removedCount: number,
): void {
  announce(stampResultAnnouncement(label, date, removedCount));
}
