import { Temporal } from "@js-temporal/polyfill";

export interface CalendarCell {
  readonly date: string;
  readonly day: number;
  readonly inMonth: boolean;
  readonly weekend: boolean;
}

export function currentMonth(timeZone = "Europe/Berlin"): string {
  return Temporal.Now.plainDateISO(timeZone).toString().slice(0, 7);
}

export function today(timeZone = "Europe/Berlin"): string {
  return Temporal.Now.plainDateISO(timeZone).toString();
}

export function addMonths(month: string, amount: number): string {
  return Temporal.PlainYearMonth.from(month).add({ months: amount }).toString();
}

export function monthRange(month: string): { start: string; end: string } {
  const value = Temporal.PlainYearMonth.from(month);
  return {
    start: value.toPlainDate({ day: 1 }).toString(),
    end: value.toPlainDate({ day: value.daysInMonth }).toString(),
  };
}

export function createMonthGrid(month: string): readonly CalendarCell[] {
  const yearMonth = Temporal.PlainYearMonth.from(month);
  const first = yearMonth.toPlainDate({ day: 1 });
  const start = first.subtract({ days: first.dayOfWeek - 1 });

  return Object.freeze(
    Array.from({ length: 42 }, (_, index) => {
      const date = start.add({ days: index });
      return Object.freeze({
        date: date.toString(),
        day: date.day,
        inMonth: date.month === yearMonth.month && date.year === yearMonth.year,
        weekend: date.dayOfWeek >= 6,
      });
    }),
  );
}

export function formatMonthTitle(month: string): string {
  const date = Temporal.PlainYearMonth.from(month).toPlainDate({ day: 1 });
  return new Intl.DateTimeFormat("de-DE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date.toString()}T00:00:00Z`));
}

export function formatDateTitle(date: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}
