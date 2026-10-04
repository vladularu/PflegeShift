import { describe, expect, it } from "vitest";
import e2025 from "../../rules/packages/reviewed/drk-rtv-e/2025-09-01-draft1.json";
import e2026 from "../../rules/packages/reviewed/drk-rtv-e/2026-10-01-draft1.json";
import p2025 from "../../rules/packages/reviewed/drk-rtv-p/2025-09-01-draft1.json";
import p2026 from "../../rules/packages/reviewed/drk-rtv-p/2026-10-01-draft1.json";
import s2026 from "../../rules/packages/reviewed/drk-rtv-s/2026-10-01-draft1.json";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { createRuleResolver } from "@/rules/rule-resolver";
import {
  calculateDrkEmployeeDraftFromProfile,
  type DrkEmployeeDraftFromProfileInput,
} from "./drk-employee-draft-from-profile";

const packages = [e2025, e2026, p2025, p2026, s2026] as RuleTariffPackage[];
const resolver = createRuleResolver(
  { tariff: packages, legal: [], holiday: [] },
  { tariff: "drk-rtv-e", legal: "unused", holiday: "unused" },
);
const confirmations: DrkEmployeeDraftFromProfileInput["confirmations"] = {
  drkApplicabilityConfirmed: true,
  annexAssignmentConfirmed: true,
  payGroupAndStepConfirmed: true,
  weeklyTimeBasisConfirmed: true,
  fullMonthBaseEntitlementConfirmed: true,
};

function profile(
  packageId: string,
  variant: string,
  group: string,
  level: string,
  effectiveFrom = "2025-01-01",
  weeklyMinutes = 2340,
  region = "BTG",
): DatedRemunerationProfile {
  return {
    effectiveFrom,
    revision: 1,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    data: {
      version: 1,
      weeklyMinutes,
      selection: {
        kind: "tariff",
        packageId,
        variant,
        region,
        group,
        level,
        fullTimeWeeklyMinutes: 2340,
      },
    },
  };
}
function calculate(
  month: string,
  profiles: readonly DatedRemunerationProfile[],
  facts: DrkEmployeeDraftFromProfileInput["confirmations"] = confirmations,
) {
  return calculateDrkEmployeeDraftFromProfile({ month, profiles, resolver, confirmations: facts });
}

describe("DRK E/P/S dated profile to catalog candidate", () => {
  it.each([
    ["drk-rtv-e", "ANLAGE_A1", "e9c", "4", 449655],
    ["drk-rtv-p", "ANLAGE_A2", "p6", "1", 302445],
    ["drk-rtv-s", "ANLAGE_A3", "s8b", "1", 358450],
  ] as const)(
    "uses the selected %s catalog table, not a TVöD fallback",
    (id, variant, group, level, cents) => {
      const result = calculate("2026-10", [profile(id, variant, group, level)]);
      expect(result).toMatchObject({
        kind: "draft-personal-table-base",
        packageId: id,
        personalTableBaseCents: cents,
        completeGross: false,
      });
    },
  );

  it("resolves an immutable P-table change by month and confirmed part-time basis", () => {
    const selected = profile("drk-rtv-p", "ANLAGE_A2", "p6", "1", "2025-01-01", 1170);
    expect(calculate("2025-09", [selected])).toMatchObject({
      kind: "draft-personal-table-base",
      versionId: "2025-09-01-draft1",
      personalTableBaseCents: 147104,
    });
    expect(calculate("2026-10", [selected])).toMatchObject({
      kind: "draft-personal-table-base",
      versionId: "2026-10-01-draft1",
      personalTableBaseCents: 151223,
    });
  });

  it("fails closed for a profile change, unknown date, wrong region and missing package", () => {
    const selected = profile("drk-rtv-p", "ANLAGE_A2", "p6", "1");
    expect(calculate("2026-10", [selected, { ...selected, effectiveFrom: "2026-10-15" }])).toEqual({
      kind: "unavailable",
      reason: "PROFILE_CHANGES_IN_MONTH",
    });
    expect(calculate("2026-10", [{ ...selected, effectiveFrom: null }])).toEqual({
      kind: "unavailable",
      reason: "PROFILE_MISSING_OR_UNDATED",
    });
    expect(
      calculate("2026-10", [
        profile("drk-rtv-p", "ANLAGE_A2", "p6", "1", "2025-01-01", 2340, "OTHER"),
      ]),
    ).toEqual({ kind: "unavailable", reason: "PROFILE_REGION_MISMATCH" });
    expect(calculate("2025-01", [selected])).toEqual({
      kind: "unavailable",
      reason: "RULE_PACKAGE_UNAVAILABLE",
    });
  });

  it("does not infer contractual applicability from the saved profile", () => {
    expect(
      calculate("2026-10", [profile("drk-rtv-e", "ANLAGE_A1", "e9c", "4")], {
        ...confirmations,
        drkApplicabilityConfirmed: false,
      }),
    ).toEqual({ kind: "unavailable", reason: "DRK_APPLICABILITY_UNCONFIRMED" });
  });

  it("rejects an inconsistent catalog generation within one month", () => {
    const selected = profile("drk-rtv-e", "ANLAGE_A1", "e9c", "4");
    const inconsistent = {
      ...resolver,
      resolveTariff: (date: string) => ({
        ok: true as const,
        value: (date.endsWith("-01") ? e2025 : e2026) as RuleTariffPackage,
      }),
    };
    expect(
      calculateDrkEmployeeDraftFromProfile({
        month: "2026-10",
        profiles: [selected],
        resolver: inconsistent,
        confirmations,
      }),
    ).toEqual({ kind: "unavailable", reason: "RULE_VERSION_CHANGES_IN_MONTH" });
  });
});
