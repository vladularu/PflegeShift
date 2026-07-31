import type {
  CalendarEntry,
  MonthlyTariffDecision,
  ShiftType,
  TvoedWorkPatternSettings,
  UserProfile,
} from "@/domain/types";
import { calculateMonthlyCompliance } from "@/engine/compliance";
import { calculateMonthlySummary } from "@/engine/monthly-summary";
import { calculateMonthlyPayEstimate } from "@/engine/pay";
import { selectAnalysisEntryWindow } from "@/features/analysis/analysis-data";
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

export function buildAnnualReport(
  year: number,
  entries: readonly CalendarEntry[],
  profile: UserProfile,
  tariffDecisions: readonly MonthlyTariffDecision[],
  workPatternSettings?: TvoedWorkPatternSettings,
): AnnualReport {
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

  for (let index = 1; index <= 12; index += 1) {
    const month = `${year}-${String(index).padStart(2, "0")}`;
    const window = selectAnalysisEntryWindow(entries, month);
    const summary = calculateMonthlySummary(month, window.monthShifts, profile);
    const compliance = calculateMonthlyCompliance(
      month,
      window.complianceShifts,
      profile.timeZone,
      {
        federalState: profile.federalState,
        weeklyMinutes: profile.weeklyMinutes,
      },
    );
    const decision = tariffDecisions.find((item) => item.month === month) ?? null;
    const pay = calculateMonthlyPayEstimate(
      month,
      window.monthShifts,
      profile,
      decision,
      window.allowanceShifts,
      workPatternSettings,
    );
    const monthDistribution = buildShiftTypeDistribution(month, window.monthEntries);

    for (const [type, count] of monthDistribution) {
      distribution.set(type, (distribution.get(type) ?? 0) + count);
    }

    const monthPremiumAmount =
      pay.timePremiumAmount +
      pay.overtimeAmount +
      pay.allowanceAmount +
      pay.tvoedAllowanceAmount +
      pay.careAllowanceAmount;

    targetMinutes += summary.targetMinutes;
    actualMinutes += summary.actualMinutes;
    workMinutes += summary.work.minutes;
    trainingMinutes += summary.training.minutes;
    vacationDays += summary.vacation.entryCount;
    sickDays += summary.sick.entryCount;
    freeDays += summary.free.entryCount;
    entryCount += window.monthEntries.length;
    if (window.monthEntries.length > 0) activeMonthCount += 1;
    if (pay.available && pay.estimatedGrossAmount !== null) {
      availablePayMonthCount += 1;
      estimatedGrossAmount += pay.estimatedGrossAmount;
    }
    premiumAmount += pay.timePremiumAmount;
    overtimeAmount += pay.overtimeAmount;
    allowanceAmount +=
      pay.allowanceAmount +
      pay.tvoedAllowanceAmount +
      pay.careAllowanceAmount;
    criticalCount += compliance.criticalCount;
    warningCount += compliance.warningCount;

    months.push(Object.freeze({
      month,
      entryCount: window.monthEntries.length,
      targetMinutes: summary.targetMinutes,
      actualMinutes: summary.actualMinutes,
      balanceMinutes: summary.balanceMinutes,
      estimatedGrossAmount: pay.estimatedGrossAmount,
      premiumAmount: monthPremiumAmount,
      criticalCount: compliance.criticalCount,
      warningCount: compliance.warningCount,
    }));
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
