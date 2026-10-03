import { describe, expect, it } from "vitest";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type { SavedPaidAbsence } from "@/domain/paid-absence";
import { calculateMonthlyBaseRemuneration } from "./remuneration-base";
import { history, shift, work } from "./remuneration-test-fixtures";

function own(rate = 2000, from = "2026-01-01"): DatedRemunerationProfile {
  return {
    ...history(from),
    data: {
      version: 2,
      weeklyMinutes: 1155,
      selection: {
        kind: "own-configured",
        configuration: {
          base: { kind: "hourly", centsPerHour: rate },
          percentageBasisHourlyCents: null,
          timePremiums: null,
          overtime: null,
          fixedAllowances: [],
          specialPayments: [],
        },
      },
    },
  };
}
const absence = shift({
  id: "absence",
  type: "VACATION",
  allDay: true,
  startTime: null,
  endTime: null,
});
function confirmed(paidMinutes: number | null): SavedPaidAbsence {
  return {
    shiftId: absence.id,
    shiftRevision: absence.revision,
    shiftDate: absence.date,
    shiftUpdatedAt: absence.updatedAt,
    timeZone: work.timeZone,
    paidMinutes,
    revision: 1,
    confirmedAt: "2026-09-22T00:00:00Z",
    updatedAt: "2026-09-22T00:00:00Z",
  };
}
describe("dated own hourly base integration", () => {
  it("does not invent hours when service input is missing", () => {
    expect(calculateMonthlyBaseRemuneration("2026-09", [own()])).toMatchObject({
      totalCents: null,
      complete: false,
      knownSubtotalCents: 0,
      positions: [
        expect.objectContaining({
          issue: { code: "OWN_HOURLY_INPUT_MISSING", message: expect.any(String) },
        }),
      ],
    });
  });
  it("pays actual worked minutes without another weekly-hours reduction", () => {
    const result = calculateMonthlyBaseRemuneration("2026-09", [own()], undefined, {
      shifts: [shift()],
      timeZone: work.timeZone,
      paidAbsences: [],
    });
    expect(result.totalCents).toBe(4000);
    expect(result.positions[0].basis.hourly?.paidMinutes).toBe(120);
  });
  it.each([
    ["2026-03", "2026-03-29", 120, 4000],
    ["2026-10", "2026-10-25", 240, 8000],
  ])("counts elapsed time through DST in %s", (month, date, minutes, cents) => {
    const result = calculateMonthlyBaseRemuneration(month, [own()], undefined, {
      shifts: [shift({ date, startTime: "01:00", endTime: "04:00" })],
      timeZone: work.timeZone,
      paidAbsences: [],
    });
    expect(result.totalCents).toBe(cents);
    expect(result.positions[0].basis.hourly?.paidMinutes).toBe(minutes);
  });
  it("splits a midnight rate change at the exact local date", () => {
    const result = calculateMonthlyBaseRemuneration(
      "2026-09",
      [own(), own(3000, "2026-09-16")],
      undefined,
      { shifts: [shift()], timeZone: work.timeZone, paidAbsences: [] },
    );
    expect(result.totalCents).toBe(5000);
    expect(result.positions.map((row) => row.amountCents)).toEqual([2000, 3000]);
  });
  it("includes final minutes of a preceding-month shift only in this month", () => {
    const result = calculateMonthlyBaseRemuneration("2026-10", [own()], undefined, {
      shifts: [shift({ date: "2026-09-30" })],
      timeZone: work.timeZone,
      paidAbsences: [],
    });
    expect(result.totalCents).toBe(2000);
    expect(result.positions[0].basis.hourly?.paidMinutes).toBe(60);
  });
  it("exposes worked subtotal while paid absence is unconfirmed", () => {
    const result = calculateMonthlyBaseRemuneration("2026-09", [own()], undefined, {
      shifts: [shift(), absence],
      timeZone: work.timeZone,
      paidAbsences: [],
    });
    expect(result.totalCents).toBeNull();
    expect(result.knownSubtotalCents).toBe(4000);
    expect(result.positions[1]).toMatchObject({
      amountCents: null,
      issue: { code: "PAID_ABSENCE_UNCONFIRMED" },
    });
  });
  it.each([
    [0, 4000],
    [90, 7000],
  ])("preserves explicitly confirmed paid minutes %s", (paidMinutes, total) => {
    const result = calculateMonthlyBaseRemuneration("2026-09", [own()], undefined, {
      shifts: [shift(), absence],
      timeZone: work.timeZone,
      paidAbsences: [confirmed(paidMinutes)],
    });
    expect(result.totalCents).toBe(total);
    expect(result.positions[1].basis.hourly?.paidMinutes).toBe(paidMinutes);
  });
  it("invalidates absence after a service revision or explicit withdrawal", () => {
    for (const input of [
      { shifts: [shift(), { ...absence, revision: 2 }], paidAbsences: [confirmed(90)] },
      { shifts: [shift(), absence], paidAbsences: [confirmed(null)] },
    ]) {
      const result = calculateMonthlyBaseRemuneration("2026-09", [own()], undefined, {
        ...input,
        timeZone: work.timeZone,
      });
      expect(result.totalCents).toBeNull();
      expect(result.knownSubtotalCents).toBe(4000);
    }
  });
  it("labels estimated pause allocation across a profile boundary", () => {
    const result = calculateMonthlyBaseRemuneration(
      "2026-09",
      [own(), own(3000, "2026-09-16")],
      undefined,
      { shifts: [shift({ breakMinutes: 30 })], timeZone: work.timeZone, paidAbsences: [] },
    );
    expect(result.totalCents).toBe(3750);
    expect(result.status).toBe("estimated");
    expect(result.positions.every((row) => row.basis.hourly?.pauseEstimated)).toBe(true);
  });
  it("rejects duplicate service and absence confirmations", () => {
    for (const input of [
      { shifts: [shift(), shift()], paidAbsences: [] },
      { shifts: [absence], paidAbsences: [confirmed(90), confirmed(90)] },
    ]) {
      expect(() =>
        calculateMonthlyBaseRemuneration("2026-09", [own()], undefined, {
          ...input,
          timeZone: work.timeZone,
        }),
      ).toThrow();
    }
  });
  it("keeps a missing timed service unavailable instead of recording zero hours", () => {
    const result = calculateMonthlyBaseRemuneration("2026-09", [own()], undefined, {
      shifts: [shift({ startTime: null, endTime: null })],
      timeZone: work.timeZone,
      paidAbsences: [],
    });
    expect(result.totalCents).toBeNull();
    expect(result.positions[1].issue?.code).toBe("WORK_TIME_MISSING");
  });
});
