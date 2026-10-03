import { Temporal } from "@js-temporal/polyfill";
import type { ShiftEntry, UserProfile } from "@/domain/types";
import { getPublicHolidays } from "@/engine/holidays";
import { conditionsMatch } from "@/engine/pay-conditions";
import type {
  RulePremiumRule,
  RuleTariffPackage,
  RuleTimeWindow,
} from "@/rules/contracts.generated";
import type { RuleResolver } from "@/rules/rule-resolver";

const HOLIDAY_DATE_CACHE = new WeakMap<RuleResolver, Map<string, ReadonlySet<string>>>();
/** Elapsed real minutes from the original shift start; until is exclusive. */
export interface PremiumMinuteInterval {
  readonly from: number;
  readonly until: number;
}
interface PremiumMinuteBuckets {
  readonly byRuleId: Map<string, number>;
}

interface PremiumDayContext {
  readonly holiday: boolean;
  readonly sunday: boolean;
  readonly saturday: boolean;
}

function zonedStart(shift: ShiftEntry, timeZone: string): Temporal.ZonedDateTime {
  const date = Temporal.PlainDate.from(shift.date);
  const time = Temporal.PlainTime.from(shift.startTime!);
  return Temporal.ZonedDateTime.from(
    {
      timeZone,
      year: date.year,
      month: date.month,
      day: date.day,
      hour: time.hour,
      minute: time.minute,
    },
    { disambiguation: "earlier" },
  );
}

function holidayDates(
  year: number,
  federalState: UserProfile["federalState"],
  holidayRegion: UserProfile["holidayRegion"],
  ruleResolver: RuleResolver,
): ReadonlySet<string> {
  const key = `${federalState}-${holidayRegion}-${year}`;
  const resolverCache = HOLIDAY_DATE_CACHE.get(ruleResolver);
  const cached = resolverCache?.get(key);
  if (cached) return cached;
  const dates = new Set(
    getPublicHolidays(year, federalState, ruleResolver, holidayRegion).map(
      (holiday) => holiday.date,
    ),
  );
  const nextCache = resolverCache ?? new Map<string, ReadonlySet<string>>();
  nextCache.set(key, dates);
  if (!resolverCache) HOLIDAY_DATE_CACHE.set(ruleResolver, nextCache);
  return dates;
}

function premiumDayContext(
  date: Temporal.PlainDate,
  federalState: UserProfile["federalState"],
  holidayRegion: UserProfile["holidayRegion"],
  ruleResolver: RuleResolver,
): PremiumDayContext {
  return {
    holiday: holidayDates(date.year, federalState, holidayRegion, ruleResolver).has(
      date.toString(),
    ),
    sunday: date.dayOfWeek === 7,
    saturday: date.dayOfWeek === 6,
  };
}

function timeWindowContains(window: RuleTimeWindow | null, minuteOfDay: number): boolean {
  if (window === null) return true;
  if (window.startMinute < window.endMinute) {
    return minuteOfDay >= window.startMinute && minuteOfDay < window.endMinute;
  }
  return minuteOfDay >= window.startMinute || minuteOfDay < window.endMinute;
}

function premiumAppliesOnDay(rule: RulePremiumRule, day: PremiumDayContext): boolean {
  switch (rule.premiumType) {
    case "NIGHT":
      return true;
    case "SUNDAY":
      return day.sunday;
    case "HOLIDAY_WITH_TIME_OFF":
    case "HOLIDAY_WITHOUT_TIME_OFF":
      return day.holiday;
    case "SATURDAY":
      return day.saturday;
    case "PRE_HOLIDAY":
      return true;
    case "OVERTIME":
      return false;
  }
}

function applyCombinationRules(
  candidates: readonly RulePremiumRule[],
  rulePackage: RuleTariffPackage,
): readonly RulePremiumRule[] {
  const selected = new Map(candidates.map((rule) => [rule.id, rule]));
  for (const combination of rulePackage.rules.combinationRules) {
    const members = combination.memberRuleIds
      .map((ruleId) => selected.get(ruleId))
      .filter((rule): rule is RulePremiumRule => rule !== undefined);
    if (members.length <= 1 || combination.mode === "STACK") continue;
    const winner =
      combination.mode === "PRIORITY"
        ? combination.priorityRuleIds
            .map((ruleId) => selected.get(ruleId))
            .find((rule): rule is RulePremiumRule => rule !== undefined)
        : members.reduce((left, right) =>
            left.percentageBasisPoints >= right.percentageBasisPoints ? left : right,
          );
    if (!winner) {
      throw new Error(`Combination rule ${combination.id} has no active priority winner.`);
    }
    for (const member of members) {
      if (member !== winner) selected.delete(member.id);
    }
  }
  return [...selected.values()];
}

function countPremiumMinute(
  buckets: PremiumMinuteBuckets,
  day: PremiumDayContext,
  date: string,
  minuteOfDay: number,
  shift: ShiftEntry,
  profile: UserProfile,
  rulePackage: RuleTariffPackage,
): void {
  const candidates = rulePackage.rules.premiumRules.filter(
    (rule) =>
      premiumAppliesOnDay(rule, day) &&
      timeWindowContains(rule.timeWindow, minuteOfDay) &&
      conditionsMatch(rule.conditions, profile, date, shift, null),
  );
  for (const rule of applyCombinationRules(candidates, rulePackage)) {
    buckets.byRuleId.set(rule.id, (buckets.byRuleId.get(rule.id) ?? 0) + 1);
  }
}

export function countPremiumMinutes(
  shift: ShiftEntry,
  profile: UserProfile,
  gross: number,
  breakStart: number,
  breakEnd: number,
  rulePackage: RuleTariffPackage,
  ruleResolver: RuleResolver,
  interval: PremiumMinuteInterval = { from: 0, until: gross },
): PremiumMinuteBuckets {
  const buckets: PremiumMinuteBuckets = {
    byRuleId: new Map(),
  };
  if (
    !Number.isInteger(interval.from) ||
    !Number.isInteger(interval.until) ||
    interval.from < 0 ||
    interval.until < interval.from ||
    interval.until > gross
  )
    throw new Error("Ungültiges Zuschlagsintervall.");
  if (gross <= 0 || interval.from === interval.until) return buckets;

  const start = zonedStart(shift, profile.timeZone);
  const lastMinute = start.add({ minutes: gross - 1 });
  const crossesOffsetTransition = start.offsetNanoseconds !== lastMinute.offsetNanoseconds;

  if (crossesOffsetTransition) {
    const dayContexts = new Map<string, PremiumDayContext>();
    for (let index = interval.from; index < interval.until; index++) {
      if (index >= breakStart && index < breakEnd) continue;
      const cursor = start.add({ minutes: index });
      const date = cursor.toPlainDate();
      const dateKey = date.toString();
      let day = dayContexts.get(dateKey);
      if (!day) {
        day = premiumDayContext(date, profile.federalState, profile.holidayRegion, ruleResolver);
        dayContexts.set(dateKey, day);
      }
      countPremiumMinute(
        buckets,
        day,
        dateKey,
        cursor.hour * 60 + cursor.minute,
        shift,
        profile,
        rulePackage,
      );
    }
    return buckets;
  }

  const startDate = start.toPlainDate();
  const startMinuteOfDay = start.hour * 60 + start.minute;
  let cachedDayOffset = Math.floor((startMinuteOfDay + interval.from) / (24 * 60));
  let cachedDate = startDate.add({ days: cachedDayOffset });
  let cachedDay = premiumDayContext(
    cachedDate,
    profile.federalState,
    profile.holidayRegion,
    ruleResolver,
  );

  for (let index = interval.from; index < interval.until; index++) {
    if (index >= breakStart && index < breakEnd) continue;
    const localMinute = startMinuteOfDay + index;
    const dayOffset = Math.floor(localMinute / (24 * 60));
    if (dayOffset !== cachedDayOffset) {
      cachedDayOffset = dayOffset;
      cachedDate = dayOffset === 0 ? startDate : startDate.add({ days: dayOffset });
      cachedDay = premiumDayContext(
        cachedDate,
        profile.federalState,
        profile.holidayRegion,
        ruleResolver,
      );
    }
    countPremiumMinute(
      buckets,
      cachedDay,
      cachedDate.toString(),
      localMinute % (24 * 60),
      shift,
      profile,
      rulePackage,
    );
  }
  return buckets;
}
