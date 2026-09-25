import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  calculateCaritasCareDraftPersonalAllowance,
  type CaritasCareAllowanceEntitlement,
} from "./caritas-care-draft-personal-allowance";

function load(region: string, version: string): RuleTariffPackage {
  return JSON.parse(
    readFileSync(
      new URL(
        `../../rules/packages/reviewed/avr-caritas-p-${region}/${version}-draft1.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  ) as RuleTariffPackage;
}

function calculate(
  pkg: RuleTariffPackage,
  date: string,
  variant: string,
  territory: string,
  weeklyMinutes: number,
  provision: "SECTION_12_3" | "SECTION_12_4",
  entitlement: CaritasCareAllowanceEntitlement,
  group = "P6",
  step = "1",
) {
  return calculateCaritasCareDraftPersonalAllowance(
    pkg,
    date,
    variant,
    territory,
    group,
    step,
    weeklyMinutes,
    provision,
    entitlement,
  );
}

describe("Caritas DRAFT personal care allowance with confirmed entitlement", () => {
  it("keeps the two confirmed provisions separate at full time", () => {
    const pkg = load("bw", "2026-02-01");
    const fixed = calculate(
      pkg,
      "2026-02-01",
      "ANLAGE_31",
      "BW",
      2340,
      "SECTION_12_3",
      "CONFIRMED",
    );
    const dynamic = calculate(
      pkg,
      "2026-02-01",
      "ANLAGE_31",
      "BW",
      2340,
      "SECTION_12_4",
      "CONFIRMED",
    );
    expect(fixed).toMatchObject({
      kind: "personal-care-allowance",
      completeGross: false,
      entitlementConfirmed: true,
      provisionId: "SECTION_12_3",
      fullTimeMonthlyCents: 3500,
      personalMonthlyCents: 3500,
      rateSourceIds: ["caritas-dg-2024-care-allowances"],
      prorationProvision: "AVR_ANLAGE_31_32_12A",
    });
    expect(dynamic).toMatchObject({
      kind: "personal-care-allowance",
      completeGross: false,
      provisionId: "SECTION_12_4",
      fullTimeMonthlyCents: 14182,
      personalMonthlyCents: 14182,
      rateSourceIds: ["caritas-bk-2025-02-corrected", "caritas-rk-bw-2025"],
    });
    if (fixed.kind === "personal-care-allowance" && dynamic.kind === "personal-care-allowance") {
      expect(fixed.rateId).not.toBe(dynamic.rateId);
      expect(fixed.tableId).toBeTruthy();
      expect(dynamic.workingTimeRuleId).toBeTruthy();
      expect(dynamic.basisSourceIds.length).toBeGreaterThan(0);
    }
  });

  it("does not pay a provision without its separate confirmed entitlement", () => {
    const pkg = load("bw", "2026-02-01");
    const read = (
      provision: "SECTION_12_3" | "SECTION_12_4",
      status: CaritasCareAllowanceEntitlement,
    ) => calculate(pkg, "2026-02-01", "ANLAGE_31", "BW", 2340, provision, status);
    expect(read("SECTION_12_3", "UNKNOWN")).toEqual({
      kind: "unavailable",
      reason: "ENTITLEMENT_UNCONFIRMED",
    });
    expect(read("SECTION_12_4", "NOT_ENTITLED")).toEqual({
      kind: "unavailable",
      reason: "NOT_ENTITLED",
    });
    expect(read("SECTION_12_4", "INVALID" as CaritasCareAllowanceEntitlement)).toEqual({
      kind: "unavailable",
      reason: "ENTITLEMENT_UNCONFIRMED",
    });
    expect(read("SECTION_12_3", "CONFIRMED")).toMatchObject({
      kind: "personal-care-allowance",
      personalMonthlyCents: 3500,
    });
  });

  it.each([
    {
      region: "bw",
      version: "2026-02-01",
      date: "2026-02-01",
      variant: "ANLAGE_31",
      territory: "BW",
      provision: "SECTION_12_3",
      expected: 2692,
      fullTimeWeeklyMinutes: 2340,
    },
    {
      region: "bayern",
      version: "2025-07-01",
      date: "2026-01-31",
      variant: "ANLAGE_31",
      territory: "BAYERN",
      provision: "SECTION_12_4",
      expected: 10750,
      fullTimeWeeklyMinutes: 2310,
    },
    {
      region: "ost",
      version: "2025-01",
      date: "2025-06-30",
      variant: "ANLAGE_31",
      territory: "OST_TARIF_WEST_BERLIN",
      provision: "SECTION_12_3",
      expected: 1923,
      fullTimeWeeklyMinutes: 2340,
    },
    {
      region: "ost",
      version: "2025-01",
      date: "2025-07-01",
      variant: "ANLAGE_31",
      territory: "OST_TARIF_WEST_BERLIN",
      provision: "SECTION_12_3",
      expected: 1948,
      fullTimeWeeklyMinutes: 2310,
    },
    {
      region: "ost",
      version: "2026-01",
      date: "2026-02-01",
      variant: "ANLAGE_32",
      territory: "OST_TARIF_OST",
      provision: "SECTION_12_4",
      expected: 10909,
      fullTimeWeeklyMinutes: 2340,
    },
  ] as const)(
    "prorates $region $date $variant $provision to $expected cents at 30 weekly hours",
    (reference) => {
      expect(
        calculate(
          load(reference.region, reference.version),
          reference.date,
          reference.variant,
          reference.territory,
          1800,
          reference.provision,
          "CONFIRMED",
        ),
      ).toMatchObject({
        kind: "personal-care-allowance",
        completeGross: false,
        personalMonthlyCents: reference.expected,
        fullTimeWeeklyMinutes: reference.fullTimeWeeklyMinutes,
        weeklyMinutes: 1800,
      });
    },
  );

  it("keeps RK Ost's 2025 unproven dynamic rate unavailable even with confirmed entitlement", () => {
    const pkg = load("ost", "2025-01");
    expect(
      calculate(
        pkg,
        "2025-06-30",
        "ANLAGE_31",
        "OST_TARIF_WEST_BERLIN",
        1800,
        "SECTION_12_4",
        "CONFIRMED",
      ),
    ).toEqual({ kind: "unavailable", reason: "MISSING_CARE_ALLOWANCE_RATE" });
  });

  it("rejects invalid time, stage, selection, package date and tampered source rates", () => {
    const pkg = load("bw", "2026-02-01");
    const read = (date: string, territory: string, minutes: number, step = "2") =>
      calculate(
        pkg,
        date,
        "ANLAGE_31",
        territory,
        minutes,
        "SECTION_12_4",
        "CONFIRMED",
        "P7",
        step,
      );
    expect(read("2026-02-01", "BW", 2341)).toEqual({
      kind: "unavailable",
      reason: "INVALID_WEEKLY_TIME",
    });
    expect(read("2026-02-01", "BW", 1800, "1")).toEqual({
      kind: "unavailable",
      reason: "MISSING_TABLE_VALUE",
    });
    expect(read("2026-02-01", "OST_TARIF_OST", 1800)).toEqual({
      kind: "unavailable",
      reason: "UNKNOWN_SELECTION",
    });
    expect(read("2027-01-01", "BW", 1800)).toEqual({
      kind: "unavailable",
      reason: "OUTSIDE_VALIDITY",
    });
    pkg.rules.caritasCareAllowanceRates![0].monthlyCents = 0;
    expect(read("2026-02-01", "BW", 1800)).toEqual({
      kind: "unavailable",
      reason: "INVALID_PACKAGE",
    });
  });
});
