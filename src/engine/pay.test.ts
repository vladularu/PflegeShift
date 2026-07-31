import { describe, expect, it } from "vitest";

import type { ShiftEntry, UserProfile } from "@/domain/types";
import {
  assessTvoedPattern,
  calculateMonthlyPayEstimate,
  calculateShiftPremiumBreakdown,
} from "@/engine/pay";

const profile: UserProfile = {
  federalState: "NW",
  weeklyMinutes: 1_155,
  timeZone: "Europe/Berlin",
  tariff: {
    payGroup: "P8",
    payLevel: 4,
    sector: "BT_K",
    fullTimeWeeklyMinutes: 2_310,
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const permanentRoundTheClock = {
  workplaceCoverage: "AROUND_THE_CLOCK" as const,
  assignment: "PERMANENT" as const,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function shift(overrides: Partial<ShiftEntry> = {}): ShiftEntry {
  return {
    kind: "SHIFT",
    id: "shift-1",
    date: "2026-07-05",
    templateId: null,
    title: "Nacht",
    type: "NIGHT",
    startTime: "21:00",
    endTime: "07:00",
    breakMinutes: 60,
    color: "#EA5B55",
    symbol: "N",
    note: null,
    overtimeMinutes: 60,
    holidayPremiumMode: "WITH_TIME_OFF",
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

describe("TVöD-P pay engine", () => {
  it("keeps night additive to Sunday and calculates overtime separately", () => {
    const result = calculateShiftPremiumBreakdown(shift(), profile);
    expect(result.premiumLines.map((line) => line.key)).toEqual(["night", "sunday"]);
    expect(result.overtimeBaseAmount).toBe(24.03);
    expect(result.overtimePremiumAmount).toBe(6.83);
  });

  it("uses the selected holiday compensation percentage", () => {
    const withTimeOff = calculateShiftPremiumBreakdown(
      shift({ date: "2026-12-25", startTime: "08:00", endTime: "16:00", breakMinutes: 0, overtimeMinutes: 0 }),
      profile,
    );
    const withoutTimeOff = calculateShiftPremiumBreakdown(
      shift({
        date: "2026-12-25",
        startTime: "08:00",
        endTime: "16:00",
        breakMinutes: 0,
        overtimeMinutes: 0,
        holidayPremiumMode: "WITHOUT_TIME_OFF",
      }),
      profile,
    );
    expect(withTimeOff.premiumLines.find((line) => line.key === "holiday")?.percentage).toBe(35);
    expect(withoutTimeOff.premiumLines.find((line) => line.key === "holiday")?.percentage).toBe(135);
  });

  it("keeps actual premium minutes across daylight-saving transitions", () => {
    const spring = calculateShiftPremiumBreakdown(
      shift({
        date: "2026-03-29",
        startTime: "00:00",
        endTime: "06:00",
        breakMinutes: 0,
        overtimeMinutes: 0,
      }),
      profile,
    );
    const autumn = calculateShiftPremiumBreakdown(
      shift({
        date: "2026-10-25",
        startTime: "00:00",
        endTime: "06:00",
        breakMinutes: 0,
        overtimeMinutes: 0,
      }),
      profile,
    );

    expect(spring.premiumLines.find((line) => line.key === "night")?.minutes).toBe(300);
    expect(autumn.premiumLines.find((line) => line.key === "night")?.minutes).toBe(420);
  });

  it("prorates salary and applies detected or manually confirmed allowances", () => {
    const withoutDecision = calculateMonthlyPayEstimate("2026-07", [shift()], profile, null);
    const withDecision = calculateMonthlyPayEstimate(
      "2026-07",
      [shift()],
      profile,
      {
        month: "2026-07",
        allowanceStatus: "ALTERNATING_MONTHLY",
        revision: 1,
        confirmedAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
      },
    );
    expect(withoutDecision.personalBaseAmount).toBe(2037.79);
    expect(withoutDecision.allowanceAmount).toBe(0);
    expect(withoutDecision.tvoedAllowanceAmount).toBe(12.5);
    expect(withoutDecision.careAllowanceAmount).toBe(70.91);
    expect(withDecision.allowanceAmount).toBe(125);
    expect(withDecision.estimatedGrossAmount).toBe(
      Math.round((
        withDecision.personalBaseAmount! +
        withDecision.timePremiumAmount +
        withDecision.overtimeAmount +
        withDecision.allowanceAmount +
        withDecision.tvoedAllowanceAmount +
        withDecision.careAllowanceAmount
      ) * 100) / 100,
    );
  });

  it("detects shift and alternating-shift patterns", () => {
    const result = assessTvoedPattern([
      shift({ id: "1", date: "2026-07-01", type: "EARLY", startTime: "06:00", endTime: "14:00" }),
      shift({ id: "2", date: "2026-07-02", type: "LATE", startTime: "13:18", endTime: "21:30" }),
      shift({ id: "3", date: "2026-07-03", type: "NIGHT", startTime: "21:00", endTime: "07:00" }),
      shift({ id: "4", date: "2026-07-04", type: "EARLY", startTime: "06:00", endTime: "14:00" }),
      shift({ id: "5", date: "2026-07-05", type: "NIGHT", startTime: "21:00", endTime: "07:00" }),
      shift({ id: "6", date: "2026-07-06", type: "NIGHT", startTime: "21:00", endTime: "07:00" }),
    ], permanentRoundTheClock);
    expect(result.shiftWork).toBe("DETECTED");
    expect(result.alternatingShiftWork).toBe("DETECTED");
    expect(result.suggestedAllowance).toBe("ALTERNATING_MONTHLY");
  });

  it("recognizes tariff night work even when the shift starts before 21:00", () => {
    const result = assessTvoedPattern([
      shift({ id: "1", date: "2026-07-01", type: "LATE", startTime: "19:00", endTime: "23:00", breakMinutes: 0 }),
      shift({ id: "2", date: "2026-07-02", type: "EARLY", startTime: "06:00", endTime: "14:00" }),
      shift({ id: "3", date: "2026-07-03", type: "DAY", startTime: "12:00", endTime: "20:00" }),
      shift({ id: "4", date: "2026-07-04", type: "LATE", startTime: "19:00", endTime: "23:00", breakMinutes: 0 }),
      shift({ id: "5", date: "2026-07-05", type: "EARLY", startTime: "06:00", endTime: "14:00" }),
      shift({ id: "6", date: "2026-07-06", type: "LATE", startTime: "19:00", endTime: "23:00", breakMinutes: 0 }),
    ], permanentRoundTheClock);
    expect(result.alternatingShiftWork).toBe("DETECTED");
  });

  it("does not classify one isolated night shift as constant alternating-shift work", () => {
    const result = assessTvoedPattern([
      shift({ id: "1", date: "2026-07-01", type: "EARLY", startTime: "06:00", endTime: "14:00" }),
      shift({ id: "2", date: "2026-07-02", type: "LATE", startTime: "13:18", endTime: "21:30" }),
      shift({ id: "3", date: "2026-07-03", type: "NIGHT", startTime: "21:00", endTime: "07:00" }),
      shift({ id: "4", date: "2026-07-04", type: "EARLY", startTime: "06:00", endTime: "14:00" }),
    ]);

    expect(result.alternatingShiftWork).toBe("REVIEW");
    expect(result.suggestedAllowance).toBe("NONE");
    expect(result.requiresConfirmation).toBe(true);
  });

  it("uses the previous month to recognize a rotation across a month boundary", () => {
    const currentShifts = [
      shift({ id: "current-1", date: "2026-07-01", type: "NIGHT", startTime: "21:00", endTime: "07:00" }),
      shift({ id: "current-2", date: "2026-07-03", type: "EARLY", startTime: "06:00", endTime: "14:00" }),
    ];
    const assessmentShifts = [
      shift({ id: "previous-1", date: "2026-06-27", type: "EARLY", startTime: "06:00", endTime: "14:00" }),
      shift({ id: "previous-2", date: "2026-06-29", type: "LATE", startTime: "13:18", endTime: "21:30" }),
      ...currentShifts,
      shift({ id: "current-3", date: "2026-07-08", type: "NIGHT", startTime: "21:00", endTime: "07:00" }),
      shift({ id: "current-4", date: "2026-07-12", type: "NIGHT", startTime: "21:00", endTime: "07:00" }),
    ];

    const result = calculateMonthlyPayEstimate(
      "2026-07",
      currentShifts,
      profile,
      null,
      assessmentShifts,
      permanentRoundTheClock,
    );

    expect(result.assessment.alternatingShiftWork).toBe("DETECTED");
    expect(result.assessment.suggestedAllowance).toBe("ALTERNATING_MONTHLY");
  });

  it("does not infer 24/7 coverage or permanent assignment from calendar data", () => {
    const result = assessTvoedPattern([
      shift({ id: "1", date: "2026-07-01", type: "EARLY", startTime: "06:00", endTime: "14:00" }),
      shift({ id: "2", date: "2026-07-02", type: "LATE", startTime: "13:18", endTime: "21:30" }),
      shift({ id: "3", date: "2026-07-03", type: "NIGHT", startTime: "21:00", endTime: "07:00" }),
      shift({ id: "4", date: "2026-07-08", type: "EARLY", startTime: "06:00", endTime: "14:00" }),
      shift({ id: "5", date: "2026-07-10", type: "NIGHT", startTime: "21:00", endTime: "07:00" }),
      shift({ id: "6", date: "2026-07-17", type: "NIGHT", startTime: "21:00", endTime: "07:00" }),
    ]);

    expect(result.alternatingShiftWork).toBe("REVIEW");
    expect(result.suggestedAllowance).toBe("NONE");
    expect(result.requiresConfirmation).toBe(true);
    expect(result.criteria.find((item) => item.key === "AROUND_THE_CLOCK")?.state).toBe("OPEN");
  });
});
