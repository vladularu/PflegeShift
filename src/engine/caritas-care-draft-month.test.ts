import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  calculateCaritasCareDraftMonth,
  type CaritasCareDraftMonthInput,
} from "./caritas-care-draft-month";

function candidate(region: string): RuleTariffPackage {
  const version = region === "ost" ? "2026-01" : "2026-02-01";
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

function input(overrides: Partial<CaritasCareDraftMonthInput> = {}): CaritasCareDraftMonthInput {
  return {
    pkg: candidate("bw"),
    month: "2026-09",
    variantId: "ANLAGE_31",
    regionId: "BW",
    groupId: "p6",
    stepId: "1",
    weeklyMinutes: 2340,
    fullMonthEmploymentConfirmed: true,
    fullMonthlyBaseEntitlementConfirmed: true,
    fixedAllowanceClaim: "ENTITLED",
    careAllowanceClaim: "ENTITLED",
    shiftEntitlements: [
      {
        from: "2026-09-01",
        through: "2026-09-30",
        status: "NONE",
        origin: "confirmed",
        revision: 1,
      },
    ],
    workedSlices: [],
    workDataComplete: true,
    localAgreement: "NONE_CONFIRMED",
    ...overrides,
  };
}

describe("Caritas DRAFT known monthly subtotal, never full gross pay", () => {
  it("composes the sourced full-time P6/1 base and both separately confirmed Pflege allowances", () => {
    const result = calculateCaritasCareDraftMonth(input());
    expect(result).toMatchObject({
      kind: "draft-known-subtotal",
      status: "estimated",
      knownSubtotalCents: 318931,
      excludedComponents: ["OVERTIME", "ANNUAL_PAYMENT", "OTHER_LOCAL_TERMS"],
      positions: [
        { component: "base", amountCents: 301249, status: "calculated" },
        { component: "fixed-allowance", amountCents: 3500, status: "calculated" },
        { component: "care-allowance", amountCents: 14182, status: "calculated" },
        { component: "shift-allowance", amountCents: 0, status: "calculated" },
        { component: "time-premiums", amountCents: 0, status: "estimated" },
      ],
    });
    if (result.kind !== "draft-known-subtotal") throw new Error(result.reason);
    expect(result.positions.slice(0, 3).every((position) => position.sourceIds.length > 0)).toBe(
      true,
    );
  });

  it("uses the same net worked hour for hourly shift allowance and night premium without double counting", () => {
    const result = calculateCaritasCareDraftMonth(
      input({
        fixedAllowanceClaim: "NOT_ENTITLED",
        careAllowanceClaim: "NOT_ENTITLED",
        shiftEntitlements: [
          {
            from: "2026-09-01",
            through: "2026-09-30",
            status: "ALTERNATING_HOURLY",
            origin: "confirmed",
            revision: 1,
          },
        ],
        workedSlices: [
          {
            date: "2026-09-21",
            fromMinute: 1260,
            throughMinute: 1320,
            publicHoliday: false,
            holidayTimeOff: null,
            shiftWork: true,
          },
        ],
      }),
    );
    expect(result).toMatchObject({
      kind: "draft-known-subtotal",
      knownSubtotalCents: 301795,
      positions: [
        { component: "base", amountCents: 301249 },
        { component: "shift-allowance", amountCents: 149 },
        { component: "time-premiums", amountCents: 397 },
      ],
    });
  });

  it.each([
    ["bw", "BW", 2340],
    ["bayern", "BAYERN", 2310],
    ["mitte", "MITTE", 2340],
    ["nord", "NORD", 2310],
    ["nrw", "NRW", 2310],
    ["ost", "OST_TARIF_OST", 2310],
    ["ost", "OST_TARIF_WEST_BERLIN", 2310],
    ["ost", "OST_TARIF_WEST_HAMBURG", 2310],
  ])("keeps regional source identity for %s/%s", (region, regionId, weeklyMinutes) => {
    const result = calculateCaritasCareDraftMonth(
      input({
        pkg: candidate(region),
        regionId,
        weeklyMinutes,
        fixedAllowanceClaim: "NOT_ENTITLED",
        careAllowanceClaim: "NOT_ENTITLED",
      }),
    );
    expect(result.kind).toBe("draft-known-subtotal");
    if (result.kind !== "draft-known-subtotal") throw new Error(result.reason);
    expect(result.packageId).toBe(`avr-caritas-p-${region}`);
    expect(result.positions[0].sourceIds.length).toBeGreaterThan(0);
  });

  it("fails closed on unknown claims, employment fraction, missing work facts or local agreement", () => {
    expect(calculateCaritasCareDraftMonth(input({ careAllowanceClaim: "UNKNOWN" }))).toEqual({
      kind: "unavailable",
      reason: "ALLOWANCE_CLAIM_UNKNOWN",
    });
    expect(calculateCaritasCareDraftMonth(input({ fullMonthEmploymentConfirmed: false }))).toEqual({
      kind: "unavailable",
      reason: "PARTIAL_EMPLOYMENT",
    });
    expect(
      calculateCaritasCareDraftMonth(input({ fullMonthlyBaseEntitlementConfirmed: false })),
    ).toEqual({
      kind: "unavailable",
      reason: "BASE_ENTITLEMENT_UNKNOWN",
    });
    expect(calculateCaritasCareDraftMonth(input({ workDataComplete: false }))).toEqual({
      kind: "unavailable",
      reason: "WORK_DATA_INCOMPLETE",
      component: "shift-allowance",
    });
    expect(calculateCaritasCareDraftMonth(input({ localAgreement: "DIFFERENT" }))).toEqual({
      kind: "unavailable",
      reason: "LOCAL_AGREEMENT_UNSUPPORTED",
      component: "time-premiums",
    });
    expect(calculateCaritasCareDraftMonth(input({ shiftEntitlements: [] }))).toEqual({
      kind: "unavailable",
      reason: "DECISION_MISSING",
      component: "shift-allowance",
    });
  });

  it("rejects overlapping, out-of-month or mid-month changed inputs instead of inflating pay", () => {
    const work = (fromMinute: number, throughMinute: number, date = "2026-09-21") => ({
      date,
      fromMinute,
      throughMinute,
      publicHoliday: false,
      holidayTimeOff: null,
      shiftWork: false,
    });
    expect(
      calculateCaritasCareDraftMonth(input({ workedSlices: [work(1260, 1320), work(1300, 1380)] })),
    ).toEqual({
      kind: "unavailable",
      reason: "WORKED_SLICES_OVERLAP",
      component: "time-premiums",
    });
    expect(
      calculateCaritasCareDraftMonth(input({ workedSlices: [work(1260, 1320, "2026-10-01")] })),
    ).toEqual({
      kind: "unavailable",
      reason: "OUTSIDE_VALIDITY",
      component: "time-premiums",
    });
    expect(calculateCaritasCareDraftMonth(input({ month: "2027-01" }))).toEqual({
      kind: "unavailable",
      reason: "OUTSIDE_VALIDITY",
    });
    expect(calculateCaritasCareDraftMonth(input({ month: "2026-13" }))).toEqual({
      kind: "unavailable",
      reason: "INVALID_MONTH",
    });
    const pkg = candidate("bw");
    const rate = pkg.rules.caritasCareAllowanceRates!.find(
      (item) => item.provisionId === "SECTION_12_4",
    )!;
    rate.validFrom = "2026-09-15";
    expect(calculateCaritasCareDraftMonth(input({ pkg }))).toEqual({
      kind: "unavailable",
      reason: "MID_MONTH_BASE_CHANGE",
    });
    const expiring = candidate("bw");
    expiring.rules.caritasCareAllowanceRates!.find(
      (item) => item.provisionId === "SECTION_12_4",
    )!.validTo = "2026-09-15";
    expect(calculateCaritasCareDraftMonth(input({ pkg: expiring }))).toEqual({
      kind: "unavailable",
      reason: "MID_MONTH_BASE_CHANGE",
    });
  });
});
