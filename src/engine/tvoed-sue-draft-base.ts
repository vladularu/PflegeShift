import { Temporal } from "@js-temporal/polyfill";
import type { RuleTariffPackage } from "../rules/contracts.generated";
import { resolveTariffSelection } from "../rules/tariff-selection";
import { validateRulePackage } from "../rules/validation";
import { roundRemunerationCents } from "./remuneration-money";

export interface TvoedSueDraftBaseInput {
  pkg: RuleTariffPackage;
  month: string;
  groupId: string;
  stepId: string;
  contractedWeeklyMinutes: number;
  tariffApplicabilityConfirmed: boolean;
  sueClassificationConfirmed: boolean;
  standardFullTimeConfirmed: boolean;
  fullMonthBaseEntitlementConfirmed: boolean;
  fullMonthSameContractConfirmed: boolean;
}

export type TvoedSueDraftBaseResult =
  | {
      kind: "unavailable";
      reason:
        | "INVALID_PACKAGE"
        | "INVALID_MONTH"
        | "OUTSIDE_VALIDITY"
        | "TARIFF_APPLICABILITY_UNCONFIRMED"
        | "SUE_CLASSIFICATION_UNCONFIRMED"
        | "MONTH_ENTITLEMENT_UNCONFIRMED"
        | "STANDARD_FULL_TIME_UNCONFIRMED"
        | "INVALID_WEEKLY_TIME"
        | "UNKNOWN_SELECTION"
        | "MISSING_TABLE_VALUE"
        | "AMOUNT_OVERFLOW";
    }
  | {
      kind: "draft-table-base";
      completeGross: false;
      fullTimeTableCents: number;
      personalTableBaseCents: number;
      contractedWeeklyMinutes: number;
      standardFullTimeWeeklyMinutes: 2340;
      packageId: "tvoed-vka-sue-bt-b";
      versionId: string;
      variantId: "BT_B";
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

/** § 52 BT-B + § 24(2),(4) TVöD: only a confirmed full-month table base. */
export function calculateTvoedSueDraftBase(input: TvoedSueDraftBaseInput): TvoedSueDraftBaseResult {
  const { pkg, month } = input;
  if (
    pkg.packageId !== "tvoed-vka-sue-bt-b" ||
    pkg.engineContractVersion !== 18 ||
    pkg.status !== "DRAFT" ||
    !validateRulePackage(pkg).ok
  )
    return { kind: "unavailable", reason: "INVALID_PACKAGE" };

  let monthStart: string;
  let monthEnd: string;
  try {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/u.test(month))
      return { kind: "unavailable", reason: "INVALID_MONTH" };
    const yearMonth = Temporal.PlainYearMonth.from(month);
    monthStart = yearMonth.toPlainDate({ day: 1 }).toString();
    monthEnd = yearMonth.toPlainDate({ day: yearMonth.daysInMonth }).toString();
  } catch {
    return { kind: "unavailable", reason: "INVALID_MONTH" };
  }
  if (monthStart < pkg.validFrom || (pkg.validTo !== null && monthEnd > pkg.validTo))
    return { kind: "unavailable", reason: "OUTSIDE_VALIDITY" };

  if (!input.tariffApplicabilityConfirmed)
    return { kind: "unavailable", reason: "TARIFF_APPLICABILITY_UNCONFIRMED" };
  if (!input.sueClassificationConfirmed)
    return { kind: "unavailable", reason: "SUE_CLASSIFICATION_UNCONFIRMED" };
  if (!input.fullMonthBaseEntitlementConfirmed || !input.fullMonthSameContractConfirmed)
    return { kind: "unavailable", reason: "MONTH_ENTITLEMENT_UNCONFIRMED" };
  if (!input.standardFullTimeConfirmed)
    return { kind: "unavailable", reason: "STANDARD_FULL_TIME_UNCONFIRMED" };
  if (
    !Number.isSafeInteger(input.contractedWeeklyMinutes) ||
    input.contractedWeeklyMinutes < 1 ||
    input.contractedWeeklyMinutes > 2340
  )
    return { kind: "unavailable", reason: "INVALID_WEEKLY_TIME" };

  const selected = resolveTariffSelection(pkg, "BT_B", "VKA");
  if (
    selected?.familyId !== "tvoed-vka-sue" ||
    selected.engineId !== "tvoed-sue-bt-b-table-draft-v1" ||
    selected.employmentKind !== "EMPLOYEE" ||
    selected.region.payTableId !== "anlage-c" ||
    Object.values(selected.capabilities).some((value) => value !== "UNSUPPORTED")
  )
    return { kind: "unavailable", reason: "UNKNOWN_SELECTION" };

  const table = pkg.rules.payTables.find((item) => item.id === selected.region.payTableId);
  const groupId = input.groupId.toLowerCase();
  const matches = table?.entries.filter(
    (entry) => entry.groupId === groupId && entry.stepId === input.stepId,
  );
  if (matches?.length !== 1) return { kind: "unavailable", reason: "MISSING_TABLE_VALUE" };
  const numerator = matches[0].monthlyCents * input.contractedWeeklyMinutes;
  if (!Number.isSafeInteger(numerator)) return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };

  return {
    kind: "draft-table-base",
    completeGross: false,
    fullTimeTableCents: matches[0].monthlyCents,
    personalTableBaseCents: roundRemunerationCents(numerator, 2340),
    contractedWeeklyMinutes: input.contractedWeeklyMinutes,
    standardFullTimeWeeklyMinutes: 2340,
    packageId: "tvoed-vka-sue-bt-b",
    versionId: pkg.versionId,
    variantId: "BT_B",
    groupId,
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
