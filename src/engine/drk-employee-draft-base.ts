import { Temporal } from "@js-temporal/polyfill";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { resolveTariffSelection } from "@/rules/tariff-selection";
import { validateRulePackage } from "@/rules/validation";
import { roundRemunerationCents } from "./remuneration-money";

const FAMILIES: Readonly<
  Record<
    string,
    { readonly variantId: string; readonly engineId: string; readonly tableId: string }
  >
> = {
  "drk-rtv-e": {
    variantId: "ANLAGE_A1",
    engineId: "drk-rtv-e-v1",
    tableId: "anlage-a1-e",
  },
  "drk-rtv-p": {
    variantId: "ANLAGE_A2",
    engineId: "drk-rtv-p-v1",
    tableId: "anlage-a2-p",
  },
  "drk-rtv-s": {
    variantId: "ANLAGE_A3",
    engineId: "drk-rtv-s-v1",
    tableId: "anlage-a3-s",
  },
};

export interface DrkEmployeeDraftBaseInput {
  readonly pkg: RuleTariffPackage;
  readonly month: string;
  readonly variantId: string;
  readonly groupId: string;
  readonly stepId: string;
  readonly contractedWeeklyMinutes: number | null;
  readonly fullTimeWeeklyMinutes: number | null;
  readonly drkApplicabilityConfirmed: boolean;
  readonly annexAssignmentConfirmed: boolean;
  readonly payGroupAndStepConfirmed: boolean;
  readonly weeklyTimeBasisConfirmed: boolean;
  readonly fullMonthBaseEntitlementConfirmed: boolean;
}

export type DrkEmployeeDraftBaseResult =
  | {
      readonly kind: "draft-personal-table-base";
      readonly completeGross: false;
      readonly fullTimeTableCents: number;
      readonly personalTableBaseCents: number;
      readonly contractedWeeklyMinutes: number;
      readonly fullTimeWeeklyMinutes: number;
      readonly packageId: string;
      readonly versionId: string;
      readonly tableId: string;
      readonly groupId: string;
      readonly stepId: string;
      readonly sourceIds: readonly string[];
      readonly excludedComponents: readonly [
        "PARTIAL_MONTH",
        "TIME_PREMIUMS",
        "ALLOWANCES",
        "OVERTIME",
        "ANNUAL_PAYMENT",
        "READINESS_AND_ON_CALL",
      ];
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | "INVALID_PACKAGE"
        | "INVALID_MONTH"
        | "OUTSIDE_VALIDITY"
        | "DRK_APPLICABILITY_UNCONFIRMED"
        | "ANNEX_ASSIGNMENT_UNCONFIRMED"
        | "GROUP_OR_STAGE_UNCONFIRMED"
        | "WEEKLY_TIME_BASIS_UNCONFIRMED"
        | "FULL_MONTH_ENTITLEMENT_UNCONFIRMED"
        | "INVALID_WEEKLY_TIME"
        | "UNKNOWN_SELECTION"
        | "MISSING_TABLE_VALUE"
        | "AMOUNT_OVERFLOW";
    };

/** § 29 full-month table base only; never promotes a DRAFT to complete gross pay. */
export function calculateDrkEmployeeDraftTableBase({
  pkg,
  month,
  variantId,
  groupId,
  stepId,
  contractedWeeklyMinutes,
  fullTimeWeeklyMinutes,
  drkApplicabilityConfirmed,
  annexAssignmentConfirmed,
  payGroupAndStepConfirmed,
  weeklyTimeBasisConfirmed,
  fullMonthBaseEntitlementConfirmed,
}: DrkEmployeeDraftBaseInput): DrkEmployeeDraftBaseResult {
  const fail = (reason: Extract<DrkEmployeeDraftBaseResult, { kind: "unavailable" }>["reason"]) =>
    ({ kind: "unavailable", reason }) as const;
  const family = FAMILIES[pkg.packageId];
  if (!family || pkg.engineContractVersion !== 17 || !validateRulePackage(pkg).ok)
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
  if (!annexAssignmentConfirmed) return fail("ANNEX_ASSIGNMENT_UNCONFIRMED");
  if (!payGroupAndStepConfirmed) return fail("GROUP_OR_STAGE_UNCONFIRMED");
  if (
    !weeklyTimeBasisConfirmed ||
    contractedWeeklyMinutes === null ||
    fullTimeWeeklyMinutes === null
  )
    return fail("WEEKLY_TIME_BASIS_UNCONFIRMED");
  if (!fullMonthBaseEntitlementConfirmed) return fail("FULL_MONTH_ENTITLEMENT_UNCONFIRMED");
  if (
    !Number.isSafeInteger(contractedWeeklyMinutes) ||
    !Number.isSafeInteger(fullTimeWeeklyMinutes) ||
    contractedWeeklyMinutes <= 0 ||
    fullTimeWeeklyMinutes <= 0 ||
    contractedWeeklyMinutes > fullTimeWeeklyMinutes ||
    fullTimeWeeklyMinutes > 7 * 24 * 60
  )
    return fail("INVALID_WEEKLY_TIME");

  const selected = resolveTariffSelection(pkg, variantId, "BTG");
  if (
    variantId !== family.variantId ||
    selected?.familyId !== "drk-rtv" ||
    selected.engineId !== family.engineId ||
    selected.employmentKind !== "EMPLOYEE" ||
    selected.region.payTableId !== family.tableId ||
    Object.values(selected.capabilities).some((value) => value !== "UNSUPPORTED")
  )
    return fail("UNKNOWN_SELECTION");
  const canonicalGroupId = groupId.toLowerCase();
  const table = pkg.rules.payTables.find((item) => item.id === family.tableId);
  const matches = table?.entries.filter(
    (entry) => entry.groupId === canonicalGroupId && entry.stepId === stepId,
  );
  if (matches?.length !== 1) return fail("MISSING_TABLE_VALUE");
  const numerator = matches[0].monthlyCents * contractedWeeklyMinutes;
  if (!Number.isSafeInteger(numerator)) return fail("AMOUNT_OVERFLOW");

  return {
    kind: "draft-personal-table-base",
    completeGross: false,
    fullTimeTableCents: matches[0].monthlyCents,
    personalTableBaseCents: roundRemunerationCents(numerator, fullTimeWeeklyMinutes),
    contractedWeeklyMinutes,
    fullTimeWeeklyMinutes,
    packageId: pkg.packageId,
    versionId: pkg.versionId,
    tableId: family.tableId,
    groupId: canonicalGroupId,
    stepId,
    sourceIds: table!.sourceIds,
    excludedComponents: [
      "PARTIAL_MONTH",
      "TIME_PREMIUMS",
      "ALLOWANCES",
      "OVERTIME",
      "ANNUAL_PAYMENT",
      "READINESS_AND_ON_CALL",
    ],
  };
}
