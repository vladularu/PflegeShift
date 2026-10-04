import type { AllowanceStatus, UserProfile } from "@/domain/types";
import { conditionsMatch } from "./pay-conditions";
import type { TrainingPayContext } from "./remuneration-training-context";

export function hasTrainingShiftAllowances(context: TrainingPayContext, date: string): boolean {
  return context.rulePackage.rules.allowanceRules.some(
    (rule) =>
      (rule.allowanceType === "shift" || rule.allowanceType === "alternating-shift") &&
      rule.validFrom <= date &&
      (rule.validTo === null || date <= rule.validTo),
  );
}

/** Match the actual training sector/region without inventing an employee pay group. */
export function trainingAllowanceRules(
  type: "shift" | "alternating-shift" | "care",
  date: string,
  status: AllowanceStatus | null,
  context: TrainingPayContext,
  work: UserProfile,
) {
  return context.rulePackage.rules.allowanceRules.filter((rule) => {
    const { sectors, tariffRegions, payGroups } = rule.conditions;
    return (
      rule.allowanceType === type &&
      (type !== "care" ||
        (context.specialDutyAllowance === "PE1_ONLY" && rule.id === "training-special-duty-pe1")) &&
      rule.validFrom <= date &&
      (rule.validTo === null || date <= rule.validTo) &&
      payGroups === null &&
      (sectors === null || sectors.includes(context.sector)) &&
      (tariffRegions == null || tariffRegions.includes(context.tariffRegion)) &&
      conditionsMatch(
        { ...rule.conditions, sectors: null, tariffRegions: null },
        { ...work, tariff: null },
        date,
        null,
        status,
      )
    );
  });
}
