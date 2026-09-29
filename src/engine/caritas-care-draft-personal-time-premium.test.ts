import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  calculateCaritasPersonalTimePremium,
  type CaritasPersonalTimePremiumInput,
  type CaritasTimePremiumType,
} from "./caritas-care-draft-personal-time-premium";

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
  overrides: Partial<CaritasPersonalTimePremiumInput> = {},
): CaritasPersonalTimePremiumInput {
  return {
    pkg: load("bw", "2025-07-01"),
    serviceDate: "2025-08-12",
    variantId: "ANLAGE_31",
    regionId: "BW",
    groupId: "P6",
    premiumType: "NIGHT",
    entitlement: "CONFIRMED_CASH",
    payableWholeHours: 8,
    hoursConfirmed: true,
    categoryAndOverlapConfirmed: true,
    ...overrides,
  };
}

describe("Caritas DRAFT personal time premium for externally confirmed whole hours", () => {
  it("multiplies each printed 2025 P6 hourly value only for one confirmed category", () => {
    for (const [premiumType, rateCentsPerHour] of [
      ["NIGHT", 386],
      ["SUNDAY", 482],
      ["HOLIDAY_WITH_TIME_OFF", 675],
      ["HOLIDAY_WITHOUT_TIME_OFF", 2604],
      ["PRE_HOLIDAY", 675],
      ["SATURDAY", 386],
    ] as const) {
      expect(calculateCaritasPersonalTimePremium(input({ premiumType }))).toMatchObject({
        kind: "personal-time-premium",
        completeGross: false,
        serviceDate: "2025-08-12",
        premiumType,
        payableWholeHours: 8,
        rateCentsPerHour,
        personalAmountCents: rateCentsPerHour * 8,
        cashEntitlementConfirmed: true,
        hoursConfirmed: true,
        categoryAndOverlapConfirmed: true,
        hourlyValues: {
          ratio: {
            reference: {
              referenceStepId: "3",
              fullTimeMonthlyCents: 327186,
              tableSourceIds: ["caritas-bk-2025-02-corrected", "caritas-rk-bw-2025"],
              rateSourceIds: ["caritas-dcv-premiums-2025"],
            },
          },
        },
      });
    }
  });

  it("keeps the eastern special table and Berlin working-time change sourced", () => {
    const pkg = load("ost", "2025-01");
    const east = calculateCaritasPersonalTimePremium(
      input({
        pkg,
        serviceDate: "2025-06-30",
        variantId: "ANLAGE_32",
        regionId: "OST_TARIF_OST",
        premiumType: "HOLIDAY_WITH_TIME_OFF",
      }),
    );
    const berlinBefore = calculateCaritasPersonalTimePremium(
      input({ pkg, serviceDate: "2025-06-30", regionId: "OST_TARIF_WEST_BERLIN" }),
    );
    const berlinAfter = calculateCaritasPersonalTimePremium(
      input({ pkg, serviceDate: "2025-07-01", regionId: "OST_TARIF_WEST_BERLIN" }),
    );
    expect(east).toMatchObject({
      kind: "personal-time-premium",
      hourlyValues: {
        ratio: { reference: { fullTimeMonthlyCents: 322510, fullTimeWeeklyMinutes: 2340 } },
      },
    });
    expect(berlinBefore).toMatchObject({
      kind: "personal-time-premium",
      hourlyValues: { ratio: { reference: { fullTimeWeeklyMinutes: 2340 } } },
    });
    expect(berlinAfter).toMatchObject({
      kind: "personal-time-premium",
      hourlyValues: { ratio: { reference: { fullTimeWeeklyMinutes: 2310 } } },
    });
    if (
      berlinBefore.kind === "personal-time-premium" &&
      berlinAfter.kind === "personal-time-premium"
    ) {
      expect(berlinAfter.rateCentsPerHour).toBeGreaterThan(berlinBefore.rateCentsPerHour);
    }
  });

  it("requires an externally confirmed cash claim, category decision and whole hours", () => {
    expect(calculateCaritasPersonalTimePremium(input({ entitlement: "UNKNOWN" }))).toEqual({
      kind: "unavailable",
      reason: "ENTITLEMENT_UNCONFIRMED",
    });
    expect(calculateCaritasPersonalTimePremium(input({ entitlement: "NOT_ENTITLED" }))).toEqual({
      kind: "unavailable",
      reason: "NOT_ENTITLED",
    });
    expect(calculateCaritasPersonalTimePremium(input({ hoursConfirmed: false }))).toEqual({
      kind: "unavailable",
      reason: "HOURS_UNCONFIRMED",
    });
    expect(
      calculateCaritasPersonalTimePremium(input({ categoryAndOverlapConfirmed: false })),
    ).toEqual({
      kind: "unavailable",
      reason: "CATEGORY_OR_OVERLAP_UNCONFIRMED",
    });
    for (const payableWholeHours of [0, -1, 1.5, 25, Number.NaN]) {
      expect(calculateCaritasPersonalTimePremium(input({ payableWholeHours }))).toEqual({
        kind: "unavailable",
        reason: "INVALID_WHOLE_HOURS",
      });
    }
    expect(
      calculateCaritasPersonalTimePremium(
        input({ premiumType: "OVERTIME" as CaritasTimePremiumType }),
      ),
    ).toEqual({ kind: "unavailable", reason: "UNKNOWN_PREMIUM_TYPE" });
  });

  it("passes through missing source, invalid dates and package changes", () => {
    expect(calculateCaritasPersonalTimePremium(input({ serviceDate: "2025-02-30" }))).toEqual({
      kind: "unavailable",
      reason: "OUTSIDE_VALIDITY",
    });
    expect(calculateCaritasPersonalTimePremium(input({ groupId: "P5" }))).toEqual({
      kind: "unavailable",
      reason: "MISSING_TABLE_VALUE",
    });
    const pkg = load("bw", "2025-07-01");
    pkg.rules.caritasTimePremiumRates![0].nightBasisPoints = 0;
    expect(calculateCaritasPersonalTimePremium(input({ pkg }))).toEqual({
      kind: "unavailable",
      reason: "INVALID_PACKAGE",
    });
  });
});
