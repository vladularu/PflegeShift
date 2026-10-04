import { describe, expect, it } from "vitest";
import legacy from "../../rules/packages/reviewed/tvoed-vka-bt-k/2026-05.json";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type { SavedTariffAnnualClaim } from "@/domain/saved-tariff-annual-claim";
import { missingTariffAnnualClaims } from "./remuneration-annual-coverage";
import { calculateDatedMonthlyRemuneration } from "./remuneration-month";
import { tariffAnnualFixture } from "./tariff-annual-test-fixtures";
import { history, resolver, work } from "./remuneration-test-fixtures";

function fixture(training = false) {
  const { pkg, claim } = tariffAnnualFixture(training);
  const profile = history();
  const selection = profile.data.selection;
  if (selection.kind !== "tariff") throw new Error("Expected tariff fixture");
  const data = {
    ...profile.data,
    selection: {
      ...selection,
      packageId: claim.selection.packageId,
      variant: claim.selection.variant,
      region: claim.selection.region,
      group: claim.selection.group,
    },
  };
  const row: SavedTariffAnnualClaim = {
    claim,
    actualPayment: null,
    revoked: false,
    revision: 1,
    updatedAt: work.updatedAt,
  };
  return { pkg, claim, row, profile: { ...profile, data }, rules: resolver([pkg]) };
}
const own = (effectiveFrom: string): DatedRemunerationProfile => ({
  ...history(effectiveFrom),
  data: {
    version: 1,
    weeklyMinutes: 2310,
    selection: { kind: "own-monthly", monthlyGrossCents: 300000 },
  },
});
describe("annual tariff input coverage", () => {
  it.each([false, true])(
    "missing personal claim is unavailable only in the declared payout month (training %s)",
    (training) => {
      const { profile, rules } = fixture(training);
      const results = Array.from({ length: 12 }, (_, i) =>
        missingTariffAnnualClaims(`2026-${String(i + 1).padStart(2, "0")}`, [profile], [], rules),
      );
      expect(results.flatMap((r) => r.positions)).toHaveLength(1);
      expect(results[10]).toMatchObject({
        complete: false,
        totalCents: null,
        knownSubtotalCents: 0,
      });
      expect(results[10].positions[0]).toMatchObject({
        amountCents: null,
        issue: { code: "ANNUAL_INPUT_MISSING" },
        basis: { tariff: { claimRevision: null, missing: ["claim"] } },
      });
      expect(results[10].positions[0].source.references.length).toBeGreaterThan(0);
    },
  );
  it("retains the year's tariff after switching to own pay, but excludes expired and future profiles", () => {
    const { profile, rules } = fixture();
    expect(
      missingTariffAnnualClaims(
        "2026-11",
        [own("2026-04-01"), { ...profile, effectiveFrom: "2025-10-01" }],
        [],
        rules,
      ).complete,
    ).toBe(false);
    expect(
      missingTariffAnnualClaims(
        "2026-11",
        [{ ...profile, effectiveFrom: "2025-01-01" }, own("2026-01-01")],
        [],
        rules,
      ).positions,
    ).toEqual([]);
    expect(
      missingTariffAnnualClaims("2026-11", [{ ...profile, effectiveFrom: "2027-01-01" }], [], rules)
        .positions,
    ).toEqual([]);
  });
  it("deduplicates group and step changes within a tariff area", () => {
    const { profile, rules } = fixture();
    const changed = history("2026-09-01", "P6", 1155, "2");
    expect(
      missingTariffAnnualClaims("2026-11", [changed, profile], [], rules).positions,
    ).toHaveLength(1);
  });
  it("a manually selected annual group covers group changes without inventing another claim", () => {
    const { profile, row, rules } = fixture();
    const changed = history("2026-09-01", "P6", 1155, "2");
    expect(
      missingTariffAnnualClaims("2026-11", [changed, profile], [row], rules).positions,
    ).toEqual([]);
  });
  it("does not let another tariff area or year hide missing inputs", () => {
    const { profile, row, claim, rules } = fixture();
    for (const selection of [
      { ...claim.selection, variant: "BT_B" },
      { ...claim.selection, region: "KAV_BW" },
      { ...claim.selection, packageId: "other-tariff" },
    ]) {
      expect(
        missingTariffAnnualClaims(
          "2026-11",
          [profile],
          [{ ...row, claim: { ...claim, selection } }],
          rules,
        ).complete,
      ).toBe(false);
    }
    expect(
      missingTariffAnnualClaims(
        "2026-11",
        [profile],
        [{ ...row, claim: { ...claim, year: 2025 } }],
        rules,
      ).complete,
    ).toBe(false);
  });
  it.each([0, 12345])(
    "a confirmed actual %s paid next year covers the original claim year without accessing rules",
    (grossCents) => {
      const { profile, row, rules } = fixture();
      expect(
        missingTariffAnnualClaims(
          "2026-11",
          [profile],
          [{ ...row, actualPayment: { grossCents, payoutMonth: "2027-01" } }],
          {
            ...rules,
            annualTariffCandidates: () => {
              throw new Error("Do not read rules for a covered actual");
            },
          },
        ).positions,
      ).toEqual([]);
    },
  );
  it("deactivating a claim restores the warning instead of confirming zero entitlement", () => {
    const { profile, row, rules } = fixture();
    expect(
      missingTariffAnnualClaims("2026-11", [profile], [{ ...row, revoked: true }], rules).complete,
    ).toBe(false);
  });
  it("does not manufacture annual entitlement for own pay or older catalogs", () => {
    const { rules } = fixture();
    expect(missingTariffAnnualClaims("2026-11", [own("2026-01-01")], [], rules).positions).toEqual(
      [],
    );
    expect(
      missingTariffAnnualClaims("2026-11", [history()], [], resolver([legacy as RuleTariffPackage]))
        .positions,
    ).toEqual([]);
  });
  it("does not invent a date when supported annual rules conflict", () => {
    const { profile, pkg } = fixture();
    const next = structuredClone(pkg);
    next.versionId = "2026-05-r3";
    next.rules.annualPaymentRules![0].payoutMonth = 12;
    const result = missingTariffAnnualClaims("2026-07", [profile], [], resolver([pkg, next]));
    expect(result.totalCents).toBeNull();
    expect(result.positions[0].issue?.code).toBe("ANNUAL_RULE_AMBIGUOUS");
  });
  it("keeps unknown group coverage unavailable and does not borrow another group's rule", () => {
    const { rules } = fixture();
    const result = missingTariffAnnualClaims(
      "2026-07",
      [history("2026-01-01", "unavailable")],
      [],
      rules,
    );
    expect(result.totalCents).toBeNull();
    expect(result.positions[0].issue?.code).toBe("ANNUAL_RULE_MISSING");
  });
  it("does not turn an undated profile into confirmed historical employment", () => {
    const { profile, rules } = fixture();
    const result = missingTariffAnnualClaims(
      "2026-11",
      [{ ...profile, effectiveFrom: null }],
      [],
      rules,
    );
    expect(result.totalCents).toBeNull();
    expect(result.positions[0].source.profileEffectiveFrom).toBeNull();
  });
  it("passes coverage through the monthly orchestrator without storing a claim", () => {
    const { profile, rules, row } = fixture();
    const input = {
      month: "2026-11",
      shifts: [],
      workProfile: work,
      history: [profile],
      allowanceEntitlements: [],
      resolver: rules,
    };
    expect(calculateDatedMonthlyRemuneration(input).annualPayments.totalCents).toBeNull();
    expect(
      calculateDatedMonthlyRemuneration({ ...input, tariffAnnualClaims: [row] }).annualPayments
        .totalCents,
    ).toBe(270000);
    expect(
      calculateDatedMonthlyRemuneration({
        ...input,
        tariffAnnualClaims: [{ ...row, actualPayment: { grossCents: 0, payoutMonth: "2026-11" } }],
      }).annualPayments.totalCents,
    ).toBe(0);
  });
});
