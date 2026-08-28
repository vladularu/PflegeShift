import { Temporal } from "@js-temporal/polyfill";

import type { CalendarEntry, MonthlyTariffDecision } from "@/domain/types";
import {
  getLegalCalculationWindow,
  getTariffAssessmentLookbackMonths,
} from "@/rules/calculation-windows";
import { bundledRuleResolver, type RuleResolver } from "@/rules/rule-resolver";

export interface AnnualReportInputs {
  readonly entries: readonly CalendarEntry[];
  readonly tariffDecisions: readonly MonthlyTariffDecision[];
  readonly year: number;
  readonly rangeStart: string;
  readonly rangeEnd: string;
}

function sameItems<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

export function selectAnnualReportInputs(
  previous: AnnualReportInputs | null,
  year: number,
  entries: readonly CalendarEntry[],
  tariffDecisions: readonly MonthlyTariffDecision[],
  ruleResolver: RuleResolver = bundledRuleResolver,
): AnnualReportInputs {
  let rangeStart = Temporal.PlainDate.from({ year, month: 1, day: 1 });
  let rangeEnd = Temporal.PlainDate.from({ year, month: 12, day: 31 });
  for (let month = 1; month <= 12; month += 1) {
    const first = Temporal.PlainDate.from({ year, month, day: 1 });
    const legalWindow = getLegalCalculationWindow(first.toString(), ruleResolver);
    const allowanceStart = first.subtract({
      months: getTariffAssessmentLookbackMonths(first.toString(), ruleResolver),
    });
    const complianceStart = first.subtract({ days: legalWindow.lookbackDays });
    const baseComplianceEnd = first
      .add({ months: 1 })
      .subtract({ days: 1 })
      .add({ days: legalWindow.lookaheadDays });
    const yearStart = Temporal.PlainDate.from({ year: first.year, month: 1, day: 1 });
    const yearEnd = Temporal.PlainDate.from({ year: first.year, month: 12, day: 31 });
    const legalComplianceStart =
      legalWindow.calendarYearCoverage && Temporal.PlainDate.compare(yearStart, complianceStart) < 0
        ? yearStart
        : complianceStart;
    const complianceEnd =
      legalWindow.calendarYearCoverage && Temporal.PlainDate.compare(yearEnd, baseComplianceEnd) > 0
        ? yearEnd
        : baseComplianceEnd;
    if (Temporal.PlainDate.compare(allowanceStart, rangeStart) < 0) {
      rangeStart = allowanceStart;
    }
    if (Temporal.PlainDate.compare(legalComplianceStart, rangeStart) < 0) {
      rangeStart = legalComplianceStart;
    }
    if (Temporal.PlainDate.compare(complianceEnd, rangeEnd) > 0) {
      rangeEnd = complianceEnd;
    }
  }
  const rangeStartValue = rangeStart.toString();
  const rangeEndValue = rangeEnd.toString();
  const selectedEntries = entries.filter(
    (entry) => entry.date >= rangeStartValue && entry.date <= rangeEndValue,
  );
  const selectedDecisions = tariffDecisions.filter((decision) =>
    decision.month.startsWith(`${year}-`),
  );
  const canReuse =
    previous?.year === year &&
    previous.rangeStart === rangeStartValue &&
    previous.rangeEnd === rangeEndValue;
  const stableEntries =
    canReuse && sameItems(previous.entries, selectedEntries)
      ? previous.entries
      : Object.freeze(selectedEntries);
  const stableDecisions =
    canReuse && sameItems(previous.tariffDecisions, selectedDecisions)
      ? previous.tariffDecisions
      : Object.freeze(selectedDecisions);

  if (
    previous !== null &&
    canReuse &&
    previous.entries === stableEntries &&
    previous.tariffDecisions === stableDecisions
  ) {
    return previous;
  }

  return {
    year,
    entries: stableEntries,
    tariffDecisions: stableDecisions,
    rangeStart: rangeStartValue,
    rangeEnd: rangeEndValue,
  };
}
