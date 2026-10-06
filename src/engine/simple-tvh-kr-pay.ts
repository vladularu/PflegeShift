import { Temporal } from "@js-temporal/polyfill";
import tables from "./simple-tvh-kr-tables.json";
import { requireTvhKrTariff, tvhKrLevelsForGroup, type TvhKrTariff } from "@/domain/tvh-kr-tariff";
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
import type { RuleTimeWindow } from "@/rules/contracts.generated";
import { bundledRuleResolver, RuleResolutionError, type RuleResolver } from "@/rules/rule-resolver";
import { selectSimpleTariffTable, simpleTariffTableAmount } from "./simple-tariff-table-overlay";
import { resolveHolidayMapForMonth } from "./holidays";
import { createManualMonthlyPayEstimate } from "./pay-fallback";
import { roundRemunerationCents } from "./remuneration-money";
import { isPayWorkShift } from "./tvoed-pattern";
import { calculateTimedShiftBounds } from "./working-time";

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const inWindow = (minute: number, window: RuleTimeWindow) =>
  window.startMinute < window.endMinute
    ? minute >= window.startMinute && minute < window.endMinute
    : minute >= window.startMinute || minute < window.endMinute;
const catalogTables = new WeakMap<
  RuleResolver,
  WeakMap<object, WeakMap<object, (typeof tables)[number]>>
>();

export function getTvhKrTable(date: string, resolver: RuleResolver = bundledRuleResolver) {
  const key = Temporal.PlainDate.from(date).toString();
  const local = tables.find((p) => p.validFrom <= key && (p.validTo === null || key <= p.validTo));
  const update = selectSimpleTariffTable(resolver, "TVH_KR", key);
  if (!local || !update) return local ?? null;
  const cached = catalogTables.get(resolver)?.get(local)?.get(update);
  if (cached) return cached;
  const monthlyCents = { ...local.monthlyCents };
  for (const group of Object.keys(monthlyCents) as (keyof typeof monthlyCents)[]) {
    monthlyCents[group] = tvhKrLevelsForGroup(group).map((step) =>
      simpleTariffTableAmount(update, group, String(step)),
    );
    Object.freeze(monthlyCents[group]);
  }
  const snapshot = Object.freeze({
    ...local,
    validFrom: update.validFrom,
    validTo: update.validTo,
    monthlyCents: Object.freeze(monthlyCents),
  });
  const byLocal = catalogTables.get(resolver) ?? new WeakMap();
  const byTable = byLocal.get(local) ?? new WeakMap();
  byTable.set(update, snapshot);
  byLocal.set(local, byTable);
  catalogTables.set(resolver, byLocal);
  return snapshot;
}
export function getTvhKrAllowanceRates(date: string) {
  Temporal.PlainDate.from(date);
  return date < "2026-10-01"
    ? {
        alternatingMonthlyCents: 10500,
        alternatingHourlyCents: 63,
        shiftMonthlyCents: 4000,
        shiftHourlyCents: 24,
      }
    : {
        alternatingMonthlyCents: 20000,
        alternatingHourlyCents: 119,
        shiftMonthlyCents: 10000,
        shiftHourlyCents: 60,
      };
}
function context(
  date: string,
  selection: TvhKrTariff,
  weeklyMinutes: number,
  resolver: RuleResolver,
) {
  const selected = requireTvhKrTariff(selection);
  const table = getTvhKrTable(date, resolver);
  if (
    !selected ||
    !table ||
    !Number.isSafeInteger(weeklyMinutes) ||
    weeklyMinutes <= 0 ||
    weeklyMinutes > selected.fullTimeWeeklyMinutes
  )
    return null;
  const fullTime = selected.fullTimeWeeklyMinutes;
  const levels = tvhKrLevelsForGroup(selected.payGroup);
  const row = table.monthlyCents[selected.payGroup];
  const monthly = row[levels.indexOf(selected.payLevel)];
  const premium = row[levels.indexOf(3)];
  const overtime =
    row[
      levels.indexOf(
        typeof selected.payLevel === "number"
          ? (Math.min(selected.payLevel, 4) as 2 | 3 | 4)
          : selected.payLevel,
      )
    ];
  return {
    fullTime,
    monthly,
    premiumHourlyCents: roundRemunerationCents(
      premium * 100,
      roundRemunerationCents(fullTime * 4348, 600),
    ),
    overtimeHourlyCents: roundRemunerationCents(
      overtime * 100,
      roundRemunerationCents(fullTime * 4348, 600),
    ),
    overtimeBasisPoints: Number(selected.payGroup.slice(2)) <= 8 ? 3000 : 1500,
    careMonthlyCents:
      Number(selected.payGroup.slice(2)) > 12
        ? 0
        : date < "2026-07-01"
          ? 13804
          : date < "2027-10-01"
            ? 14222
            : 14620,
    allowanceRates: getTvhKrAllowanceRates(date),
    policy: {
      nightWindow: { startMinute: 1260, endMinute: 360 },
      nightBasisPoints: 2000,
      sundayBasisPoints: 2500,
      holidayWithTimeOffBasisPoints: 3500,
      holidayWithoutTimeOffBasisPoints: 13500,
      preHolidayMonthDays: ["12-24", "12-31"],
      preHolidayWindow: { startMinute: 360, endMinute: 1440 },
      preHolidayBasisPoints: 3500,
      saturdayWindow: { startMinute: 780, endMinute: 1260 },
      saturdayBasisPoints: 2000,
    },
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

export interface TvhKrCalculationOptions {
  readonly allowanceStatus: AllowanceStatus;
  /** Explicit nursing shift-work estimate/decision supplied by the caller. */
  readonly saturdayShiftWork: boolean;
  readonly assessment?: TvoedAssessment;
  readonly confirmedAllowance?: AllowanceStatus | null;
}

export function calculateTvhKrShift(
  shift: ShiftEntry,
  work: UserProfile,
  selection: TvhKrTariff,
  options: TvhKrCalculationOptions,
  resolver: RuleResolver = bundledRuleResolver,
): ShiftPremiumBreakdown & { hourlyAllowanceAmount: number } {
  const empty: ShiftPremiumBreakdown & { hourlyAllowanceAmount: number } = {
    shiftId: shift.id,
    date: shift.date,
    hourlyAllowanceAmount: 0,
    netMinutes: 0,
    premiumLines: [],
    overtimeBaseAmount: 0,
    overtimePremiumAmount: 0,
    totalAmount: 0,
  };
  if (shift.deletedAt !== null || !isPayWorkShift(shift)) return empty;
  if (
    typeof options.saturdayShiftWork !== "boolean" ||
    !ALLOWANCE_STATUSES.includes(options.allowanceStatus)
  )
    throw new Error("Der Schichtarbeitsbezug fehlt.");
  const bounds = calculateTimedShiftBounds(shift, work.timeZone);
  if (!bounds) return empty;
  // §6(1) sentence 2: prescribed breaks count as paid time in alternating shift work.
  const paidBreaks = options.allowanceStatus.startsWith("ALTERNATING");
  const paidMinutes = paidBreaks ? bounds.grossMinutes : bounds.netMinutes;
  const pause = paidBreaks ? 0 : Math.min(shift.breakMinutes, bounds.grossMinutes);
  const pauseFrom = Math.floor((bounds.grossMinutes - pause) / 2);
  const start = Temporal.Instant.fromEpochMilliseconds(
    bounds.startEpochMinutes * 60000,
  ).toZonedDateTimeISO(work.timeZone);
  const buckets = new Map<string, PremiumBucket>();
  const allowanceBuckets = new Map<number, number>();
  const overtimeBuckets = new Map<
    string,
    { base: number; premium: number; percentage: number; minutes: number }
  >();
  const confirmedMinutes = shift.tariffOvertimeConfirmed
    ? Math.min(shift.overtimeMinutes, paidMinutes)
    : 0;
  let remainingWork = paidMinutes,
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
    const ctx = context(date, selection, work.weeklyMinutes, resolver);
    if (!ctx)
      throw new RuleResolutionError({
        code: "RULE_PACKAGE_NOT_FOUND",
        kind: "TARIFF",
        packageId: "tvh-kr-tdl",
        effectiveDate: date,
        message: "Für einen Dienst fehlt eine gültige TV-H-Pflegetabelle oder Vollzeitbasis.",
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
    // Temporal zoned getters resolve the time zone; read each once per dated section.
    const sectionStartMinute = sectionStart.hour * 60 + sectionStart.minute;
    const dayOfWeek = sectionStart.dayOfWeek;
    const percentage = (key: string, label: string, basisPoints: number): PremiumCandidate => ({
      key,
      label,
      ruleId: "tvh-" + key,
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
      const minute = cursor ? cursor.hour * 60 + cursor.minute : sectionStartMinute + offset - from;
      if (inWindow(minute, ctx.policy.nightWindow))
        count(percentage("night", "Nacht", ctx.policy.nightBasisPoints));
      const competing: PremiumCandidate[] = [];
      if (dayOfWeek === 7)
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
      // Ordinary salaried nursing: no Saturday premium during shift/alternating shift work.
      if (
        dayOfWeek === 6 &&
        inWindow(minute, ctx.policy.saturdayWindow) &&
        !options.saturdayShiftWork
      )
        competing.push(percentage("saturday", "Samstag", ctx.policy.saturdayBasisPoints));
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
      if (options.allowanceStatus.endsWith("HOURLY")) {
        const rate = options.allowanceStatus.startsWith("ALTERNATING")
          ? ctx.allowanceRates.alternatingHourlyCents
          : ctx.allowanceRates.shiftHourlyCents;
        allowanceBuckets.set(rate, (allowanceBuckets.get(rate) ?? 0) + 1);
      }
      remainingWork--;
    }
    from = until;
  }
  const lines = new Map<string, PremiumLine>();
  for (const { candidate, minutes } of buckets.values()) {
    const amount =
      roundRemunerationCents(
        roundRemunerationCents(candidate.hourlyCents * candidate.percentageBasisPoints, 10000) *
          minutes,
        60,
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
          roundRemunerationCents(b.premium * b.percentage, 10000) * b.minutes,
          60,
        ),
      0,
    ) / 100;
  const premiumLines = [...lines.values()];
  const hourlyAllowanceAmount =
    [...allowanceBuckets].reduce(
      (sum, [rate, minutes]) => sum + roundRemunerationCents(rate * minutes, 60),
      0,
    ) / 100;
  return {
    ...empty,
    hourlyAllowanceAmount,
    netMinutes: paidMinutes,
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

export function calculateTvhKrMonth(
  month: string,
  shifts: readonly ShiftEntry[],
  work: UserProfile,
  selection: TvhKrTariff,
  options: TvhKrCalculationOptions,
  resolver: RuleResolver = bundledRuleResolver,
): MonthlyPayEstimate {
  if (
    !/^\d{4}-\d{2}$/.test(month) ||
    !ALLOWANCE_STATUSES.includes(options.allowanceStatus) ||
    typeof options.saturdayShiftWork !== "boolean" ||
    (options.confirmedAllowance != null && options.confirmedAllowance !== options.allowanceStatus)
  )
    throw new Error("Ungültige TV-H-Monatsangaben.");
  const date = Temporal.PlainYearMonth.from(month).toPlainDate({ day: 1 }).toString();
  const ctx = context(date, selection, work.weeklyMinutes, resolver);
  const empty = { ...createManualMonthlyPayEstimate(month, 0), tariffLabel: "TV-H Pflege" };
  if (!ctx)
    return {
      ...empty,
      available: false,
      fullTimeTableAmount: null,
      personalBaseAmount: null,
      estimatedGrossAmount: null,
    };
  const policy = ctx.allowanceRates;
  const care = { nursingMonthlyCents: ctx.careMonthlyCents };
  const breakdowns = shifts
    .filter((s) => s.deletedAt === null && s.date.startsWith(month + "-") && isPayWorkShift(s))
    .map((s) => calculateTvhKrShift(s, work, selection, options, resolver));
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
  const allowanceAmount = monthly
    ? roundRemunerationCents(rate * work.weeklyMinutes, ctx.fullTime) / 100
    : money(breakdowns.reduce((sum, b) => sum + b.hourlyAllowanceAmount, 0));
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
