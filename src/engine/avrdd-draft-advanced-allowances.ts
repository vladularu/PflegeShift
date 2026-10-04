import { Temporal } from "@js-temporal/polyfill";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { resolveTariffSelection } from "@/rules/tariff-selection";
import { validateRulePackage } from "@/rules/validation";
import { roundRemunerationCents } from "./remuneration-money";

export interface AvrddAdvancedAllowanceClaim {
  /** Confirms every activity, assignment, qualification and setting condition for this exact § 14 claim. */
  readonly status: "ELIGIBLE_CONFIRMED" | "INELIGIBLE_CONFIRMED" | "UNKNOWN";
  /** Personal monthly agreement already paid for the same activity; zero must be explicitly confirmed. */
  readonly priorIndividualMonthlyCents: number | null;
}

export interface AvrddDraftAdvancedAllowancesInput {
  readonly pkg: RuleTariffPackage;
  readonly workMonth: string;
  readonly variantId: string;
  readonly regionId: string;
  readonly groupId: string;
  readonly stepId: string;
  readonly avrddApplicabilityConfirmed: boolean;
  readonly contractTimeMode: "STANDARD_39" | "INDIVIDUAL_FULL_TIME_CORRIDOR" | "UNKNOWN";
  readonly contractedWeeklyMinutes: number;
  readonly fullMonthEntitlementConfirmed: boolean;
  readonly claims: Readonly<{
    practice: AvrddAdvancedAllowanceClaim;
    palliativeOrWound: AvrddAdvancedAllowanceClaim;
    intensive: AvrddAdvancedAllowanceClaim;
    specialist: AvrddAdvancedAllowanceClaim;
  }>;
  /** Specialist scope and the post-2026 hospice/Palliative Care collision need separate confirmation. */
  readonly specialistContext:
    | "LEGACY_SCOPE_CONFIRMED"
    | "NEW_NON_HOSPICE_SCOPE_CONFIRMED"
    | "HOSPICE_PALLIATIVE_CONFIRMED"
    | "UNKNOWN";
}

export interface AvrddAdvancedAllowancePosition {
  readonly component:
    "PRACTICE" | "PALLIATIVE_OR_WOUND" | "LEGACY_EG7_COMBINED" | "INTENSIVE" | "SPECIALIST";
  readonly legalLetter: "e" | "f" | "g" | "h";
  readonly fullTimeMonthlyCents: number;
  readonly personalMonthlyCents: number;
  readonly priorIndividualMonthlyCents: number;
  /** Additional tariff amount only; the individual agreement remains a separate pay position. */
  readonly tariffTopUpCents: number;
  readonly sourceIds: readonly string[];
}

export type AvrddDraftAdvancedAllowancesResult =
  | {
      readonly kind: "draft-confirmed-advanced-allowances";
      readonly status: "estimated";
      readonly completeGross: false;
      readonly workMonth: string;
      readonly packageId: string;
      readonly versionId: string;
      /** No total: unrelated allowances may have additional local stacking or payment rules. */
      readonly positions: readonly AvrddAdvancedAllowancePosition[];
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | "INVALID_PACKAGE"
        | "INVALID_MONTH"
        | "OUTSIDE_VALIDITY"
        | "AVRDD_APPLICABILITY_UNCONFIRMED"
        | "CONTRACT_TIME_UNKNOWN"
        | "CORRIDOR_SEPARATE_CALCULATION_REQUIRED"
        | "INVALID_WEEKLY_TIME"
        | "FULL_MONTH_ENTITLEMENT_UNCONFIRMED"
        | "UNKNOWN_SELECTION"
        | "ALLOWANCE_FACTS_UNCONFIRMED"
        | "NO_ALLOWANCE_CONFIRMED"
        | "GROUP_NOT_ELIGIBLE"
        | "SPECIALIST_SCOPE_UNCONFIRMED"
        | "SPECIALIST_SCOPE_UNSUPPORTED"
        | "INDIVIDUAL_OFFSET_UNKNOWN"
        | "INVALID_INDIVIDUAL_OFFSET"
        | "LEGACY_COMBINATION_AMBIGUOUS"
        | "EQUAL_RATE_COMBINATION_UNRESOLVED"
        | "HOSPICE_PALLIATIVE_COMBINATION_UNRESOLVED"
        | "MISSING_POLICY"
        | "MISSING_TABLE_VALUE"
        | "AMOUNT_OVERFLOW";
    };

type ClaimName = keyof AvrddDraftAdvancedAllowancesInput["claims"];

/** Candidate-only § 14(2)(e–h) components. Confirmed eligibility is an input, never inferred. */
export function calculateAvrddDraftAdvancedAllowances(
  input: AvrddDraftAdvancedAllowancesInput,
): AvrddDraftAdvancedAllowancesResult {
  const { pkg } = input;
  if (pkg.engineContractVersion !== 15 || pkg.status !== "DRAFT" || !validateRulePackage(pkg).ok)
    return { kind: "unavailable", reason: "INVALID_PACKAGE" };
  let month: Temporal.PlainYearMonth;
  try {
    month = Temporal.PlainYearMonth.from(input.workMonth);
    if (!/^\d{4}-\d{2}$/u.test(input.workMonth) || month.toString() !== input.workMonth)
      return { kind: "unavailable", reason: "INVALID_MONTH" };
  } catch {
    return { kind: "unavailable", reason: "INVALID_MONTH" };
  }
  const firstDate = `${input.workMonth}-01`;
  const lastDate = `${input.workMonth}-${String(month.daysInMonth).padStart(2, "0")}`;
  if (firstDate < pkg.validFrom || (pkg.validTo !== null && lastDate > pkg.validTo))
    return { kind: "unavailable", reason: "OUTSIDE_VALIDITY" };
  if (!input.avrddApplicabilityConfirmed)
    return { kind: "unavailable", reason: "AVRDD_APPLICABILITY_UNCONFIRMED" };
  if (input.contractTimeMode === "UNKNOWN")
    return { kind: "unavailable", reason: "CONTRACT_TIME_UNKNOWN" };
  if (input.contractTimeMode !== "STANDARD_39")
    return { kind: "unavailable", reason: "CORRIDOR_SEPARATE_CALCULATION_REQUIRED" };
  const standardMinutes = pkg.rules.avrddStagePolicy?.standardFullTimeWeeklyMinutes;
  if (
    standardMinutes !== 2340 ||
    !Number.isSafeInteger(input.contractedWeeklyMinutes) ||
    input.contractedWeeklyMinutes < 60 ||
    input.contractedWeeklyMinutes > standardMinutes
  )
    return { kind: "unavailable", reason: "INVALID_WEEKLY_TIME" };
  if (!input.fullMonthEntitlementConfirmed)
    return { kind: "unavailable", reason: "FULL_MONTH_ENTITLEMENT_UNCONFIRMED" };
  const selection = resolveTariffSelection(pkg, input.variantId, input.regionId);
  if (
    selection?.familyId !== "avr-dd" ||
    selection.engineId !== "avr-dd-v1" ||
    !selection.groups.some(
      (group) => group.id === input.groupId && group.levels.includes(input.stepId),
    ) ||
    Object.values(selection.capabilities).some((capability) => capability !== "UNSUPPORTED")
  )
    return { kind: "unavailable", reason: "UNKNOWN_SELECTION" };
  const policies = pkg.rules.avrddAdvancedAllowancePolicies?.filter(
    (policy) =>
      policy.validFrom <= firstDate && (policy.validTo === null || lastDate <= policy.validTo),
  );
  if (policies?.length !== 1) return { kind: "unavailable", reason: "MISSING_POLICY" };
  const policy = policies[0];
  const names: readonly ClaimName[] = ["practice", "palliativeOrWound", "intensive", "specialist"];
  if (names.some((name) => !input.claims[name] || input.claims[name].status === "UNKNOWN"))
    return { kind: "unavailable", reason: "ALLOWANCE_FACTS_UNCONFIRMED" };
  const eligible = (name: ClaimName) => input.claims[name].status === "ELIGIBLE_CONFIRMED";
  if (names.every((name) => !eligible(name)))
    return { kind: "unavailable", reason: "NO_ALLOWANCE_CONFIRMED" };
  if (
    ((eligible("practice") || eligible("palliativeOrWound")) &&
      input.groupId !== "eg7" &&
      (policy.phase === "LEGACY_EFG" || eligible("palliativeOrWound"))) ||
    (eligible("practice") &&
      policy.phase === "POST_2026_07_EFGH" &&
      input.groupId !== "eg7" &&
      input.groupId !== "eg8") ||
    (eligible("intensive") && input.groupId !== "eg8") ||
    (eligible("specialist") && input.groupId !== "eg7" && input.groupId !== "eg8")
  )
    return { kind: "unavailable", reason: "GROUP_NOT_ELIGIBLE" };
  if (eligible("specialist")) {
    if (input.specialistContext === "UNKNOWN")
      return { kind: "unavailable", reason: "SPECIALIST_SCOPE_UNCONFIRMED" };
    if (policy.phase === "LEGACY_EFG" && input.specialistContext !== "LEGACY_SCOPE_CONFIRMED")
      return { kind: "unavailable", reason: "SPECIALIST_SCOPE_UNSUPPORTED" };
    if (
      policy.phase === "POST_2026_07_EFGH" &&
      input.specialistContext === "HOSPICE_PALLIATIVE_CONFIRMED" &&
      eligible("palliativeOrWound")
    )
      return { kind: "unavailable", reason: "HOSPICE_PALLIATIVE_COMBINATION_UNRESOLVED" };
  }
  for (const name of names) {
    if (!eligible(name)) continue;
    const offset = input.claims[name].priorIndividualMonthlyCents;
    if (offset === null) return { kind: "unavailable", reason: "INDIVIDUAL_OFFSET_UNKNOWN" };
    if (!Number.isSafeInteger(offset) || offset < 0)
      return { kind: "unavailable", reason: "INVALID_INDIVIDUAL_OFFSET" };
  }
  const table = pkg.rules.payTables.find((item) => item.id === selection.region.payTableId);
  const differenceNeeded =
    eligible("palliativeOrWound") ||
    (eligible("practice") && policy.practiceMode === "HALF_EG8_DIFFERENCE");
  let differenceCents: number | null = null;
  if (differenceNeeded) {
    const eg7 = table?.entries.filter(
      (entry) => entry.groupId === "eg7" && entry.stepId === input.stepId,
    );
    const eg8 = table?.entries.filter(
      (entry) => entry.groupId === "eg8" && entry.stepId === input.stepId,
    );
    if (eg7?.length !== 1 || eg8?.length !== 1 || eg8[0].monthlyCents <= eg7[0].monthlyCents)
      return { kind: "unavailable", reason: "MISSING_TABLE_VALUE" };
    const numerator = (eg8[0].monthlyCents - eg7[0].monthlyCents) * policy.eg8DifferenceBasisPoints;
    if (!Number.isSafeInteger(numerator)) return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };
    differenceCents = roundRemunerationCents(numerator, 10_000);
  }
  const practiceCents =
    policy.practiceMode === "FIXED_MONTHLY" ? policy.practiceMonthlyCents : differenceCents;
  if (eligible("practice") && practiceCents === null)
    return { kind: "unavailable", reason: "MISSING_POLICY" };
  type Candidate = {
    name: ClaimName;
    component: AvrddAdvancedAllowancePosition["component"];
    legalLetter: AvrddAdvancedAllowancePosition["legalLetter"];
    fullTimeMonthlyCents: number;
    priorIndividualMonthlyCents: number;
    usesTable: boolean;
  };
  const candidates: Candidate[] = [];
  if (eligible("practice"))
    candidates.push({
      name: "practice",
      component: "PRACTICE",
      legalLetter: "e",
      fullTimeMonthlyCents: practiceCents!,
      priorIndividualMonthlyCents: input.claims.practice.priorIndividualMonthlyCents!,
      usesTable: policy.practiceMode === "HALF_EG8_DIFFERENCE",
    });
  if (eligible("palliativeOrWound"))
    candidates.push({
      name: "palliativeOrWound",
      component: "PALLIATIVE_OR_WOUND",
      legalLetter: policy.phase === "LEGACY_EFG" ? "e" : "f",
      fullTimeMonthlyCents: differenceCents!,
      priorIndividualMonthlyCents: input.claims.palliativeOrWound.priorIndividualMonthlyCents!,
      usesTable: true,
    });
  if (eligible("intensive"))
    candidates.push({
      name: "intensive",
      component: "INTENSIVE",
      legalLetter: policy.phase === "LEGACY_EFG" ? "f" : "g",
      fullTimeMonthlyCents: policy.intensiveMonthlyCents,
      priorIndividualMonthlyCents: input.claims.intensive.priorIndividualMonthlyCents!,
      usesTable: false,
    });
  if (eligible("specialist"))
    candidates.push({
      name: "specialist",
      component: "SPECIALIST",
      legalLetter: policy.phase === "LEGACY_EFG" ? "g" : "h",
      fullTimeMonthlyCents: policy.specialistMonthlyCents,
      priorIndividualMonthlyCents: input.claims.specialist.priorIndividualMonthlyCents!,
      usesTable: false,
    });
  const practice = candidates.find((candidate) => candidate.name === "practice");
  const palliative = candidates.find((candidate) => candidate.name === "palliativeOrWound");
  if (practice && palliative) {
    if (policy.phase === "LEGACY_EFG") {
      if (practice.priorIndividualMonthlyCents !== palliative.priorIndividualMonthlyCents)
        return { kind: "unavailable", reason: "LEGACY_COMBINATION_AMBIGUOUS" };
      practice.component = "LEGACY_EG7_COMBINED";
      candidates.splice(candidates.indexOf(palliative), 1);
    } else {
      if (practice.fullTimeMonthlyCents === palliative.fullTimeMonthlyCents)
        return { kind: "unavailable", reason: "EQUAL_RATE_COMBINATION_UNRESOLVED" };
      candidates.splice(
        candidates.indexOf(
          practice.fullTimeMonthlyCents > palliative.fullTimeMonthlyCents ? palliative : practice,
        ),
        1,
      );
    }
  }
  const positions: AvrddAdvancedAllowancePosition[] = [];
  for (const candidate of candidates) {
    const numerator = candidate.fullTimeMonthlyCents * input.contractedWeeklyMinutes;
    if (!Number.isSafeInteger(numerator)) return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };
    const personalMonthlyCents = roundRemunerationCents(numerator, standardMinutes);
    positions.push({
      component: candidate.component,
      legalLetter: candidate.legalLetter,
      fullTimeMonthlyCents: candidate.fullTimeMonthlyCents,
      personalMonthlyCents,
      priorIndividualMonthlyCents: candidate.priorIndividualMonthlyCents,
      tariffTopUpCents: Math.max(0, personalMonthlyCents - candidate.priorIndividualMonthlyCents),
      sourceIds: candidate.usesTable
        ? [...new Set([...policy.sourceIds, ...(table?.sourceIds ?? [])])]
        : policy.sourceIds,
    });
  }
  return {
    kind: "draft-confirmed-advanced-allowances",
    status: "estimated",
    completeGross: false,
    workMonth: input.workMonth,
    packageId: pkg.packageId,
    versionId: pkg.versionId,
    positions,
  };
}
