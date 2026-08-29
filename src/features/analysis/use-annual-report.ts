import { useCallback, useEffect, useRef, useState } from "react";

import type {
  CalendarEntry,
  MonthlyTariffDecision,
  TvoedWorkPatternSettings,
  UserProfile,
} from "@/domain/types";
import { buildAnnualAvailableReportSteps } from "@/features/analysis/annual-core-report";
import type { AnnualReport } from "@/features/analysis/annual-report";
import type { RuleComputationFailure } from "@/features/analysis/rule-computation";
import { useLocalReferenceDate } from "@/features/analysis/use-local-reference-date";
import { bundledRuleResolver, type RuleResolver } from "@/rules/rule-resolver";
import { scheduleIdleWork } from "@/ui/schedule-idle-work";

interface AnnualReportState {
  readonly entries: readonly CalendarEntry[];
  readonly error: string | null;
  readonly fatalError: Error | null;
  readonly profile: UserProfile;
  readonly referenceDate: string;
  readonly report: AnnualReport | null;
  readonly ruleFailure: RuleComputationFailure | null;
  readonly ruleResolver: RuleResolver;
  readonly tariffDecisions: readonly MonthlyTariffDecision[];
  readonly workPatternSettings: TvoedWorkPatternSettings;
  readonly year: number;
}

interface DeferredAnnualReportResult {
  readonly error: string | null;
  readonly fatalError: Error | null;
  readonly report: AnnualReport | null;
  readonly ruleFailure: RuleComputationFailure | null;
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
  const requestRevision = useRef(0);
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
    requestRevision.current += 1;
    const currentRequest = requestRevision.current;
    const steps = buildAnnualAvailableReportSteps(
      year,
      entries,
      profile,
      tariffDecisions,
      workPatternSettings,
      referenceDate,
      ruleResolver,
    );
    const advance = () => {
      try {
        const step = steps.next();
        if (!active || requestRevision.current !== currentRequest) return;
        if (step.done) {
          setState({
            entries,
            error: null,
            fatalError: null,
            profile,
            referenceDate,
            report: step.value,
            ruleFailure: null,
            ruleResolver,
            tariffDecisions,
            workPatternSettings,
            year,
          });
        } else {
          cancelScheduledWork = scheduleIdleWork(advance);
        }
      } catch (reportError) {
        const fatalError =
          reportError instanceof Error
            ? reportError
            : new Error("Annual report computation failed.");
        if (active) {
          setState({
            entries,
            error: null,
            fatalError,
            profile,
            referenceDate,
            report: null,
            ruleFailure: null,
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
    fatalError: matchesRequest ? state.fatalError : null,
    report: matchesRequest ? state.report : null,
    ruleFailure: matchesRequest ? state.ruleFailure : null,
    retry,
  };
}
