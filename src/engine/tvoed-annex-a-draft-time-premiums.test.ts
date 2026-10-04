import { describe, expect, it } from "vitest";
import oldCandidate from "../../rules/packages/reviewed/tvoed-vka-anlage-a/2025-04-01-draft1.json";
import currentCandidate from "../../rules/packages/reviewed/tvoed-vka-anlage-a/2026-05-01-draft1.json";
import type { RuleTariffPackage } from "../rules/contracts.generated";
import {
  calculateTvoedAnnexADraftTimePremiums,
  type TvoedAnnexADraftTimePremiumInput,
} from "./tvoed-annex-a-draft-time-premiums";

const current = currentCandidate as RuleTariffPackage;

function input(
  overrides: Partial<TvoedAnnexADraftTimePremiumInput> = {},
): TvoedAnnexADraftTimePremiumInput {
  return {
    pkg: current,
    month: "2026-09",
    variantId: "BT_K",
    groupId: "eg9b",
    fullTimeWeeklyMinutes: 2340,
    fullTimeReferenceConfirmed: true,
    applicabilityConfirmed: true,
    workDataComplete: true,
    cashPaymentConfirmed: true,
    localAgreement: "NONE_CONFIRMED",
    workedSlices: [
      {
        date: "2026-09-20",
        fromMinute: 1260,
        throughMinute: 1380,
        actualElapsedMinutes: 120,
        workKind: "REGULAR_ACTIVE",
        publicHoliday: false,
      },
    ],
    ...overrides,
  };
}

describe("TVöD Anlage A draft cash time premiums", () => {
  it.each(["BT_K", "BT_B"] as const)(
    "stacks night with Sunday for %s using EG9b stage 3",
    (variantId) => {
      const result = calculateTvoedAnnexADraftTimePremiums(input({ variantId }));
      expect(result).toMatchObject({
        kind: "draft-time-premiums",
        completeGross: false,
        status: "estimated",
        referenceHourlyCents: 2479,
        amountCents: 2232,
        positions: [
          { premium: "NIGHT", minutes: 120, percentageBasisPoints: 2000, amountCents: 992 },
          { premium: "SUNDAY", minutes: 120, percentageBasisPoints: 2500, amountCents: 1240 },
        ],
      });
    },
  );

  it("pays the highest holiday/Saturday premium, not both, and keeps the 235% cap out of the partial result", () => {
    const result = calculateTvoedAnnexADraftTimePremiums(
      input({
        month: "2026-12",
        workedSlices: [
          {
            date: "2026-12-26",
            fromMinute: 780,
            throughMinute: 900,
            actualElapsedMinutes: 120,
            workKind: "REGULAR_ACTIVE",
            publicHoliday: true,
            holidayTimeOff: false,
            shiftWork: true,
            legacyAngestellteClass: true,
          },
        ],
      }),
    );
    expect(result).toMatchObject({
      kind: "draft-time-premiums",
      amountCents: 6693,
      positions: [{ premium: "HOLIDAY_WITHOUT_TIME_OFF", minutes: 120, amountCents: 6693 }],
    });
  });

  it("uses the distinct 35% holiday rate only when time off is confirmed", () => {
    const result = calculateTvoedAnnexADraftTimePremiums(
      input({
        month: "2026-12",
        workedSlices: [
          {
            date: "2026-12-25",
            fromMinute: 780,
            throughMinute: 900,
            actualElapsedMinutes: 120,
            workKind: "REGULAR_ACTIVE",
            publicHoliday: true,
            holidayTimeOff: true,
          },
        ],
      }),
    );
    expect(result).toMatchObject({
      kind: "draft-time-premiums",
      amountCents: 1735,
      positions: [{ premium: "HOLIDAY_WITH_TIME_OFF", minutes: 120, amountCents: 1735 }],
    });
  });

  it("applies the Saturday shift-work exception only with the confirmed § 38(5) class", () => {
    const saturday = {
      date: "2026-09-26",
      fromMinute: 780,
      throughMinute: 900,
      actualElapsedMinutes: 120,
      workKind: "REGULAR_ACTIVE" as const,
      publicHoliday: false,
      shiftWork: true,
    };
    expect(
      calculateTvoedAnnexADraftTimePremiums(
        input({
          workedSlices: [{ ...saturday, legacyAngestellteClass: false }],
        }),
      ),
    ).toMatchObject({ kind: "draft-time-premiums", amountCents: 0 });
    expect(
      calculateTvoedAnnexADraftTimePremiums(
        input({
          workedSlices: [{ ...saturday, legacyAngestellteClass: true }],
        }),
      ),
    ).toMatchObject({ kind: "draft-time-premiums", amountCents: 992 });
    expect(
      calculateTvoedAnnexADraftTimePremiums(
        input({
          workedSlices: [saturday],
        }),
      ),
    ).toEqual({ kind: "unavailable", reason: "LEGACY_CLASS_UNKNOWN" });
    expect(
      calculateTvoedAnnexADraftTimePremiums(
        input({
          workedSlices: [{ ...saturday, shiftWork: false }],
        }),
      ),
    ).toMatchObject({ kind: "draft-time-premiums", amountCents: 992 });
  });

  it("starts the Christmas Eve premium at 06:00, without treating all of 24 December as a holiday", () => {
    const result = calculateTvoedAnnexADraftTimePremiums(
      input({
        month: "2026-12",
        workedSlices: [
          {
            date: "2026-12-24",
            fromMinute: 300,
            throughMinute: 420,
            actualElapsedMinutes: 120,
            workKind: "REGULAR_ACTIVE",
            publicHoliday: false,
          },
        ],
      }),
    );
    expect(result).toMatchObject({ kind: "draft-time-premiums", amountCents: 1364 });
    if (result.kind === "draft-time-premiums")
      expect(result.positions).toEqual(
        expect.arrayContaining([
          {
            date: "2026-12-24",
            premium: "NIGHT",
            minutes: 60,
            percentageBasisPoints: 2000,
            amountCents: 496,
          },
          {
            date: "2026-12-24",
            premium: "PRE_HOLIDAY",
            minutes: 60,
            percentageBasisPoints: 3500,
            amountCents: 868,
          },
        ]),
      );
  });

  it("keeps the earlier dated table separate", () => {
    const result = calculateTvoedAnnexADraftTimePremiums(
      input({
        pkg: oldCandidate as RuleTariffPackage,
        month: "2025-09",
        workedSlices: [
          {
            date: "2025-09-21",
            fromMinute: 1260,
            throughMinute: 1380,
            actualElapsedMinutes: 120,
            workKind: "REGULAR_ACTIVE",
            publicHoliday: false,
          },
        ],
      }),
    );
    expect(result.kind).toBe("draft-time-premiums");
    if (result.kind === "draft-time-premiums") {
      expect(result.versionId).toBe("2025-04-01-draft1");
      expect(result.referenceHourlyCents).not.toBe(2479);
    }
  });

  it.each([
    [{ localAgreement: "UNKNOWN" }, "LOCAL_AGREEMENT_UNSUPPORTED"],
    [{ cashPaymentConfirmed: false }, "CASH_PAYMENT_UNCONFIRMED"],
    [{ workDataComplete: false }, "WORK_DATA_INCOMPLETE"],
    [{ fullTimeWeeklyMinutes: 2520 }, "FULL_TIME_REFERENCE_UNSUPPORTED"],
    [{ month: "2026-04" }, "OUTSIDE_VALIDITY"],
    [{ groupId: "p9" }, "MISSING_REFERENCE_PAY"],
  ] as const)("fails closed for %j", (overrides, reason) => {
    expect(calculateTvoedAnnexADraftTimePremiums(input(overrides))).toEqual({
      kind: "unavailable",
      reason,
    });
  });

  it("rejects unconfirmed holidays, double counted intervals and DST clock changes", () => {
    const holiday = input({
      workedSlices: [
        {
          date: "2026-09-20",
          fromMinute: 780,
          throughMinute: 900,
          actualElapsedMinutes: 120,
          workKind: "REGULAR_ACTIVE",
          publicHoliday: true,
        },
      ],
    });
    expect(calculateTvoedAnnexADraftTimePremiums(holiday)).toEqual({
      kind: "unavailable",
      reason: "HOLIDAY_TIME_OFF_UNKNOWN",
    });
    const overlapping = input({
      workedSlices: [
        input().workedSlices[0],
        { ...input().workedSlices[0], fromMinute: 1320, throughMinute: 1440 },
      ],
    });
    expect(calculateTvoedAnnexADraftTimePremiums(overlapping)).toEqual({
      kind: "unavailable",
      reason: "OVERLAPPING_WORK",
    });
    const dst = input({
      month: "2026-10",
      workedSlices: [
        {
          date: "2026-10-25",
          fromMinute: 60,
          throughMinute: 180,
          actualElapsedMinutes: 120,
          workKind: "REGULAR_ACTIVE",
          publicHoliday: false,
        },
      ],
    });
    expect(calculateTvoedAnnexADraftTimePremiums(dst)).toEqual({
      kind: "unavailable",
      reason: "DST_DAY_UNSUPPORTED",
    });
  });
});
