import type {
  CalendarEntry,
  MonthlyComplianceResult,
  MonthlyPayEstimate,
  MonthlySummary,
  MonthlyTariffDecision,
  ShiftEntry,
  ShiftType,
  TvoedWorkPatternSettings,
  UserProfile,
} from "@/domain/types";
import { calculateMonthlyComplianceSteps } from "@/engine/compliance";
import { calculateMonthlySummary } from "@/engine/monthly-summary";
import { calculateMonthlyPayEstimate } from "@/engine/pay";
import {
  selectAllowanceShifts,
  selectComplianceShifts,
  selectMonthlyAnalysisEntries,
} from "@/features/analysis/analysis-data";
import { buildMonthlyTimedShiftTypeAnalysis } from "@/features/analysis/analysis-metrics";
import type { AnnualMonthReport, AnnualReport } from "@/features/analysis/annual-report";
import { classifyChecks } from "./check-visibility";
import { buildShiftTypeDistribution } from "@/features/calendar/calendar-metrics";
import {
  requireResolvedPackage,
  RuleResolutionError,
  type RuleResolver,
} from "@/rules/rule-resolver";

const ABSENCE_TYPES = new Set<ShiftType>(["VACATION", "SICK", "FREE"]);

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function captureRuleValue<T>(calculate: () => T): T | null {
  try {
    return calculate();
  } catch (error) {
    if (error instanceof RuleResolutionError) return null;
    throw error;
  }
}

export function buildAnnualCoreReport(
  year: number,
  entries: readonly CalendarEntry[],
  profile: Pick<UserProfile, "timeZone">,
): AnnualReport {
  const distribution = new Map<ShiftType, number>();
  const months: AnnualMonthReport[] = [];
  let actualMinutes = 0;
  let workMinutes = 0;
  let trainingMinutes = 0;
  let vacationDays = 0;
  let sickDays = 0;
  let freeDays = 0;
  let entryCount = 0;
  let activeMonthCount = 0;

  for (let monthIndex = 1; monthIndex <= 12; monthIndex += 1) {
    const month = `${year}-${String(monthIndex).padStart(2, "0")}`;
    const monthEntries = entries.filter(
      (entry) => entry.deletedAt === null && entry.date.startsWith(`${month}-`),
    );
    const shifts = monthEntries.filter((entry): entry is ShiftEntry => entry.kind === "SHIFT");
    const timed = buildMonthlyTimedShiftTypeAnalysis(month, monthEntries, profile);
    const monthDistribution = buildShiftTypeDistribution(month, monthEntries);
    for (const [type, count] of monthDistribution) {
      distribution.set(type, (distribution.get(type) ?? 0) + count);
    }
    const monthWorkMinutes = timed.items
      .filter((item) => item.type !== "TRAINING" && !ABSENCE_TYPES.has(item.type))
      .reduce((sum, item) => sum + item.minutes, 0);
    const monthTrainingMinutes = timed.items.find((item) => item.type === "TRAINING")?.minutes ?? 0;
    const monthActualMinutes = monthWorkMinutes + monthTrainingMinutes;

    actualMinutes += monthActualMinutes;
    workMinutes += monthWorkMinutes;
    trainingMinutes += monthTrainingMinutes;
    vacationDays += shifts.filter((shift) => shift.type === "VACATION").length;
    sickDays += shifts.filter((shift) => shift.type === "SICK").length;
    freeDays += shifts.filter((shift) => shift.type === "FREE").length;
    entryCount += monthEntries.length;
    if (monthEntries.length > 0) activeMonthCount += 1;
    months.push(
      Object.freeze({
        month,
        entryCount: monthEntries.length,
        targetMinutes: null,
        actualMinutes: monthActualMinutes,
        balanceMinutes: null,
        estimatedGrossAmount: null,
        premiumAmount: 0,
        criticalCount: 0,
        warningCount: 0,
      }),
    );
  }

  return Object.freeze({
    year,
    months: Object.freeze(months),
    targetMinutes: null,
    actualMinutes,
    balanceMinutes: null,
    workMinutes,
    trainingMinutes,
    vacationDays,
    sickDays,
    freeDays,
    entryCount,
    activeMonthCount,
    availablePayMonthCount: 0,
    estimatedGrossAmount: 0,
    premiumAmount: 0,
    overtimeAmount: 0,
    allowanceAmount: 0,
    criticalCount: 0,
    warningCount: 0,
    distribution,
    worktimeCoverageComplete: false,
    complianceCoverageComplete: false,
  });
}

interface AvailableMonthCalculation {
  readonly compliance: MonthlyComplianceResult | null;
  readonly pay: MonthlyPayEstimate | null;
  readonly summary: MonthlySummary | null;
}

interface CachedPart<T> {
  readonly key: string;
  readonly value: T;
}

interface AvailableMonthCache {
  summary?: CachedPart<MonthlySummary | null>;
  compliance?: CachedPart<MonthlyComplianceResult | null>;
  pay?: CachedPart<MonthlyPayEstimate | null>;
}

export function createAnnualAvailableReportCache() {
  return new WeakMap<RuleResolver, Map<string, AvailableMonthCache>>();
}

export function annualInputKey(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) return item;
    const record = item as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, record[key]]),
    );
  });
}

interface AnnualComputationOptions {
  readonly cache?: ReturnType<typeof createAnnualAvailableReportCache>;
  readonly onCore?: (report: AnnualReport) => void;
}

function* calculateAvailableMonth(
  month: string,
  entries: readonly CalendarEntry[],
  profile: UserProfile,
  decision: MonthlyTariffDecision | null,
  workPatternSettings: TvoedWorkPatternSettings,
  referenceDate: string,
  ruleResolver: RuleResolver,
  cached: AvailableMonthCache,
): Generator<number, AvailableMonthCalculation, void> {
  const monthlyEntries = selectMonthlyAnalysisEntries(entries, month);
  const summaryKey = annualInputKey([monthlyEntries.monthShifts, profile]);
  const summary =
    cached.summary?.key === summaryKey
      ? cached.summary.value
      : captureRuleValue(() =>
          calculateMonthlySummary(month, monthlyEntries.monthShifts, profile, ruleResolver),
        );
  cached.summary = { key: summaryKey, value: summary };
  yield 1;

  let compliance: MonthlyComplianceResult | null = null;
  const complianceShifts = captureRuleValue(() => {
    requireResolvedPackage(ruleResolver.resolveHoliday(`${month}-01`));
    return selectComplianceShifts(entries, month, ruleResolver);
  });
  // Use the engine's complete legal window, not merely the edited month.
  const complianceKey = annualInputKey([complianceShifts, profile, referenceDate]);
  if (cached.compliance?.key === complianceKey) {
    compliance = cached.compliance.value;
  } else if (complianceShifts !== null) {
    try {
      const steps = calculateMonthlyComplianceSteps(month, complianceShifts, profile.timeZone, {
        federalState: profile.federalState,
        holidayRegion: profile.holidayRegion,
        referenceDate,
        ruleResolver,
        weeklyMinutes: profile.weeklyMinutes,
        regularRotatingNightWork: profile.regularRotatingNightWork,
        sundayHolidayWorkEligible: profile.sundayHolidayWorkEligible,
        allEmploymentWorkRecorded: profile.allEmploymentWorkRecorded,
      });
      while (true) {
        const step = steps.next();
        if (step.done) {
          compliance = step.value;
          break;
        }
        yield 2;
      }
    } catch (error) {
      if (!(error instanceof RuleResolutionError)) throw error;
    }
  }
  cached.compliance = { key: complianceKey, value: compliance };
  yield 2;

  const allowanceShifts = captureRuleValue(() =>
    profile.tariff === null
      ? monthlyEntries.monthShifts
      : selectAllowanceShifts(entries, month, ruleResolver),
  );
  const payKey = annualInputKey([
    monthlyEntries.monthShifts,
    allowanceShifts,
    profile,
    decision,
    workPatternSettings,
  ]);
  const pay =
    cached.pay?.key === payKey
      ? cached.pay.value
      : captureRuleValue(() => {
          if (allowanceShifts === null) return null;
          return calculateMonthlyPayEstimate(
            month,
            monthlyEntries.monthShifts,
            profile,
            decision,
            allowanceShifts,
            workPatternSettings,
            ruleResolver,
          );
        });
  cached.pay = { key: payKey, value: pay };
  yield 3;

  return { compliance, pay, summary };
}

export function* buildAnnualAvailableReportSteps(
  year: number,
  entries: readonly CalendarEntry[],
  profile: UserProfile,
  tariffDecisions: readonly MonthlyTariffDecision[],
  workPatternSettings: TvoedWorkPatternSettings,
  referenceDate: string,
  ruleResolver: RuleResolver,
  options: AnnualComputationOptions = {},
): Generator<number, AnnualReport, void> {
  if (!Number.isInteger(year) || year < 1900 || year > 4099) {
    throw new Error("Ungültiges Berichtsjahr.");
  }
  const core = buildAnnualCoreReport(year, entries, profile);
  options.onCore?.(core);
  // Explicit paint boundary: do not start legal work in the core's scheduler slice.
  yield 0;
  const monthsCache = options.cache?.get(ruleResolver) ?? new Map<string, AvailableMonthCache>();
  options.cache?.set(ruleResolver, monthsCache);
  const decisions = new Map(tariffDecisions.map((item) => [item.month, item]));
  const months: AnnualMonthReport[] = [];
  let targetMinutes = 0;
  let summaryActualMinutes = 0;
  let estimatedGrossAmount = 0;
  let premiumAmount = 0;
  let overtimeAmount = 0;
  let allowanceAmount = 0;
  let criticalCount = 0;
  let warningCount = 0;
  let availablePayMonthCount = 0;
  let worktimeCoverageComplete = true;
  let complianceCoverageComplete = true;

  for (const coreMonth of core.months) {
    const cached = monthsCache.get(coreMonth.month) ?? {};
    if (!monthsCache.has(coreMonth.month) && monthsCache.size >= 36) {
      monthsCache.delete(monthsCache.keys().next().value!);
    }
    monthsCache.set(coreMonth.month, cached);
    const calculation = calculateAvailableMonth(
      coreMonth.month,
      entries,
      profile,
      decisions.get(coreMonth.month) ?? null,
      workPatternSettings,
      referenceDate,
      ruleResolver,
      cached,
    );
    let available: AvailableMonthCalculation;
    while (true) {
      const step = calculation.next();
      if (step.done) {
        available = step.value;
        break;
      }
      yield step.value;
    }

    worktimeCoverageComplete &&= available.summary !== null;
    complianceCoverageComplete &&= available.compliance !== null;
    if (available.summary !== null) {
      targetMinutes += available.summary.targetMinutes;
      summaryActualMinutes += available.summary.actualMinutes;
    }
    if (available.compliance !== null) {
      criticalCount += available.compliance.criticalCount;
      warningCount += available.compliance.warningCount;
    }
    const payAvailable =
      available.pay?.available === true && available.pay.estimatedGrossAmount !== null;
    if (payAvailable && available.pay !== null) {
      availablePayMonthCount += 1;
      estimatedGrossAmount += available.pay.estimatedGrossAmount ?? 0;
      premiumAmount += available.pay.timePremiumAmount;
      overtimeAmount += available.pay.overtimeAmount;
      allowanceAmount +=
        available.pay.allowanceAmount +
        available.pay.tvoedAllowanceAmount +
        available.pay.careAllowanceAmount;
    }
    months.push(
      Object.freeze({
        ...coreMonth,
        targetMinutes: available.summary?.targetMinutes ?? null,
        actualMinutes: available.summary?.actualMinutes ?? coreMonth.actualMinutes,
        balanceMinutes: available.summary?.balanceMinutes ?? null,
        estimatedGrossAmount: payAvailable ? (available.pay?.estimatedGrossAmount ?? null) : null,
        premiumAmount: payAvailable
          ? (available.pay?.timePremiumAmount ?? 0) +
            (available.pay?.overtimeAmount ?? 0) +
            (available.pay?.allowanceAmount ?? 0) +
            (available.pay?.tvoedAllowanceAmount ?? 0) +
            (available.pay?.careAllowanceAmount ?? 0)
          : 0,
        criticalCount: available.compliance?.criticalCount ?? 0,
        warningCount: available.compliance?.warningCount ?? 0,
        infoCount: available.compliance?.infoCount ?? 0,
        checkCounts: classifyChecks(available.compliance?.issues ?? []),
      }),
    );
    yield 4;
  }

  const actualMinutes = worktimeCoverageComplete ? summaryActualMinutes : core.actualMinutes;
  return Object.freeze({
    ...core,
    months: Object.freeze(months),
    targetMinutes: worktimeCoverageComplete ? targetMinutes : null,
    actualMinutes,
    balanceMinutes: worktimeCoverageComplete ? actualMinutes - targetMinutes : null,
    availablePayMonthCount,
    estimatedGrossAmount: roundMoney(estimatedGrossAmount),
    premiumAmount: roundMoney(premiumAmount),
    overtimeAmount: roundMoney(overtimeAmount),
    allowanceAmount: roundMoney(allowanceAmount),
    criticalCount,
    warningCount,
    worktimeCoverageComplete,
    complianceCoverageComplete,
  });
}
