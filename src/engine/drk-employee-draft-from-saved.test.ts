import { describe, expect, it } from "vitest";
import e2026 from "../../rules/packages/reviewed/drk-rtv-e/2026-10-01-draft1.json";
import p2026 from "../../rules/packages/reviewed/drk-rtv-p/2026-10-01-draft1.json";
import s2026 from "../../rules/packages/reviewed/drk-rtv-s/2026-10-01-draft1.json";
import { validateSavedDrkEmployeeMonthConfirmation } from "@/domain/saved-drk-employee-month-confirmation";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { createRuleResolver } from "@/rules/rule-resolver";
import { calculateDrkEmployeeDraftFromSaved } from "./drk-employee-draft-from-saved";

const resolver = createRuleResolver(
  { tariff: [e2026, p2026, s2026] as RuleTariffPackage[], legal: [], holiday: [] },
  { tariff: "drk-rtv-p", legal: "unused", holiday: "unused" },
);

function profile(
  packageId = "drk-rtv-p",
  variant = "ANLAGE_A2",
  group = "P6",
  level = "1",
): DatedRemunerationProfile {
  return {
    effectiveFrom: "2026-10-01",
    revision: 1,
    createdAt: "2026-09-22T00:00:00Z",
    updatedAt: "2026-09-22T00:00:00Z",
    data: {
      version: 1,
      weeklyMinutes: 2340,
      selection: {
        kind: "tariff",
        packageId,
        variant,
        region: "BTG",
        group,
        level,
        fullTimeWeeklyMinutes: 2340,
      },
    },
  };
}

function saved(
  packageId: "drk-rtv-e" | "drk-rtv-p" | "drk-rtv-s" = "drk-rtv-p",
  variantId: "ANLAGE_A1" | "ANLAGE_A2" | "ANLAGE_A3" = "ANLAGE_A2",
  groupId = "p6",
  stepId = "s1",
) {
  return validateSavedDrkEmployeeMonthConfirmation({
    month: "2026-10",
    profileEffectiveFrom: "2026-10-01",
    profileRevision: 1,
    packageId,
    ruleVersionId: "2026-10-01-draft1",
    variantId,
    regionId: "BTG",
    groupId,
    stepId,
    contractedWeeklyMinutes: 2340,
    fullTimeWeeklyMinutes: 2340,
    drkApplicabilityConfirmed: true,
    annexAssignmentConfirmed: true,
    payGroupAndStepConfirmed: true,
    weeklyTimeBasisConfirmed: true,
    fullMonthBaseEntitlementConfirmed: true,
    revision: 1,
    confirmedAt: "2026-09-22T00:00:00Z",
    updatedAt: "2026-09-22T00:00:00Z",
  });
}

function calculate(
  profiles: readonly DatedRemunerationProfile[] = [profile()],
  confirmations = [saved()],
) {
  return calculateDrkEmployeeDraftFromSaved({
    month: "2026-10",
    profiles,
    resolver,
    confirmations,
  });
}

describe("saved DRK month answers to isolated catalog draft", () => {
  it.each([
    ["drk-rtv-e", "ANLAGE_A1", "E9C", "e9c", "4", "s4", 449655],
    ["drk-rtv-p", "ANLAGE_A2", "P6", "p6", "1", "s1", 302445],
    ["drk-rtv-s", "ANLAGE_A3", "S8B", "s8b", "1", "s1", 358450],
  ] as const)(
    "uses saved answers and selected %s table only",
    (id, variant, group, groupId, level, stepId, cents) => {
      expect(
        calculate([profile(id, variant, group, level)], [saved(id, variant, groupId, stepId)]),
      ).toMatchObject({
        kind: "draft-personal-table-base",
        packageId: id,
        personalTableBaseCents: cents,
        completeGross: false,
      });
    },
  );

  it("fails closed for missing, duplicate or stale personal answers", () => {
    expect(calculate([profile()], [])).toEqual({
      kind: "unavailable",
      reason: "CONFIRMATION_MISSING",
    });
    expect(calculate([profile()], [saved(), saved()])).toEqual({
      kind: "unavailable",
      reason: "CONFIRMATION_AMBIGUOUS",
    });
    expect(calculate([{ ...profile(), revision: 2 }])).toEqual({
      kind: "unavailable",
      reason: "CONFIRMATION_STALE",
    });
    expect(calculate([profile()], [{ ...saved(), ruleVersionId: "other-version" }])).toEqual({
      kind: "unavailable",
      reason: "CONFIRMATION_STALE",
    });
  });

  it("does not interpret an unknown or negative answer as consent", () => {
    expect(calculate([profile()], [{ ...saved(), weeklyTimeBasisConfirmed: null }])).toEqual({
      kind: "unavailable",
      reason: "WEEKLY_TIME_BASIS_UNCONFIRMED",
    });
    expect(calculate([profile()], [{ ...saved(), annexAssignmentConfirmed: false }])).toEqual({
      kind: "unavailable",
      reason: "ANNEX_ASSIGNMENT_UNCONFIRMED",
    });
  });

  it("rejects profile changes inside the month and a changed catalog generation", () => {
    expect(calculate([profile(), { ...profile(), effectiveFrom: "2026-10-15" }])).toEqual({
      kind: "unavailable",
      reason: "PROFILE_CHANGES_IN_MONTH",
    });
    const changed = {
      ...resolver,
      resolveTariff: (date: string) => ({
        ok: true as const,
        value: (date.endsWith("-01") ? p2026 : e2026) as RuleTariffPackage,
      }),
    };
    expect(
      calculateDrkEmployeeDraftFromSaved({
        month: "2026-10",
        profiles: [profile()],
        resolver: changed,
        confirmations: [saved()],
      }),
    ).toEqual({ kind: "unavailable", reason: "RULE_VERSION_CHANGES_IN_MONTH" });
  });
});
