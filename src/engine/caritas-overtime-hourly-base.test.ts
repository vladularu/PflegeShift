import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { lookupCaritasOvertimeHourlyBase } from "./caritas-overtime-hourly-base";

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

describe("Caritas sourced overtime hourly base", () => {
  it("uses the individual P6 step and the official 39-hour West divisor", () => {
    const pkg = load("bw", "2025-07-01");
    const step1 = lookupCaritasOvertimeHourlyBase(pkg, "2025-07-01", "ANLAGE_31", "BW", "P6", "1");
    const step3 = lookupCaritasOvertimeHourlyBase(pkg, "2025-07-01", "ANLAGE_31", "BW", "P6", "3");
    expect(step1).toMatchObject({
      kind: "source-overtime-hourly-base",
      personalStepId: "1",
      referenceStepId: "1",
      referenceMonthlyCents: 293044,
      fullTimeWeeklyMinutes: 2340,
      hourlyBaseCents: 1728,
      stepCapProvision: "AVR_ANLAGE_31_32_6_ABS_1_ANMERKUNG",
      divisorProvision: "AVR_ANLAGE_1_IIA_A_SATZ_4",
      roundingProvision: "AVR_ANLAGE_1_X_E",
    });
    expect(step3).toMatchObject({
      kind: "source-overtime-hourly-base",
      referenceMonthlyCents: 327186,
      hourlyBaseCents: 1929,
    });
    expect(step1).not.toHaveProperty("personalAmountCents");
    expect(step1).not.toHaveProperty("premiumCentsPerHour");
  });

  it("caps steps five and six at step four, while preserving the personal step", () => {
    const pkg = load("bw", "2025-07-01");
    for (const step of ["4", "5", "6"]) {
      expect(
        lookupCaritasOvertimeHourlyBase(pkg, "2025-07-01", "ANLAGE_32", "BW", "P6", step),
      ).toMatchObject({
        kind: "source-overtime-hourly-base",
        personalStepId: step,
        referenceStepId: "4",
        referenceMonthlyCents: 363614,
        hourlyBaseCents: 2144,
      });
    }
  });

  it("uses the selected annex and territory, including the Berlin working-time change", () => {
    const pkg = load("ost", "2025-01");
    const before = lookupCaritasOvertimeHourlyBase(
      pkg,
      "2025-06-30",
      "ANLAGE_31",
      "OST_TARIF_WEST_BERLIN",
      "P6",
      "3",
    );
    const after = lookupCaritasOvertimeHourlyBase(
      pkg,
      "2025-07-01",
      "ANLAGE_31",
      "OST_TARIF_WEST_BERLIN",
      "P6",
      "3",
    );
    expect(before).toMatchObject({
      kind: "source-overtime-hourly-base",
      fullTimeWeeklyMinutes: 2340,
      referenceMonthlyCents: 324091,
      hourlyBaseCents: 1911,
    });
    expect(after).toMatchObject({
      kind: "source-overtime-hourly-base",
      fullTimeWeeklyMinutes: 2310,
      referenceMonthlyCents: 324091,
      hourlyBaseCents: 1936,
    });
    const east = lookupCaritasOvertimeHourlyBase(
      pkg,
      "2025-07-01",
      "ANLAGE_32",
      "OST_TARIF_OST",
      "P6",
      "3",
    );
    expect(east).toMatchObject({
      kind: "source-overtime-hourly-base",
      fullTimeWeeklyMinutes: 2340,
      referenceMonthlyCents: 322510,
      hourlyBaseCents: 1902,
    });
  });

  it("rejects invalid steps, unknown groups and dates outside package validity", () => {
    const pkg = load("bw", "2025-07-01");
    expect(
      lookupCaritasOvertimeHourlyBase(pkg, "2025-07-01", "ANLAGE_31", "BW", "P6", "7"),
    ).toEqual({ kind: "unavailable", reason: "INVALID_STEP" });
    expect(
      lookupCaritasOvertimeHourlyBase(pkg, "2025-07-01", "ANLAGE_31", "BW", "P7", "1"),
    ).toEqual({ kind: "unavailable", reason: "MISSING_TABLE_VALUE" });
    expect(
      lookupCaritasOvertimeHourlyBase(pkg, "2025-07-01", "ANLAGE_31", "BW", "P5", "3"),
    ).toEqual({ kind: "unavailable", reason: "MISSING_TABLE_VALUE" });
    expect(
      lookupCaritasOvertimeHourlyBase(pkg, "2025-06-30", "ANLAGE_31", "BW", "P6", "3"),
    ).toEqual({ kind: "unavailable", reason: "OUTSIDE_VALIDITY" });
  });

  it("keeps unsupported Caritas packages DRAFT-only", () => {
    const pkg = load("bw", "2026-02-01");
    expect(
      lookupCaritasOvertimeHourlyBase(pkg, "2026-02-01", "ANLAGE_32", "BW", "P6", "3"),
    ).toMatchObject({ kind: "source-overtime-hourly-base" });
    pkg.status = "PUBLISHED";
    expect(
      lookupCaritasOvertimeHourlyBase(pkg, "2026-02-01", "ANLAGE_32", "BW", "P6", "3"),
    ).toEqual({ kind: "unavailable", reason: "INVALID_PACKAGE" });
  });
});
