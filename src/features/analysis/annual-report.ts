import { Temporal } from "@js-temporal/polyfill";

import type {
  CalendarEntry,
  MonthlyComplianceResult,
  MonthlyTariffDecision,
  ShiftType,
  TvoedWorkPatternSettings,
  UserProfile,
} from "@/domain/types";
import { calculateMonthlyComplianceSteps } from "@/engine/compliance";
import { calculateMonthlySummary } from "@/engine/monthly-summary";
import { calculateMonthlyPayEstimate } from "@/engine/pay";
import {
  selectAnalysisEntryWindow,
  type AnalysisEntryWindow,
} from "@/features/analysis/analysis-data";
import { buildShiftTypeDistribution } from "@/features/calendar/calendar-metrics";

export interface AnnualMonthReport {
  readonly month: string;
  readonly entryCount: number;
  readonly targetMinutes: number;
  readonly actualMinutes: number;
  readonly balanceMinutes: number;
  readonly estimatedGrossAmount: number | null;
  readonly premiumAmount: number;
  readonly criticalCount: number;
  readonly warningCount: number;
}

export interface AnnualReport {
  readonly year: number;
  readonly months: readonly AnnualMonthReport[];
  readonly targetMinutes: number;
  readonly actualMinutes: number;
  readonly balanceMinutes: number;
  readonly workMinutes: number;
  readonly trainingMinutes: number;
  readonly vacationDays: number;
  readonly sickDays: number;
  readonly freeDays: number;
  readonly entryCount: number;
  readonly activeMonthCount: number;
  readonly availablePayMonthCount: number;
  readonly estimatedGrossAmount: number;
  readonly premiumAmount: number;
  readonly overtimeAmount: number;
  readonly allowanceAmount: number;
  readonly criticalCount: number;
  readonly warningCount: number;
  readonly distribution: ReadonlyMap<ShiftType, number>;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

interface AnnualMonthContribution {
  readonly report: AnnualMonthReport;
  readonly workMinutes: number;
  readonly trainingMinutes: number;
  readonly vacationDays: number;
  readonly sickDays: number;
  readonly freeDays: number;
  readonly availablePay: boolean;
  readonly estimatedGrossAmount: number;
  readonly premiumAmount: number;
  readonly overtimeAmount: number;
  readonly allowanceAmount: number;
  readonly distribution: ReadonlyMap<ShiftType, number>;
}

interface CachedAnnualMonth {
  summary?: {
    readonly shifts: readonly CalendarEntry[];
    readonly profile: UserProfile;
    readonly value: ReturnType<typeof calculateMonthlySummary>;
  };
  compliance?: {
    readonly shifts: readonly CalendarEntry[];
    readonly profile: UserProfile;
    readonly referenceDate: string;
    readonly value: MonthlyComplianceResult;
  };
  pay?: {
    readonly monthShifts: readonly CalendarEntry[];
    readonly allowanceShifts: readonly CalendarEntry[];
    readonly profile: UserProfile;
    readonly decision: MonthlyTariffDecision | null;
    readonly workPatternSettings: TvoedWorkPatternSettings | undefined;
    readonly value: ReturnType<typeof calculateMonthlyPayEstimate>;
  };
  distribution?: {
    readonly entries: readonly CalendarEntry[];
    readonly value: ReadonlyMap<ShiftType, number>;
  };
}

export interface AnnualReportComputationCache {
  readonly months: Map<string, CachedAnnualMonth>;
}

export function createAnnualReportComputationCache(): AnnualReportComputationCache {
  return { months: new Map() };
}

function sameItems<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function monthCache(
  cache: AnnualReportComputationCache | undefined,
  month: string,
): CachedAnnualMonth {
  if (!cache) return {};
  const existing = cache.months.get(month);
  if (existing) return existing;
  if (!cache.months.has(month) && cache.months.size >= 36) {
    const oldest = cache.months.keys().next().value;
    if (oldest !== undefined) cache.months.delete(oldest);
  }
  const created: CachedAnnualMonth = {};
  cache.months.set(month, created);
  return created;
}

function* calculateAnnualMonthContribution(
  month: string,
  window: AnalysisEntryWindow,
  profile: UserProfile,
  decision: MonthlyTariffDecision | null,
  workPatternSettings: TvoedWorkPatternSettings | undefined,
  referenceDate: string,
  cached: CachedAnnualMonth,
): Generator<number, AnnualMonthContribution, void> {
  let summary =
    cached.summary &&
    cached.summary.profile === profile &&
    sameItems(cached.summary.shifts, window.monthShifts)
      ? cached.summary.value
      : null;
  if (summary === null) {
    summary = calculateMonthlySummary(month, window.monthShifts, profile);
    cached.summary = { shifts: window.monthShifts, profile, value: summary };
    yield 1;
  }

  let compliance =
    cached.compliance &&
    cached.compliance.profile === profile &&
    cached.compliance.referenceDate === referenceDate &&
    sameItems(cached.compliance.shifts, window.complianceShifts)
      ? cached.compliance.value
      : null;
  if (compliance === null) {
    const steps = calculateMonthlyComplianceSteps(
      month,
      window.complianceShifts,
      profile.timeZone,
      {
        federalState: profile.federalState,
        referenceDate,
        weeklyMinutes: profile.weeklyMinutes,
      },
    );
    while (true) {
      const step = steps.next();
      if (step.done) {
        compliance = step.value;
        break;
      }
      yield 2;
    }
    cached.compliance = {
      shifts: window.complianceShifts,
      profile,
      referenceDate,
      value: compliance,
    };
  }

  let pay =
    cached.pay &&
    cached.pay.profile === profile &&
    cached.pay.decision === decision &&
    cached.pay.workPatternSettings === workPatternSettings &&
    sameItems(cached.pay.monthShifts, window.monthShifts) &&
    sameItems(cached.pay.allowanceShifts, window.allowanceShifts)
      ? cached.pay.value
      : null;
  if (pay === null) {
    pay = calculateMonthlyPayEstimate(
      month,
      window.monthShifts,
      profile,
      decision,
      window.allowanceShifts,
      workPatternSettings,
    );
    cached.pay = {
      monthShifts: window.monthShifts,
      allowanceShifts: window.allowanceShifts,
      profile,
      decision,
      workPatternSettings,
      value: pay,
    };
    yield 3;
  }

  let distribution =
    cached.distribution && sameItems(cached.distribution.entries, window.monthEntries)
      ? cached.distribution.value
      : null;
  if (distribution === null) {
    distribution = buildShiftTypeDistribution(month, window.monthEntries);
    cached.distribution = { entries: window.monthEntries, value: distribution };
  }
  const allowanceAmount = pay.allowanceAmount + pay.tvoedAllowanceAmount + pay.careAllowanceAmount;

  return Object.freeze({
    report: Object.freeze({
      month,
      entryCount: window.monthEntries.length,
      targetMinutes: summary.targetMinutes,
      actualMinutes: summary.actualMinutes,
      balanceMinutes: summary.balanceMinutes,
      estimatedGrossAmount: pay.estimatedGrossAmount,
      premiumAmount: pay.timePremiumAmount + pay.overtimeAmount + allowanceAmount,
      criticalCount: compliance.criticalCount,
      warningCount: compliance.warningCount,
    }),
    workMinutes: summary.work.minutes,
    trainingMinutes: summary.training.minutes,
    vacationDays: summary.vacation.entryCount,
    sickDays: summary.sick.entryCount,
    freeDays: summary.free.entryCount,
    availablePay: pay.available && pay.estimatedGrossAmount !== null,
    estimatedGrossAmount: pay.estimatedGrossAmount ?? 0,
    premiumAmount: pay.timePremiumAmount,
    overtimeAmount: pay.overtimeAmount,
    allowanceAmount,
    distribution,
  });
}

export function* buildAnnualReportSteps(
  year: number,
  entries: readonly CalendarEntry[],
  profile: UserProfile,
  tariffDecisions: readonly MonthlyTariffDecision[],
  workPatternSettings?: TvoedWorkPatternSettings,
  cache?: AnnualReportComputationCache,
  referenceDate = Temporal.Now.plainDateISO(profile.timeZone).toString(),
): Generator<number, AnnualReport, void> {
  if (!Number.isInteger(year) || year < 1900 || year > 4099) {
    throw new Error("Ungültiges Berichtsjahr.");
  }

  const distribution = new Map<ShiftType, number>();
  const months: AnnualMonthReport[] = [];
  let targetMinutes = 0;
  let actualMinutes = 0;
  let workMinutes = 0;
  let trainingMinutes = 0;
  let vacationDays = 0;
  let sickDays = 0;
  let freeDays = 0;
  let entryCount = 0;
  let activeMonthCount = 0;
  let availablePayMonthCount = 0;
  let estimatedGrossAmount = 0;
  let premiumAmount = 0;
  let overtimeAmount = 0;
  let allowanceAmount = 0;
  let criticalCount = 0;
  let warningCount = 0;
  const windows = Array.from({ length: 12 }, (_, monthIndex) =>
    selectAnalysisEntryWindow(entries, `${year}-${String(monthIndex + 1).padStart(2, "0")}`),
  );
  const decisionsByMonth = new Map(tariffDecisions.map((item) => [item.month, item]));

  for (let index = 1; index <= 12; index += 1) {
    const month = `${year}-${String(index).padStart(2, "0")}`;
    const window = windows[index - 1];
    const decision = decisionsByMonth.get(month) ?? null;
    const calculation = calculateAnnualMonthContribution(
      month,
      window,
      profile,
      decision,
      workPatternSettings,
      referenceDate,
      monthCache(cache, month),
    );
    let contribution: AnnualMonthContribution;
    while (true) {
      const step = calculation.next();
      if (step.done) {
        contribution = step.value;
        break;
      }
      yield index;
    }

    for (const [type, count] of contribution.distribution) {
      distribution.set(type, (distribution.get(type) ?? 0) + count);
    }

    targetMinutes += contribution.report.targetMinutes;
    actualMinutes += contribution.report.actualMinutes;
    workMinutes += contribution.workMinutes;
    trainingMinutes += contribution.trainingMinutes;
    vacationDays += contribution.vacationDays;
    sickDays += contribution.sickDays;
    freeDays += contribution.freeDays;
    entryCount += contribution.report.entryCount;
    if (contribution.report.entryCount > 0) activeMonthCount += 1;
    if (contribution.availablePay) {
      availablePayMonthCount += 1;
      estimatedGrossAmount += contribution.estimatedGrossAmount;
    }
    premiumAmount += contribution.premiumAmount;
    overtimeAmount += contribution.overtimeAmount;
    allowanceAmount += contribution.allowanceAmount;
    criticalCount += contribution.report.criticalCount;
    warningCount += contribution.report.warningCount;

    months.push(contribution.report);
    yield index;
  }

  return Object.freeze({
    year,
    months: Object.freeze(months),
    targetMinutes,
    actualMinutes,
    balanceMinutes: actualMinutes - targetMinutes,
    workMinutes,
    trainingMinutes,
    vacationDays,
    sickDays,
    freeDays,
    entryCount,
    activeMonthCount,
    availablePayMonthCount,
    estimatedGrossAmount: roundMoney(estimatedGrossAmount),
    premiumAmount: roundMoney(premiumAmount),
    overtimeAmount: roundMoney(overtimeAmount),
    allowanceAmount: roundMoney(allowanceAmount),
    criticalCount,
    warningCount,
    distribution,
  });
}

export function buildAnnualReport(
  year: number,
  entries: readonly CalendarEntry[],
  profile: UserProfile,
  tariffDecisions: readonly MonthlyTariffDecision[],
  workPatternSettings?: TvoedWorkPatternSettings,
): AnnualReport {
  const steps = buildAnnualReportSteps(
    year,
    entries,
    profile,
    tariffDecisions,
    workPatternSettings,
  );
  while (true) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}
