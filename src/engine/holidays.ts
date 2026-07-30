import { Temporal } from "@js-temporal/polyfill";

import type { FederalState } from "@/domain/types";

export interface PublicHoliday {
  readonly date: string;
  readonly name: string;
  readonly scope: "NATIONWIDE" | "STATEWIDE";
}

const EPIPHANY = new Set<FederalState>(["BW", "BY", "ST"]);
const CORPUS_CHRISTI = new Set<FederalState>(["BW", "BY", "HE", "NW", "RP", "SL"]);
const REFORMATION = new Set<FederalState>(["BB", "MV", "SN", "ST", "TH"]);
const REFORMATION_SINCE_2018 = new Set<FederalState>(["HB", "HH", "NI", "SH"]);
const ALL_SAINTS = new Set<FederalState>(["BW", "BY", "NW", "RP", "SL"]);

function date(year: number, month: number, day: number): string {
  return new Temporal.PlainDate(year, month, day).toString();
}

export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return date(year, month, day);
}

function shift(value: string, days: number): string {
  return Temporal.PlainDate.from(value).add({ days }).toString();
}

function repentanceDay(year: number): string {
  const november23 = Temporal.PlainDate.from(date(year, 11, 23));
  const daysBack = november23.dayOfWeek > 3 ? november23.dayOfWeek - 3 : november23.dayOfWeek + 4;
  return november23.subtract({ days: daysBack }).toString();
}

export function getPublicHolidays(
  year: number,
  federalState: FederalState,
): readonly PublicHoliday[] {
  const easter = easterSunday(year);
  const result: PublicHoliday[] = [
    { date: date(year, 1, 1), name: "Neujahr", scope: "NATIONWIDE" },
    { date: shift(easter, -2), name: "Karfreitag", scope: "NATIONWIDE" },
    { date: shift(easter, 1), name: "Ostermontag", scope: "NATIONWIDE" },
    { date: date(year, 5, 1), name: "Tag der Arbeit", scope: "NATIONWIDE" },
    { date: shift(easter, 39), name: "Christi Himmelfahrt", scope: "NATIONWIDE" },
    { date: shift(easter, 50), name: "Pfingstmontag", scope: "NATIONWIDE" },
    { date: date(year, 10, 3), name: "Tag der Deutschen Einheit", scope: "NATIONWIDE" },
    { date: date(year, 12, 25), name: "1. Weihnachtstag", scope: "NATIONWIDE" },
    { date: date(year, 12, 26), name: "2. Weihnachtstag", scope: "NATIONWIDE" },
  ];

  if (EPIPHANY.has(federalState)) {
    result.push({ date: date(year, 1, 6), name: "Heilige Drei Könige", scope: "STATEWIDE" });
  }
  if ((federalState === "BE" && year >= 2019) || (federalState === "MV" && year >= 2023)) {
    result.push({ date: date(year, 3, 8), name: "Internationaler Frauentag", scope: "STATEWIDE" });
  }
  if (federalState === "BB") {
    result.push(
      { date: easter, name: "Ostersonntag", scope: "STATEWIDE" },
      { date: shift(easter, 49), name: "Pfingstsonntag", scope: "STATEWIDE" },
    );
  }
  if (CORPUS_CHRISTI.has(federalState)) {
    result.push({ date: shift(easter, 60), name: "Fronleichnam", scope: "STATEWIDE" });
  }
  if (federalState === "SL") {
    result.push({ date: date(year, 8, 15), name: "Mariä Himmelfahrt", scope: "STATEWIDE" });
  }
  if (federalState === "TH" && year >= 2019) {
    result.push({ date: date(year, 9, 20), name: "Weltkindertag", scope: "STATEWIDE" });
  }
  if (
    year === 2017 ||
    REFORMATION.has(federalState) ||
    (year >= 2018 && REFORMATION_SINCE_2018.has(federalState))
  ) {
    result.push({
      date: date(year, 10, 31),
      name: "Reformationstag",
      scope: year === 2017 ? "NATIONWIDE" : "STATEWIDE",
    });
  }
  if (ALL_SAINTS.has(federalState)) {
    result.push({ date: date(year, 11, 1), name: "Allerheiligen", scope: "STATEWIDE" });
  }
  if (federalState === "SN") {
    result.push({ date: repentanceDay(year), name: "Buß- und Bettag", scope: "STATEWIDE" });
  }
  if (federalState === "BE" && (year === 2020 || year === 2025)) {
    result.push({ date: date(year, 5, 8), name: "Tag der Befreiung", scope: "STATEWIDE" });
  }
  if (federalState === "BE" && year === 2028) {
    result.push({
      date: date(year, 6, 17),
      name: "75. Jahrestag des Volksaufstands vom 17. Juni 1953",
      scope: "STATEWIDE",
    });
  }

  return Object.freeze(result.sort((left, right) => left.date.localeCompare(right.date)));
}

export function holidayMapForMonth(
  month: string,
  federalState: FederalState,
): ReadonlyMap<string, PublicHoliday> {
  const year = Number(month.slice(0, 4));
  return new Map(
    getPublicHolidays(year, federalState)
      .filter((holiday) => holiday.date.startsWith(`${month}-`))
      .map((holiday) => [holiday.date, holiday]),
  );
}
