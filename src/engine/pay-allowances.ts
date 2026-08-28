import type { AllowanceStatus, UserProfile } from "@/domain/types";
import { conditionsMatch } from "@/engine/pay-conditions";
import type { RuleTariffPackage } from "@/rules/contracts.generated";

interface AllowanceCalculationInput {
  readonly date: string;
  readonly fullTimeWeeklyMinutes: number;
  readonly profile: UserProfile;
  readonly rulePackage: RuleTariffPackage;
  readonly status: AllowanceStatus | null;
  readonly workMinutes: number;
}

export interface MonthlyAllowanceAmounts {
  readonly allowanceAmount: number;
  readonly careAllowanceAmount: number;
  readonly tvoedAllowanceAmount: number;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function configuredAllowanceAmount(
  rule: RuleTariffPackage["rules"]["allowanceRules"][number],
  workMinutes: number,
  profile: UserProfile,
  fullTimeWeeklyMinutes: number,
): number {
  if (profile.tariff === null) return 0;
  const amount =
    rule.amountKind === "FIXED_HOURLY"
      ? (workMinutes / 60) * (rule.amountCents / 100)
      : rule.amountCents / 100;
  const factor = rule.prorateByPartTime ? profile.weeklyMinutes / fullTimeWeeklyMinutes : 1;
  return roundMoney(amount * factor);
}

function matchingAllowanceAmount(
  allowanceType: "alternating-shift" | "care" | "shift" | "tvoed",
  input: AllowanceCalculationInput,
): number {
  const { date, fullTimeWeeklyMinutes, profile, rulePackage, status, workMinutes } = input;
  if (profile.tariff === null || (allowanceType.includes("shift") && status === null)) return 0;
  const candidates = rulePackage.rules.allowanceRules.filter(
    (rule) =>
      rule.allowanceType === allowanceType &&
      rule.validFrom <= date &&
      (rule.validTo === null || date <= rule.validTo) &&
      conditionsMatch(rule.conditions, profile, date, null, status),
  );
  if (candidates.length !== 1) {
    throw new Error(
      `Expected one ${allowanceType} allowance rule on ${date}, found ${candidates.length}.`,
    );
  }
  return configuredAllowanceAmount(candidates[0], workMinutes, profile, fullTimeWeeklyMinutes);
}

export function calculateMonthlyAllowanceAmounts(
  input: AllowanceCalculationInput,
): MonthlyAllowanceAmounts {
  const { status } = input;
  const allowanceAmount =
    status === null || status === "NONE"
      ? 0
      : matchingAllowanceAmount(
          status.startsWith("ALTERNATING") ? "alternating-shift" : "shift",
          input,
        );
  return {
    allowanceAmount,
    careAllowanceAmount: matchingAllowanceAmount("care", input),
    tvoedAllowanceAmount: matchingAllowanceAmount("tvoed", input),
  };
}
