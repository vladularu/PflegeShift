import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { lookupCaritasOvertimeHourlyPremium } from "./caritas-overtime-hourly-premium";

function load(region: string, version: string): RuleTariffPackage {
  return JSON.parse(
    readFileSync(
      new URL(
        "../../rules/packages/reviewed/avr-caritas-p-" + region + "/" + version + "-draft1.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as RuleTariffPackage;
}

describe("Caritas sourced overtime premium per hour", () => {
  it("matches the printed P6 premium for 39 and 38.5 weekly hours", () => {
    expect(
      lookupCaritasOvertimeHourlyPremium(
        load("bw", "2025-07-01"),
        "2025-07-01",
        "ANLAGE_32",
        "BW",
        "P6",
      ),
    ).toMatchObject({
      kind: "source-overtime-hourly-premium",
      groupId: "p6",
      referenceStepId: "3",
      hourlyTableCents: 1929,
      premiumBasisPoints: 3000,
      premiumCentsPerHour: 579,
      rateProvision: "AVR_ANLAGE_31_32_6_ABS_1_A",
    });
    expect(
      lookupCaritasOvertimeHourlyPremium(
        load("bayern", "2025-07-01"),
        "2025-07-01",
        "ANLAGE_31",
        "BAYERN",
        "P6",
      ),
    ).toMatchObject({
      kind: "source-overtime-hourly-premium",
      hourlyTableCents: 1955,
      premiumBasisPoints: 3000,
      premiumCentsPerHour: 587,
    });
  });

  it("uses 30 percent through P11 and 15 percent from P12", () => {
    const pkg = load("bw", "2025-07-01");
    expect(
      lookupCaritasOvertimeHourlyPremium(pkg, "2025-07-01", "ANLAGE_32", "BW", "P11"),
    ).toMatchObject({
      kind: "source-overtime-hourly-premium",
      hourlyTableCents: 2614,
      premiumBasisPoints: 3000,
      premiumCentsPerHour: 784,
    });
    expect(
      lookupCaritasOvertimeHourlyPremium(pkg, "2025-07-01", "ANLAGE_32", "BW", "P12"),
    ).toMatchObject({
      kind: "source-overtime-hourly-premium",
      hourlyTableCents: 2755,
      premiumBasisPoints: 1500,
      premiumCentsPerHour: 413,
    });
    expect(
      lookupCaritasOvertimeHourlyPremium(pkg, "2025-07-01", "ANLAGE_32", "BW", "P16"),
    ).toMatchObject({ premiumBasisPoints: 1500 });
  });

  it("retains the selected territory and table/working-time sources", () => {
    const result = lookupCaritasOvertimeHourlyPremium(
      load("ost", "2026-01"),
      "2026-02-01",
      "ANLAGE_31",
      "OST_TARIF_OST",
      "P6",
    );
    expect(result).toMatchObject({
      kind: "source-overtime-hourly-premium",
      variantId: "ANLAGE_31",
      regionId: "OST_TARIF_OST",
      referenceStepId: "3",
    });
    if (result.kind === "source-overtime-hourly-premium") {
      expect(result.sourceIds.length).toBeGreaterThan(0);
      expect(result.tableId).toBeTruthy();
      expect(result.workingTimeRuleId).toBeTruthy();
    }
    expect(result).not.toHaveProperty("personalAmountCents");
    expect(result).not.toHaveProperty("payableWholeHours");
  });

  it("rejects an unknown P group and invalid date without depending on other premiums", () => {
    const pkg = load("bw", "2025-07-01");
    expect(lookupCaritasOvertimeHourlyPremium(pkg, "2025-07-01", "ANLAGE_32", "BW", "P5")).toEqual({
      kind: "unavailable",
      reason: "MISSING_TABLE_VALUE",
    });
    expect(lookupCaritasOvertimeHourlyPremium(pkg, "2025-06-30", "ANLAGE_32", "BW", "P6")).toEqual({
      kind: "unavailable",
      reason: "OUTSIDE_VALIDITY",
    });
    delete pkg.rules.caritasTimePremiumRates;
    expect(
      lookupCaritasOvertimeHourlyPremium(pkg, "2025-07-01", "ANLAGE_32", "BW", "P6"),
    ).toMatchObject({ kind: "source-overtime-hourly-premium", premiumCentsPerHour: 579 });
  });

  it("does not accept an activated package", () => {
    const pkg = load("bw", "2025-07-01");
    pkg.status = "PUBLISHED";
    expect(lookupCaritasOvertimeHourlyPremium(pkg, "2025-07-01", "ANLAGE_32", "BW", "P6")).toEqual({
      kind: "unavailable",
      reason: "INVALID_PACKAGE",
    });
  });
});
