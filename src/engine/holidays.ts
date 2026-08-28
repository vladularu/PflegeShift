import { Temporal } from "@js-temporal/polyfill";

import type { FederalState } from "@/domain/types";
import type { RuleHoliday, RuleHolidayPackage } from "@/rules/contracts.generated";
import {
  bundledRuleResolver,
  requireResolvedPackage,
  type RuleResolver,
} from "@/rules/rule-resolver";

export interface PublicHoliday {
  readonly date: string;
  readonly name: string;
  readonly scope: "NATIONWIDE" | "STATEWIDE";
}

const HOLIDAY_CACHE = new WeakMap<RuleResolver, Map<string, readonly PublicHoliday[]>>();
const HOLIDAY_PACKAGE_CACHE = new WeakMap<
  RuleResolver,
  Map<number, readonly RuleHolidayPackage[]>
>();

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

function repentanceDay(year: number): string {
  const november23 = Temporal.PlainDate.from(date(year, 11, 23));
  const daysBack = november23.dayOfWeek > 3 ? november23.dayOfWeek - 3 : november23.dayOfWeek + 4;
  return november23.subtract({ days: daysBack }).toString();
}

function holidayDate(rule: RuleHoliday, year: number): string {
  switch (rule.calculation.type) {
    case "FIXED_DATE":
      return date(year, rule.calculation.month, rule.calculation.day);
    case "EASTER_OFFSET":
      return Temporal.PlainDate.from(easterSunday(year))
        .add({ days: rule.calculation.offsetDays })
        .toString();
    case "REPENTANCE_DAY":
      return repentanceDay(year);
    case "SPECIFIC_DATE":
      return rule.calculation.date;
  }
}

function packagesForYear(year: number, ruleResolver: RuleResolver): readonly RuleHolidayPackage[] {
  const resolverCache = HOLIDAY_PACKAGE_CACHE.get(ruleResolver);
  const cached = resolverCache?.get(year);
  if (cached) return cached;
  const packages = new Set<RuleHolidayPackage>();
  const end = Temporal.PlainDate.from({ year, month: 12, day: 31 }).add({ days: 1 });
  for (
    let cursor = Temporal.PlainDate.from({ year, month: 1, day: 1 });
    Temporal.PlainDate.compare(cursor, end) < 0;
    cursor = cursor.add({ days: 1 })
  ) {
    packages.add(requireResolvedPackage(ruleResolver.resolveHoliday(cursor.toString())));
  }
  const resolvedPackages = Object.freeze([...packages]);
  const nextCache = resolverCache ?? new Map<number, readonly RuleHolidayPackage[]>();
  nextCache.set(year, resolvedPackages);
  if (!resolverCache) HOLIDAY_PACKAGE_CACHE.set(ruleResolver, nextCache);
  return resolvedPackages;
}

function isRuleActiveForState(
  rule: RuleHoliday,
  holidayDateValue: string,
  federalState: FederalState,
): boolean {
  return (
    rule.validFrom <= holidayDateValue &&
    holidayDateValue <= rule.validTo &&
    (rule.scope === "NATIONWIDE" || rule.federalStates?.includes(federalState) === true)
  );
}

export function getPublicHolidays(
  year: number,
  federalState: FederalState,
  ruleResolver: RuleResolver = bundledRuleResolver,
): readonly PublicHoliday[] {
  const key = `${federalState}-${year}`;
  const resolverCache = HOLIDAY_CACHE.get(ruleResolver);
  const cached = resolverCache?.get(key);
  if (cached) return cached;

  const result: PublicHoliday[] = [];
  for (const rulePackage of packagesForYear(year, ruleResolver)) {
    for (const rule of rulePackage.rules.holidays) {
      const holidayDateValue = holidayDate(rule, year);
      if (!holidayDateValue.startsWith(`${year}-`)) continue;
      if (!isRuleActiveForState(rule, holidayDateValue, federalState)) continue;
      const activePackage = requireResolvedPackage(ruleResolver.resolveHoliday(holidayDateValue));
      if (
        activePackage.packageId !== rulePackage.packageId ||
        activePackage.versionId !== rulePackage.versionId
      ) {
        continue;
      }
      result.push({
        date: holidayDateValue,
        name: rule.name,
        scope: rule.scope,
      });
    }
  }

  const holidays = Object.freeze(
    result.sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        left.name.localeCompare(right.name) ||
        left.scope.localeCompare(right.scope),
    ),
  );
  const nextCache = resolverCache ?? new Map<string, readonly PublicHoliday[]>();
  nextCache.set(key, holidays);
  if (!resolverCache) HOLIDAY_CACHE.set(ruleResolver, nextCache);
  return holidays;
}

export function holidayMapForMonth(
  month: string,
  federalState: FederalState,
  ruleResolver: RuleResolver = bundledRuleResolver,
): ReadonlyMap<string, PublicHoliday> {
  const year = Number(month.slice(0, 4));
  return new Map(
    getPublicHolidays(year, federalState, ruleResolver)
      .filter((holiday) => holiday.date.startsWith(`${month}-`))
      .map((holiday) => [holiday.date, holiday]),
  );
}
