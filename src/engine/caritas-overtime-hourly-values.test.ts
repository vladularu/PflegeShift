import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { lookupCaritasOvertimeHourlyValues } from "./caritas-overtime-hourly-values";

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

describe("Caritas sourced overtime hourly values", () => {
  it("matches printed P6 39-hour totals and caps the individual step at four", () => {
    const pkg = load("bw", "2025-07-01");
    for (const [step, baseCents, totalCents] of [
      ["1", 1728, 2307],
      ["3", 1929, 2508],
      ["4", 2144, 2723],
      ["5", 2144, 2723],
      ["6", 2144, 2723],
    ] as const) {
      expect(
        lookupCaritasOvertimeHourlyValues(pkg, "2025-07-01", "ANLAGE_32", "BW", "P6", step),
      ).toMatchObject({
        kind: "source-overtime-hourly-values",
        base: { personalStepId: step, referenceStepId: step > "4" ? "4" : step },
        baseCentsPerHour: baseCents,
        premiumCentsPerHour: 579,
        totalCentsPerHour: totalCents,
      });
    }
  });

  it("matches the printed 38.5-hour P6 reference", () => {
    const pkg = load("bayern", "2025-07-01");
    expect(
      lookupCaritasOvertimeHourlyValues(pkg, "2025-07-01", "ANLAGE_31", "BAYERN", "P6", "3"),
    ).toMatchObject({
      kind: "source-overtime-hourly-values",
      baseCentsPerHour: 1955,
      premiumCentsPerHour: 587,
      totalCentsPerHour: 2542,
    });
  });

  it("preserves the P11/P12 premium boundary in the printed total", () => {
    const pkg = load("bw", "2025-07-01");
    expect(
      lookupCaritasOvertimeHourlyValues(pkg, "2025-07-01", "ANLAGE_32", "BW", "P11", "3"),
    ).toMatchObject({
      kind: "source-overtime-hourly-values",
      baseCentsPerHour: 2614,
      premiumCentsPerHour: 784,
      totalCentsPerHour: 3398,
    });
    expect(
      lookupCaritasOvertimeHourlyValues(pkg, "2025-07-01", "ANLAGE_32", "BW", "P12", "3"),
    ).toMatchObject({
      kind: "source-overtime-hourly-values",
      baseCentsPerHour: 2755,
      premiumCentsPerHour: 413,
      totalCentsPerHour: 3168,
    });
  });

  it("keeps unknown selections and unreviewed claims unavailable", () => {
    const pkg = load("bw", "2025-07-01");
    expect(
      lookupCaritasOvertimeHourlyValues(pkg, "2025-07-01", "ANLAGE_32", "BW", "P5", "3"),
    ).toEqual({ kind: "unavailable", reason: "MISSING_TABLE_VALUE" });
    expect(
      lookupCaritasOvertimeHourlyValues(pkg, "2025-07-01", "ANLAGE_32", "BW", "P6", "7"),
    ).toEqual({ kind: "unavailable", reason: "INVALID_STEP" });
    const result = lookupCaritasOvertimeHourlyValues(
      pkg,
      "2025-07-01",
      "ANLAGE_32",
      "BW",
      "P6",
      "3",
    );
    expect(result).not.toHaveProperty("payableWholeHours");
    expect(result).not.toHaveProperty("personalAmountCents");
    pkg.status = "PUBLISHED";
    expect(
      lookupCaritasOvertimeHourlyValues(pkg, "2025-07-01", "ANLAGE_32", "BW", "P6", "3"),
    ).toEqual({ kind: "unavailable", reason: "INVALID_PACKAGE" });
  });
});
