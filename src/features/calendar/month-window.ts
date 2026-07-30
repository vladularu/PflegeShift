import { addMonths } from "@/engine/calendar";

export function createMonthWindow(
  anchor: string,
  before: number,
  after: number,
): readonly string[] {
  return Object.freeze(
    Array.from({ length: before + after + 1 }, (_, index) =>
      addMonths(anchor, index - before),
    ),
  );
}

export function appendMonths(
  months: readonly string[],
  amount: number,
): readonly string[] {
  const last = months.at(-1);
  if (!last) return months;
  return Object.freeze([
    ...months,
    ...Array.from({ length: amount }, (_, index) => addMonths(last, index + 1)),
  ]);
}

export function prependMonths(
  months: readonly string[],
  amount: number,
): readonly string[] {
  const first = months[0];
  if (!first) return months;
  return Object.freeze([
    ...Array.from({ length: amount }, (_, index) =>
      addMonths(first, index - amount),
    ),
    ...months,
  ]);
}
