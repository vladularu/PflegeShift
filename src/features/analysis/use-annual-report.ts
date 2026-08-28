import { useCallback, useEffect, useRef, useState } from "react";

import type {
  CalendarEntry,
  MonthlyTariffDecision,
  TvoedWorkPatternSettings,
  UserProfile,
} from "@/domain/types";
import {
  buildAnnualReportSteps,
  createAnnualReportComputationCache,
  type AnnualReport,
} from "@/features/analysis/annual-report";
import { useLocalReferenceDate } from "@/features/analysis/use-local-reference-date";
import { recordDiagnostic } from "@/infrastructure/diagnostics";
import { bundledRuleResolver, type RuleResolver } from "@/rules/rule-resolver";
import { scheduleIdleWork } from "@/ui/schedule-idle-work";

interface AnnualReportState {
  readonly entries: readonly CalendarEntry[];
  readonly error: string | null;
  readonly profile: UserProfile;
  readonly referenceDate: string;
  readonly report: AnnualReport | null;
  readonly ruleResolver: RuleResolver;
  readonly tariffDecisions: readonly MonthlyTariffDecision[];
  readonly workPatternSettings: TvoedWorkPatternSettings;
  readonly year: number;
}

interface DeferredAnnualReportResult {
  readonly error: string | null;
  readonly report: AnnualReport | null;
  readonly retry: () => void;
}

export function useDeferredAnnualReport({
  enabled,
  entries,
  profile,
  ruleResolver = bundledRuleResolver,
  tariffDecisions,
  workPatternSettings,
  year,
}: {
  readonly enabled: boolean;
  readonly entries: readonly CalendarEntry[];
  readonly profile: UserProfile | null;
  readonly ruleResolver?: RuleResolver;
  readonly tariffDecisions: readonly MonthlyTariffDecision[];
  readonly workPatternSettings: TvoedWorkPatternSettings;
  readonly year: number;
}): DeferredAnnualReportResult {
  const [retryRevision, setRetryRevision] = useState(0);
  const [state, setState] = useState<AnnualReportState | null>(null);
  const cache = useRef(createAnnualReportComputationCache());
  const retry = useCallback(() => setRetryRevision((value) => value + 1), []);
  const referenceDate = useLocalReferenceDate(profile?.timeZone ?? "Europe/Berlin");

  const matchesRequest =
    state !== null &&
    profile !== null &&
    state.entries === entries &&
    state.profile === profile &&
    state.referenceDate === referenceDate &&
    state.ruleResolver === ruleResolver &&
    state.tariffDecisions === tariffDecisions &&
    state.workPatternSettings === workPatternSettings &&
    state.year === year;
  const completedRequest = matchesRequest && state.report !== null && state.error === null;

  useEffect(() => {
    if (!enabled || profile === null || completedRequest) return;
    let active = true;
    let cancelScheduledWork = () => {};
    const steps = buildAnnualReportSteps(
      year,
      entries,
      profile,
      tariffDecisions,
      workPatternSettings,
      cache.current,
      referenceDate,
      ruleResolver,
    );
    const advance = () => {
      try {
        const step = steps.next();
        if (!active) return;
        if (step.done) {
          setState({
            entries,
            error: null,
            profile,
            referenceDate,
            report: step.value,
            ruleResolver,
            tariffDecisions,
            workPatternSettings,
            year,
          });
        } else {
          cancelScheduledWork = scheduleIdleWork(advance);
        }
      } catch (reportError) {
        recordDiagnostic("reporting", "ANNUAL_REPORT_FAILED", reportError);
        if (active) {
          setState({
            entries,
            error: "Die Jahresauswertung konnte nicht berechnet werden.",
            profile,
            referenceDate,
            report: null,
            ruleResolver,
            tariffDecisions,
            workPatternSettings,
            year,
          });
        }
      }
    };
    cancelScheduledWork = scheduleIdleWork(advance);
    return () => {
      active = false;
      cancelScheduledWork();
    };
  }, [
    completedRequest,
    enabled,
    entries,
    profile,
    referenceDate,
    retryRevision,
    ruleResolver,
    tariffDecisions,
    workPatternSettings,
    year,
  ]);

  return {
    error: matchesRequest ? state.error : null,
    report: matchesRequest ? state.report : null,
    retry,
  };
}
