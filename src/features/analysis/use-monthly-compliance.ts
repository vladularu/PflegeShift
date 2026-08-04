import { useCallback, useEffect, useState } from "react";

import type { MonthlyComplianceResult, ShiftEntry, UserProfile } from "@/domain/types";
import { calculateMonthlyComplianceSteps } from "@/engine/compliance";
import { useLocalReferenceDate } from "@/features/analysis/use-local-reference-date";
import { scheduleIdleWork } from "@/ui/schedule-idle-work";
import { recordDiagnostic } from "@/infrastructure/diagnostics";

interface MonthlyComplianceState {
  readonly error: string | null;
  readonly month: string;
  readonly profile: UserProfile;
  readonly referenceDate: string;
  readonly result: MonthlyComplianceResult | null;
  readonly shifts: readonly ShiftEntry[];
}

interface DeferredMonthlyComplianceResult {
  readonly error: string | null;
  readonly result: MonthlyComplianceResult | null;
  readonly retry: () => void;
}

export function useDeferredMonthlyCompliance({
  enabled,
  month,
  profile,
  shifts,
}: {
  readonly enabled: boolean;
  readonly month: string;
  readonly profile: UserProfile | null;
  readonly shifts: readonly ShiftEntry[];
}): DeferredMonthlyComplianceResult {
  const [retryRevision, setRetryRevision] = useState(0);
  const [state, setState] = useState<MonthlyComplianceState | null>(null);
  const retry = useCallback(() => setRetryRevision((value) => value + 1), []);
  const referenceDate = useLocalReferenceDate(profile?.timeZone ?? "Europe/Berlin");
  const matchesRequest =
    state !== null &&
    profile !== null &&
    state.month === month &&
    state.profile === profile &&
    state.referenceDate === referenceDate &&
    state.shifts === shifts;
  const completedRequest = matchesRequest && state.result !== null && state.error === null;

  useEffect(() => {
    if (!enabled || profile === null || completedRequest) return;
    let active = true;
    let cancelScheduledWork = () => {};
    const steps = calculateMonthlyComplianceSteps(month, shifts, profile.timeZone, {
      federalState: profile.federalState,
      weeklyMinutes: profile.weeklyMinutes,
      referenceDate,
    });
    const advance = () => {
      try {
        const step = steps.next();
        if (!active) return;
        if (step.done) {
          setState({
            error: null,
            month,
            profile,
            referenceDate,
            result: step.value,
            shifts,
          });
        } else {
          cancelScheduledWork = scheduleIdleWork(advance);
        }
      } catch (complianceError) {
        recordDiagnostic("reporting", "MONTHLY_COMPLIANCE_FAILED", complianceError);
        if (active) {
          setState({
            error: "Die Arbeitszeitprüfung konnte nicht berechnet werden.",
            month,
            profile,
            referenceDate,
            result: null,
            shifts,
          });
        }
      }
    };
    cancelScheduledWork = scheduleIdleWork(advance);
    return () => {
      active = false;
      cancelScheduledWork();
    };
  }, [completedRequest, enabled, month, profile, referenceDate, retryRevision, shifts]);

  return {
    error: matchesRequest ? state.error : null,
    result: matchesRequest ? state.result : null,
    retry,
  };
}
