import { Temporal } from "@js-temporal/polyfill";

import type {
  MonthlyPayEstimate,
  MonthlyTariffDecision,
  PremiumLine,
  ShiftEntry,
  ShiftPremiumBreakdown,
  TvoedWorkPatternSettings,
  TvoedAssessment,
  UserProfile,
} from "@/domain/types";
import { getPublicHolidays } from "@/engine/holidays";
import { calculateMonthlyAllowanceAmounts } from "@/engine/pay-allowances";
import { assessTvoedKCalendarMonth } from "@/engine/tvoed-k-calendar-assessment";
import type { NightSequenceExplanation } from "@/engine/tvoed-k-calendar-nights";
import { conditionsMatch } from "@/engine/pay-conditions";
import { createManualMonthlyPayEstimate } from "@/engine/pay-fallback";
import {
  getHourlyTableAmountForStep,
  getIndividualHourlyRate,
  getMonthlyTableAmount,
  getOvertimeBaseHourlyRate,
  getTariffFullTimeWeeklyMinutes,
  getTariffRulePackage,
  getTariffVersion,
} from "@/engine/tariff";
import {
  assessTvoedPattern,
  DEFAULT_TVOED_WORK_PATTERN_SETTINGS,
  isPayWorkShift as isWorkShift,
} from "@/engine/tvoed-pattern";
import { calculateTimedShiftMinutes } from "@/engine/working-time";
import { getTariffAssessmentLookbackMonths } from "@/rules/calculation-windows";
import type {
  RulePremiumRule,
  RuleTariffPackage,
  RuleTimeWindow,
} from "@/rules/contracts.generated";
import { bundledRuleResolver, type RuleResolver } from "@/rules/rule-resolver";

const HOLIDAY_DATE_CACHE = new WeakMap<RuleResolver, Map<string, ReadonlySet<string>>>();

export { assessTvoedPattern, DEFAULT_TVOED_WORK_PATTERN_SETTINGS };

export interface MonthlyTvoedAssessmentResult {
  readonly nightSequence?: NightSequenceExplanation;
  readonly assessment: TvoedAssessment | null;
  readonly available: boolean;
  readonly tariffLabel: string | null;
}

interface PremiumMinuteBuckets {
  readonly byRuleId: Map<string, number>;
}

interface PremiumDayContext {
  readonly holiday: boolean;
  readonly sunday: boolean;
  readonly saturday: boolean;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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

function grossMinutes(shift: ShiftEntry, timeZone: string): number {
  return calculateTimedShiftMinutes({ ...shift, breakMinutes: 0 }, timeZone);
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

function countPremiumMinutes(
  shift: ShiftEntry,
  profile: UserProfile,
  gross: number,
  breakStart: number,
  breakEnd: number,
  rulePackage: RuleTariffPackage,
  ruleResolver: RuleResolver,
): PremiumMinuteBuckets {
  const buckets: PremiumMinuteBuckets = {
    byRuleId: new Map(),
  };
  if (gross <= 0) return buckets;

  const start = zonedStart(shift, profile.timeZone);
  const lastMinute = start.add({ minutes: gross - 1 });
  const crossesOffsetTransition = start.offsetNanoseconds !== lastMinute.offsetNanoseconds;

  if (crossesOffsetTransition) {
    const dayContexts = new Map<string, PremiumDayContext>();
    for (let index = 0; index < gross; index++) {
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
  let cachedDayOffset = 0;
  let cachedDate = startDate;
  let cachedDay = premiumDayContext(
    startDate,
    profile.federalState,
    profile.holidayRegion,
    ruleResolver,
  );

  for (let index = 0; index < gross; index++) {
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

function premiumLine(
  key: string,
  label: string,
  minutes: number,
  percentage: number,
  hourlyRate: number,
): PremiumLine | null {
  if (minutes <= 0) return null;
  return {
    key,
    label,
    minutes,
    percentage,
    hourlyRate,
    amount: roundMoney((minutes / 60) * hourlyRate * (percentage / 100)),
  };
}

const SHIFT_PREMIUM_CACHE = new WeakMap<
  ShiftEntry,
  WeakMap<RuleResolver, Map<string, ShiftPremiumBreakdown>>
>();

function premiumCacheKey(shift: ShiftEntry, profile: UserProfile): string {
  const tariff = profile.tariff;
  return [
    shift.revision,
    shift.date,
    shift.type,
    shift.startTime,
    shift.endTime,
    shift.breakMinutes,
    shift.overtimeMinutes,
    shift.tariffOvertimeConfirmed,
    shift.holidayPremiumMode,
    shift.deletedAt,
    profile.updatedAt,
    profile.federalState,
    profile.holidayRegion,
    profile.weeklyMinutes,
    profile.timeZone,
    tariff?.payGroup,
    tariff?.payLevel,
    tariff?.sector,
    tariff?.tariffRegion,
    tariff?.fullTimeWeeklyMinutes,
  ].join("|");
}

function calculateShiftPremiumBreakdownUncached(
  shift: ShiftEntry,
  profile: UserProfile,
  ruleResolver: RuleResolver,
): ShiftPremiumBreakdown {
  const tariff = profile.tariff;
  const rulePackage = getTariffRulePackage(shift.date, ruleResolver);
  if (!isWorkShift(shift) || tariff === null || rulePackage === null) {
    return {
      shiftId: shift.id,
      date: shift.date,
      netMinutes: isWorkShift(shift) ? calculateTimedShiftMinutes(shift, profile.timeZone) : 0,
      premiumLines: [],
      overtimeBaseAmount: 0,
      overtimePremiumAmount: 0,
      totalAmount: 0,
    };
  }

  const individualRate = getIndividualHourlyRate(tariff, shift.date, ruleResolver) ?? 0;
  const gross = grossMinutes(shift, profile.timeZone);
  const breakStart = Math.floor((gross - Math.min(gross, shift.breakMinutes)) / 2);
  const breakEnd = breakStart + Math.min(gross, shift.breakMinutes);
  const buckets = countPremiumMinutes(
    shift,
    profile,
    gross,
    breakStart,
    breakEnd,
    rulePackage,
    ruleResolver,
  );
  const premiumKey = (rule: RulePremiumRule): string => {
    switch (rule.premiumType) {
      case "HOLIDAY_WITH_TIME_OFF":
      case "HOLIDAY_WITHOUT_TIME_OFF":
        return "holiday";
      case "PRE_HOLIDAY":
        return "preholiday";
      default:
        return rule.premiumType.toLowerCase();
    }
  };
  const hourlyRateFor = (rule: RulePremiumRule): number => {
    if (rule.rateBasis === "INDIVIDUAL_HOURLY") return individualRate;
    if (rule.referenceStepId === null) {
      throw new Error(`Premium rule ${rule.id} requires a reference step.`);
    }
    return getHourlyTableAmountForStep(tariff, shift.date, rule.referenceStepId, ruleResolver) ?? 0;
  };
  const lines = rulePackage.rules.premiumRules
    .filter((rule) => rule.premiumType !== "OVERTIME")
    .map((rule) =>
      premiumLine(
        premiumKey(rule),
        rule.label,
        buckets.byRuleId.get(rule.id) ?? 0,
        rule.percentageBasisPoints / 100,
        hourlyRateFor(rule),
      ),
    )
    .filter((line): line is PremiumLine => line !== null);
  const netMinutes = calculateTimedShiftMinutes(shift, profile.timeZone);
  const overtimeMinutes = shift.tariffOvertimeConfirmed
    ? Math.min(shift.overtimeMinutes, netMinutes)
    : 0;
  const overtimeRules = rulePackage.rules.premiumRules.filter(
    (rule) =>
      rule.premiumType === "OVERTIME" &&
      conditionsMatch(rule.conditions, profile, shift.date, shift, null),
  );
  if (overtimeRules.length !== 1) {
    throw new Error(
      `Expected one overtime rule for ${tariff.payGroup} on ${shift.date}, found ${overtimeRules.length}.`,
    );
  }
  const overtimeRule = overtimeRules[0];
  const overtimeRate = hourlyRateFor(overtimeRule);
  const overtimeBaseRate = getOvertimeBaseHourlyRate(rulePackage, tariff, individualRate);
  const overtimeBaseAmount = roundMoney((overtimeMinutes / 60) * overtimeBaseRate);
  const overtimePremiumAmount = roundMoney(
    (overtimeMinutes / 60) * overtimeRate * (overtimeRule.percentageBasisPoints / 10_000),
  );
  const totalAmount = roundMoney(
    lines.reduce((sum, line) => sum + line.amount, 0) + overtimeBaseAmount + overtimePremiumAmount,
  );
  return {
    shiftId: shift.id,
    date: shift.date,
    netMinutes,
    premiumLines: lines,
    overtimeBaseAmount,
    overtimePremiumAmount,
    totalAmount,
  };
}

export function calculateShiftPremiumBreakdown(
  shift: ShiftEntry,
  profile: UserProfile,
  ruleResolver: RuleResolver = bundledRuleResolver,
): ShiftPremiumBreakdown {
  const key = premiumCacheKey(shift, profile);
  const cachedByResolver = SHIFT_PREMIUM_CACHE.get(shift);
  const cachedByInput = cachedByResolver?.get(ruleResolver);
  const cached = cachedByInput?.get(key);
  if (cached) return cached;

  const result = Object.freeze(
    calculateShiftPremiumBreakdownUncached(shift, profile, ruleResolver),
  );
  const nextCache = cachedByInput ?? new Map<string, ShiftPremiumBreakdown>();
  nextCache.set(key, result);
  const nextResolverCache =
    cachedByResolver ?? new WeakMap<RuleResolver, Map<string, ShiftPremiumBreakdown>>();
  if (!cachedByInput) nextResolverCache.set(ruleResolver, nextCache);
  if (!cachedByResolver) SHIFT_PREMIUM_CACHE.set(shift, nextResolverCache);
  return result;
}

export function calculateMonthlyPayEstimate(
  month: string,
  shifts: readonly ShiftEntry[],
  profile: UserProfile,
  decision: MonthlyTariffDecision | null,
  assessmentShifts: readonly ShiftEntry[] = shifts,
  workPatternSettings: TvoedWorkPatternSettings = DEFAULT_TVOED_WORK_PATTERN_SETTINGS,
  ruleResolver: RuleResolver = bundledRuleResolver,
): MonthlyPayEstimate {
  if (profile.tariff === null && profile.manualMonthlyGrossCents != null) {
    return createManualMonthlyPayEstimate(month, profile.manualMonthlyGrossCents);
  }

  const monthShifts = shifts.filter(
    (shift) => shift.deletedAt === null && shift.date.startsWith(`${month}-`) && isWorkShift(shift),
  );
  const first = Temporal.PlainDate.from(`${month}-01`);
  const dateKey = first.toString();
  const rulePackage = getTariffRulePackage(dateKey, ruleResolver);
  const assessmentResult = calculateMonthlyTvoedAssessment(
    month,
    monthShifts,
    assessmentShifts,
    workPatternSettings,
    ruleResolver,
    profile,
  );
  const assessment =
    assessmentResult.assessment ??
    assessTvoedPattern([], workPatternSettings, ruleResolver, dateKey);
  const version = getTariffVersion(dateKey, ruleResolver);
  const tariff = profile.tariff;
  if (version === null || tariff === null || rulePackage === null) {
    return {
      month,
      tariffLabel: version?.label ?? null,
      available: false,
      fullTimeTableAmount: null,
      personalBaseAmount: null,
      shiftBreakdowns: [],
      timePremiumAmount: 0,
      overtimeAmount: 0,
      allowanceAmount: 0,
      tvoedAllowanceAmount: 0,
      careAllowanceAmount: 0,
      estimatedGrossAmount: null,
      assessment,
      confirmedAllowance: decision?.allowanceStatus ?? null,
    };
  }
  const shiftBreakdowns = monthShifts.map((shift) =>
    calculateShiftPremiumBreakdown(shift, profile, ruleResolver),
  );
  const fullTimeWeeklyMinutes = getTariffFullTimeWeeklyMinutes(tariff, dateKey, ruleResolver);
  if (fullTimeWeeklyMinutes === null) {
    throw new Error(`No tariff weekly working time is available for ${dateKey}.`);
  }
  const fullTimeTableAmount = getMonthlyTableAmount(tariff, dateKey, ruleResolver)!;
  const personalBaseAmount = roundMoney(
    fullTimeTableAmount * (profile.weeklyMinutes / fullTimeWeeklyMinutes),
  );
  const timePremiumAmount = roundMoney(
    shiftBreakdowns.reduce(
      (sum, item) => sum + item.premiumLines.reduce((lineSum, line) => lineSum + line.amount, 0),
      0,
    ),
  );
  const overtimeAmount = roundMoney(
    shiftBreakdowns.reduce(
      (sum, item) => sum + item.overtimeBaseAmount + item.overtimePremiumAmount,
      0,
    ),
  );
  const workMinutes = shiftBreakdowns.reduce((sum, item) => sum + item.netMinutes, 0);
  const confirmedAllowance = decision?.allowanceStatus ?? null;
  const effectiveAllowance = confirmedAllowance ?? assessment.suggestedAllowance;
  const {
    allowanceAmount: monthlyAllowanceAmount,
    careAllowanceAmount: monthlyCareAllowanceAmount,
    tvoedAllowanceAmount: monthlyTvoedAllowanceAmount,
  } = calculateMonthlyAllowanceAmounts({
    date: dateKey,
    fullTimeWeeklyMinutes,
    profile,
    rulePackage,
    status: effectiveAllowance,
    workMinutes,
  });
  return {
    month,
    tariffLabel: version.label,
    available: true,
    fullTimeTableAmount,
    personalBaseAmount,
    shiftBreakdowns,
    timePremiumAmount,
    overtimeAmount,
    allowanceAmount: monthlyAllowanceAmount,
    tvoedAllowanceAmount: monthlyTvoedAllowanceAmount,
    careAllowanceAmount: monthlyCareAllowanceAmount,
    estimatedGrossAmount: roundMoney(
      personalBaseAmount +
        timePremiumAmount +
        overtimeAmount +
        monthlyAllowanceAmount +
        monthlyTvoedAllowanceAmount +
        monthlyCareAllowanceAmount,
    ),
    assessment,
    confirmedAllowance,
  };
}

export function calculateMonthlyTvoedAssessment(
  month: string,
  monthShifts: readonly ShiftEntry[],
  assessmentShifts: readonly ShiftEntry[],
  workPatternSettings: TvoedWorkPatternSettings = DEFAULT_TVOED_WORK_PATTERN_SETTINGS,
  ruleResolver: RuleResolver = bundledRuleResolver,
  profile?: Pick<UserProfile, "tariff" | "timeZone">,
): MonthlyTvoedAssessmentResult {
  const first = Temporal.PlainDate.from(`${month}-01`);
  const dateKey = first.toString();
  const rulePackage = getTariffRulePackage(dateKey, ruleResolver);
  const version = getTariffVersion(dateKey, ruleResolver);
  if (rulePackage === null || version === null) {
    return { assessment: null, available: false, tariffLabel: version?.label ?? null };
  }
  const currentWorkShifts = monthShifts.filter(
    (shift) => shift.deletedAt === null && shift.date.startsWith(`${month}-`) && isWorkShift(shift),
  );
  const assessmentStart = first
    .subtract({ months: getTariffAssessmentLookbackMonths(dateKey, ruleResolver) })
    .toString();
  const assessmentEnd = first.add({ months: 1 }).subtract({ days: 1 }).toString();
  if (profile?.tariff?.sector === "BT_K") {
    const relevant = assessmentShifts.filter(
      (shift) =>
        shift.deletedAt === null && shift.date >= assessmentStart && shift.date <= assessmentEnd,
    );
    return {
      ...assessTvoedKCalendarMonth(
        month,
        relevant,
        workPatternSettings,
        ruleResolver,
        profile.timeZone,
      ),
      available: true,
      tariffLabel: version.label,
    };
  }
  const relevantShifts =
    currentWorkShifts.length === 0
      ? []
      : assessmentShifts.filter(
          (shift) =>
            shift.deletedAt === null &&
            shift.date >= assessmentStart &&
            shift.date <= assessmentEnd &&
            isWorkShift(shift),
        );
  return {
    assessment: assessTvoedPattern(relevantShifts, workPatternSettings, ruleResolver, dateKey),
    available: true,
    tariffLabel: version.label,
  };
}
