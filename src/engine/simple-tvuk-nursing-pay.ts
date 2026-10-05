import { Temporal } from "@js-temporal/polyfill";
import { requireTvUkNursingTariff, type TvUkNursingTariff } from "@/domain/tvuk-nursing-tariff";
import type {
  MonthlyPayEstimate,
  PremiumLine,
  ShiftEntry,
  ShiftPremiumBreakdown,
  TvoedAssessment,
  UserProfile,
} from "@/domain/types";
import { bundledRuleResolver, RuleResolutionError, type RuleResolver } from "@/rules/rule-resolver";
import { resolveHolidayMapForMonth } from "./holidays";
import { createManualMonthlyPayEstimate } from "./pay-fallback";
import { roundRemunerationCents } from "./remuneration-money";
import { isPayWorkShift } from "./tvoed-pattern";
import { calculateTimedShiftBounds } from "./working-time";
import sourceTables from "./simple-tvuk-nursing-tables.json";

export const TVUK_FULL_TIME_MINUTES = 2310;
interface TvUkTable {
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly sourceUrl: string;
  readonly sourcePage: number;
  readonly groups: Readonly<Record<string, Readonly<Record<string, number>>>>;
}
const tables: readonly TvUkTable[] = sourceTables;
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export function getTvUkNursingTable(date: string): TvUkTable | null {
  const day = Temporal.PlainDate.from(date).toString();
  return tables.find((t) => t.validFrom <= day && (t.validTo === null || day <= t.validTo)) ?? null;
}
function context(date: string, selection: TvUkNursingTariff, weeklyMinutes: number) {
  const selected = requireTvUkNursingTariff(selection);
  const table = getTvUkNursingTable(date);
  if (
    !selected ||
    !table ||
    !Number.isSafeInteger(weeklyMinutes) ||
    weeklyMinutes <= 0 ||
    weeklyMinutes > TVUK_FULL_TIME_MINUTES
  )
    return null;
  const monthlyCents = table.groups[selected.payGroup]?.[String(selected.payLevel)];
  if (!Number.isSafeInteger(monthlyCents) || monthlyCents <= 0) return null;
  return {
    monthlyCents,
    hourlyCents: roundRemunerationCents(monthlyCents * 60000, TVUK_FULL_TIME_MINUTES * 4348),
  };
}
export interface TvUkCalculationOptions {
  /** Regular shift duty satisfying TV-UK §11, supplied explicitly by the caller. */
  readonly regularShiftWork: boolean;
  /** Confirmed night pauses during which the workplace cannot be left (§8). */
  readonly paidNightBreaks?: boolean;
  readonly assessment?: TvoedAssessment;
}
export interface TvUkShiftBreakdown extends ShiftPremiumBreakdown {
  /** Compulsory time credit: five percent of paid night minutes, never salary. */
  readonly nightCompensatoryMinutes: number;
}
export interface TvUkMonthlyEstimate extends MonthlyPayEstimate {
  readonly nightCompensatoryMinutes: number;
}
function requireOptions(options: TvUkCalculationOptions) {
  if (
    typeof options.regularShiftWork !== "boolean" ||
    (options.paidNightBreaks !== undefined && typeof options.paidNightBreaks !== "boolean")
  )
    throw new Error("Ungültige TV-UK-Schichtangaben.");
}
const isNight = (minute: number) => minute < 360 || minute >= 1200;

export function calculateTvUkNursingShift(
  shift: ShiftEntry,
  work: UserProfile,
  selection: TvUkNursingTariff,
  options: TvUkCalculationOptions,
  resolver: RuleResolver = bundledRuleResolver,
): TvUkShiftBreakdown {
  requireOptions(options);
  const empty: TvUkShiftBreakdown = {
    shiftId: shift.id,
    date: shift.date,
    netMinutes: 0,
    premiumLines: [],
    overtimeBaseAmount: 0,
    overtimePremiumAmount: 0,
    totalAmount: 0,
    nightCompensatoryMinutes: 0,
  };
  if (shift.deletedAt !== null || !isPayWorkShift(shift)) return empty;
  const bounds = calculateTimedShiftBounds(shift, work.timeZone);
  if (!bounds) return empty;
  const pause = Math.min(shift.breakMinutes, bounds.grossMinutes);
  const pauseFrom = Math.floor((bounds.grossMinutes - pause) / 2);
  const start = Temporal.Instant.fromEpochMilliseconds(
    bounds.startEpochMinutes * 60000,
  ).toZonedDateTimeISO(work.timeZone);
  let paidPause = 0;
  if (options.paidNightBreaks) {
    for (let offset = pauseFrom; offset < pauseFrom + pause; offset++) {
      const cursor = start.add({ minutes: offset });
      if (isNight(cursor.hour * 60 + cursor.minute)) paidPause++;
    }
  }
  const paidMinutes = bounds.netMinutes + paidPause;
  const confirmedMinutes = shift.tariffOvertimeConfirmed
    ? Math.min(shift.overtimeMinutes, paidMinutes)
    : 0;
  const buckets = new Map<
    string,
    { key: string; label: string; percentage: number; hourly: number; minutes: number }
  >();
  const overtime = new Map<number, number>();
  let from = 0,
    remaining = paidMinutes,
    nightMinutes = 0;
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
    const ctx = context(date, selection, work.weeklyMinutes);
    if (!ctx)
      throw new RuleResolutionError({
        code: "RULE_PACKAGE_NOT_FOUND",
        kind: "TARIFF",
        packageId: "tv-uk-nursing",
        effectiveDate: date,
        message: "Für einen Dienst fehlt eine gültige TV-UK-Pflegetabelle oder Vollzeitbasis.",
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
    const count = (key: string, label: string, percentage: number) => {
      const id = JSON.stringify([key, percentage, ctx.hourlyCents]);
      const previous = buckets.get(id);
      if (previous) previous.minutes++;
      else buckets.set(id, { key, label, percentage, hourly: ctx.hourlyCents, minutes: 1 });
    };
    for (let offset = from; offset < until; offset++) {
      const cursor = transition ? start.add({ minutes: offset }) : null;
      const minute = cursor
        ? cursor.hour * 60 + cursor.minute
        : sectionStart.hour * 60 + sectionStart.minute + offset - from;
      if (
        offset >= pauseFrom &&
        offset < pauseFrom + pause &&
        !(options.paidNightBreaks && isNight(minute))
      )
        continue;
      if (isNight(minute)) {
        nightMinutes++;
        // 25% basic night premium minus compulsory 5% time credit; extra 15% is cash.
        count("night", "Nacht", minute < 240 ? 3500 : 2000);
      } else if (options.regularShiftWork) count("shift", "Schichtdienst (6–20 Uhr)", 280);
      // §11(1)c/d/e: one calendar premium, choosing the greatest applicable rate.
      if (sectionStart.dayOfWeek === 7) count("sunday", "Sonntag", 4000);
      else if (holidays.holidays.has(date)) count("holiday", "Feiertag", 2500);
      else if (date.slice(5) === "12-24" || date.slice(5) === "12-31")
        count("preholiday", "24./31. Dezember", 2500);
      if (remaining <= confirmedMinutes)
        overtime.set(ctx.hourlyCents, (overtime.get(ctx.hourlyCents) ?? 0) + 1);
      remaining--;
    }
    from = until;
  }
  const premiumLines: PremiumLine[] = [...buckets.values()].map((b) => ({
    key: b.key,
    label: b.label,
    ruleId: "tvuk-" + b.key + "-" + b.percentage,
    minutes: b.minutes,
    percentage: b.percentage / 100,
    hourlyRate: b.hourly / 100,
    amount: roundRemunerationCents(b.hourly * b.percentage * b.minutes, 600000) / 100,
  }));
  const overtimeBaseAmount =
    [...overtime].reduce(
      (sum, [rate, minutes]) => sum + roundRemunerationCents(rate * minutes, 60),
      0,
    ) / 100;
  const overtimePremiumAmount =
    [...overtime].reduce(
      (sum, [rate, minutes]) => sum + roundRemunerationCents(rate * minutes * 2500, 600000),
      0,
    ) / 100;
  return {
    ...empty,
    netMinutes: paidMinutes,
    premiumLines,
    overtimeBaseAmount,
    overtimePremiumAmount,
    totalAmount: money(
      premiumLines.reduce((sum, p) => sum + p.amount, 0) +
        overtimeBaseAmount +
        overtimePremiumAmount,
    ),
    nightCompensatoryMinutes: nightMinutes / 20,
  };
}

export function calculateTvUkNursingMonth(
  month: string,
  shifts: readonly ShiftEntry[],
  work: UserProfile,
  selection: TvUkNursingTariff,
  options: TvUkCalculationOptions,
  resolver: RuleResolver = bundledRuleResolver,
): TvUkMonthlyEstimate {
  requireOptions(options);
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Ungültiger TV-UK-Monat.");
  const date = Temporal.PlainYearMonth.from(month).toPlainDate({ day: 1 }).toString();
  const ctx = context(date, selection, work.weeklyMinutes);
  const empty: TvUkMonthlyEstimate = {
    ...createManualMonthlyPayEstimate(month, 0),
    tariffLabel: "TV-UK Pflege (Baden-Württemberg)",
    nightCompensatoryMinutes: 0,
  };
  if (!ctx)
    return {
      ...empty,
      available: false,
      fullTimeTableAmount: null,
      personalBaseAmount: null,
      estimatedGrossAmount: null,
    };
  const breakdowns = shifts
    .filter((s) => s.deletedAt === null && s.date.startsWith(month + "-") && isPayWorkShift(s))
    .map((s) => calculateTvUkNursingShift(s, work, selection, options, resolver));
  const personalBaseAmount =
    roundRemunerationCents(ctx.monthlyCents * work.weeklyMinutes, TVUK_FULL_TIME_MINUTES) / 100;
  const careAllowanceAmount =
    selection.payGroup === "PUK5"
      ? 0
      : roundRemunerationCents(20000 * work.weeklyMinutes, TVUK_FULL_TIME_MINUTES) / 100;
  const timePremiumAmount = money(
    breakdowns.reduce((sum, b) => sum + b.premiumLines.reduce((s, p) => s + p.amount, 0), 0),
  );
  const overtimeAmount = money(
    breakdowns.reduce((sum, b) => sum + b.overtimeBaseAmount + b.overtimePremiumAmount, 0),
  );
  return {
    ...empty,
    available: true,
    fullTimeTableAmount: ctx.monthlyCents / 100,
    personalBaseAmount,
    careAllowanceAmount,
    timePremiumAmount,
    overtimeAmount,
    allowanceAmount: 0,
    tvoedAllowanceAmount: 0,
    shiftBreakdowns: breakdowns,
    estimatedGrossAmount: money(
      personalBaseAmount + careAllowanceAmount + timePremiumAmount + overtimeAmount,
    ),
    assessment: options.assessment ?? empty.assessment,
    nightCompensatoryMinutes: breakdowns.reduce((sum, b) => sum + b.nightCompensatoryMinutes, 0),
  };
}
