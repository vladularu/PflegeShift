import { Temporal } from "@js-temporal/polyfill";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { resolveTariffSelection } from "@/rules/tariff-selection";
import { validateRulePackage } from "@/rules/validation";

const GROUP_BY_VARIANT: Readonly<Record<string, string>> = {
  ANLAGE_3: "anlage-3-general",
  ANLAGE_3A_A: "anlage-3a-a",
  ANLAGE_3A_B: "anlage-3a-b",
};

export interface DrkTrainingDraftBaseInput {
  readonly pkg: RuleTariffPackage;
  readonly month: string;
  readonly variantId: string;
  readonly trainingYear: number | null;
  readonly drkApplicabilityConfirmed: boolean;
  readonly trainingCategoryConfirmed: boolean;
  readonly trainingYearConfirmed: boolean;
  readonly fullMonthBaseEntitlementConfirmed: boolean;
  readonly fullTimeTrainingConfirmed: boolean;
}

export type DrkTrainingDraftBaseResult =
  | {
      readonly kind: "draft-full-month-training-table-base";
      readonly completeGross: false;
      readonly monthlyCents: number;
      readonly packageId: "drk-rtv-training";
      readonly versionId: string;
      readonly tableId: "training";
      readonly variantId: string;
      readonly categoryId: string;
      readonly trainingYear: number;
      readonly sourceIds: readonly string[];
      readonly excludedComponents: readonly [
        "PARTIAL_MONTH",
        "PART_TIME",
        "TIME_PREMIUMS",
        "ALLOWANCES",
        "OVERTIME",
        "ANNUAL_PAYMENT",
      ];
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | "INVALID_PACKAGE"
        | "INVALID_MONTH"
        | "OUTSIDE_VALIDITY"
        | "DRK_APPLICABILITY_UNCONFIRMED"
        | "TRAINING_CATEGORY_UNCONFIRMED"
        | "TRAINING_YEAR_UNCONFIRMED"
        | "FULL_MONTH_ENTITLEMENT_UNCONFIRMED"
        | "NON_FULL_TIME_SEPARATE_CALCULATION"
        | "UNKNOWN_SELECTION"
        | "INVALID_TRAINING_YEAR"
        | "MISSING_TABLE_VALUE";
    };

/** Isolated reference component; a DRAFT table cannot become a complete salary by itself. */
export function calculateDrkTrainingDraftTableBase({
  pkg,
  month,
  variantId,
  trainingYear,
  drkApplicabilityConfirmed,
  trainingCategoryConfirmed,
  trainingYearConfirmed,
  fullMonthBaseEntitlementConfirmed,
  fullTimeTrainingConfirmed,
}: DrkTrainingDraftBaseInput): DrkTrainingDraftBaseResult {
  const fail = (reason: Extract<DrkTrainingDraftBaseResult, { kind: "unavailable" }>["reason"]) =>
    ({ kind: "unavailable", reason }) as const;
  if (
    pkg.packageId !== "drk-rtv-training" ||
    pkg.engineContractVersion !== 17 ||
    !validateRulePackage(pkg).ok
  )
    return fail("INVALID_PACKAGE");

  let monthStart: string;
  let monthEnd: string;
  try {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/u.test(month)) return fail("INVALID_MONTH");
    const yearMonth = Temporal.PlainYearMonth.from(month);
    monthStart = yearMonth.toPlainDate({ day: 1 }).toString();
    monthEnd = yearMonth.toPlainDate({ day: yearMonth.daysInMonth }).toString();
  } catch {
    return fail("INVALID_MONTH");
  }
  if (monthStart < pkg.validFrom || (pkg.validTo !== null && monthEnd > pkg.validTo))
    return fail("OUTSIDE_VALIDITY");
  if (!drkApplicabilityConfirmed) return fail("DRK_APPLICABILITY_UNCONFIRMED");
  if (!trainingCategoryConfirmed) return fail("TRAINING_CATEGORY_UNCONFIRMED");
  if (!trainingYearConfirmed || trainingYear === null) return fail("TRAINING_YEAR_UNCONFIRMED");
  if (!fullMonthBaseEntitlementConfirmed) return fail("FULL_MONTH_ENTITLEMENT_UNCONFIRMED");
  if (!fullTimeTrainingConfirmed) return fail("NON_FULL_TIME_SEPARATE_CALCULATION");

  const categoryId = GROUP_BY_VARIANT[variantId];
  const selected = resolveTariffSelection(pkg, variantId, "BTG");
  if (
    categoryId === undefined ||
    selected?.familyId !== "drk-rtv" ||
    selected.engineId !== "drk-rtv-training-v1" ||
    selected.employmentKind !== "APPRENTICE" ||
    selected.region.payTableId !== "training" ||
    Object.values(selected.capabilities).some((value) => value !== "UNSUPPORTED")
  )
    return fail("UNKNOWN_SELECTION");
  if (!Number.isSafeInteger(trainingYear) || trainingYear < 1 || trainingYear > 4)
    return fail("INVALID_TRAINING_YEAR");
  const table = pkg.rules.payTables.find((candidate) => candidate.id === "training");
  const entries = table?.entries.filter(
    (entry) => entry.groupId === categoryId && entry.stepId === `s${trainingYear}`,
  );
  if (entries?.length !== 1) return fail("MISSING_TABLE_VALUE");

  return {
    kind: "draft-full-month-training-table-base",
    completeGross: false,
    monthlyCents: entries[0].monthlyCents,
    packageId: "drk-rtv-training",
    versionId: pkg.versionId,
    tableId: "training",
    variantId,
    categoryId,
    trainingYear,
    sourceIds: table!.sourceIds,
    excludedComponents: [
      "PARTIAL_MONTH",
      "PART_TIME",
      "TIME_PREMIUMS",
      "ALLOWANCES",
      "OVERTIME",
      "ANNUAL_PAYMENT",
    ],
  };
}
