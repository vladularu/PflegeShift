import { Temporal } from "@js-temporal/polyfill";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { resolveTariffSelection } from "@/rules/tariff-selection";
import { validateRulePackage } from "@/rules/validation";
import { roundRemunerationCents } from "./remuneration-money";

export interface AvrddDraftBaseInput {
  readonly pkg: RuleTariffPackage;
  /** A day in the full entitlement month, used only to choose a dated table. */
  readonly date: string;
  readonly groupId: string;
  readonly stepId: string;
  readonly contractedWeeklyMinutes: number;
  readonly contractTimeMode: "STANDARD_39" | "INDIVIDUAL_FULL_TIME_CORRIDOR" | "UNKNOWN";
  readonly avrddApplicabilityConfirmed: boolean;
  readonly fullMonthBaseEntitlementConfirmed: boolean;
}

export type AvrddDraftBaseResult =
  | {
      readonly kind: "draft-personal-table-base";
      readonly completeGross: false;
      readonly fullTimeTableCents: number;
      readonly personalTableBaseCents: number;
      readonly contractedWeeklyMinutes: number;
      readonly standardFullTimeWeeklyMinutes: number;
      readonly packageId: string;
      readonly versionId: string;
      readonly tableId: string;
      readonly groupId: string;
      readonly stepId: string;
      readonly sourceIds: readonly string[];
      readonly excludedComponents: readonly [
        "TIME_PREMIUMS",
        "ALLOWANCES",
        "OVERTIME",
        "ANNUAL_PAYMENT",
        "OTHER_LOCAL_TERMS",
      ];
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | "INVALID_PACKAGE"
        | "INVALID_DATE"
        | "OUTSIDE_VALIDITY"
        | "AVRDD_APPLICABILITY_UNCONFIRMED"
        | "FULL_MONTH_ENTITLEMENT_UNCONFIRMED"
        | "CONTRACT_TIME_UNKNOWN"
        | "CORRIDOR_SEPARATE_CALCULATION_REQUIRED"
        | "INVALID_WEEKLY_TIME"
        | "UNKNOWN_SELECTION"
        | "MISSING_TABLE_VALUE"
        | "AMOUNT_OVERFLOW";
    };

/** Local draft component only: § 15 table value and § 21 standard part-time proportion. */
export function calculateAvrddDraftTableBase({
  pkg,
  date,
  groupId,
  stepId,
  contractedWeeklyMinutes,
  contractTimeMode,
  avrddApplicabilityConfirmed,
  fullMonthBaseEntitlementConfirmed,
}: AvrddDraftBaseInput): AvrddDraftBaseResult {
  if (pkg.engineContractVersion !== 15 || !validateRulePackage(pkg).ok)
    return { kind: "unavailable", reason: "INVALID_PACKAGE" };
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || Temporal.PlainDate.from(date).toString() !== date)
      return { kind: "unavailable", reason: "INVALID_DATE" };
  } catch {
    return { kind: "unavailable", reason: "INVALID_DATE" };
  }
  if (date < pkg.validFrom || (pkg.validTo !== null && date > pkg.validTo))
    return { kind: "unavailable", reason: "OUTSIDE_VALIDITY" };
  if (!avrddApplicabilityConfirmed)
    return { kind: "unavailable", reason: "AVRDD_APPLICABILITY_UNCONFIRMED" };
  if (!fullMonthBaseEntitlementConfirmed)
    return { kind: "unavailable", reason: "FULL_MONTH_ENTITLEMENT_UNCONFIRMED" };
  if (contractTimeMode === "UNKNOWN")
    return { kind: "unavailable", reason: "CONTRACT_TIME_UNKNOWN" };
  if (contractTimeMode === "INDIVIDUAL_FULL_TIME_CORRIDOR")
    return { kind: "unavailable", reason: "CORRIDOR_SEPARATE_CALCULATION_REQUIRED" };

  const standardFullTimeWeeklyMinutes = pkg.rules.avrddStagePolicy?.standardFullTimeWeeklyMinutes;
  if (
    standardFullTimeWeeklyMinutes !== 2340 ||
    !Number.isSafeInteger(contractedWeeklyMinutes) ||
    contractedWeeklyMinutes < 60 ||
    contractedWeeklyMinutes > standardFullTimeWeeklyMinutes
  )
    return { kind: "unavailable", reason: "INVALID_WEEKLY_TIME" };
  const selection = resolveTariffSelection(pkg, "ANLAGE_1", "AVR_DD");
  if (
    selection?.familyId !== "avr-dd" ||
    selection.engineId !== "avr-dd-v1" ||
    selection.region.payTableId === undefined ||
    Object.values(selection.capabilities).some((value) => value !== "UNSUPPORTED")
  )
    return { kind: "unavailable", reason: "UNKNOWN_SELECTION" };
  const table = pkg.rules.payTables.find((item) => item.id === selection.region.payTableId);
  const canonicalGroupId = groupId.toLowerCase();
  const matches = table?.entries.filter(
    (entry) => entry.groupId === canonicalGroupId && entry.stepId === stepId,
  );
  if (matches?.length !== 1) return { kind: "unavailable", reason: "MISSING_TABLE_VALUE" };
  const numerator = matches[0].monthlyCents * contractedWeeklyMinutes;
  if (!Number.isSafeInteger(numerator)) return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };
  return {
    kind: "draft-personal-table-base",
    completeGross: false,
    fullTimeTableCents: matches[0].monthlyCents,
    personalTableBaseCents: roundRemunerationCents(numerator, standardFullTimeWeeklyMinutes),
    contractedWeeklyMinutes,
    standardFullTimeWeeklyMinutes,
    packageId: pkg.packageId,
    versionId: pkg.versionId,
    tableId: table!.id,
    groupId: canonicalGroupId,
    stepId,
    sourceIds: [...new Set([...table!.sourceIds, ...pkg.rules.avrddStagePolicy!.sourceIds])],
    excludedComponents: [
      "TIME_PREMIUMS",
      "ALLOWANCES",
      "OVERTIME",
      "ANNUAL_PAYMENT",
      "OTHER_LOCAL_TERMS",
    ],
  };
}
