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

  it("prorates base salary and only pays a confirmed allowance", () => {
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
    expect(withDecision.allowanceAmount).toBe(125);
  });

  it("detects shift and alternating-shift patterns", () => {
    const result = assessTvoedPattern([
      shift({ id: "1", date: "2026-07-01", type: "EARLY", startTime: "06:00" }),
      shift({ id: "2", date: "2026-07-02", type: "LATE", startTime: "13:18" }),
      shift({ id: "3", date: "2026-07-03", type: "NIGHT", startTime: "21:00" }),
      shift({ id: "4", date: "2026-07-04", type: "EARLY", startTime: "06:00" }),
    ]);
    expect(result.shiftWork).toBe("DETECTED");
    expect(result.alternatingShiftWork).toBe("DETECTED");
    expect(result.suggestedAllowance).toBe("ALTERNATING_MONTHLY");
  });

  it("recognizes tariff night work even when the shift starts before 21:00", () => {
    const result = assessTvoedPattern([
      shift({ id: "1", date: "2026-07-01", type: "LATE", startTime: "19:00", endTime: "23:00" }),
      shift({ id: "2", date: "2026-07-02", type: "EARLY", startTime: "06:00", endTime: "14:00" }),
      shift({ id: "3", date: "2026-07-03", type: "DAY", startTime: "12:00", endTime: "20:00" }),
      shift({ id: "4", date: "2026-07-04", type: "LATE", startTime: "19:00", endTime: "23:00" }),
    ]);
    expect(result.alternatingShiftWork).toBe("DETECTED");
  });
});
