import { Temporal } from "@js-temporal/polyfill";

import type { ShiftEntry } from "@/domain/types";

function timeParts(value: string): { hour: number; minute: number } {
  const [hour, minute] = value.split(":").map(Number);
  return { hour, minute };
}

export function calculateTimedShiftMinutes(
  shift: Pick<ShiftEntry, "date" | "startTime" | "endTime" | "breakMinutes">,
  timeZone: string,
): number {
  if (shift.startTime === null || shift.endTime === null) {
    return 0;
  }

  const date = Temporal.PlainDate.from(shift.date);
  const startTime = Temporal.PlainTime.from(shift.startTime);
  const endTime = Temporal.PlainTime.from(shift.endTime);
  const endDate = Temporal.PlainTime.compare(endTime, startTime) <= 0
    ? date.add({ days: 1 })
    : date;
  const startParts = timeParts(shift.startTime);
  const endParts = timeParts(shift.endTime);
  const start = Temporal.ZonedDateTime.from(
    { timeZone, year: date.year, month: date.month, day: date.day, ...startParts },
    { disambiguation: "earlier" },
  );
  const end = Temporal.ZonedDateTime.from(
    { timeZone, year: endDate.year, month: endDate.month, day: endDate.day, ...endParts },
    { disambiguation: "later" },
  );
  const grossMinutes = Math.round(
    Number(end.epochMilliseconds - start.epochMilliseconds) / 60_000,
  );
  return Math.max(0, grossMinutes - shift.breakMinutes);
}

export function formatMinutes(value: number): string {
  const absolute = Math.abs(value);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  return `${value < 0 ? "−" : ""}${hours}:${String(minutes).padStart(2, "0")}`;
}

export function formatSignedMinutes(value: number): string {
  return `${value >= 0 ? "+" : "−"}${formatMinutes(Math.abs(value))}`;
}
