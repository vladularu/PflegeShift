import { roundRemunerationCents } from "./remuneration-money";
import {
  calculateTvoedSueDraftBase,
  type TvoedSueDraftBaseInput,
  type TvoedSueDraftBaseResult,
} from "./tvoed-sue-draft-base";

export interface TvoedSueDraftAllowanceInput extends TvoedSueDraftBaseInput {
  sectionXxivClassificationConfirmed: boolean;
  fullMonthAllowanceEntitlementConfirmed: boolean;
  caseGroup: "6" | "OTHER" | "UNKNOWN";
  conversionDays: "NONE_CONFIRMED" | "TAKEN" | "UNKNOWN";
}

export type TvoedSueDraftAllowanceResult =
  | Extract<TvoedSueDraftBaseResult, { kind: "unavailable" }>
  | {
      kind: "unavailable";
      reason:
        | "SECTION_XXIV_UNCONFIRMED"
        | "ALLOWANCE_ENTITLEMENT_UNCONFIRMED"
        | "CASE_GROUP_UNCONFIRMED"
        | "CONVERSION_DAYS_UNRESOLVED"
        | "ALLOWANCE_POLICY_MISSING"
        | "AMOUNT_OVERFLOW";
    }
  | { kind: "not-applicable"; groupId: string; sourceIds: string[] }
  | {
      kind: "draft-monthly-allowance";
      completeGross: false;
      fullTimeAllowanceCents: number;
      personalAllowanceCents: number;
      groupId: string;
      packageId: "tvoed-vka-sue-bt-b";
      versionId: string;
      sourceIds: string[];
      excludedComponents: readonly ["CONVERSION_DAY_DEDUCTIONS", "OTHER_ALLOWANCES"];
    };

/** § 52(6) BT-B + § 24(2) TVöD: only a confirmed whole-month SuE allowance. */
export function calculateTvoedSueDraftAllowance(
  input: TvoedSueDraftAllowanceInput,
): TvoedSueDraftAllowanceResult {
  const base = calculateTvoedSueDraftBase(input);
  if (base.kind === "unavailable") return base;
  if (!input.sectionXxivClassificationConfirmed)
    return { kind: "unavailable", reason: "SECTION_XXIV_UNCONFIRMED" };
  if (!input.fullMonthAllowanceEntitlementConfirmed)
    return { kind: "unavailable", reason: "ALLOWANCE_ENTITLEMENT_UNCONFIRMED" };

  const policy = input.pkg.rules.tvoedSueAllowancePolicy;
  if (!policy) return { kind: "unavailable", reason: "ALLOWANCE_POLICY_MISSING" };
  const band = policy.bands.find((entry) => entry.groupIds.includes(base.groupId));
  if (!band) return { kind: "not-applicable", groupId: base.groupId, sourceIds: policy.sourceIds };
  if (band.caseGroup !== null) {
    if (input.caseGroup === "UNKNOWN")
      return { kind: "unavailable", reason: "CASE_GROUP_UNCONFIRMED" };
    if (input.caseGroup !== band.caseGroup)
      return { kind: "not-applicable", groupId: base.groupId, sourceIds: policy.sourceIds };
  }
  if (input.conversionDays !== "NONE_CONFIRMED")
    return { kind: "unavailable", reason: "CONVERSION_DAYS_UNRESOLVED" };

  const numerator = band.monthlyCents * base.contractedWeeklyMinutes;
  if (!Number.isSafeInteger(numerator)) return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };
  return {
    kind: "draft-monthly-allowance",
    completeGross: false,
    fullTimeAllowanceCents: band.monthlyCents,
    personalAllowanceCents: roundRemunerationCents(numerator, base.standardFullTimeWeeklyMinutes),
    groupId: base.groupId,
    packageId: base.packageId,
    versionId: base.versionId,
    sourceIds: [...policy.sourceIds],
    excludedComponents: ["CONVERSION_DAY_DEDUCTIONS", "OTHER_ALLOWANCES"],
  };
}
