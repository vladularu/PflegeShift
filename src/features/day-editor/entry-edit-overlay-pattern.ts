const ENTRY_EDIT_DISMISS_DISTANCE = 88;
const ENTRY_EDIT_DISMISS_VELOCITY = 900;

export function shouldDismissEntryEditOverlay(translationY: number, velocityY: number): boolean {
  "worklet";
  return translationY >= ENTRY_EDIT_DISMISS_DISTANCE || velocityY >= ENTRY_EDIT_DISMISS_VELOCITY;
}

export function entryEditShortDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  const weekday = new Intl.DateTimeFormat("de-DE", { weekday: "short" })
    .format(date)
    .replace(/\.$/, "");
  const month = new Intl.DateTimeFormat("de-DE", { month: "short" })
    .format(date)
    .replace(/\.$/, "");
  return `${weekday}. ${date.getDate()}. ${month}.`;
}

export function entryEditDurationLabel(minutes: number | null): string {
  if (minutes === null) return "Ganztägig";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}min`;
}
