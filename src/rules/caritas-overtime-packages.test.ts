import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "./contracts.generated";
import { validateRulePackage } from "./validation";

const regionalPackages = [
  ...["bw", "bayern", "mitte", "nord", "nrw"].flatMap((region) => [
    `avr-caritas-p-${region}/2025-07-01-draft1.json`,
    `avr-caritas-p-${region}/2026-02-01-draft1.json`,
  ]),
  "avr-caritas-p-ost/2025-01-draft1.json",
  "avr-caritas-p-ost/2026-01-draft1.json",
];

describe("Caritas regional overtime source packages", () => {
  it.each(regionalPackages)("carries a dated, non-executable rule in %s", (name) => {
    const pkg = JSON.parse(
      readFileSync(new URL(`../../rules/packages/reviewed/${name}`, import.meta.url), "utf8"),
    ) as RuleTariffPackage;
    const policy = pkg.rules.caritasOvertimePolicy;
    expect(validateRulePackage(pkg)).toEqual({ ok: true, value: pkg });
    expect(policy).toBeDefined();
    expect(policy?.validFrom).toBe(pkg.validFrom);
    expect(policy?.validTo).toBe(pkg.validTo);
    expect(policy?.premiumReferenceStepId).toBe("3");
    expect(policy?.workPayMaximumStepId).toBe("4");
    expect(policy?.rateBands).toEqual([
      {
        groupIds: ["p4", "p6", "p7", "p8", "p9", "p10", "p11"],
        premiumBasisPoints: 3000,
      },
      { groupIds: ["p12", "p13", "p14", "p15", "p16"], premiumBasisPoints: 1500 },
    ]);
    expect(policy?.sourceIds).toContain(
      pkg.validFrom.startsWith("2025") ? "caritas-avr-text-2025-1" : "caritas-avr-text-2026-03",
    );
    expect(pkg.rules.selection?.capabilities.overtime).toBe("UNSUPPORTED");
    expect(pkg.status).toBe("DRAFT");
  });
});
