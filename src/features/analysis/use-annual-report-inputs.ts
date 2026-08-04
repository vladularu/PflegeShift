import { useEffect, useMemo, useState } from "react";

import type { CalendarEntry, MonthlyTariffDecision } from "@/domain/types";
import {
  selectAnnualReportInputs,
  type AnnualReportInputs,
} from "@/features/analysis/annual-report-inputs";

export function useAnnualReportInputs(
  year: number,
  entries: readonly CalendarEntry[],
  tariffDecisions: readonly MonthlyTariffDecision[],
): AnnualReportInputs {
  const [committed, setCommitted] = useState<AnnualReportInputs | null>(null);
  const selected = useMemo(
    () => selectAnnualReportInputs(committed, year, entries, tariffDecisions),
    [committed, entries, tariffDecisions, year],
  );

  useEffect(() => {
    setCommitted((current) => (current === selected ? current : selected));
  }, [selected]);

  return selected;
}
