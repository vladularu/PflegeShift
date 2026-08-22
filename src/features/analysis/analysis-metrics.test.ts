import { describe, expect, it } from "vitest";

import type { CalendarEntry, ShiftEntry } from "@/domain/types";
import { calculateMonthlySummary } from "@/engine/monthly-summary";
import { buildMonthlyShiftTypeAnalysis } from "@/features/analysis/analysis-metrics";

const profile = {
  federalState: "NW" as const,
  weeklyMinutes: 2_310,
  timeZone: "Europe/Berlin",
};

function shift(
  id: string,
  date: string,
  type: ShiftEntry["type"],
  startTime: string | null,
  endTime: string | null,
  breakMinutes = 0,
  deletedAt: string | null = null,
): ShiftEntry {
  return {
    kind: "SHIFT",
    id,
    date,
    templateId: null,
    title: type,
    type,
    startTime,
    endTime,
    breakMinutes,
    color: "#2F80ED",
    symbol: type.slice(0, 1),
    note: null,
    overtimeMinutes: 0,
    holidayPremiumMode: "WITH_TIME_OFF",
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt,
  };
}

describe("monthly shift type analysis", () => {
  it("groups counts and credited minutes using the monthly work-time contract", () => {
    const entries: CalendarEntry[] = [
      shift("early", "2026-07-01", "EARLY", "06:00", "14:12", 30),
      shift("training", "2026-07-01", "TRAINING", "12:00", "16:00"),
      shift("night", "2026-07-02", "NIGHT", "22:00", "06:00", 30),
      shift("vacation", "2026-07-03", "VACATION", null, null),
      shift("free", "2026-07-04", "FREE", null, null),
      shift("deleted", "2026-07-05", "LATE", "14:00", "22:00", 30, "2026-07-06"),
      shift("outside", "2026-08-01", "DAY", "08:00", "16:00", 30),
    ];

    const result = buildMonthlyShiftTypeAnalysis("2026-07", entries, profile);
    const monthlySummary = calculateMonthlySummary(
      "2026-07",
      entries.filter((entry): entry is ShiftEntry => entry.kind === "SHIFT"),
      profile,
    );

    expect(result.items).toEqual([
      { type: "EARLY", count: 1, minutes: 462 },
      { type: "NIGHT", count: 1, minutes: 450 },
      { type: "TRAINING", count: 1, minutes: 108 },
      { type: "VACATION", count: 1, minutes: 462 },
      { type: "FREE", count: 1, minutes: 0 },
    ]);
    expect(result.totalCount).toBe(5);
    expect(result.totalMinutes).toBe(monthlySummary.actualMinutes);
  });

  it("returns an empty immutable result when the month has no shifts", () => {
    const result = buildMonthlyShiftTypeAnalysis("2026-07", [], profile);

    expect(result).toEqual({ items: [], totalCount: 0, totalMinutes: 0 });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.items)).toBe(true);
  });
});
