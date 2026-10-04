import { useMemo } from "react";
import { useTrainingData } from "@/application/training-provider";
import { usePflegeShiftEntries, usePflegeShiftProfile } from "@/application/pflegeshift-provider";
import { useRuleCatalogRuntime } from "@/application/rule-catalog-runtime-provider";
import type { MonthlyComplianceResult, ShiftEntry } from "@/domain/types";
import { trainingComplianceForState, type TrainingComplianceResult } from "./training-compliance";

export function useTrainingCompliance(
  month: string,
  adult: MonthlyComplianceResult | null,
): TrainingComplianceResult | null {
  const training = useTrainingData();
  const { profile } = usePflegeShiftProfile();
  const { entries } = usePflegeShiftEntries();
  const { resolver: ruleResolver } = useRuleCatalogRuntime();
  return useMemo(() => {
    if (profile === null) return null;
    return trainingComplianceForState({
      month,
      adult,
      training,
      profile,
      ruleResolver,
      shifts: entries.filter((entry): entry is ShiftEntry => entry.kind === "SHIFT"),
    });
  }, [adult, entries, month, profile, ruleResolver, training]);
}
