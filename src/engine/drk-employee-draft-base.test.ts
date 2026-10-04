import { describe, expect, it } from "vitest";
import e2024 from "../../rules/packages/reviewed/drk-rtv-e/2024-06-01-draft1.json";
import e2025 from "../../rules/packages/reviewed/drk-rtv-e/2025-09-01-draft1.json";
import e2026 from "../../rules/packages/reviewed/drk-rtv-e/2026-10-01-draft1.json";
import e2027 from "../../rules/packages/reviewed/drk-rtv-e/2027-10-01-draft1.json";
import p2024 from "../../rules/packages/reviewed/drk-rtv-p/2024-06-01-draft1.json";
import p2025 from "../../rules/packages/reviewed/drk-rtv-p/2025-09-01-draft1.json";
import p2026 from "../../rules/packages/reviewed/drk-rtv-p/2026-10-01-draft1.json";
import s2024 from "../../rules/packages/reviewed/drk-rtv-s/2024-10-01-draft1.json";
import s2025 from "../../rules/packages/reviewed/drk-rtv-s/2025-09-01-draft1.json";
import s2026 from "../../rules/packages/reviewed/drk-rtv-s/2026-10-01-draft1.json";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  calculateDrkEmployeeDraftTableBase,
  type DrkEmployeeDraftBaseInput,
} from "./drk-employee-draft-base";

const cases = [
  [e2024, "2024-06", "ANLAGE_A1", "e9c", "s4", 385833],
  [e2025, "2025-09", "ANLAGE_A1", "e9c", "s4", 397408],
  [e2026, "2026-10", "ANLAGE_A1", "e9c", "s4", 449655],
  [e2027, "2027-10", "ANLAGE_A1", "e9c", "s4", 454655],
  [p2024, "2024-06", "ANLAGE_A2", "p6", "s1", 281253],
  [p2025, "2025-09", "ANLAGE_A2", "p6", "s1", 294207],
  [p2026, "2026-10", "ANLAGE_A2", "p6", "s1", 302445],
  [s2024, "2024-10", "ANLAGE_A3", "s8b", "s1", 337687],
  [s2025, "2025-09", "ANLAGE_A3", "s8b", "s1", 348687],
  [s2026, "2026-10", "ANLAGE_A3", "s8b", "s1", 358450],
] as const;

function input(
  raw: RuleTariffPackage,
  month: string,
  variantId: string,
  groupId: string,
  stepId: string,
  patch: Partial<DrkEmployeeDraftBaseInput> = {},
): DrkEmployeeDraftBaseInput {
  return {
    pkg: raw,
    month,
    variantId,
    groupId,
    stepId,
    contractedWeeklyMinutes: 2340,
    fullTimeWeeklyMinutes: 2340,
    drkApplicabilityConfirmed: true,
    annexAssignmentConfirmed: true,
    payGroupAndStepConfirmed: true,
    weeklyTimeBasisConfirmed: true,
    fullMonthBaseEntitlementConfirmed: true,
    ...patch,
  };
}

describe("isolated DRK employee E/P/S draft table base", () => {
  it.each(cases)(
    "resolves official reference rows at every table boundary",
    (raw, month, variant, group, stage, expectedCents) => {
      const result = calculateDrkEmployeeDraftTableBase(
        input(raw as RuleTariffPackage, month, variant, group, stage),
      );
      expect(result.kind).toBe("draft-personal-table-base");
      if (result.kind !== "draft-personal-table-base") return;
      expect(result.fullTimeTableCents).toBe(expectedCents);
      expect(result.personalTableBaseCents).toBe(expectedCents);
      expect(result.completeGross).toBe(false);
      expect(result.excludedComponents).toContain("READINESS_AND_ON_CALL");
    },
  );

  it("applies only a confirmed § 29 part-time ratio and rounds half a cent up", () => {
    const result = calculateDrkEmployeeDraftTableBase(
      input(p2026 as RuleTariffPackage, "2026-10", "ANLAGE_A2", "p6", "s1", {
        contractedWeeklyMinutes: 1200,
        fullTimeWeeklyMinutes: 2340,
      }),
    );
    expect(result.kind === "draft-personal-table-base" && result.personalTableBaseCents).toBe(
      155100,
    );
    const halfCent = calculateDrkEmployeeDraftTableBase(
      input(e2026 as RuleTariffPackage, "2026-10", "ANLAGE_A1", "e9c", "s4", {
        contractedWeeklyMinutes: 1200,
        fullTimeWeeklyMinutes: 2400,
      }),
    );
    expect(halfCent.kind === "draft-personal-table-base" && halfCent.personalTableBaseCents).toBe(
      224828,
    );
  });

  it("blocks old/new table mismatches, invalid months and unavailable stages", () => {
    expect(
      calculateDrkEmployeeDraftTableBase(
        input(p2025 as RuleTariffPackage, "2026-10", "ANLAGE_A2", "p6", "s1"),
      ),
    ).toEqual({ kind: "unavailable", reason: "OUTSIDE_VALIDITY" });
    expect(
      calculateDrkEmployeeDraftTableBase(
        input(e2027 as RuleTariffPackage, "2027-09", "ANLAGE_A1", "e9c", "s4"),
      ),
    ).toEqual({ kind: "unavailable", reason: "OUTSIDE_VALIDITY" });
    expect(
      calculateDrkEmployeeDraftTableBase(
        input(s2026 as RuleTariffPackage, "2026-13", "ANLAGE_A3", "s8b", "s1"),
      ),
    ).toEqual({ kind: "unavailable", reason: "INVALID_MONTH" });
    expect(
      calculateDrkEmployeeDraftTableBase(
        input(p2026 as RuleTariffPackage, "2026-10", "ANLAGE_A2", "p7", "s1"),
      ),
    ).toEqual({ kind: "unavailable", reason: "MISSING_TABLE_VALUE" });
    expect(
      calculateDrkEmployeeDraftTableBase(
        input(e2026 as RuleTariffPackage, "2026-10", "ANLAGE_A2", "e9c", "s4"),
      ),
    ).toEqual({ kind: "unavailable", reason: "UNKNOWN_SELECTION" });
  });

  it("refuses missing confirmations and implausible weekly time", () => {
    const standard = input(s2025 as RuleTariffPackage, "2025-09", "ANLAGE_A3", "s8b", "s1");
    for (const [field, reason] of [
      ["drkApplicabilityConfirmed", "DRK_APPLICABILITY_UNCONFIRMED"],
      ["annexAssignmentConfirmed", "ANNEX_ASSIGNMENT_UNCONFIRMED"],
      ["payGroupAndStepConfirmed", "GROUP_OR_STAGE_UNCONFIRMED"],
      ["weeklyTimeBasisConfirmed", "WEEKLY_TIME_BASIS_UNCONFIRMED"],
      ["fullMonthBaseEntitlementConfirmed", "FULL_MONTH_ENTITLEMENT_UNCONFIRMED"],
    ] as const)
      expect(calculateDrkEmployeeDraftTableBase({ ...standard, [field]: false })).toEqual({
        kind: "unavailable",
        reason,
      });
    expect(
      calculateDrkEmployeeDraftTableBase({ ...standard, fullTimeWeeklyMinutes: null }),
    ).toEqual({ kind: "unavailable", reason: "WEEKLY_TIME_BASIS_UNCONFIRMED" });
    expect(
      calculateDrkEmployeeDraftTableBase({ ...standard, contractedWeeklyMinutes: 2400 }),
    ).toEqual({ kind: "unavailable", reason: "INVALID_WEEKLY_TIME" });
    const mutated = structuredClone(s2025) as RuleTariffPackage;
    mutated.rules.payTables[0].entries[0].monthlyCents = -1;
    expect(calculateDrkEmployeeDraftTableBase({ ...standard, pkg: mutated })).toEqual({
      kind: "unavailable",
      reason: "INVALID_PACKAGE",
    });
  });
});
