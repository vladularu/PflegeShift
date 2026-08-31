import { useEffect, useMemo, useState } from "react";

import type { CalendarEntry, MonthlyTariffDecision } from "@/domain/types";
import {
  selectAnnualReportInputs,
  type AnnualReportInputs,
} from "@/features/analysis/annual-report-inputs";
import {
  captureRuleComputation,
  type RuleComputationResult,
} from "@/features/analysis/rule-computation";
import { bundledRuleResolver, type RuleResolver } from "@/rules/rule-resolver";

export function useAnnualReportInputs(
  year: number,
  entries: readonly CalendarEntry[],
  tariffDecisions: readonly MonthlyTariffDecision[],
  ruleResolver: RuleResolver = bundledRuleResolver,
  enabled = true,
  retryRevision = 0,
): RuleComputationResult<AnnualReportInputs> | null {
  const [committed, setCommitted] = useState<AnnualReportInputs | null>(null);
  const selected = useMemo(() => {
    void retryRevision;
    return enabled
      ? captureRuleComputation(() =>
          selectAnnualReportInputs(committed, year, entries, tariffDecisions, ruleResolver),
        )
      : null;
  }, [committed, enabled, entries, retryRevision, ruleResolver, tariffDecisions, year]);

  useEffect(() => {
    if (selected?.ok) {
      setCommitted((current) => (current === selected.value ? current : selected.value));
    }
  }, [selected]);

  return selected;
}
