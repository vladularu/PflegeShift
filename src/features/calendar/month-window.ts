import { addMonths } from "@/engine/calendar";

function monthOrdinal(month: string): number {
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
}

export function boundedMonthScrollStart(
  visibleMonth: string,
  targetMonth: string,
  maxVisibleMonths = 4,
): string {
  const distance = monthOrdinal(targetMonth) - monthOrdinal(visibleMonth);
  if (Math.abs(distance) <= maxVisibleMonths) return visibleMonth;
  return addMonths(targetMonth, distance > 0 ? -maxVisibleMonths : maxVisibleMonths);
}

export function createMonthWindow(
  anchor: string,
  before: number,
  after: number,
): readonly string[] {
  return Object.freeze(
    Array.from({ length: before + after + 1 }, (_, index) => addMonths(anchor, index - before)),
  );
}

export function appendMonths(months: readonly string[], amount: number): readonly string[] {
  const last = months.at(-1);
  if (!last) return months;
  return Object.freeze([
    ...months,
    ...Array.from({ length: amount }, (_, index) => addMonths(last, index + 1)),
  ]);
}

export function prependMonths(months: readonly string[], amount: number): readonly string[] {
  const first = months[0];
  if (!first) return months;
  return Object.freeze([
    ...Array.from({ length: amount }, (_, index) => addMonths(first, index - amount)),
    ...months,
  ]);
}

export function shouldRecenterMonthWindow(
  months: readonly string[],
  month: string,
  edgeBuffer = 2,
): boolean {
  const index = months.indexOf(month);
  return index < 0 || index <= edgeBuffer || index >= months.length - 1 - edgeBuffer;
}

export function monthAtPagerOffset(
  months: readonly string[],
  pageHeight: number,
  offset: number,
): string | null {
  if (
    months.length === 0 ||
    !Number.isFinite(pageHeight) ||
    pageHeight <= 0 ||
    !Number.isFinite(offset)
  ) {
    return null;
  }
  const index = Math.max(0, Math.min(months.length - 1, Math.round(offset / pageHeight)));
  return months[index] ?? null;
}
