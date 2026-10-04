import { useMemo } from "react";
import {
  usePflegeShiftEntries,
  usePflegeShiftProfile,
  usePflegeShiftStatus,
  usePflegeShiftTariff,
} from "@/application/pflegeshift-provider";
import { useRemunerationData } from "@/application/remuneration-provider";
import { useRuleCatalogRuntime } from "@/application/rule-catalog-runtime-provider";
import { useTrainingData } from "@/application/training-provider";
import type { ShiftEntry } from "@/domain/types";
import { activeActualOwnAnnualPayments } from "@/domain/saved-annual-payment";
import { calculateAssessedMonthlyRemuneration } from "@/engine/remuneration-month";
import { captureRuleComputation } from "./rule-computation";

/** Shared read-only adapter. Retains carry-in shifts and tariff-specific lookback. */
export function useMonthlyRemuneration(month: string, enabled = true) {
  const { entries } = usePflegeShiftEntries();
  const { profile } = usePflegeShiftProfile();
  const root = usePflegeShiftStatus();
  const history = useRemunerationData();
  const training = useTrainingData();
  const { tariffDecisions, workPatternSettings } = usePflegeShiftTariff();
  const { resolver } = useRuleCatalogRuntime();
  const available =
    enabled && root.ready && root.error === null && profile !== null && history.status === "ready";
  const shifts = useMemo(
    () =>
      entries.filter(
        (entry): entry is ShiftEntry => entry.kind === "SHIFT" && entry.deletedAt === null,
      ),
    [entries],
  );
  const calculation = useMemo(() => {
    if (!available || profile === null) return null;
    return captureRuleComputation(() =>
      calculateAssessedMonthlyRemuneration({
        month,
        shifts,
        workProfile: profile,
        history: history.profiles,
        savedOvertimeAllocations: history.overtimeAllocations,
        paidAbsences: history.paidAbsences,
        actualAnnualPayments: activeActualOwnAnnualPayments(history.actualAnnualPayments),
        tariffAnnualClaims: history.tariffAnnualClaims,
        tvlShiftWork: history.tvlShiftWork,
        savedAnnexAConfirmations: history.tvoedAnnexAMonthConfirmations,
        savedAnnexAPremiumFacts: history.tvoedAnnexAPremiumFacts,
        annexAPauseDetails: training.shifts,
        annexAEntriesComplete: root.ready,
        annexAPauseDetailsComplete: training.status === "ready",
        savedSueConfirmations: history.tvoedSueMonthConfirmations,
        savedSueAllowanceConfirmations: history.tvoedSueAllowanceConfirmations,
        settings: workPatternSettings,
        resolver,
        decisions: history.allowanceDecisions.find((item) => item.month === month)?.decisions,
        legacyDecision: tariffDecisions.find((item) => item.month === month) ?? null,
      }),
    );
  }, [
    available,
    root.ready,
    profile,
    month,
    shifts,
    history.profiles,
    history.allowanceDecisions,
    history.overtimeAllocations,
    history.paidAbsences,
    history.actualAnnualPayments,
    history.tariffAnnualClaims,
    history.tvlShiftWork,
    history.tvoedAnnexAMonthConfirmations,
    history.tvoedAnnexAPremiumFacts,
    training.shifts,
    training.status,
    history.tvoedSueMonthConfirmations,
    history.tvoedSueAllowanceConfirmations,
    workPatternSettings,
    resolver,
    tariffDecisions,
  ]);
  return {
    calculation,
    error:
      root.error ??
      (history.status === "error" ? (history.error ?? "Vergütungsdaten nicht verfügbar.") : null),
    reload: async () => {
      if (root.error || !root.ready) await root.reload();
      else await history.reload();
    },
  };
}
