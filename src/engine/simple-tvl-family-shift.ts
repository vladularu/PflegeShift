import { Temporal } from "@js-temporal/polyfill";
import type { PremiumLine, ShiftEntry, ShiftPremiumBreakdown, UserProfile } from "@/domain/types";
import type { RuleTimeWindow } from "@/rules/contracts.generated";
import { RuleResolutionError, type RuleResolver } from "@/rules/rule-resolver";
import { resolveHolidayMapForMonth } from "./holidays";
import { roundRemunerationCents } from "./remuneration-money";
import { isPayWorkShift } from "./tvoed-pattern";
import { calculateTimedShiftBounds } from "./working-time";

export interface TvlFamilyPremiumPolicy {
  readonly nightWindow: RuleTimeWindow;
  readonly nightBasisPoints: number;
  readonly sundayBasisPoints: number;
  readonly holidayWithTimeOffBasisPoints: number;
  readonly holidayWithoutTimeOffBasisPoints: number;
  readonly preHolidayMonthDays: readonly string[];
  readonly preHolidayWindow: RuleTimeWindow;
  readonly preHolidayBasisPoints: number;
  readonly saturdayWindow: RuleTimeWindow;
  readonly saturdayBasisPoints: number;
  readonly saturdaySalariedShiftHourlyCents: number;
}
export interface TvlFamilyShiftContext {
  readonly premiumHourlyCents: number;
  readonly overtimeHourlyCents: number;
  readonly overtimeBasisPoints: number;
  readonly policy: TvlFamilyPremiumPolicy;
}
interface TvlFamilyShiftConfig {
  readonly packageId: string;
  readonly rulePrefix: string;
  readonly failureMessage: string;
  readonly roundHourlyPremium: boolean;
  readonly context: (date: string) => TvlFamilyShiftContext | null;
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
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const inWindow = (minute: number, window: RuleTimeWindow) =>
  window.startMinute < window.endMinute
    ? minute >= window.startMinute && minute < window.endMinute
    : minute >= window.startMinute || minute < window.endMinute;

// Shared elapsed-time traversal only. Each tariff supplies its own checked rates and rounding.
export function calculateTvlFamilyShift(
  shift: ShiftEntry,
  work: UserProfile,
  saturdayShiftWork: boolean,
  resolver: RuleResolver,
  config: TvlFamilyShiftConfig,
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
    const ctx = config.context(date);
    if (!ctx)
      throw new RuleResolutionError({
        code: "RULE_PACKAGE_NOT_FOUND",
        kind: "TARIFF",
        packageId: config.packageId,
        effectiveDate: date,
        message: config.failureMessage,
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
      ruleId: config.rulePrefix + "-" + key,
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
                ruleId: config.rulePrefix + "-saturday-fixed",
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
        config.roundHourlyPremium
          ? roundRemunerationCents(candidate.hourlyCents * candidate.percentageBasisPoints, 10000) *
              minutes
          : candidate.hourlyCents * candidate.percentageBasisPoints * minutes,
        config.roundHourlyPremium ? 60 : 600000,
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
      (sum, b) =>
        sum +
        roundRemunerationCents(
          config.roundHourlyPremium
            ? roundRemunerationCents(b.premium * b.percentage, 10000) * b.minutes
            : b.premium * b.percentage * b.minutes,
          config.roundHourlyPremium ? 60 : 600000,
        ),
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
