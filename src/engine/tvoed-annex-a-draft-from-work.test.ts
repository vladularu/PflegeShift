import { describe, expect, it } from "vitest";
import candidate from "../../rules/packages/reviewed/tvoed-vka-anlage-a/2026-05-01-draft1.json";
import {
  validateSavedShiftTraining,
  type SavedShiftTraining,
  type ShiftTrainingData,
} from "@/domain/training-data";
import type { ShiftEntry } from "@/domain/types";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { shift, work } from "./remuneration-test-fixtures";
import {
  calculateTvoedAnnexADraftTimePremiumsFromWork,
  tvoedAnnexAShiftBinding,
  type TvoedAnnexADraftFromWorkInput,
} from "./tvoed-annex-a-draft-from-work";

const parent = shift({
  id: "september-sunday",
  date: "2026-09-20",
  type: "NIGHT",
  startTime: "21:00",
  endTime: "23:00",
  breakMinutes: 0,
});

function details(shift: ShiftEntry, pauses: ShiftTrainingData["pauses"]): SavedShiftTraining {
  return validateSavedShiftTraining({
    shiftId: shift.id,
    shiftRevision: shift.revision,
    shiftDate: shift.date,
    shiftUpdatedAt: shift.updatedAt,
    timeZone: "Europe/Berlin",
    data: { version: 1, pauses, school: null },
    revision: 1,
    updatedAt: shift.updatedAt,
  });
}

function input(
  overrides: Partial<TvoedAnnexADraftFromWorkInput> = {},
): TvoedAnnexADraftFromWorkInput {
  return {
    pkg: candidate as RuleTariffPackage,
    month: "2026-09",
    variantId: "BT_K",
    groupId: "eg9b",
    fullTimeWeeklyMinutes: 2340,
    fullTimeReferenceConfirmed: true,
    applicabilityConfirmed: true,
    cashPaymentConfirmed: true,
    localAgreement: "NONE_CONFIRMED",
    shifts: [parent],
    pauseDetails: [details(parent, [])],
    workProfile: work,
    entriesComplete: true,
    dayDecisions: [
      {
        shiftId: parent.id,
        date: parent.date,
        origin: "confirmed",
        shiftBinding: tvoedAnnexAShiftBinding(parent, "Europe/Berlin"),
        workKind: "REGULAR_ACTIVE",
        holidayTimeOff: null,
        shiftWork: null,
        legacyAngestellteClass: null,
      },
    ],
    ...overrides,
  };
}

describe("TVöD Anlage A draft bridge from real work and confirmed facts", () => {
  it("prices only actual net Sunday night work, with no centered break guess", () => {
    expect(calculateTvoedAnnexADraftTimePremiumsFromWork(input())).toMatchObject({
      kind: "draft-time-premiums",
      completeGross: false,
      amountCents: 2232,
      positions: [
        { premium: "NIGHT", minutes: 120, amountCents: 992 },
        { premium: "SUNDAY", minutes: 120, amountCents: 1240 },
      ],
    });
  });

  it("subtracts a confirmed pause at its recorded time", () => {
    const paused = { ...parent, breakMinutes: 30 };
    const facts = input({
      shifts: [paused],
      pauseDetails: [
        details(paused, [{ start: "2026-09-20T19:30:00Z", end: "2026-09-20T20:00:00Z" }]),
      ],
      dayDecisions: [
        {
          ...input().dayDecisions[0],
          shiftBinding: tvoedAnnexAShiftBinding(paused, "Europe/Berlin"),
        },
      ],
    });
    expect(calculateTvoedAnnexADraftTimePremiumsFromWork(facts)).toMatchObject({
      kind: "draft-time-premiums",
      amountCents: 1674,
      positions: [
        { premium: "NIGHT", minutes: 90 },
        { premium: "SUNDAY", minutes: 90 },
      ],
    });
  });

  it("requires current explicit pause data and a complete month", () => {
    expect(
      calculateTvoedAnnexADraftTimePremiumsFromWork(input({ pauseDetails: [] })),
    ).toMatchObject({
      kind: "unavailable",
      stage: "work-slices",
      reason: "PAUSES_MISSING_OR_STALE",
    });
    expect(
      calculateTvoedAnnexADraftTimePremiumsFromWork(
        input({ pauseDetails: [details({ ...parent, revision: 2 }, [])] }),
      ),
    ).toMatchObject({ kind: "unavailable", stage: "work-slices" });
    expect(
      calculateTvoedAnnexADraftTimePremiumsFromWork(input({ entriesComplete: false })),
    ).toMatchObject({ kind: "unavailable", stage: "work-slices", reason: "ENTRIES_INCOMPLETE" });
  });

  it("never infers regular work from a template or an absent day confirmation", () => {
    expect(
      calculateTvoedAnnexADraftTimePremiumsFromWork(input({ dayDecisions: [] })),
    ).toMatchObject({ kind: "unavailable", stage: "work-facts", reason: "WORK_KIND_UNCONFIRMED" });
    expect(
      calculateTvoedAnnexADraftTimePremiumsFromWork(
        input({ dayDecisions: [{ ...input().dayDecisions[0], workKind: "SPECIAL" }] }),
      ),
    ).toMatchObject({ kind: "unavailable", stage: "premium", reason: "SPECIAL_WORK_UNSUPPORTED" });
  });

  it("derives the official holiday from the work location but requires time-off confirmation", () => {
    const christmas = shift({
      id: "christmas",
      date: "2026-12-25",
      startTime: "13:00",
      endTime: "15:00",
      breakMinutes: 0,
    });
    const decision = {
      ...input().dayDecisions[0],
      shiftId: christmas.id,
      date: christmas.date,
      shiftBinding: tvoedAnnexAShiftBinding(christmas, "Europe/Berlin"),
    };
    const facts = input({
      month: "2026-12",
      shifts: [christmas],
      pauseDetails: [details(christmas, [])],
      dayDecisions: [decision],
    });
    expect(calculateTvoedAnnexADraftTimePremiumsFromWork(facts)).toMatchObject({
      kind: "unavailable",
      stage: "premium",
      reason: "HOLIDAY_TIME_OFF_UNKNOWN",
    });
    expect(
      calculateTvoedAnnexADraftTimePremiumsFromWork({
        ...facts,
        dayDecisions: [{ ...decision, holidayTimeOff: true }],
      }),
    ).toMatchObject({
      kind: "draft-time-premiums",
      positions: [{ premium: "HOLIDAY_WITH_TIME_OFF", minutes: 120 }],
    });
  });

  it("does not assume the Saturday shift-work or legacy employee class", () => {
    const saturday = shift({
      id: "saturday",
      date: "2026-09-26",
      startTime: "13:00",
      endTime: "15:00",
      breakMinutes: 0,
    });
    const decision = {
      ...input().dayDecisions[0],
      shiftId: saturday.id,
      date: saturday.date,
      shiftBinding: tvoedAnnexAShiftBinding(saturday, "Europe/Berlin"),
    };
    const facts = input({
      shifts: [saturday],
      pauseDetails: [details(saturday, [])],
      dayDecisions: [decision],
    });
    expect(calculateTvoedAnnexADraftTimePremiumsFromWork(facts)).toMatchObject({
      kind: "unavailable",
      stage: "premium",
      reason: "SHIFT_WORK_UNKNOWN",
    });
    expect(
      calculateTvoedAnnexADraftTimePremiumsFromWork({
        ...facts,
        dayDecisions: [{ ...decision, shiftWork: true }],
      }),
    ).toMatchObject({ kind: "unavailable", stage: "premium", reason: "LEGACY_CLASS_UNKNOWN" });
    expect(
      calculateTvoedAnnexADraftTimePremiumsFromWork({
        ...facts,
        dayDecisions: [{ ...decision, shiftWork: true, legacyAngestellteClass: true }],
      }),
    ).toMatchObject({ kind: "draft-time-premiums", amountCents: 992 });
  });

  it("rejects duplicate decisions, non-cash claims and unsupported time zones", () => {
    const decision = input().dayDecisions[0];
    expect(
      calculateTvoedAnnexADraftTimePremiumsFromWork(input({ dayDecisions: [decision, decision] })),
    ).toMatchObject({ kind: "unavailable", stage: "work-facts", reason: "DECISION_AMBIGUOUS" });
    expect(
      calculateTvoedAnnexADraftTimePremiumsFromWork(input({ cashPaymentConfirmed: false })),
    ).toMatchObject({ kind: "unavailable", stage: "premium", reason: "CASH_PAYMENT_UNCONFIRMED" });
    expect(
      calculateTvoedAnnexADraftTimePremiumsFromWork(
        input({ workProfile: { ...work, timeZone: "Europe/London" } }),
      ),
    ).toMatchObject({ kind: "unavailable", stage: "work-slices", reason: "TIME_ZONE_UNSUPPORTED" });
  });

  it("rejects a confirmation from another shift snapshot even with the same revision", () => {
    const decision = input().dayDecisions[0];
    expect(
      calculateTvoedAnnexADraftTimePremiumsFromWork(
        input({ dayDecisions: [{ ...decision, shiftBinding: "prior-content" }] }),
      ),
    ).toMatchObject({ kind: "unavailable", stage: "work-facts", reason: "DECISION_STALE" });
  });

  it("includes a previous-month night only for minutes in the requested month", () => {
    const augustNight = shift({
      id: "august-night",
      date: "2026-08-31",
      startTime: "23:00",
      endTime: "02:00",
      breakMinutes: 0,
    });
    expect(
      calculateTvoedAnnexADraftTimePremiumsFromWork(
        input({
          shifts: [augustNight],
          pauseDetails: [details(augustNight, [])],
          dayDecisions: [
            {
              ...input().dayDecisions[0],
              shiftId: augustNight.id,
              date: "2026-09-01",
              shiftBinding: tvoedAnnexAShiftBinding(augustNight, "Europe/Berlin"),
            },
          ],
        }),
      ),
    ).toMatchObject({
      kind: "draft-time-premiums",
      amountCents: 992,
      positions: [{ date: "2026-09-01", premium: "NIGHT", minutes: 120 }],
    });
  });

  it("refuses a daylight-saving shift before treating clock minutes as elapsed work", () => {
    const transition = shift({
      id: "dst-night",
      date: "2026-10-25",
      startTime: "00:00",
      endTime: "06:00",
      breakMinutes: 0,
    });
    expect(
      calculateTvoedAnnexADraftTimePremiumsFromWork(
        input({
          month: "2026-10",
          shifts: [transition],
          pauseDetails: [details(transition, [])],
          dayDecisions: [],
        }),
      ),
    ).toMatchObject({
      kind: "unavailable",
      stage: "work-slices",
      reason: "DST_TRANSITION_UNSUPPORTED",
    });
  });

  it("does not silently omit a training entry that may be paid work", () => {
    const training = shift({
      id: "training",
      date: "2026-09-21",
      type: "TRAINING",
      startTime: "08:00",
      endTime: "16:00",
      breakMinutes: 0,
    });
    expect(
      calculateTvoedAnnexADraftTimePremiumsFromWork(input({ shifts: [parent, training] })),
    ).toMatchObject({
      kind: "unavailable",
      stage: "work-slices",
      reason: "TRAINING_WORK_UNRESOLVED",
      shiftId: "training",
    });
  });
});
