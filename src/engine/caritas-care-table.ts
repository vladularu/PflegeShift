import { Temporal } from "@js-temporal/polyfill";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { resolveTariffSelection } from "@/rules/tariff-selection";
import { validateRulePackage } from "@/rules/validation";

/** A printed full-time table value only; never a personal salary or permission to run pay rules. */
export type CaritasCareTableLookup =
  | {
      readonly kind: "source-table";
      readonly packageId: string;
      readonly versionId: string;
      readonly tableId: string;
      readonly monthlyCents: number;
      readonly groupId: string;
      readonly stepId: string;
      readonly sourceIds: readonly string[];
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        "INVALID_PACKAGE" | "OUTSIDE_VALIDITY" | "UNKNOWN_SELECTION" | "MISSING_TABLE_VALUE";
    };

export function lookupCaritasCareTable(
  pkg: RuleTariffPackage,
  date: string,
  variantId: string,
  regionId: string,
  groupId: string,
  stepId: string,
): CaritasCareTableLookup {
  if (pkg.engineContractVersion !== 14 || !validateRulePackage(pkg).ok)
    return { kind: "unavailable", reason: "INVALID_PACKAGE" };
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) throw new RangeError("Invalid ISO date");
    Temporal.PlainDate.from(date);
  } catch {
    return { kind: "unavailable", reason: "OUTSIDE_VALIDITY" };
  }
  if (date < pkg.validFrom || (pkg.validTo !== null && date > pkg.validTo))
    return { kind: "unavailable", reason: "OUTSIDE_VALIDITY" };
  const selection = resolveTariffSelection(pkg, variantId, regionId);
  if (
    selection?.familyId !== "avr-caritas-p" ||
    selection.engineId !== "avr-caritas-p-v1" ||
    selection.region.payTableId === undefined ||
    Object.values(selection.capabilities).some((capability) => capability !== "UNSUPPORTED")
  )
    return { kind: "unavailable", reason: "UNKNOWN_SELECTION" };
  const table = pkg.rules.payTables.find((item) => item.id === selection.region.payTableId);
  const matches = table?.entries.filter(
    (entry) => entry.groupId === groupId.toLowerCase() && entry.stepId === stepId,
  );
  if (!table || matches?.length !== 1)
    return { kind: "unavailable", reason: "MISSING_TABLE_VALUE" };
  return {
    kind: "source-table",
    packageId: pkg.packageId,
    versionId: pkg.versionId,
    tableId: table.id,
    monthlyCents: matches[0].monthlyCents,
    groupId: matches[0].groupId,
    stepId: matches[0].stepId,
    sourceIds: table.sourceIds,
  };
}
