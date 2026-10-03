import { describe, expect, it } from "vitest";
import { tariffAnnualFixture } from "@/engine/tariff-annual-test-fixtures";
import { resolver } from "@/engine/remuneration-test-fixtures";
import { selectAnnualTariff } from "./tariff-annual-selection";
import type { RuleResolver } from "./rule-resolver";

describe("annual tariff selection from the active catalog", () => {
  it.each([false, true])(
    "selects the explicitly declared entitlement year (training %s)",
    (training) => {
      const { pkg, claim } = tariffAnnualFixture(training);
      const selected = selectAnnualTariff(claim, resolver([pkg]));
      expect(selected.ok).toBe(true);
      if (selected.ok) {
        expect(selected.package).toEqual(pkg);
        expect(selected.rule.payoutMonth).toBe(11);
      }
      expect(selectAnnualTariff({ ...claim, year: 2027 }, resolver([pkg]))).toEqual({
        ok: false,
        code: "ANNUAL_RULE_MISSING",
      });
    },
  );
  it("never falls back to a bundled package or guesses a date when an adapter lacks the annual interface", () => {
    const { pkg, claim } = tariffAnnualFixture();
    const active = resolver([pkg]);
    const legacy: RuleResolver = {
      resolveTariff: active.resolveTariff,
      resolveLegal: active.resolveLegal,
      resolveHoliday: active.resolveHoliday,
    };
    expect(selectAnnualTariff(claim, legacy)).toEqual({ ok: false, code: "ANNUAL_RULE_MISSING" });
    expect(selectAnnualTariff(claim, resolver([]))).toEqual({
      ok: false,
      code: "ANNUAL_RULE_MISSING",
    });
  });
  it("retains all agreeing versions and rejects contradicting rates instead of choosing the newest", () => {
    const { pkg, claim } = tariffAnnualFixture();
    const next = structuredClone(pkg);
    next.versionId = "2026-05-r3";
    next.sources[0].title += " – erneute Dokumentation";
    const selected = selectAnnualTariff(claim, resolver([pkg, next]));
    expect(selected.ok).toBe(true);
    if (selected.ok)
      expect(selected.versions.map((v) => v.versionId)).toEqual([next.versionId, pkg.versionId]);
    next.rules.annualPaymentRules![0].rateBasisPoints = 8000;
    expect(selectAnnualTariff(claim, resolver([pkg, next]))).toEqual({
      ok: false,
      code: "ANNUAL_RULE_AMBIGUOUS",
    });
  });
  it.each(["variant", "region", "group"] as const)(
    "does not substitute a different %s",
    (field) => {
      const { pkg, claim } = tariffAnnualFixture();
      claim.selection[field] = "other-unconfigured";
      expect(selectAnnualTariff(claim, resolver([pkg]))).toEqual({
        ok: false,
        code: "ANNUAL_RULE_MISSING",
      });
    },
  );
  it("validates candidates and isolates package and year scope", () => {
    const { pkg, claim } = tariffAnnualFixture();
    const active = resolver([pkg]);
    expect(active.annualTariffCandidates!(pkg.packageId, 1899)).toEqual([]);
    expect(active.annualTariffCandidates!(pkg.packageId, 2026.5)).toEqual([]);
    expect(active.annualTariffCandidates!("wrong-package", 2026)).toEqual([]);
    expect(active.annualTariffCandidates!(pkg.packageId, 2024)).toEqual([]);
    expect(Object.isFrozen(active.annualTariffCandidates!(pkg.packageId, 2026))).toBe(true);
    pkg.rules.annualPaymentRules![0].rateBasisPoints = -1;
    expect(selectAnnualTariff(claim, active)).toEqual({ ok: false, code: "ANNUAL_RULE_INVALID" });
  });
});
