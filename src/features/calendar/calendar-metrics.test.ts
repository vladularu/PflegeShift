import { describe, expect, it } from "vitest";

import type { CalendarEntry, ShiftEntry } from "@/domain/types";
import { calculateMonthlySummary } from "@/engine/monthly-summary";
import {
  buildMonthlyHoursSeries,
  buildShiftTypeDistribution,
  calculateDailySummary,
  calculateMonthProgress,
  clampDateToMonth,
} from "@/features/calendar/calendar-metrics";

const profile = {
  federalState: "BY" as const,
  weeklyMinutes: 2_400,
  timeZone: "Europe/Berlin",
};

function shift(partial: Partial<ShiftEntry> & Pick<ShiftEntry, "date" | "type">): ShiftEntry {
  return {
    kind: "SHIFT",
    id: `${partial.date}-${partial.type}`,
    templateId: null,
    title: "Dienst",
    startTime: "08:00",
    endTime: "16:30",
    breakMinutes: 30,
    color: "#008C7A",
    symbol: "D",
    note: null,
    overtimeMinutes: 0,
    holidayPremiumMode: "WITH_TIME_OFF",
    revision: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    deletedAt: null,
    ...partial,
  };
}

describe("calendar metrics", () => {
  it("keeps overtime visible while capping the progress ring", () => {
    expect(calculateMonthProgress(2_100, 2_000)).toEqual({
      displayPercent: 105,
      fillPercent: 100,
    });
    expect(calculateMonthProgress(500, 2_000)).toEqual({
      displayPercent: 25,
      fillPercent: 25,
    });
    expect(calculateMonthProgress(500, 0)).toEqual({
      displayPercent: 0,
      fillPercent: 0,
    });
  });

  it("calculates target, worked time and balance without appointments", () => {
    const entries: CalendarEntry[] = [
      shift({ date: "2026-07-01", type: "DAY" }),
      {
        kind: "APPOINTMENT",
        id: "a",
        date: "2026-07-01",
        title: "Arzt",
        allDay: false,
        startTime: "10:00",
        endTime: "11:00",
        color: "#000",
        note: null,
        revision: 1,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ];
    expect(calculateDailySummary("2026-07-01", entries, profile)).toMatchObject({
      targetMinutes: 480,
      actualMinutes: 480,
      balanceMinutes: 0,
    });
  });

  it("credits absence on workdays and handles overnight shifts", () => {
    expect(
      calculateDailySummary(
        "2026-07-02",
        [shift({ date: "2026-07-02", type: "VACATION", startTime: null, endTime: null })],
        profile,
      ).actualMinutes,
    ).toBe(480);
    expect(
      calculateDailySummary(
        "2026-07-03",
        [
          shift({
            date: "2026-07-03",
            type: "NIGHT",
            startTime: "21:00",
            endTime: "07:30",
            breakMinutes: 30,
          }),
        ],
        profile,
      ).actualMinutes,
    ).toBe(600);
  });

  it("sets no target on a public holiday", () => {
    expect(calculateDailySummary("2026-01-01", [], profile)).toMatchObject({
      targetMinutes: 0,
      actualMinutes: 0,
      balanceMinutes: 0,
    });
  });

  it("aggregates every day and groups shift types", () => {
    const entries = [
      shift({ date: "2026-07-01", type: "EARLY" }),
      shift({ date: "2026-07-02", type: "EARLY" }),
      shift({ date: "2026-07-03", type: "LATE" }),
    ];
    expect(buildMonthlyHoursSeries("2026-07", entries, profile)).toHaveLength(31);
    expect(
      buildMonthlyHoursSeries("2026-07", entries, profile).reduce(
        (sum, day) => sum + day.actualMinutes,
        0,
      ),
    ).toBe(1_440);
    expect(buildShiftTypeDistribution("2026-07", entries).get("EARLY")).toBe(2);
  });

  it("reconciles daily bars exactly to the monthly actual time", () => {
    const entries = [
      shift({ date: "2026-07-01", type: "EARLY" }),
      shift({ date: "2026-07-02", type: "VACATION", startTime: null, endTime: null }),
      shift({
        date: "2026-07-03",
        type: "NIGHT",
        startTime: "21:00",
        endTime: "07:30",
        breakMinutes: 30,
      }),
    ];
    const bars = buildMonthlyHoursSeries("2026-07", entries, profile);
    const monthly = calculateMonthlySummary("2026-07", entries, profile);
    expect(bars.reduce((sum, day) => sum + day.actualMinutes, 0)).toBe(monthly.actualMinutes);
  });

  it("keeps the day when changing month and clamps shorter months", () => {
    expect(clampDateToMonth("2026-01-31", "2026-02")).toBe("2026-02-28");
    expect(clampDateToMonth("2026-01-13", "2026-08")).toBe("2026-08-13");
  });
});
