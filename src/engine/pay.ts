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
import type { RulePremiumRule } from "@/rules/contracts.generated";
import { bundledRuleResolver, type RuleResolver } from "@/rules/rule-resolver";

import { countPremiumMinutes, type PremiumMinuteInterval } from "./pay-premium-minutes";

export { assessTvoedPattern, DEFAULT_TVOED_WORK_PATTERN_SETTINGS };

export interface MonthlyTvoedAssessmentResult {
  readonly nightSequence?: NightSequenceExplanation;
  readonly assessment: TvoedAssessment | null;
  readonly available: boolean;
  readonly tariffLabel: string | null;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function grossMinutes(shift: ShiftEntry, timeZone: string): number {
  return calculateTimedShiftMinutes({ ...shift, breakMinutes: 0 }, timeZone);
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
  interval?: PremiumMinuteInterval & { readonly date: string },
): ShiftPremiumBreakdown {
  const tariff = profile.tariff;
  const referenceDate = interval?.date ?? shift.date;
  const rulePackage = getTariffRulePackage(referenceDate, ruleResolver);
  if (interval && (tariff === null || rulePackage === null)) throw new PremiumRuleDataError();
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

  const individualRateValue = getIndividualHourlyRate(tariff, referenceDate, ruleResolver);
  const individualRate = individualRateValue ?? 0;
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
    interval,
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
    if (rule.rateBasis === "INDIVIDUAL_HOURLY") {
      if (interval && individualRateValue === null) throw new PremiumRuleDataError();
      return individualRate;
    }
    if (rule.referenceStepId === null) {
      throw new Error(`Premium rule ${rule.id} requires a reference step.`);
    }
    const rate = getHourlyTableAmountForStep(
      tariff,
      referenceDate,
      rule.referenceStepId,
      ruleResolver,
    );
    if (interval && rate === null) throw new PremiumRuleDataError();
    return rate ?? 0;
  };
  const lines = rulePackage.rules.premiumRules
    .filter(
      (rule) =>
        rule.premiumType !== "OVERTIME" && (!interval || (buckets.byRuleId.get(rule.id) ?? 0) > 0),
    )
    .map((rule) => {
      const line = premiumLine(
        premiumKey(rule),
        rule.label,
        buckets.byRuleId.get(rule.id) ?? 0,
        rule.percentageBasisPoints / 100,
        hourlyRateFor(rule),
      );
      return line && interval ? { ...line, ruleId: rule.id } : line;
    })
    .filter((line): line is PremiumLine => line !== null);
  const netMinutes = calculateTimedShiftMinutes(shift, profile.timeZone);
  if (interval) {
    const breakOverlap = Math.max(
      0,
      Math.min(interval.until, breakEnd) - Math.max(interval.from, breakStart),
    );
    return {
      shiftId: shift.id,
      date: interval.date,
      netMinutes: interval.until - interval.from - breakOverlap,
      premiumLines: lines,
      overtimeBaseAmount: 0,
      overtimePremiumAmount: 0,
      totalAmount: roundMoney(lines.reduce((sum, line) => sum + line.amount, 0)),
    };
  }
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

export class PremiumRuleDataError extends Error {
  constructor() {
    super("Die Stundenbasis für den Zeitzuschlag ist nicht verfügbar.");
    this.name = "PremiumRuleDataError";
  }
}

/** Uses the original shift's pause estimate; never duplicates or allocates overtime. */
export function calculateShiftTimePremiumInterval(
  shift: ShiftEntry,
  profile: UserProfile,
  ruleResolver: RuleResolver,
  interval: PremiumMinuteInterval & { readonly date: string },
): Pick<ShiftPremiumBreakdown, "premiumLines" | "netMinutes"> {
  return calculateShiftPremiumBreakdownUncached(shift, profile, ruleResolver, interval);
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
  const fullTimeTableAmount = tariff ? getMonthlyTableAmount(tariff, dateKey, ruleResolver) : null;
  if (version === null || tariff === null || rulePackage === null || fullTimeTableAmount === null) {
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
