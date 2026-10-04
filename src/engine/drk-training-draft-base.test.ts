import { describe, expect, it } from "vitest";
import p2024 from "../../rules/packages/reviewed/drk-rtv-training/2024-06-01-draft1.json";
import p2025 from "../../rules/packages/reviewed/drk-rtv-training/2025-09-01-draft1.json";
import p2026 from "../../rules/packages/reviewed/drk-rtv-training/2026-10-01-draft1.json";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  calculateDrkTrainingDraftTableBase,
  type DrkTrainingDraftBaseInput,
} from "./drk-training-draft-base";

const cases = [
  [p2024, "2024-06", "ANLAGE_3", [123074, 128727, 133913, 141108]],
  [p2024, "2024-06", "ANLAGE_3A_A", [136006, 142839, 153955]],
  [p2024, "2024-06", "ANLAGE_3A_B", [128246]],
  [p2025, "2025-09", "ANLAGE_3", [132074, 137727, 142913, 150108]],
  [p2025, "2025-09", "ANLAGE_3A_A", [145006, 151839, 162955]],
  [p2025, "2025-09", "ANLAGE_3A_B", [137246]],
  [p2026, "2026-10", "ANLAGE_3", [141074, 146727, 151913, 159108]],
  [p2026, "2026-10", "ANLAGE_3A_A", [154006, 160839, 171955]],
  [p2026, "2026-10", "ANLAGE_3A_B", [146246]],
] as const;

function input(
  raw: RuleTariffPackage,
  month: string,
  variantId: string,
  trainingYear: number | null,
  patch: Partial<DrkTrainingDraftBaseInput> = {},
): DrkTrainingDraftBaseInput {
  return {
    pkg: raw,
    month,
    variantId,
    trainingYear,
    drkApplicabilityConfirmed: true,
    trainingCategoryConfirmed: true,
    trainingYearConfirmed: true,
    fullMonthBaseEntitlementConfirmed: true,
    fullTimeTrainingConfirmed: true,
    ...patch,
  };
}

describe("isolated DRK training draft table base", () => {
  it.each(cases)(
    "resolves every printed amount, never a complete gross",
    (raw, month, variant, values) => {
      for (const [index, expectedCents] of values.entries()) {
        const result = calculateDrkTrainingDraftTableBase(
          input(raw as RuleTariffPackage, month, variant, index + 1),
        );
        expect(result.kind).toBe("draft-full-month-training-table-base");
        if (result.kind !== "draft-full-month-training-table-base") continue;
        expect(result.monthlyCents).toBe(expectedCents);
        expect(result.completeGross).toBe(false);
        expect(result.trainingYear).toBe(index + 1);
        expect(result.excludedComponents).toContain("ANNUAL_PAYMENT");
        expect(result.excludedComponents).toContain("PART_TIME");
      }
    },
  );

  it("fails closed at table boundaries and for invalid months", () => {
    expect(
      calculateDrkTrainingDraftTableBase(
        input(p2024 as RuleTariffPackage, "2025-09", "ANLAGE_3", 1),
      ),
    ).toEqual({ kind: "unavailable", reason: "OUTSIDE_VALIDITY" });
    expect(
      calculateDrkTrainingDraftTableBase(
        input(p2025 as RuleTariffPackage, "2026-10", "ANLAGE_3", 1),
      ),
    ).toEqual({ kind: "unavailable", reason: "OUTSIDE_VALIDITY" });
    expect(
      calculateDrkTrainingDraftTableBase(
        input(p2026 as RuleTariffPackage, "2026-09", "ANLAGE_3", 1),
      ),
    ).toEqual({ kind: "unavailable", reason: "OUTSIDE_VALIDITY" });
    expect(
      calculateDrkTrainingDraftTableBase(
        input(p2026 as RuleTariffPackage, "2026-13", "ANLAGE_3", 1),
      ),
    ).toEqual({ kind: "unavailable", reason: "INVALID_MONTH" });
  });

  it("requires explicit applicability, category, year, full month and full-time facts", () => {
    const standard = input(p2026 as RuleTariffPackage, "2026-10", "ANLAGE_3A_A", 2);
    for (const [field, reason] of [
      ["drkApplicabilityConfirmed", "DRK_APPLICABILITY_UNCONFIRMED"],
      ["trainingCategoryConfirmed", "TRAINING_CATEGORY_UNCONFIRMED"],
      ["trainingYearConfirmed", "TRAINING_YEAR_UNCONFIRMED"],
      ["fullMonthBaseEntitlementConfirmed", "FULL_MONTH_ENTITLEMENT_UNCONFIRMED"],
      ["fullTimeTrainingConfirmed", "NON_FULL_TIME_SEPARATE_CALCULATION"],
    ] as const)
      expect(calculateDrkTrainingDraftTableBase({ ...standard, [field]: false })).toEqual({
        kind: "unavailable",
        reason,
      });
    expect(calculateDrkTrainingDraftTableBase({ ...standard, trainingYear: null })).toEqual({
      kind: "unavailable",
      reason: "TRAINING_YEAR_UNCONFIRMED",
    });
  });

  it("rejects unknown category, unavailable years and a mutated package", () => {
    const standard = input(p2025 as RuleTariffPackage, "2025-09", "ANLAGE_3A_B", 1);
    expect(calculateDrkTrainingDraftTableBase({ ...standard, variantId: "ANLAGE_A2" })).toEqual({
      kind: "unavailable",
      reason: "UNKNOWN_SELECTION",
    });
    expect(calculateDrkTrainingDraftTableBase({ ...standard, trainingYear: 2 })).toEqual({
      kind: "unavailable",
      reason: "MISSING_TABLE_VALUE",
    });
    expect(calculateDrkTrainingDraftTableBase({ ...standard, trainingYear: 5 })).toEqual({
      kind: "unavailable",
      reason: "INVALID_TRAINING_YEAR",
    });
    const mutated = structuredClone(p2025) as RuleTariffPackage;
    mutated.rules.payTables[0].entries[0].monthlyCents = -1;
    expect(calculateDrkTrainingDraftTableBase({ ...standard, pkg: mutated })).toEqual({
      kind: "unavailable",
      reason: "INVALID_PACKAGE",
    });
  });
});
