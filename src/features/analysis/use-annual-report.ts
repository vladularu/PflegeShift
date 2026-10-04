import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRemunerationData } from "@/application/remuneration-provider";
import { activeActualOwnAnnualPayments } from "@/domain/saved-annual-payment";
import { useTrainingData } from "@/application/training-provider";
import { usePflegeShiftEntries } from "@/application/pflegeshift-provider";
import type { AnnualRemunerationInput } from "./annual-remuneration";

import type {
  CalendarEntry,
  ShiftEntry,
  MonthlyTariffDecision,
  TvoedWorkPatternSettings,
  UserProfile,
} from "@/domain/types";
import {
  annualInputKey,
  buildAnnualAvailableReportSteps,
  createAnnualAvailableReportCache,
} from "@/features/analysis/annual-core-report";
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
  readonly coreReport: AnnualReport | null;
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
  const history = useRemunerationData();
  const trainingData = useTrainingData();
  const { entries: loadedEntries } = usePflegeShiftEntries();
  const remuneration = useMemo<AnnualRemunerationInput>(
    () => ({
      status: history.status,
      profiles: history.profiles,
      allowanceDecisions: history.allowanceDecisions,
      overtimeAllocations: history.overtimeAllocations,
      paidAbsences: history.paidAbsences,
      actualAnnualPayments: activeActualOwnAnnualPayments(history.actualAnnualPayments),
      tariffAnnualClaims: history.tariffAnnualClaims,
      tvlShiftWork: history.tvlShiftWork,
      savedAnnexAConfirmations: history.tvoedAnnexAMonthConfirmations,
      savedAnnexAPremiumFacts: history.tvoedAnnexAPremiumFacts,
      annexAPauseDetails: trainingData.shifts,
      annexAPauseDetailsComplete: trainingData.status === "ready",
      savedSueConfirmations: history.tvoedSueMonthConfirmations,
      savedSueAllowanceConfirmations: history.tvoedSueAllowanceConfirmations,
      shifts: loadedEntries.filter(
        (entry): entry is ShiftEntry => entry.kind === "SHIFT" && entry.deletedAt === null,
      ),
    }),
    [
      history.status,
      history.profiles,
      history.allowanceDecisions,
      history.overtimeAllocations,
      history.paidAbsences,
      history.actualAnnualPayments,
      history.tariffAnnualClaims,
      history.tvlShiftWork,
      history.tvoedAnnexAMonthConfirmations,
      history.tvoedAnnexAPremiumFacts,
      trainingData.shifts,
      trainingData.status,
      history.tvoedSueMonthConfirmations,
      history.tvoedSueAllowanceConfirmations,
      loadedEntries,
    ],
  );
  const training = useMemo(
    () => ({
      data: {
        status: trainingData.status,
        error: trainingData.error,
        profiles: trainingData.profiles,
        shifts: trainingData.shifts,
      },
      shifts: remuneration.shifts,
    }),
    [
      trainingData.status,
      trainingData.error,
      trainingData.profiles,
      trainingData.shifts,
      remuneration.shifts,
    ],
  );
  const [retryRevision, setRetryRevision] = useState(0);
  const [states, setStates] = useState<readonly AnnualReportState[]>([]);
  const [coreState, setCoreState] = useState<AnnualReportState | null>(null);
  const [computationCache] = useState(createAnnualAvailableReportCache);
  const requestRevision = useRef(0);
  const retry = useCallback(() => setRetryRevision((value) => value + 1), []);
  const referenceDate = useLocalReferenceDate(profile?.timeZone ?? "Europe/Berlin");
  // Database reloads create new objects. Compare complete values, not identity or
  // revision alone: template joins and restores can change values at the same revision.
  // Keep this key in memory only; no diagnostic log or persistent cache.
  const inputKey = useMemo(
    () =>
      enabled
        ? annualInputKey({
            entries,
            profile,
            tariffDecisions,
            workPatternSettings,
            year,
            referenceDate,
            remuneration,
            training,
          })
        : null,
    [
      enabled,
      entries,
      profile,
      tariffDecisions,
      workPatternSettings,
      year,
      referenceDate,
      remuneration,
      training,
    ],
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
      {
        cache: computationCache,
        remuneration,
        training,
        onCore: (report) => {
          if (!active || requestRevision.current !== currentRequest) return;
          setCoreState({
            inputKey,
            report,
            year,
            ruleResolver,
            error: null,
            fatalError: null,
            ruleFailure: null,
          });
        },
      },
    );
    const advance = () => {
      try {
        if (!active || requestRevision.current !== currentRequest) return;
        // Amortize idle callbacks, but yield back to input/rendering after a small slice.
        // The step cap also bounds work with coarse/fake clocks.
        const deadline = performance.now() + 4;
        let step = steps.next();
        let count = 1;
        while (!step.done && step.value !== 0 && count < 32 && performance.now() < deadline) {
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
    computationCache,
    completedRequest,
    enabled,
    entries,
    inputKey,
    profile,
    referenceDate,
    retryRevision,
    remuneration,
    training,
    ruleResolver,
    tariffDecisions,
    workPatternSettings,
    year,
  ]);

  return {
    coreReport:
      coreState?.inputKey === inputKey && coreState?.ruleResolver === ruleResolver
        ? coreState.report
        : null,
    error: state?.error ?? null,
    fatalError: state?.fatalError ?? null,
    report: state?.report ?? null,
    ruleFailure: state?.ruleFailure ?? null,
    retry,
  };
}
