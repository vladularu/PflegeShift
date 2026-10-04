import { describe, expect, it } from "vitest";
import oldCandidate from "../../rules/packages/reviewed/avr-dd-anlage-1/2025-03-01-draft1.json";
import currentCandidate from "../../rules/packages/reviewed/avr-dd-anlage-1/2026-09-01-draft1.json";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  calculateAvrddDraftTimePremiums,
  type AvrddDraftTimePremiumInput,
  type AvrddDraftWorkedSlice,
} from "./avrdd-draft-time-premiums";

const old = oldCandidate as RuleTariffPackage;
const current = currentCandidate as RuleTariffPackage;

function work(
  date: string,
  fromMinute: number,
  throughMinute: number,
  changes: Partial<AvrddDraftWorkedSlice> = {},
): AvrddDraftWorkedSlice {
  return {
    date,
    fromMinute,
    throughMinute,
    publicHoliday: false,
    nightPremiumEligible: true,
    workKind: "REGULAR_ACTIVE",
    ...changes,
  };
}

function input(
  month: string,
  workedSlices: readonly AvrddDraftWorkedSlice[],
  changes: Partial<AvrddDraftTimePremiumInput> = {},
): AvrddDraftTimePremiumInput {
  return {
    pkg: current,
    month,
    variantId: "ANLAGE_1",
    regionId: "AVR_DD",
    groupId: "eg2",
    workedSlices,
    avrddApplicabilityConfirmed: true,
    workDataComplete: true,
    premiumArrangement: "NONE_CONFIRMED",
    ...changes,
  };
}

describe("AVR.DD § 20a DRAFT time premiums", () => {
  it("uses the printed Anlage 9 cents rather than re-rounding percentages", () => {
    const result = calculateAvrddDraftTimePremiums(
      input("2026-11", [work("2026-11-01", 1260, 1320, { publicHoliday: true })]),
    );
    expect(result).toMatchObject({
      kind: "draft-time-premiums",
      status: "estimated",
      completeGross: false,
      groupId: "eg2",
      amountCents: 1263,
      positions: [
        { premium: "NIGHT", minutes: 60, printedRateCentsPerHour: 421, amountCents: 421 },
        {
          premium: "HOLIDAY_ON_SUNDAY",
          minutes: 60,
          printedRateCentsPerHour: 842,
          amountCents: 842,
        },
      ],
    });
    if (result.kind !== "draft-time-premiums") throw new Error(result.reason);
    expect(result.sourceIds).toContain("arkdd-rundschreiben-2025-07");
    expect(result.sourceIds).toContain("arkdd-avrdd-2026-01");
    expect(result.excludedComponents).toContain("OVERTIME");
  });

  it("uses the earlier table only within its proven validity period", () => {
    const result = calculateAvrddDraftTimePremiums(
      input("2025-03", [work("2025-03-02", 720, 780)], { pkg: old, groupId: "eg10" }),
    );
    expect(result).toMatchObject({
      kind: "draft-time-premiums",
      amountCents: 1154,
      positions: [{ premium: "SUNDAY", printedRateCentsPerHour: 1154 }],
    });
    expect(calculateAvrddDraftTimePremiums(input("2026-09", [], { pkg: old }))).toEqual({
      kind: "unavailable",
      reason: "OUTSIDE_VALIDITY",
    });
  });

  it("starts the Saturday premium at 13:00 and ends it at 21:00", () => {
    const result = calculateAvrddDraftTimePremiums(
      input("2026-09", [work("2026-09-26", 779, 781), work("2026-09-26", 1260, 1261)]),
    );
    expect(result).toMatchObject({
      amountCents: 11,
      positions: [
        { premium: "SATURDAY", minutes: 1, printedRateCentsPerHour: 253, amountCents: 4 },
        { premium: "NIGHT", minutes: 1, printedRateCentsPerHour: 421, amountCents: 7 },
      ],
    });
  });

  it("chooses weekday holiday over Saturday instead of adding both", () => {
    const result = calculateAvrddDraftTimePremiums(
      input("2026-10", [work("2026-10-03", 780, 840, { publicHoliday: true })]),
    );
    expect(result).toMatchObject({
      amountCents: 589,
      positions: [{ premium: "HOLIDAY", minutes: 60, amountCents: 589 }],
    });
  });

  it("combines the separate calendar-day pieces of a night shift without inventing pauses", () => {
    const result = calculateAvrddDraftTimePremiums(
      input("2026-09", [work("2026-09-26", 1260, 1440), work("2026-09-27", 0, 360)]),
    );
    expect(result).toMatchObject({ kind: "draft-time-premiums", amountCents: 7323 });
    if (result.kind !== "draft-time-premiums") throw new Error(result.reason);
    expect(result.positions).toEqual([
      {
        date: "2026-09-26",
        premium: "NIGHT",
        minutes: 180,
        printedRateCentsPerHour: 421,
        amountCents: 1263,
      },
      {
        date: "2026-09-27",
        premium: "NIGHT",
        minutes: 360,
        printedRateCentsPerHour: 421,
        amountCents: 2526,
      },
      {
        date: "2026-09-27",
        premium: "SUNDAY",
        minutes: 360,
        printedRateCentsPerHour: 589,
        amountCents: 3534,
      },
    ]);
  });

  it("keeps a confirmed night exclusion distinct from unknown eligibility", () => {
    expect(
      calculateAvrddDraftTimePremiums(
        input("2026-09", [work("2026-09-21", 1260, 1320, { nightPremiumEligible: false })]),
      ),
    ).toMatchObject({ kind: "draft-time-premiums", amountCents: 0, positions: [] });
    expect(
      calculateAvrddDraftTimePremiums(
        input("2026-09", [work("2026-09-21", 1260, 1320, { nightPremiumEligible: null })]),
      ),
    ).toEqual({ kind: "unavailable", reason: "NIGHT_ELIGIBILITY_UNKNOWN" });
  });

  it("fails closed on unconfirmed entitlement, incomplete work and a local lump sum", () => {
    const ordinary = [work("2026-09-21", 1260, 1320)];
    expect(
      calculateAvrddDraftTimePremiums(
        input("2026-09", ordinary, { avrddApplicabilityConfirmed: false }),
      ),
    ).toEqual({ kind: "unavailable", reason: "AVRDD_APPLICABILITY_UNCONFIRMED" });
    expect(
      calculateAvrddDraftTimePremiums(input("2026-09", ordinary, { workDataComplete: false })),
    ).toEqual({ kind: "unavailable", reason: "WORK_DATA_INCOMPLETE" });
    expect(
      calculateAvrddDraftTimePremiums(
        input("2026-09", ordinary, { premiumArrangement: "UNKNOWN" }),
      ),
    ).toEqual({ kind: "unavailable", reason: "LOCAL_AGREEMENT_UNKNOWN" });
    expect(
      calculateAvrddDraftTimePremiums(
        input("2026-09", ordinary, { premiumArrangement: "LUMP_SUM" }),
      ),
    ).toEqual({ kind: "unavailable", reason: "LOCAL_AGREEMENT_UNSUPPORTED" });
  });

  it("does not treat standby or on-call active work as ordinary paid time", () => {
    for (const workKind of ["STANDBY", "ON_CALL_ACTIVE", "UNKNOWN"] as const) {
      expect(
        calculateAvrddDraftTimePremiums(
          input("2026-09", [work("2026-09-21", 1260, 1320, { workKind })]),
        ),
      ).toEqual({ kind: "unavailable", reason: "SPECIAL_WORK_UNSUPPORTED" });
    }
  });

  it("rejects unknown holiday, overlap, invalid and out-of-month slices", () => {
    expect(
      calculateAvrddDraftTimePremiums(
        input("2026-09", [work("2026-09-21", 780, 840, { publicHoliday: null })]),
      ),
    ).toEqual({ kind: "unavailable", reason: "HOLIDAY_UNKNOWN" });
    expect(
      calculateAvrddDraftTimePremiums(
        input("2026-09", [work("2026-09-21", 780, 840), work("2026-09-21", 810, 900)]),
      ),
    ).toEqual({ kind: "unavailable", reason: "WORKED_SLICES_OVERLAP" });
    expect(
      calculateAvrddDraftTimePremiums(input("2026-09", [work("2026-09-21", 840, 840)])),
    ).toEqual({ kind: "unavailable", reason: "INVALID_WORKED_SLICE" });
    expect(
      calculateAvrddDraftTimePremiums(input("2026-09", [work("2026-10-01", 780, 840)])),
    ).toEqual({ kind: "unavailable", reason: "OUTSIDE_MONTH" });
  });

  it("requires the sourced policy and an explicit AVR.DD selection", () => {
    const noPolicy = structuredClone(current);
    delete noPolicy.rules.avrddTimePremiumPolicy;
    expect(calculateAvrddDraftTimePremiums(input("2026-09", [], { pkg: noPolicy }))).toEqual({
      kind: "unavailable",
      reason: "MISSING_POLICY",
    });
    expect(calculateAvrddDraftTimePremiums(input("2026-09", [], { regionId: "OTHER" }))).toEqual({
      kind: "unavailable",
      reason: "UNKNOWN_SELECTION",
    });
  });
});
