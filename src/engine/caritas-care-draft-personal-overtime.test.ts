import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  calculateCaritasPersonalOvertime,
  type CaritasPersonalOvertimeInput,
  type CaritasOvertimeCashEntitlement,
} from "./caritas-care-draft-personal-overtime";

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

function input(
  overrides: Partial<CaritasPersonalOvertimeInput> = {},
): CaritasPersonalOvertimeInput {
  return {
    pkg: load("bw", "2025-07-01"),
    serviceDate: "2025-08-12",
    variantId: "ANLAGE_32",
    regionId: "BW",
    groupId: "P6",
    personalStepId: "3",
    overtimeConfirmed: true,
    baseEntitlement: "CONFIRMED_CASH",
    premiumEntitlement: "CONFIRMED_CASH",
    payableWholeHours: 3,
    hoursConfirmed: true,
    ...overrides,
  };
}

describe("Caritas DRAFT personal cash overtime for externally confirmed whole hours", () => {
  it("keeps the printed 39-hour P6 base and premium separate for three payable hours", () => {
    for (const [personalStepId, baseAmountCents, personalAmountCents] of [
      ["1", 5184, 6921],
      ["3", 5787, 7524],
      ["4", 6432, 8169],
      ["5", 6432, 8169],
      ["6", 6432, 8169],
    ] as const) {
      expect(calculateCaritasPersonalOvertime(input({ personalStepId }))).toMatchObject({
        kind: "personal-overtime",
        completeGross: false,
        serviceDate: "2025-08-12",
        payableWholeHours: 3,
        baseAmountCents,
        premiumAmountCents: 1737,
        personalAmountCents,
        overtimeConfirmed: true,
        cashBaseEntitlementConfirmed: true,
        cashPremiumEntitlementConfirmed: true,
        hoursConfirmed: true,
        hourlyValues: {
          base: { personalStepId, referenceStepId: personalStepId > "4" ? "4" : personalStepId },
          sourceIds: [
            "caritas-bk-2025-02-corrected",
            "caritas-rk-bw-2025",
            "caritas-dgs-west-factsheets-2025",
          ],
        },
      });
    }
  });

  it("uses the published 38.5-hour P6 values for Bavaria without a part-time reduction", () => {
    expect(
      calculateCaritasPersonalOvertime(
        input({
          pkg: load("bayern", "2025-07-01"),
          variantId: "ANLAGE_31",
          regionId: "BAYERN",
          payableWholeHours: 2,
        }),
      ),
    ).toMatchObject({
      kind: "personal-overtime",
      baseAmountCents: 3910,
      premiumAmountCents: 1174,
      personalAmountCents: 5084,
      hourlyValues: { base: { fullTimeWeeklyMinutes: 2310 } },
    });
  });

  it("preserves the lower P12 overtime premium in a confirmed four-hour amount", () => {
    expect(
      calculateCaritasPersonalOvertime(input({ groupId: "P12", payableWholeHours: 4 })),
    ).toMatchObject({
      kind: "personal-overtime",
      baseAmountCents: 11020,
      premiumAmountCents: 1652,
      personalAmountCents: 12672,
      hourlyValues: { premium: { premiumBasisPoints: 1500 } },
    });
  });

  it("assigns the dated Berlin working-time change and eastern table to the work date", () => {
    const pkg = load("ost", "2025-01");
    const berlin = input({
      pkg,
      variantId: "ANLAGE_31",
      regionId: "OST_TARIF_WEST_BERLIN",
      payableWholeHours: 2,
    });
    expect(
      calculateCaritasPersonalOvertime({ ...berlin, serviceDate: "2025-06-30" }),
    ).toMatchObject({
      kind: "personal-overtime",
      baseAmountCents: 3822,
      premiumAmountCents: 1146,
      personalAmountCents: 4968,
      hourlyValues: { base: { fullTimeWeeklyMinutes: 2340 } },
    });
    expect(
      calculateCaritasPersonalOvertime({ ...berlin, serviceDate: "2025-07-01" }),
    ).toMatchObject({
      kind: "personal-overtime",
      baseAmountCents: 3872,
      premiumAmountCents: 1162,
      personalAmountCents: 5034,
      hourlyValues: { base: { fullTimeWeeklyMinutes: 2310 } },
    });
    expect(
      calculateCaritasPersonalOvertime(
        input({ pkg, serviceDate: "2025-07-01", regionId: "OST_TARIF_OST", payableWholeHours: 2 }),
      ),
    ).toMatchObject({
      kind: "personal-overtime",
      baseAmountCents: 3804,
      premiumAmountCents: 1142,
      personalAmountCents: 4946,
      hourlyValues: { base: { regionId: "OST_TARIF_OST", referenceMonthlyCents: 322510 } },
    });
  });

  it("requires an explicit overtime decision and reviewed payable hours", () => {
    for (const confirmation of [false, undefined, null, "true"] as const) {
      expect(
        calculateCaritasPersonalOvertime(input({ overtimeConfirmed: confirmation as boolean })),
      ).toEqual({ kind: "unavailable", reason: "OVERTIME_UNCONFIRMED" });
      expect(
        calculateCaritasPersonalOvertime(input({ hoursConfirmed: confirmation as boolean })),
      ).toEqual({ kind: "unavailable", reason: "HOURS_UNCONFIRMED" });
    }
  });

  it("requires separate cash claims for both components and rejects partial cash cases", () => {
    for (const entitlement of ["UNKNOWN", undefined, null, "CONFIRMED_TIME", true] as const) {
      expect(
        calculateCaritasPersonalOvertime(
          input({ baseEntitlement: entitlement as CaritasOvertimeCashEntitlement }),
        ),
      ).toEqual({ kind: "unavailable", reason: "BASE_ENTITLEMENT_UNCONFIRMED" });
      expect(
        calculateCaritasPersonalOvertime(
          input({ premiumEntitlement: entitlement as CaritasOvertimeCashEntitlement }),
        ),
      ).toEqual({ kind: "unavailable", reason: "PREMIUM_ENTITLEMENT_UNCONFIRMED" });
    }
    expect(calculateCaritasPersonalOvertime(input({ baseEntitlement: "NOT_ENTITLED" }))).toEqual({
      kind: "unavailable",
      reason: "BASE_NOT_ENTITLED",
    });
    expect(calculateCaritasPersonalOvertime(input({ premiumEntitlement: "NOT_ENTITLED" }))).toEqual(
      {
        kind: "unavailable",
        reason: "PREMIUM_NOT_ENTITLED",
      },
    );
  });

  it("accepts only one to 24 confirmed whole hours for a single work date", () => {
    for (const payableWholeHours of [
      0,
      -1,
      0.5,
      1.5,
      25,
      Number.NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER,
    ]) {
      expect(calculateCaritasPersonalOvertime(input({ payableWholeHours }))).toEqual({
        kind: "unavailable",
        reason: "INVALID_WHOLE_HOURS",
      });
    }
    expect(calculateCaritasPersonalOvertime(input({ payableWholeHours: 1 }))).toMatchObject({
      kind: "personal-overtime",
      personalAmountCents: 2508,
    });
    expect(calculateCaritasPersonalOvertime(input({ payableWholeHours: 24 }))).toMatchObject({
      kind: "personal-overtime",
      personalAmountCents: 60192,
    });
  });

  it("keeps invalid dates, groups, steps and source selections unavailable despite all confirmations", () => {
    for (const serviceDate of ["2025-02-30", "2025-06-30", "2025-08-12T00:00:00Z", "2026-02-01"]) {
      expect(calculateCaritasPersonalOvertime(input({ serviceDate }))).toEqual({
        kind: "unavailable",
        reason: "OUTSIDE_VALIDITY",
      });
    }
    expect(calculateCaritasPersonalOvertime(input({ groupId: "P5" }))).toEqual({
      kind: "unavailable",
      reason: "MISSING_TABLE_VALUE",
    });
    expect(calculateCaritasPersonalOvertime(input({ groupId: "P7", personalStepId: "1" }))).toEqual(
      {
        kind: "unavailable",
        reason: "MISSING_TABLE_VALUE",
      },
    );
    expect(calculateCaritasPersonalOvertime(input({ personalStepId: "7" }))).toEqual({
      kind: "unavailable",
      reason: "INVALID_STEP",
    });
    expect(calculateCaritasPersonalOvertime(input({ regionId: "BAYERN" }))).toEqual({
      kind: "unavailable",
      reason: "UNKNOWN_SELECTION",
    });
  });

  it("requires a valid DRAFT package and never grants app calculation capability", () => {
    const pkg = load("bw", "2026-02-01");
    const original = structuredClone(pkg);
    expect(
      calculateCaritasPersonalOvertime(input({ pkg, serviceDate: "2026-02-01" })),
    ).toMatchObject({ kind: "personal-overtime", completeGross: false });
    expect(pkg).toEqual(original);
    pkg.status = "PUBLISHED";
    expect(calculateCaritasPersonalOvertime(input({ pkg, serviceDate: "2026-02-01" }))).toEqual({
      kind: "unavailable",
      reason: "INVALID_PACKAGE",
    });
    pkg.status = "DRAFT";
    pkg.engineContractVersion = 11;
    expect(calculateCaritasPersonalOvertime(input({ pkg, serviceDate: "2026-02-01" }))).toEqual({
      kind: "unavailable",
      reason: "INVALID_PACKAGE",
    });
  });
});
