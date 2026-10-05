import { Temporal } from "@js-temporal/polyfill";
import kr2025 from "../../rules/packages/reviewed/tvl-kr-tdl/2025-11.json";
import kr2026 from "../../rules/packages/reviewed/tvl-kr-tdl/2026-04.json";
import kr2027 from "../../rules/packages/reviewed/tvl-kr-tdl/2027-03.json";
import kr2028 from "../../rules/packages/reviewed/tvl-kr-tdl/2028-01.json";
import {
  requireTvlKrTariff,
  type TvlKrTariff,
  type TvlKrUniversityRegion,
} from "@/domain/tvl-kr-tariff";
import { ALLOWANCE_STATUSES } from "@/domain/types";
import type {
  AllowanceStatus,
  MonthlyPayEstimate,
  PremiumLine,
  ShiftEntry,
  ShiftPremiumBreakdown,
  TvoedAssessment,
  UserProfile,
} from "@/domain/types";
import type { RuleTariffPackage, RuleTimeWindow } from "@/rules/contracts.generated";
import { bundledRuleResolver, RuleResolutionError, type RuleResolver } from "@/rules/rule-resolver";
import { validateRulePackage } from "@/rules/validation";
import { resolveHolidayMapForMonth } from "./holidays";
import { createManualMonthlyPayEstimate } from "./pay-fallback";
import { roundRemunerationCents } from "./remuneration-money";
import { isPayWorkShift } from "./tvoed-pattern";
import { calculateTimedShiftBounds } from "./working-time";

// A bounded local adapter for the explicitly selected nursing table. The raw
// packages retain DRAFT; this does not extend the remote catalog's contracts.
const packages = [kr2025, kr2026, kr2027, kr2028].map((raw) => {
  const result = validateRulePackage(raw);
  if (
    !result.ok ||
    result.value.kind !== "TARIFF" ||
    result.value.packageId !== "tvl-kr-tdl" ||
    result.value.engineContractVersion !== 12
  )
    throw new Error("Ungültige TV-L-Pflegetabelle.");
  return result.value;
});
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const active = (
  date: string,
  item: { readonly validFrom: string; readonly validTo: string | null },
) => item.validFrom <= date && (item.validTo === null || date <= item.validTo);
const inWindow = (minute: number, window: RuleTimeWindow) =>
  window.startMinute < window.endMinute
    ? minute >= window.startMinute && minute < window.endMinute
    : minute >= window.startMinute || minute < window.endMinute;

function packageAt(date: string): RuleTariffPackage | null {
  const key = Temporal.PlainDate.from(date).toString();
  return packages.find((p) => active(key, p)) ?? null;
}

export function getTvlKrUniversityFullTimeMinutes(
  date: string,
  region: TvlKrUniversityRegion,
): number | null {
  if (region !== "WEST" && region !== "EAST") return null;
  const pkg = packageAt(date);
  const regionId = region === "WEST" ? "WEST_38_5" : "EAST_UNIVERSITY_HOSPITAL";
  const rules = pkg?.rules.employmentWorkingTimeRules?.filter(
    (r) => r.variantId === "SECTION_43" && r.regionId === regionId && active(date, r),
  );
  return rules?.length === 1 ? rules[0].fullTimeWeeklyMinutes : null;
}

function context(
  date: string,
  selection: TvlKrTariff,
  region: TvlKrUniversityRegion,
  weeklyMinutes: number,
) {
  const selected = requireTvlKrTariff(selection);
  const pkg = packageAt(date);
  const fullTime = getTvlKrUniversityFullTimeMinutes(date, region);
  if (
    !selected ||
    !pkg ||
    fullTime === null ||
    !Number.isSafeInteger(weeklyMinutes) ||
    weeklyMinutes <= 0 ||
    weeklyMinutes > fullTime
  )
    return null;
  const group = selected.payGroup.toLowerCase();
  const entries = pkg.rules.payTables
    .filter((t) => t.id === pkg.rules.selector.payTableId)
    .flatMap((t) => t.entries);
  const value = (step: number) => {
    const matching = entries.filter((e) => e.groupId === group && e.stepId === String(step));
    return matching.length === 1 ? matching[0].monthlyCents : null;
  };
  const monthly = value(selected.payLevel),
    premium = value(3),
    overtime = value(Math.min(selected.payLevel, 4));
  const policy = pkg.rules.tvlTimePremiumPolicy,
    overtimePolicy = pkg.rules.tvlOvertimePolicy;
  const overtimeRules = overtimePolicy?.groupRates.filter((r) => r.groupId === group);
  if (
    monthly === null ||
    premium === null ||
    overtime === null ||
    !policy ||
    !overtimePolicy ||
    overtimeRules?.length !== 1
  )
    return null;
  return {
    pkg,
    fullTime,
    monthly,
    premiumHourlyCents: roundRemunerationCents(
      premium * 60000,
      fullTime * policy.monthlyFactorThousandths,
    ),
    overtimeHourlyCents: roundRemunerationCents(
      overtime * 60000,
      fullTime * overtimePolicy.monthlyFactorThousandths,
    ),
    overtimeBasisPoints: overtimeRules[0].percentageBasisPoints,
    policy,
  };
}

interface PremiumCandidate {
  readonly key: string;
  readonly label: string;
  readonly ruleId: string;
  readonly hourlyCents: number;
  readonly percentageBasisPoints: number;
}
interface PremiumBucket {
  candidate: PremiumCandidate;
  minutes: number;
}

export interface TvlKrCalculationOptions {
  readonly allowanceStatus: AllowanceStatus;
  /** Explicit nursing shift-work estimate/decision supplied by the caller. */
  readonly saturdayShiftWork: boolean;
  readonly assessment?: TvoedAssessment;
  readonly confirmedAllowance?: AllowanceStatus | null;
}

export function calculateTvlKrShift(
  shift: ShiftEntry,
  work: UserProfile,
  selection: TvlKrTariff,
  region: TvlKrUniversityRegion,
  saturdayShiftWork: boolean,
  resolver: RuleResolver = bundledRuleResolver,
): ShiftPremiumBreakdown {
  const empty: ShiftPremiumBreakdown = {
    shiftId: shift.id,
    date: shift.date,
    netMinutes: 0,
    premiumLines: [],
    overtimeBaseAmount: 0,
    overtimePremiumAmount: 0,
    totalAmount: 0,
  };
  if (shift.deletedAt !== null || !isPayWorkShift(shift)) return empty;
  if (typeof saturdayShiftWork !== "boolean") throw new Error("Der Schichtarbeitsbezug fehlt.");
  const bounds = calculateTimedShiftBounds(shift, work.timeZone);
  if (!bounds) return empty;
  const pause = Math.min(shift.breakMinutes, bounds.grossMinutes);
  const pauseFrom = Math.floor((bounds.grossMinutes - pause) / 2);
  const start = Temporal.Instant.fromEpochMilliseconds(
    bounds.startEpochMinutes * 60000,
  ).toZonedDateTimeISO(work.timeZone);
  const buckets = new Map<string, PremiumBucket>();
  const overtimeBuckets = new Map<
    string,
    { base: number; premium: number; percentage: number; minutes: number }
  >();
  const confirmedMinutes = shift.tariffOvertimeConfirmed
    ? Math.min(shift.overtimeMinutes, bounds.netMinutes)
    : 0;
  let remainingWork = bounds.netMinutes,
    from = 0;
  while (from < bounds.grossMinutes) {
    const sectionStart = start.add({ minutes: from });
    const date = sectionStart.toPlainDate().toString();
    const midnight = sectionStart
      .toPlainDate()
      .add({ days: 1 })
      .toZonedDateTime({ timeZone: work.timeZone, plainTime: "00:00" });
    const until = Math.min(
      bounds.grossMinutes,
      Number(midnight.epochMilliseconds - start.epochMilliseconds) / 60000,
    );
    const ctx = context(date, selection, region, work.weeklyMinutes);
    if (!ctx)
      throw new RuleResolutionError({
        code: "RULE_PACKAGE_NOT_FOUND",
        kind: "TARIFF",
        packageId: "tvl-kr-tdl",
        effectiveDate: date,
        message: "Für einen Dienst fehlt eine gültige TV-L-Pflegetabelle oder Vollzeitbasis.",
      });
    const holidays = resolveHolidayMapForMonth(
      date.slice(0, 7),
      work.federalState,
      resolver,
      work.holidayRegion,
    );
    if (holidays.status !== "AVAILABLE") throw new RuleResolutionError(holidays.failure);
    const transition =
      sectionStart.offsetNanoseconds !== start.add({ minutes: until - 1 }).offsetNanoseconds;
    const percentage = (key: string, label: string, basisPoints: number): PremiumCandidate => ({
      key,
      label,
      ruleId: "tvl-" + key,
      hourlyCents: ctx.premiumHourlyCents,
      percentageBasisPoints: basisPoints,
    });
    const count = (candidate: PremiumCandidate) => {
      const key = JSON.stringify([
        candidate.key,
        candidate.hourlyCents,
        candidate.percentageBasisPoints,
      ]);
      const previous = buckets.get(key);
      if (previous) previous.minutes++;
      else buckets.set(key, { candidate, minutes: 1 });
    };
    for (let offset = from; offset < until; offset++) {
      if (offset >= pauseFrom && offset < pauseFrom + pause) continue;
      const cursor = transition ? start.add({ minutes: offset }) : null;
      const minute = cursor
        ? cursor.hour * 60 + cursor.minute
        : sectionStart.hour * 60 + sectionStart.minute + offset - from;
      if (inWindow(minute, ctx.policy.nightWindow))
        count(percentage("night", "Nacht", ctx.policy.nightBasisPoints));
      const competing: PremiumCandidate[] = [];
      if (sectionStart.dayOfWeek === 7)
        competing.push(percentage("sunday", "Sonntag", ctx.policy.sundayBasisPoints));
      if (holidays.holidays.has(date))
        competing.push(
          percentage(
            "holiday",
            shift.holidayPremiumMode === "WITH_TIME_OFF"
              ? "Feiertag mit Freizeitausgleich"
              : "Feiertag ohne Freizeitausgleich",
            shift.holidayPremiumMode === "WITH_TIME_OFF"
              ? ctx.policy.holidayWithTimeOffBasisPoints
              : ctx.policy.holidayWithoutTimeOffBasisPoints,
          ),
        );
      if (
        ctx.policy.preHolidayMonthDays.includes(date.slice(5)) &&
        inWindow(minute, ctx.policy.preHolidayWindow)
      )
        competing.push(
          percentage("preholiday", "24./31. Dezember", ctx.policy.preHolidayBasisPoints),
        );
      if (sectionStart.dayOfWeek === 6 && inWindow(minute, ctx.policy.saturdayWindow))
        competing.push(
          saturdayShiftWork
            ? {
                key: "saturday",
                label: "Samstag",
                ruleId: "tvl-saturday-fixed",
                hourlyCents: ctx.policy.saturdaySalariedShiftHourlyCents,
                percentageBasisPoints: 10000,
              }
            : percentage("saturday", "Samstag", ctx.policy.saturdayBasisPoints),
        );
      const winner = competing.reduce<PremiumCandidate | null>(
        (best, candidate) =>
          best === null ||
          candidate.hourlyCents * candidate.percentageBasisPoints >
            best.hourlyCents * best.percentageBasisPoints
            ? candidate
            : best,
        null,
      );
      if (winner) count(winner);
      if (remainingWork <= confirmedMinutes) {
        const key = JSON.stringify([
          ctx.overtimeHourlyCents,
          ctx.premiumHourlyCents,
          ctx.overtimeBasisPoints,
        ]);
        const previous = overtimeBuckets.get(key);
        if (previous) previous.minutes++;
        else
          overtimeBuckets.set(key, {
            base: ctx.overtimeHourlyCents,
            premium: ctx.premiumHourlyCents,
            percentage: ctx.overtimeBasisPoints,
            minutes: 1,
          });
      }
      remainingWork--;
    }
    from = until;
  }
  const lines = new Map<string, PremiumLine>();
  for (const { candidate, minutes } of buckets.values()) {
    const amount =
      roundRemunerationCents(
        candidate.hourlyCents * candidate.percentageBasisPoints * minutes,
        600000,
      ) / 100;
    const previous = lines.get(candidate.key);
    const totalMinutes = (previous?.minutes ?? 0) + minutes;
    lines.set(candidate.key, {
      key: candidate.key,
      label: candidate.label,
      ruleId: candidate.ruleId,
      minutes: totalMinutes,
      percentage: candidate.percentageBasisPoints / 100,
      hourlyRate: previous
        ? money(
            (previous.hourlyRate * previous.minutes + (candidate.hourlyCents / 100) * minutes) /
              totalMinutes,
          )
        : candidate.hourlyCents / 100,
      amount: money((previous?.amount ?? 0) + amount),
    });
  }
  const overtimeBaseAmount =
    [...overtimeBuckets.values()].reduce(
      (sum, b) => sum + roundRemunerationCents(b.base * b.minutes, 60),
      0,
    ) / 100;
  const overtimePremiumAmount =
    [...overtimeBuckets.values()].reduce(
      (sum, b) => sum + roundRemunerationCents(b.premium * b.percentage * b.minutes, 600000),
      0,
    ) / 100;
  const premiumLines = [...lines.values()];
  return {
    ...empty,
    netMinutes: bounds.netMinutes,
    premiumLines,
    overtimeBaseAmount,
    overtimePremiumAmount,
    totalAmount: money(
      premiumLines.reduce((sum, p) => sum + p.amount, 0) +
        overtimeBaseAmount +
        overtimePremiumAmount,
    ),
  };
}

export function calculateTvlKrMonth(
  month: string,
  shifts: readonly ShiftEntry[],
  work: UserProfile,
  selection: TvlKrTariff,
  region: TvlKrUniversityRegion,
  options: TvlKrCalculationOptions,
  resolver: RuleResolver = bundledRuleResolver,
): MonthlyPayEstimate {
  if (
    !/^\d{4}-\d{2}$/.test(month) ||
    !ALLOWANCE_STATUSES.includes(options.allowanceStatus) ||
    typeof options.saturdayShiftWork !== "boolean" ||
    (options.confirmedAllowance != null && options.confirmedAllowance !== options.allowanceStatus)
  )
    throw new Error("Ungültige TV-L-Monatsangaben.");
  const date = Temporal.PlainYearMonth.from(month).toPlainDate({ day: 1 }).toString();
  const ctx = context(date, selection, region, work.weeklyMinutes);
  const empty = { ...createManualMonthlyPayEstimate(month, 0), tariffLabel: "TV-L Pflege" };
  if (!ctx)
    return {
      ...empty,
      available: false,
      fullTimeTableAmount: null,
      personalBaseAmount: null,
      estimatedGrossAmount: null,
    };
  const policy = ctx.pkg.rules.tvlShiftAllowancePolicy?.periods.find((p) => active(date, p));
  const care = ctx.pkg.rules.tvlCareAllowancePolicy;
  if (!policy || !care)
    return {
      ...empty,
      available: false,
      fullTimeTableAmount: null,
      personalBaseAmount: null,
      estimatedGrossAmount: null,
    };
  const breakdowns = shifts
    .filter((s) => s.deletedAt === null && s.date.startsWith(month + "-") && isPayWorkShift(s))
    .map((s) =>
      calculateTvlKrShift(s, work, selection, region, options.saturdayShiftWork, resolver),
    );
  const personalBaseAmount =
    roundRemunerationCents(ctx.monthly * work.weeklyMinutes, ctx.fullTime) / 100;
  const careAllowanceAmount =
    roundRemunerationCents(care.nursingMonthlyCents * work.weeklyMinutes, ctx.fullTime) / 100;
  const status = options.allowanceStatus;
  const monthly = status.endsWith("_MONTHLY"),
    alternating = status.startsWith("ALTERNATING");
  const rate =
    status === "NONE"
      ? 0
      : alternating
        ? monthly
          ? policy.alternatingMonthlyCents
          : policy.alternatingHourlyCents
        : monthly
          ? policy.shiftMonthlyCents
          : policy.shiftHourlyCents;
  const allowanceAmount =
    roundRemunerationCents(
      rate * (monthly ? work.weeklyMinutes : breakdowns.reduce((sum, b) => sum + b.netMinutes, 0)),
      monthly ? ctx.fullTime : 60,
    ) / 100;
  const timePremiumAmount = money(
    breakdowns.reduce((sum, b) => sum + b.premiumLines.reduce((s, p) => s + p.amount, 0), 0),
  );
  const overtimeAmount = money(
    breakdowns.reduce((sum, b) => sum + b.overtimeBaseAmount + b.overtimePremiumAmount, 0),
  );
  return {
    ...empty,
    available: true,
    fullTimeTableAmount: ctx.monthly / 100,
    personalBaseAmount,
    careAllowanceAmount,
    tvoedAllowanceAmount: 0,
    allowanceAmount,
    timePremiumAmount,
    overtimeAmount,
    shiftBreakdowns: breakdowns,
    estimatedGrossAmount: money(
      personalBaseAmount +
        careAllowanceAmount +
        allowanceAmount +
        timePremiumAmount +
        overtimeAmount,
    ),
    assessment: options.assessment ?? empty.assessment,
    confirmedAllowance: options.confirmedAllowance ?? null,
  };
}
