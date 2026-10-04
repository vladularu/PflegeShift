import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import oldCandidate from "../../rules/packages/reviewed/tvoed-vka-anlage-a/2025-04-01-draft1.json";
import currentCandidate from "../../rules/packages/reviewed/tvoed-vka-anlage-a/2026-05-01-draft1.json";
import type { RuleTariffPackage } from "./contracts.generated";
import { RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS } from "./rule-catalog-engine-support";
import { resolveTariffSelection } from "./tariff-selection";
import { validateRulePackage } from "./validation";

function sourceRows(period: string): string[][] {
  return readFileSync(
    new URL(`../../docs/tvoed-vka-anlage-a-${period}.csv`, import.meta.url),
    "utf8",
  )
    .trim()
    .split(/\r?\n/u)
    .slice(1)
    .map((line) => line.split(","));
}

describe("TVöD-VKA Anlage A (EG) source-only packages", () => {
  it.each([
    ["2025-04", oldCandidate, "2025-04-01", "2026-04-30", 566912, 246552],
    ["2026-05", currentCandidate, "2026-05-01", "2027-03-31", 582786, 253455],
  ] as const)(
    "binds all 101 EG amounts for %s to one dated catalog package",
    (period, candidate, from, to, eg15s1, eg1s2) => {
      const pkg = candidate as RuleTariffPackage;
      expect(validateRulePackage(pkg)).toEqual({ ok: true, value: pkg });
      expect(pkg).toMatchObject({
        engineContractVersion: 16,
        status: "DRAFT",
        validFrom: from,
        validTo: to,
      });
      expect(pkg.sources[0].sha256).toBe(
        "00e831fefffb833b689c1355c58e87cf25bdd6c585ab4693f41a187604b0ef6e",
      );
      expect(pkg.sources[1].sha256).toBe(
        "0240e0d5430f94756f31e0ccc2ac2b7833ad1d1dae8a0911d21ea61ddcf26fd8",
      );
      expect(pkg.rules.payTables).toHaveLength(1);
      expect(pkg.rules.tvoedAnnexATimePremiumPolicy).toMatchObject({
        validFrom: from,
        validTo: to,
        referenceStepId: "s3",
        monthlyFactorThousandths: 4348,
        standardFullTimeWeeklyMinutes: 2340,
        nightBasisPoints: 2000,
        sundayBasisPoints: 2500,
        holidayWithTimeOffBasisPoints: 3500,
        holidayWithoutTimeOffBasisPoints: 13500,
        saturdayShiftLegacyAngestellteOnly: true,
      });
      expect(pkg.rules.tvoedAnnexAOvertimePolicy).toMatchObject({
        validFrom: from,
        validTo: to,
        premiumReferenceStepId: "s3",
        workPayMaximumStepId: "s4",
        monthlyFactorThousandths: 4348,
        standardFullTimeWeeklyMinutes: 2340,
        requiresConfirmedClassification: true,
        requiresSeparateSettlement: true,
      });
      const entries = pkg.rules.payTables[0].entries;
      expect(entries).toHaveLength(101);
      expect(
        entries.find((row) => row.groupId === "eg15" && row.stepId === "s1")?.monthlyCents,
      ).toBe(eg15s1);
      expect(
        entries.find((row) => row.groupId === "eg1" && row.stepId === "s2")?.monthlyCents,
      ).toBe(eg1s2);
      expect(entries.some((row) => row.groupId === "eg1" && row.stepId === "s1")).toBe(false);
      const expected = sourceRows(period).flatMap(([groupId, ...amounts]) =>
        amounts.flatMap((amount, index) =>
          amount === "" ? [] : [{ groupId, stepId: `s${index + 1}`, monthlyCents: Number(amount) }],
        ),
      );
      expect(entries).toEqual(expected);
      for (const variant of ["BT_K", "BT_B"]) {
        const selected = resolveTariffSelection(pkg, variant, "VKA");
        expect(selected?.familyId).toBe("tvoed-vka-annex-a");
        expect(selected?.variant.sourceIds).toEqual([
          variant === "BT_K" ? pkg.sources[0].id : pkg.sources[1].id,
        ]);
        expect(selected?.groups.find((group) => group.id === "eg1")?.levels).toEqual([
          "s2",
          "s3",
          "s4",
          "s5",
          "s6",
        ]);
        expect(selected?.capabilities.basePay).toBe("UNSUPPORTED");
        expect(
          Object.values(selected!.capabilities).every((value) => value === "UNSUPPORTED"),
        ).toBe(true);
      }
      expect(RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS).not.toContain(16);
    },
  );

  it("rejects invented EG 1 stage 1 and an incomplete EG row", () => {
    const pkg = structuredClone(currentCandidate) as RuleTariffPackage;
    pkg.rules.payTables[0].entries.push({ groupId: "eg1", stepId: "s1", monthlyCents: 100000 });
    pkg.rules.payTables[0].entries.splice(0, 1);
    const result = validateRulePackage(pkg);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.issues.map((issue) => issue.code)).toEqual(
        expect.arrayContaining(["TVOED_A_TABLE_ENTRY", "TVOED_A_TABLE_INCOMPLETE"]),
      );
  });

  it("cannot accidentally turn the table into a published, complete salary engine", () => {
    const pkg = structuredClone(currentCandidate) as RuleTariffPackage;
    pkg.rules.selection!.capabilities.basePay = "SUPPORTED";
    const result = validateRulePackage(pkg);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.issues.map((issue) => issue.code)).toContain("TVOED_A_NOT_EXECUTABLE");
  });

  it("rejects a changed premium rate or missing source while remaining DRAFT", () => {
    const rate = structuredClone(currentCandidate) as RuleTariffPackage;
    rate.rules.tvoedAnnexATimePremiumPolicy!.nightBasisPoints = 2500;
    const rateResult = validateRulePackage(rate);
    expect(rateResult.ok).toBe(false);
    if (!rateResult.ok)
      expect(rateResult.issues.map((issue) => issue.code)).toContain("TVOED_A_PREMIUM_VALUE");

    const source = structuredClone(currentCandidate) as RuleTariffPackage;
    source.rules.tvoedAnnexATimePremiumPolicy!.sourceIds = [source.sources[0].id];
    const sourceResult = validateRulePackage(source);
    expect(sourceResult.ok).toBe(false);
    if (!sourceResult.ok)
      expect(sourceResult.issues.map((issue) => issue.code)).toContain(
        "TVOED_A_PREMIUM_SOURCE_RANGE",
      );
  });

  it("rejects altered overtime rate bands and incomplete source provenance", () => {
    const rate = structuredClone(currentCandidate) as RuleTariffPackage;
    rate.rules.tvoedAnnexAOvertimePolicy!.rateBands[1].premiumBasisPoints = 3000;
    const rateResult = validateRulePackage(rate);
    expect(rateResult.ok).toBe(false);
    if (!rateResult.ok)
      expect(rateResult.issues.map((issue) => issue.code)).toContain("TVOED_A_OVERTIME_RATE");

    const source = structuredClone(currentCandidate) as RuleTariffPackage;
    source.rules.tvoedAnnexAOvertimePolicy!.sourceIds = [source.sources[0].id];
    const sourceResult = validateRulePackage(source);
    expect(sourceResult.ok).toBe(false);
    if (!sourceResult.ok)
      expect(sourceResult.issues.map((issue) => issue.code)).toContain(
        "TVOED_A_OVERTIME_SOURCE_RANGE",
      );
  });
});
