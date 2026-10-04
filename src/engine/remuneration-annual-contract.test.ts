import { describe, expect, it } from "vitest";
import employeeValue from "../../rules/packages/reviewed/tvoed-vka-bt-k/2026-05-r3.json";
import trainingValue from "../../rules/packages/reviewed/tvaoed-pflege-vka/2026-05.json";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type { SavedTariffAnnualClaim } from "@/domain/saved-tariff-annual-claim";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { bundledRuleResolver } from "@/rules/rule-resolver";
import { RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS } from "@/rules/rule-catalog-engine-support";
import { remunerationTariffOptions } from "@/features/settings/remuneration-tariff-options";
import {
  remunerationDataFromForm,
  remunerationFormValues,
} from "@/features/settings/remuneration-editor-values";
import { tariffAnnualFixture } from "./tariff-annual-test-fixtures";
import { history, resolver, shift, work } from "./remuneration-test-fixtures";
import { calculateDatedMonthlyRemuneration } from "./remuneration-month";
import { resolveRemunerationContext } from "./remuneration-context";

function fixture(training: boolean) {
  const { pkg: arithmetic, claim } = tariffAnnualFixture(training);
  const pkg = training ? (structuredClone(trainingValue) as RuleTariffPackage) : arithmetic;
  if (training) {
    pkg.engineContractVersion = 11;
    pkg.rules.selection!.capabilities.annualPayment = "SUPPORTED";
    pkg.rules.annualPaymentRules = arithmetic.rules.annualPaymentRules!.map((rule) => ({
      ...rule,
      payGroups: [
        ...new Set(
          pkg.rules.payTables.flatMap((table) => table.entries.map((entry) => entry.groupId)),
        ),
      ] as [string, ...string[]],
      sourceIds: [
        ...pkg.rules.selection!.variants.find((variant) => variant.id === rule.variantId)!
          .sourceIds,
      ],
    })) as NonNullable<RuleTariffPackage["rules"]["annualPaymentRules"]>;
  }
  const original = (training ? trainingValue : employeeValue) as RuleTariffPackage;
  const profile: DatedRemunerationProfile = {
    ...history(),
    data: {
      version: training ? 3 : 1,
      weeklyMinutes: 2310,
      selection: {
        kind: "tariff",
        packageId: pkg.packageId,
        variant: "BT_K",
        region: "OTHER",
        group: training ? "b" : "P5",
        level: "1",
        fullTimeWeeklyMinutes: 2310,
        ...(training ? { specialDutyAllowance: "NONE" as const } : {}),
      },
    },
  };
  const row: SavedTariffAnnualClaim = {
    claim,
    actualPayment: null,
    revoked: false,
    revision: 1,
    updatedAt: work.updatedAt,
  };
  return { pkg, original, profile, row };
}

describe("monthly pay remains connected when annual rules are added", () => {
  it.each([false, true])(
    "preserves base, premiums, allowances and overtime with annual contract (training %s)",
    (training) => {
      const { pkg, original, profile, row } = fixture(training);
      const duty = shift({
        date: "2026-11-15",
        startTime: "20:00",
        endTime: "06:00",
        overtimeMinutes: 60,
        tariffOvertimeConfirmed: true,
      });
      const input = {
        month: "2026-11",
        history: [profile],
        workProfile: work,
        shifts: [duty],
        overtimeAllocations: new Map([[duty.id, [{ date: "2026-11-16", minutes: 60 }]]]),
        allowanceEntitlements: [
          {
            from: "2026-11-01",
            through: "2026-11-30",
            status: "NONE" as const,
            origin: "confirmed" as const,
            revision: 1,
          },
        ],
      };
      const before = calculateDatedMonthlyRemuneration({
        ...input,
        resolver: resolver([original]),
      });
      const after = calculateDatedMonthlyRemuneration({
        ...input,
        resolver: resolver([pkg]),
        tariffAnnualClaims: [row],
      });
      for (const key of ["base", "timePremiums", "allowances", "overtime"] as const) {
        expect(after[key].totalCents).toBe(before[key].totalCents);
        expect(after[key].knownSubtotalCents).toBe(before[key].knownSubtotalCents);
        expect(
          after[key].positions.map((p) => [p.label, p.amountCents, p.status, p.issue]),
        ).toEqual(before[key].positions.map((p) => [p.label, p.amountCents, p.status, p.issue]));
      }
      expect(after.base.totalCents).toBe(training ? 149069 : 290718);
      expect(after.timePremiums.knownSubtotalCents).toBeGreaterThan(0);
      expect(after.overtime.knownSubtotalCents).toBeGreaterThan(0);
      expect(after.annualPayments.totalCents).toBe(training ? 135000 : 270000);
      expect(after.knownSubtotalCents - before.knownSubtotalCents).toBe(training ? 135000 : 270000);
    },
  );
  it.each([false, true])(
    "keeps tariff options and form roundtrips available (training %s)",
    (training) => {
      const { pkg, profile } = fixture(training);
      const rules = resolver([pkg]);
      const options = remunerationTariffOptions("2026-11-01", rules);
      expect(options.unavailable).toEqual([]);
      expect(options.available).toHaveLength(1);
      const groups = options.available[0].groups;
      expect(groups.find((g) => g.id === (training ? "b" : "P5"))!.levels).toEqual(
        training ? ["1", "2", "3"] : ["1", "2", "3", "4", "5", "6"],
      );
      if (!training)
        expect(groups.find((g) => g.id === "P7")!.levels).toEqual(["2", "3", "4", "5", "6"]);
      const saved = remunerationDataFromForm(
        remunerationFormValues(profile.data),
        "2026-11-01",
        rules,
      );
      expect(saved.selection).toMatchObject(profile.data.selection);
      expect(
        resolveRemunerationContext("2026-11-01", [{ ...profile, data: saved }], rules).kind,
      ).toBe(training ? "training-tariff" : "tariff");
    },
  );
  it.each([false, true])(
    "requires missing annual inputs without suppressing the known base pay (training %s)",
    (training) => {
      const { pkg, profile } = fixture(training);
      const result = calculateDatedMonthlyRemuneration({
        month: "2026-11",
        history: [profile],
        workProfile: work,
        shifts: [],
        allowanceEntitlements: [],
        resolver: resolver([pkg]),
      });
      expect(result.base.totalCents).toBe(training ? 149069 : 290718);
      expect(result.annualPayments.totalCents).toBeNull();
      expect(result.estimatedGrossCents).toBeNull();
    },
  );
  it.each([false, true])(
    "rejects a contract 11 package without complete annual terms (training %s)",
    (training) => {
      const { pkg, profile } = fixture(training);
      delete pkg.rules.annualPaymentRules;
      expect(resolveRemunerationContext("2026-11-01", [profile], resolver([pkg])).kind).toBe(
        "unavailable",
      );
      expect(remunerationTariffOptions("2026-11-01", resolver([pkg])).available).toEqual([]);
    },
  );
  it.each([false, true])("does not substitute another annual family (training %s)", (training) => {
    const { pkg, profile } = fixture(training);
    pkg.rules.selection!.familyId = "other-family";
    expect(resolveRemunerationContext("2026-11-01", [profile], resolver([pkg])).kind).toBe(
      "unavailable",
    );
  });
  it("supports contract 11 while unapproved training drafts remain outside the bundled catalog", () => {
    expect([...RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS]).toContain(11);
    expect(employeeValue.status).toBe("REVIEWED");
    expect(fixture(true).pkg.status).toBe("DRAFT");
    expect(bundledRuleResolver.resolveTariff("2026-11-01", trainingValue.packageId).ok).toBe(false);
    expect(trainingValue.status).toBe("DRAFT");
  });
});
