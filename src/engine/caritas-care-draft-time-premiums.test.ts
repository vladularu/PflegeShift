import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  calculateCaritasCareDraftTimePremiums,
  type CaritasDraftTimePremiumInput,
  type CaritasDraftWorkedSlice,
} from "./caritas-care-draft-time-premiums";

function candidate(name: string): RuleTariffPackage {
  return JSON.parse(
    readFileSync(new URL(`../../rules/packages/reviewed/${name}`, import.meta.url), "utf8"),
  ) as RuleTariffPackage;
}

const bw2026 = candidate("avr-caritas-p-bw/2026-02-01-draft1.json");
const work = (
  date: string,
  fromMinute: number,
  throughMinute: number,
  rest: Partial<CaritasDraftWorkedSlice> = {},
): CaritasDraftWorkedSlice => ({
  date,
  fromMinute,
  throughMinute,
  publicHoliday: false,
  holidayTimeOff: null,
  shiftWork: false,
  ...rest,
});
const input = (slices: readonly CaritasDraftWorkedSlice[]): CaritasDraftTimePremiumInput => ({
  pkg: bw2026,
  variantId: "ANLAGE_31",
  regionId: "BW",
  groupId: "p6",
  workedSlices: slices,
  workDataComplete: true,
  localAgreement: "NONE_CONFIRMED",
});

describe("Caritas care DRAFT § 6 federal time-premium baseline", () => {
  it("uses P6 Stufe 3 and full-time weekly time even though no individual stage is supplied", () => {
    const result = calculateCaritasCareDraftTimePremiums(input([work("2026-09-21", 1260, 1320)]));
    expect(result).toMatchObject({
      kind: "federal-baseline-time-premiums",
      status: "estimated",
      amountCents: 397,
      positions: [
        {
          premium: "NIGHT",
          minutes: 60,
          referenceHourlyCents: 1984,
          percentageBasisPoints: 2000,
          amountCents: 397,
        },
      ],
    });
  });

  it("stacks night with the highest Sunday/holiday rate, never all day rates", () => {
    const result = calculateCaritasCareDraftTimePremiums(
      input([work("2026-11-01", 1260, 1320, { publicHoliday: true, holidayTimeOff: false })]),
    );
    expect(result).toMatchObject({
      kind: "federal-baseline-time-premiums",
      amountCents: 3075,
    });
    if (result.kind !== "federal-baseline-time-premiums") throw new Error(result.reason);
    expect(result.positions.map((position) => position.premium)).toEqual([
      "NIGHT",
      "HOLIDAY_WITHOUT_TIME_OFF",
    ]);
    expect(result.positions.map((position) => position.amountCents)).toEqual([397, 2678]);
  });

  it("requires Saturday shift-work facts and excludes that premium during shift work", () => {
    const saturday = work("2026-09-26", 780, 840, { shiftWork: null });
    expect(calculateCaritasCareDraftTimePremiums(input([saturday]))).toEqual({
      kind: "unavailable",
      reason: "SHIFT_WORK_UNKNOWN",
    });
    const ordinary = calculateCaritasCareDraftTimePremiums(
      input([{ ...saturday, shiftWork: false }]),
    );
    expect(ordinary).toMatchObject({ amountCents: 397 });
    const shifts = calculateCaritasCareDraftTimePremiums(input([{ ...saturday, shiftWork: true }]));
    expect(shifts).toMatchObject({ amountCents: 0, positions: [] });
  });

  it("handles a midnight split with actual net slices, not an invented centered pause", () => {
    const result = calculateCaritasCareDraftTimePremiums(
      input([work("2026-09-26", 1320, 1440), work("2026-09-27", 0, 120)]),
    );
    if (result.kind !== "federal-baseline-time-premiums") throw new Error(result.reason);
    expect(result.positions.filter((position) => position.premium === "NIGHT")).toHaveLength(2);
    expect(result.positions.find((position) => position.premium === "SUNDAY")?.minutes).toBe(120);
    expect(result.positions.reduce((sum, position) => sum + position.minutes, 0)).toBe(360);
  });

  it("fails closed on unknown holiday, compensation, work data and local agreement", () => {
    expect(
      calculateCaritasCareDraftTimePremiums(
        input([work("2026-09-21", 1260, 1320, { publicHoliday: null })]),
      ),
    ).toEqual({ kind: "unavailable", reason: "HOLIDAY_UNKNOWN" });
    expect(
      calculateCaritasCareDraftTimePremiums(
        input([work("2026-11-01", 1260, 1320, { publicHoliday: true })]),
      ),
    ).toEqual({ kind: "unavailable", reason: "HOLIDAY_TIME_OFF_UNKNOWN" });
    expect(
      calculateCaritasCareDraftTimePremiums({ ...input([]), workDataComplete: false }),
    ).toEqual({ kind: "unavailable", reason: "WORK_DATA_INCOMPLETE" });
    expect(
      calculateCaritasCareDraftTimePremiums({ ...input([]), localAgreement: "DIFFERENT" }),
    ).toEqual({ kind: "unavailable", reason: "LOCAL_AGREEMENT_UNSUPPORTED" });
  });

  it("rejects outside dates, missing source policy and unknown selections", () => {
    expect(calculateCaritasCareDraftTimePremiums(input([work("2027-01-01", 0, 60)]))).toEqual({
      kind: "unavailable",
      reason: "OUTSIDE_VALIDITY",
    });
    const old = candidate("avr-caritas-p-bw/2026-02-01-draft1.json");
    delete old.rules.caritasTimePremiumPolicy;
    expect(calculateCaritasCareDraftTimePremiums({ ...input([]), pkg: old })).toEqual({
      kind: "unavailable",
      reason: "MISSING_POLICY",
    });
    expect(
      calculateCaritasCareDraftTimePremiums({ ...input([]), regionId: "OST_TARIF_OST" }),
    ).toEqual({
      kind: "unavailable",
      reason: "UNKNOWN_SELECTION",
    });
  });
});
