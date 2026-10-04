import { Temporal } from "@js-temporal/polyfill";
import type { RuleTariffPackage } from "../rules/contracts.generated";
import { resolveTariffSelection } from "../rules/tariff-selection";
import { validateRulePackage } from "../rules/validation";
import { roundRemunerationCents } from "./remuneration-money";

export interface TvoedAnnexADraftBaseInput {
  pkg: RuleTariffPackage;
  date: string;
  variantId: "BT_K" | "BT_B";
  groupId: string;
  stepId: string;
  contractedWeeklyMinutes: number;
  comparableFullTimeWeeklyMinutes: number;
  applicabilityConfirmed: boolean;
  comparableFullTimeConfirmed: boolean;
  fullMonthBaseEntitlementConfirmed: boolean;
  fullMonthSameContractConfirmed: boolean;
}

export type TvoedAnnexADraftBaseResult =
  | { kind: "unavailable"; reason: string }
  | {
      kind: "draft-table-base";
      completeGross: false;
      fullTimeTableCents: number;
      personalTableBaseCents: number;
      contractedWeeklyMinutes: number;
      comparableFullTimeWeeklyMinutes: number;
      packageId: string;
      versionId: string;
      variantId: "BT_K" | "BT_B";
      groupId: string;
      stepId: string;
      sourceIds: string[];
      excludedComponents: readonly [
        "TIME_PREMIUMS",
        "ALLOWANCES",
        "OVERTIME",
        "ANNUAL_PAYMENT",
        "OTHER_INDIVIDUAL_TERMS",
      ];
    };

/** A source-bound table lookup, never an app-ready complete gross estimate. */
export function calculateTvoedAnnexADraftBase(
  input: TvoedAnnexADraftBaseInput,
): TvoedAnnexADraftBaseResult {
  const { pkg, date } = input;
  if (pkg.engineContractVersion !== 16 || pkg.status !== "DRAFT" || !validateRulePackage(pkg).ok)
    return { kind: "unavailable", reason: "INVALID_PACKAGE" };
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || Temporal.PlainDate.from(date).toString() !== date)
      return { kind: "unavailable", reason: "INVALID_DATE" };
  } catch {
    return { kind: "unavailable", reason: "INVALID_DATE" };
  }
  if (date < pkg.validFrom || (pkg.validTo !== null && date > pkg.validTo))
    return { kind: "unavailable", reason: "OUTSIDE_VALIDITY" };
  if (!input.applicabilityConfirmed)
    return { kind: "unavailable", reason: "TARIFF_APPLICABILITY_UNCONFIRMED" };
  if (!input.fullMonthBaseEntitlementConfirmed || !input.fullMonthSameContractConfirmed)
    return { kind: "unavailable", reason: "MONTH_ENTITLEMENT_UNCONFIRMED" };
  if (!input.comparableFullTimeConfirmed)
    return { kind: "unavailable", reason: "FULL_TIME_REFERENCE_UNCONFIRMED" };
  if (
    !Number.isSafeInteger(input.comparableFullTimeWeeklyMinutes) ||
    input.comparableFullTimeWeeklyMinutes < 1800 ||
    input.comparableFullTimeWeeklyMinutes > 2520 ||
    !Number.isSafeInteger(input.contractedWeeklyMinutes) ||
    input.contractedWeeklyMinutes < 1 ||
    input.contractedWeeklyMinutes > input.comparableFullTimeWeeklyMinutes
  )
    return { kind: "unavailable", reason: "INVALID_WEEKLY_TIME" };

  const selected = resolveTariffSelection(pkg, input.variantId, "VKA");
  if (
    selected?.familyId !== "tvoed-vka-annex-a" ||
    selected.engineId !== "tvoed-annex-a-v1" ||
    Object.values(selected.capabilities).some((value) => value !== "UNSUPPORTED")
  )
    return { kind: "unavailable", reason: "UNKNOWN_SELECTION" };
  const table = pkg.rules.payTables.find((item) => item.id === selected.region.payTableId);
  const matches = table?.entries.filter(
    (entry) => entry.groupId === input.groupId.toLowerCase() && entry.stepId === input.stepId,
  );
  if (matches?.length !== 1) return { kind: "unavailable", reason: "MISSING_TABLE_VALUE" };
  const numerator = matches[0].monthlyCents * input.contractedWeeklyMinutes;
  if (!Number.isSafeInteger(numerator)) return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };
  return {
    kind: "draft-table-base",
    completeGross: false,
    fullTimeTableCents: matches[0].monthlyCents,
    personalTableBaseCents: roundRemunerationCents(
      numerator,
      input.comparableFullTimeWeeklyMinutes,
    ),
    contractedWeeklyMinutes: input.contractedWeeklyMinutes,
    comparableFullTimeWeeklyMinutes: input.comparableFullTimeWeeklyMinutes,
    packageId: pkg.packageId,
    versionId: pkg.versionId,
    variantId: input.variantId,
    groupId: input.groupId.toLowerCase(),
    stepId: input.stepId,
    sourceIds: [...table!.sourceIds],
    excludedComponents: [
      "TIME_PREMIUMS",
      "ALLOWANCES",
      "OVERTIME",
      "ANNUAL_PAYMENT",
      "OTHER_INDIVIDUAL_TERMS",
    ],
  };
}
