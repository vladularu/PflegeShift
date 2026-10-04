import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "./contracts.generated";
import { validateRulePackage } from "./validation";
import { tvalShiftAllowanceIssues } from "./tval-shift-allowance-validation";

function candidate(version = "2026-04"): RuleTariffPackage {
  return JSON.parse(
    readFileSync(
      new URL(`../../rules/packages/reviewed/tval-pflege-tdl/${version}.json`, import.meta.url),
      "utf8",
    ),
  );
}
describe("TVA-L dated shift allowance catalog", () => {
  it.each(["2025-11", "2026-04", "2027-01", "2027-03", "2028-01"])(
    "validates %s without advertising complete allowances",
    (version) => {
      const pkg = candidate(version);
      expect(validateRulePackage(pkg)).toMatchObject({ ok: true });
      expect(pkg.rules.selection!.capabilities.allowances).toBe("UNSUPPORTED");
      expect(pkg.status).toBe("DRAFT");
      expect(pkg.rules.tvalShiftAllowancePolicy!.shareBasisPoints).toBe(7500);
      for (const scope of pkg.rules.tvalShiftAllowancePolicy!.scopes) {
        for (const row of scope.rates.periods) {
          const hospital = scope.id === "SECTION_43";
          const earlier = row.validFrom < "2026-07-01";
          expect([
            row.shiftMonthlyCents,
            row.alternatingMonthlyCents,
            row.shiftHourlyCents,
            row.alternatingHourlyCents,
          ]).toEqual(
            earlier
              ? [hospital ? 6000 : 4000, hospital ? 15000 : 10500, 24, 63]
              : [10000, hospital ? 25000 : 20000, 60, hospital ? 149 : 119],
          );
          expect(scope.rates.sourceIds).toEqual(["tdl-tval-pflege-2026", "tdl-tv-l-2026"]);
        }
      }
    },
  );
  it("keeps the July boundary inside the April catalog", () => {
    const p = candidate().rules.tvalShiftAllowancePolicy!;
    for (const s of p.scopes)
      expect(s.rates.periods.map((r) => [r.validFrom, r.validTo])).toEqual([
        ["2026-04-01", "2026-06-30"],
        ["2026-07-01", "2026-12-31"],
      ]);
  });
  it.each(["gap", "overlap", "invalid-date", "missing-end", "zero", "source", "duplicate-scope"])(
    "rejects %s",
    (kind) => {
      const p = candidate();
      const policy = p.rules.tvalShiftAllowancePolicy!;
      const rates = policy.scopes[0]!.rates;
      if (kind === "gap") rates.periods[1]!.validFrom = "2026-07-02";
      if (kind === "overlap") rates.periods[1]!.validFrom = "2026-06-30";
      if (kind === "invalid-date") rates.periods[1]!.validFrom = "2026-02-30";
      if (kind === "missing-end") rates.periods[1]!.validTo = null;
      if (kind === "zero") rates.periods[1]!.alternatingMonthlyCents = 0;
      if (kind === "source") rates.sourceIds = ["unknown-source"];
      if (kind === "duplicate-scope") policy.scopes[1]!.id = policy.scopes[0]!.id;
      expect(tvalShiftAllowanceIssues(p).length).toBeGreaterThan(0);
      expect(validateRulePackage(p).ok).toBe(false);
    },
  );
  it("does not accept the new policy under an employee or VKA contract", () => {
    const p = candidate();
    p.engineContractVersion = 12;
    expect(tvalShiftAllowanceIssues(p).map((i) => i.code)).toContain("TVAL_SHIFT_CONTRACT");
    expect(validateRulePackage(p).ok).toBe(false);
  });
  it("allows old drafts without the partial shift component but not an invalid share", () => {
    const p = candidate();
    const raw = JSON.parse(JSON.stringify(p));
    raw.rules.tvalShiftAllowancePolicy.shareBasisPoints = 10000;
    expect(validateRulePackage(raw).ok).toBe(false);
    delete p.rules.tvalShiftAllowancePolicy;
    expect(validateRulePackage(p).ok).toBe(true);
  });
});
