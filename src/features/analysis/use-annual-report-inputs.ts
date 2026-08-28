import { useEffect, useMemo, useState } from "react";

import type { CalendarEntry, MonthlyTariffDecision } from "@/domain/types";
import {
  selectAnnualReportInputs,
  type AnnualReportInputs,
} from "@/features/analysis/annual-report-inputs";
import { bundledRuleResolver, type RuleResolver } from "@/rules/rule-resolver";

export function useAnnualReportInputs(
  year: number,
  entries: readonly CalendarEntry[],
  tariffDecisions: readonly MonthlyTariffDecision[],
  ruleResolver: RuleResolver = bundledRuleResolver,
): AnnualReportInputs {
  const [committed, setCommitted] = useState<AnnualReportInputs | null>(null);
  const selected = useMemo(
    () => selectAnnualReportInputs(committed, year, entries, tariffDecisions, ruleResolver),
    [committed, entries, ruleResolver, tariffDecisions, year],
  );

  useEffect(() => {
    setCommitted((current) => (current === selected ? current : selected));
  }, [selected]);

  return selected;
}
