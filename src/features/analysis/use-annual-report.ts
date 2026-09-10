import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  readonly inputKey: string;
  readonly error: string | null;
  readonly fatalError: Error | null;
  readonly report: AnnualReport | null;
  readonly ruleFailure: RuleComputationFailure | null;
  readonly ruleResolver: RuleResolver;
  readonly year: number;
}

interface DeferredAnnualReportResult {
  readonly error: string | null;
  readonly fatalError: Error | null;
  readonly report: AnnualReport | null;
  readonly ruleFailure: RuleComputationFailure | null;
  readonly retry: () => void;
}

function canonicalize(value: Record<string, unknown>): string {
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
  const [states, setStates] = useState<readonly AnnualReportState[]>([]);
  const requestRevision = useRef(0);
  const retry = useCallback(() => setRetryRevision((value) => value + 1), []);
  const referenceDate = useLocalReferenceDate(profile?.timeZone ?? "Europe/Berlin");
  // Database reloads create new objects. Compare complete values, not identity or
  // revision alone: template joins and restores can change values at the same revision.
  // Keep this key in memory only; no diagnostic log or persistent cache.
  const inputKey = useMemo(
    () =>
      enabled
        ? canonicalize({
            entries,
            profile,
            tariffDecisions,
            workPatternSettings,
            year,
            referenceDate,
          })
        : null,
    [enabled, entries, profile, tariffDecisions, workPatternSettings, year, referenceDate],
  );

  const state = states.find(
    (item) =>
      profile !== null &&
      item.inputKey === inputKey &&
      item.ruleResolver === ruleResolver &&
      item.year === year,
  );
  const completedRequest = state !== undefined && state.report !== null && state.error === null;

  useEffect(() => {
    if (!enabled || profile === null || inputKey === null || completedRequest) return;
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
        if (!active || requestRevision.current !== currentRequest) return;
        // Amortize idle callbacks, but yield back to input/rendering after a small slice.
        // The step cap also bounds work with coarse/fake clocks.
        const deadline = performance.now() + 4;
        let step = steps.next();
        let count = 1;
        while (!step.done && count < 32 && performance.now() < deadline) {
          step = steps.next();
          count += 1;
        }
        if (!active || requestRevision.current !== currentRequest) return;
        if (step.done) {
          const next: AnnualReportState = {
            inputKey,
            error: null,
            fatalError: null,
            report: step.value,
            ruleFailure: null,
            ruleResolver,
            year,
          };
          setStates((previous) =>
            [next, ...previous.filter((item) => item.year !== year)].slice(0, 3),
          );
        } else {
          cancelScheduledWork = scheduleIdleWork(advance);
        }
      } catch (reportError) {
        const fatalError =
          reportError instanceof Error
            ? reportError
            : new Error("Annual report computation failed.");
        if (active) {
          const next: AnnualReportState = {
            inputKey,
            error: null,
            fatalError,
            report: null,
            ruleFailure: null,
            ruleResolver,
            year,
          };
          setStates((previous) =>
            [next, ...previous.filter((item) => item.year !== year)].slice(0, 3),
          );
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
    inputKey,
    profile,
    referenceDate,
    retryRevision,
    ruleResolver,
    tariffDecisions,
    workPatternSettings,
    year,
  ]);

  return {
    error: state?.error ?? null,
    fatalError: state?.fatalError ?? null,
    report: state?.report ?? null,
    ruleFailure: state?.ruleFailure ?? null,
    retry,
  };
}
