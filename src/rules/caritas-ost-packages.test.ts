import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "./contracts.generated";
import { resolveTariffSelection } from "./tariff-selection";
import { validateRulePackage } from "./validation";

function load(year: 2025 | 2026): RuleTariffPackage {
  return JSON.parse(
    readFileSync(
      new URL(
        `../../rules/packages/reviewed/avr-caritas-p-ost/${year}-01-draft1.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  ) as RuleTariffPackage;
}

const printedValue = (pkg: RuleTariffPackage, tableId: string, groupId: string, stepId: string) =>
  pkg.rules.payTables
    .find((table) => table.id === tableId)
    ?.entries.find((entry) => entry.groupId === groupId && entry.stepId === stepId)?.monthlyCents;

describe("Caritas RK Ost dated DRAFT packages", () => {
  it("keeps both packages byte-for-byte aligned with their source CSVs", () => {
    expect(() =>
      execFileSync(
        process.execPath,
        [
          fileURLToPath(new URL("../../scripts/build-caritas-ost-candidates.mjs", import.meta.url)),
          "--check",
        ],
        { stdio: "pipe" },
      ),
    ).not.toThrow();
  });

  it.each([2025, 2026] as const)("validates the %s source and all 62 entries per table", (year) => {
    const pkg = load(year);
    expect(validateRulePackage(pkg)).toEqual({ ok: true, value: pkg });
    expect(pkg.status).toBe("DRAFT");
    expect(pkg.review.status).toBe("DRAFT");
    expect(pkg.validFrom).toBe(`${year}-01-01`);
    expect(pkg.validTo).toBe(`${year}-12-31`);
    expect(pkg.sources.some((source) => source.id === `caritas-rk-ost-${year}-p`)).toBe(true);
    expect(pkg.rules.payTables).toHaveLength(year === 2025 ? 2 : 1);
    expect(pkg.rules.payTables.every((table) => table.entries.length === 62)).toBe(true);
    expect(Object.values(pkg.rules.selection!.capabilities)).toEqual(Array(5).fill("UNSUPPORTED"));
    expect(pkg.rules.employmentWorkingTimeRules).toHaveLength(year === 2025 ? 7 : 6);
    expect(pkg.rules.caritasCareAllowanceRates).toHaveLength(year === 2025 ? 12 : 18);
    expect(pkg.rules.caritasShiftAllowanceRates).toHaveLength(6);
    expect(pkg.rules.caritasTimePremiumPolicy).toMatchObject({
      validFrom: `${year}-01-01`,
      validTo: `${year}-12-31`,
      nightWindow: { startMinute: 1260, endMinute: 360 },
      nightBasisPoints: 2000,
      holidayWithoutTimeOffBasisPoints: 13500,
      sourceIds: ["caritas-avr-text-2025-1", `caritas-time-premiums-${year}`],
    });
    for (const id of pkg.rules.caritasTimePremiumPolicy!.sourceIds)
      expect(pkg.sources.some((source) => source.id === id)).toBe(true);
    expect(pkg.rules.caritasAnnualPaymentPolicy).toMatchObject({
      validFrom: `${year}-01-01`,
      validTo: `${year}-12-31`,
      referenceMonths: [7, 8, 9],
      payoutMonth: 11,
      earlyExitVariantId: "ANLAGE_31",
      eastTariff2025UsesWestTable: year === 2025,
      sourceIds:
        year === 2025
          ? ["caritas-avr-text-2025-1"]
          : ["caritas-avr-text-2026-03", "caritas-bk-2025-03-east-annual"],
    });
    for (const id of pkg.rules.caritasAnnualPaymentPolicy!.sourceIds)
      expect(pkg.sources.some((source) => source.id === id)).toBe(true);
    for (const annex of [31, 32])
      for (const territory of ["OST_TARIF_OST", "OST_TARIF_WEST_BERLIN", "OST_TARIF_WEST_HAMBURG"])
        expect(pkg.rules.caritasShiftAllowanceRates).toContainEqual({
          id: `caritas-ost-shift-${annex}-${territory.toLowerCase().replaceAll("_", "-")}-${year}`,
          variantId: `ANLAGE_${annex}`,
          regionId: territory,
          validFrom: year === 2025 ? "2025-07-01" : "2026-01-01",
          validTo: `${year}-12-31`,
          alternatingMonthlyCents: 25000,
          alternatingHourlyCents: annex === 31 ? 149 : 147,
          shiftMonthlyCents: 10000,
          shiftHourlyCents: 59,
          sourceIds: ["caritas-bk-2025-02-corrected", "caritas-rk-ost-2025-allowances"],
        });
    for (const annex of [31, 32])
      for (const territory of ["OST_TARIF_OST", "OST_TARIF_WEST_BERLIN", "OST_TARIF_WEST_HAMBURG"])
        for (const period of year === 2025
          ? [{ from: "2025-07-01", to: "2025-12-31", cents: 13796 }]
          : [
              { from: "2026-01-01", to: "2026-01-31", cents: 13796 },
              { from: "2026-02-01", to: "2026-12-31", cents: 14182 },
            ])
          expect(pkg.rules.caritasCareAllowanceRates).toContainEqual({
            id: `caritas-ost-${territory.toLowerCase().replaceAll("_", "-")}-${annex}-care-4-${period.from}`,
            provisionId: "SECTION_12_4",
            variantId: `ANLAGE_${annex}`,
            regionId: territory,
            validFrom: period.from,
            validTo: period.to,
            monthlyCents: period.cents,
            sourceIds: ["caritas-bk-2025-02-corrected", "caritas-rk-ost-2025-allowances"],
          });
    for (const annex of [31, 32])
      for (const territory of ["OST_TARIF_OST", "OST_TARIF_WEST_BERLIN", "OST_TARIF_WEST_HAMBURG"])
        expect(pkg.rules.caritasCareAllowanceRates).toContainEqual({
          id: `caritas-ost-${territory.toLowerCase().replaceAll("_", "-")}-${annex}-care-3-${year}`,
          provisionId: "SECTION_12_3",
          variantId: `ANLAGE_${annex}`,
          regionId: territory,
          validFrom: `${year}-01-01`,
          validTo: `${year}-12-31`,
          monthlyCents: 2500,
          sourceIds: ["caritas-dg-2024-care-allowances"],
        });
    expect(pkg.rules.selection!.capabilities.allowances).toBe("UNSUPPORTED");
    if (year === 2026) {
      for (const annex of [31, 32])
        for (const territory of [
          "OST_TARIF_OST",
          "OST_TARIF_WEST_BERLIN",
          "OST_TARIF_WEST_HAMBURG",
        ])
          expect(pkg.rules.employmentWorkingTimeRules).toContainEqual(
            expect.objectContaining({
              variantId: `ANLAGE_${annex}`,
              regionId: territory,
              validFrom: "2026-01-01",
              validTo: "2026-12-31",
              fullTimeWeeklyMinutes: annex === 31 ? 2310 : 2340,
            }),
          );
    }
  });

  it("splits the 2025 Berlin Anlage-31 change without changing Hamburg's table territory", () => {
    const pkg = load(2025);
    const times = pkg.rules.employmentWorkingTimeRules!;
    const berlin = times.filter(
      (rule) => rule.variantId === "ANLAGE_31" && rule.regionId === "OST_TARIF_WEST_BERLIN",
    );
    expect(berlin).toEqual([
      expect.objectContaining({
        validFrom: "2025-01-01",
        validTo: "2025-06-30",
        fullTimeWeeklyMinutes: 2340,
      }),
      expect.objectContaining({
        validFrom: "2025-07-01",
        validTo: "2025-12-31",
        fullTimeWeeklyMinutes: 2310,
      }),
    ]);
    expect(times).toContainEqual(
      expect.objectContaining({
        variantId: "ANLAGE_31",
        regionId: "OST_TARIF_WEST_HAMBURG",
        validFrom: "2025-01-01",
        validTo: "2025-12-31",
        fullTimeWeeklyMinutes: 2310,
      }),
    );
    const unsplit = structuredClone(pkg);
    const rule = unsplit.rules.employmentWorkingTimeRules!.find(
      (item) => item.variantId === "ANLAGE_31" && item.regionId === "OST_TARIF_WEST_BERLIN",
    )!;
    rule.validTo = "2025-12-31";
    unsplit.rules.employmentWorkingTimeRules = unsplit.rules.employmentWorkingTimeRules!.filter(
      (item) =>
        item !==
        unsplit.rules.employmentWorkingTimeRules!.find((entry) => entry.id === berlin[1].id),
    ) as typeof unsplit.rules.employmentWorkingTimeRules;
    const validation = validateRulePackage(unsplit);
    expect(validation.ok).toBe(false);
    if (!validation.ok)
      expect(validation.issues.map((issue) => issue.code)).toContain("CARITAS_WORKING_TIME_VALUE");
  });

  it("binds Anlage 32 and Tarifgebiet Ost to the lower 2025 table only", () => {
    const pkg = load(2025);
    const id = (annex: number, territory: string) =>
      resolveTariffSelection(pkg, `ANLAGE_${annex}`, territory)?.region.payTableId;
    expect(id(31, "OST_TARIF_OST")).toBe("caritas-ost-p-2025-common");
    expect(id(31, "OST_TARIF_WEST_BERLIN")).toBe("caritas-ost-p-2025-common");
    expect(id(31, "OST_TARIF_WEST_HAMBURG")).toBe("caritas-ost-p-2025-common");
    expect(id(32, "OST_TARIF_WEST_BERLIN")).toBe("caritas-ost-p-2025-common");
    expect(id(32, "OST_TARIF_WEST_HAMBURG")).toBe("caritas-ost-p-2025-common");
    expect(id(32, "OST_TARIF_OST")).toBe("caritas-ost-p-2025-annex32-east");
    expect(resolveTariffSelection(pkg, "ANLAGE_32", "OST")).toBeNull();
    expect(printedValue(pkg, id(32, "OST_TARIF_OST")!, "p6", "1")).toBe(287685);
    expect(printedValue(pkg, id(32, "OST_TARIF_WEST_BERLIN")!, "p6", "1")).toBe(289095);
    expect(printedValue(pkg, id(32, "OST_TARIF_OST")!, "p16", "6")).toBe(668321);
    expect(printedValue(pkg, id(32, "OST_TARIF_WEST_HAMBURG")!, "p16", "6")).toBe(671597);
  });

  it("uses the same printed P values for both annexes in both 2026 territories", () => {
    const pkg = load(2026);
    for (const annex of [31, 32])
      for (const territory of ["OST_TARIF_OST", "OST_TARIF_WEST_BERLIN", "OST_TARIF_WEST_HAMBURG"])
        expect(resolveTariffSelection(pkg, `ANLAGE_${annex}`, territory)?.region.payTableId).toBe(
          "caritas-ost-p-2026-common",
        );
    expect(printedValue(pkg, "caritas-ost-p-2026-common", "p6", "1")).toBe(300370);
    expect(printedValue(pkg, "caritas-ost-p-2026-common", "p16", "6")).toBe(691746);
  });
});
