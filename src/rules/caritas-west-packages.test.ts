import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "./contracts.generated";
import { RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS } from "./rule-catalog-engine-support";
import { resolveTariffSelection } from "./tariff-selection";
import { validateRulePackage } from "./validation";

const commissions = ["bw", "bayern", "mitte", "nord", "nrw"];
const dates = ["2025-07-01", "2026-02-01"];
const rows = readFileSync(
  new URL("../../docs/caritas-p-mittelwerte-2025-2026.csv", import.meta.url),
  "utf8",
)
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((line) => line.split(","));

function load(commission: string, date: string): RuleTariffPackage {
  return JSON.parse(
    readFileSync(
      new URL(
        `../../rules/packages/reviewed/avr-caritas-p-${commission}/${date}-draft1.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  ) as RuleTariffPackage;
}

describe("Caritas West regional DRAFT packages", () => {
  it("keeps generated packages byte-for-byte aligned with their source CSV", () => {
    expect(() =>
      execFileSync(
        process.execPath,
        [
          fileURLToPath(
            new URL("../../scripts/build-caritas-west-candidates.mjs", import.meta.url),
          ),
          "--check",
        ],
        { stdio: "pipe" },
      ),
    ).not.toThrow();
  });

  it.each(commissions)("has two dated and non-overlapping packages for RK %s", (commission) => {
    const first = load(commission, dates[0]);
    const second = load(commission, dates[1]);
    expect(first.validTo).toBe("2026-01-31");
    expect(second.validFrom).toBe("2026-02-01");
    expect(second.validTo).toBe("2026-12-31");
    expect(first.packageId).toBe(second.packageId);
    expect(first.versionId).not.toBe(second.versionId);
  });

  it.each(commissions.flatMap((commission) => dates.map((date) => [commission, date])))(
    "validates %s at %s without claiming executable pay rules",
    (commission, date) => {
      const pkg = load(commission, date);
      expect(validateRulePackage(pkg)).toEqual({ ok: true, value: pkg });
      expect(pkg.status).toBe("DRAFT");
      expect(pkg.review.status).toBe("DRAFT");
      expect(pkg.sources.some((source) => source.id === `caritas-rk-${commission}-2025`)).toBe(
        true,
      );
      expect(pkg.rules.payTables).toHaveLength(1);
      const entries = rows
        .filter((row) => row[0] === date)
        .flatMap((row) =>
          row.slice(2).flatMap((amount, index) =>
            amount
              ? [
                  {
                    groupId: row[1].toLowerCase(),
                    stepId: String(index + 1),
                    monthlyCents: Number(amount),
                  },
                ]
              : [],
          ),
        );
      expect(pkg.rules.payTables[0].entries).toEqual(entries);
      expect(pkg.rules.employmentWorkingTimeRules).toHaveLength(2);
      expect(pkg.rules.caritasCareAllowanceRates).toHaveLength(4);
      expect(pkg.rules.caritasShiftAllowanceRates).toHaveLength(2);
      expect(pkg.rules.caritasTimePremiumPolicy).toMatchObject({
        validFrom: date,
        validTo: pkg.validTo,
        nightWindow: { startMinute: 1260, endMinute: 360 },
        nightBasisPoints: 2000,
        holidayWithoutTimeOffBasisPoints: 13500,
        sourceIds:
          date === "2025-07-01"
            ? [
                "caritas-avr-text-2025-1",
                "caritas-time-premiums-2025",
                "caritas-time-premiums-2026",
              ]
            : ["caritas-avr-text-2025-1", "caritas-time-premiums-2026"],
      });
      for (const id of pkg.rules.caritasTimePremiumPolicy!.sourceIds)
        expect(pkg.sources.some((source) => source.id === id)).toBe(true);
      expect(pkg.rules.caritasAnnualPaymentPolicy).toMatchObject({
        validFrom: date,
        validTo: date === "2025-07-01" ? "2025-12-31" : "2026-12-31",
        referenceMonths: [7, 8, 9],
        payoutMonth: 11,
        earlyExitVariantId: "ANLAGE_31",
        eastTariff2025UsesWestTable: false,
        rateBands: [
          { groupIds: ["p4", "p6", "p7", "p8"], rateBasisPoints: 8600 },
          {
            groupIds: ["p9", "p10", "p11", "p12", "p13", "p14", "p15", "p16"],
            rateBasisPoints: 7600,
          },
        ],
        sourceIds: [date === "2025-07-01" ? "caritas-avr-text-2025-1" : "caritas-avr-text-2026-03"],
      });
      for (const id of pkg.rules.caritasAnnualPaymentPolicy!.sourceIds)
        expect(pkg.sources.some((source) => source.id === id)).toBe(true);
      for (const annex of [31, 32]) {
        const selected = resolveTariffSelection(pkg, `ANLAGE_${annex}`, commission.toUpperCase());
        expect(selected?.region.payTableId).toBe(pkg.rules.payTables[0].id);
        expect(selected?.capabilities.basePay).toBe("UNSUPPORTED");
        expect(selected?.capabilities.allowances).toBe("UNSUPPORTED");
        expect(selected?.capabilities.timePremiums).toBe("UNSUPPORTED");
        const time = pkg.rules.employmentWorkingTimeRules!.find(
          (rule) => rule.variantId === `ANLAGE_${annex}`,
        );
        expect(time).toMatchObject({
          regionId: commission.toUpperCase(),
          validFrom: date,
          validTo: pkg.validTo,
          fullTimeWeeklyMinutes: annex === 32 || ["bw", "mitte"].includes(commission) ? 2340 : 2310,
        });
        expect(pkg.sources.some((source) => source.id === time?.sourceIds[0])).toBe(true);
        expect(pkg.rules.caritasCareAllowanceRates).toContainEqual({
          id: `caritas-${commission}-care-4-${annex}-${date}`,
          provisionId: "SECTION_12_4",
          variantId: `ANLAGE_${annex}`,
          regionId: commission.toUpperCase(),
          validFrom: date,
          validTo: pkg.validTo,
          monthlyCents: date === "2025-07-01" ? 13796 : 14182,
          sourceIds: ["caritas-bk-2025-02-corrected", `caritas-rk-${commission}-2025`],
        });
        expect(pkg.rules.caritasCareAllowanceRates).toContainEqual({
          id: `caritas-${commission}-care-3-${annex}-${date}`,
          provisionId: "SECTION_12_3",
          variantId: `ANLAGE_${annex}`,
          regionId: commission.toUpperCase(),
          validFrom: date,
          validTo: pkg.validTo,
          monthlyCents: commission === "bw" ? 3500 : 2500,
          sourceIds: ["caritas-dg-2024-care-allowances"],
        });
        expect(pkg.rules.caritasShiftAllowanceRates).toContainEqual({
          id: `caritas-${commission}-shift-${annex}-${date}`,
          variantId: `ANLAGE_${annex}`,
          regionId: commission.toUpperCase(),
          validFrom: date,
          validTo: pkg.validTo,
          alternatingMonthlyCents: 25000,
          alternatingHourlyCents: annex === 31 ? 149 : 147,
          shiftMonthlyCents: 10000,
          shiftHourlyCents: 59,
          sourceIds: ["caritas-bk-2025-02-corrected", `caritas-rk-${commission}-2025`],
        });
      }
    },
  );

  it("pins independent printed P6 references and leaves contract 14 out of activation", () => {
    expect(load("bw", "2025-07-01").rules.payTables[0].entries).toContainEqual({
      groupId: "p6",
      stepId: "1",
      monthlyCents: 293044,
    });
    expect(load("bw", "2026-02-01").rules.payTables[0].entries).toContainEqual({
      groupId: "p6",
      stepId: "1",
      monthlyCents: 301249,
    });
    expect([...RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS] as number[]).not.toContain(14);
  });
});
