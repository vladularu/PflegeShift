import { Temporal } from "@js-temporal/polyfill";

import type { FederalState } from "@/domain/types";
import { getPublicHolidays } from "@/engine/holidays";

export function shiftOverlapsHoliday(
  dateValue: string,
  startValue: string,
  endValue: string,
  federalState: FederalState,
): boolean {
  try {
    const date = Temporal.PlainDate.from(dateValue);
    const start = Temporal.PlainTime.from(startValue);
    const end = Temporal.PlainTime.from(endValue);
    const coveredDates = [date.toString()];
    if (Temporal.PlainTime.compare(end, start) <= 0 && endValue !== "00:00") {
      coveredDates.push(date.add({ days: 1 }).toString());
    }
    const holidayDates = new Set(
      [date.year, date.add({ days: 1 }).year].flatMap((year) =>
        getPublicHolidays(year, federalState).map((holiday) => holiday.date),
      ),
    );
    return coveredDates.some((coveredDate) => holidayDates.has(coveredDate));
  } catch {
    return false;
  }
}
