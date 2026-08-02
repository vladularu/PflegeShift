import { describe, expect, it } from "vitest";

import type { ShiftEntry } from "@/domain/types";
import { calculateDailyWorkCredit } from "@/engine/daily-summary";

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
    symbol: "D",
    note: null,
    overtimeMinutes: 0,
    holidayPremiumMode: "WITH_TIME_OFF",
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  };
}

describe("daily work credit", () => {
  it("uses sickness only to fill the remaining daily target", () => {
    const result = calculateDailyWorkCredit("2026-07-01", [
      shift("early", "2026-07-01", "EARLY", "06:00", "10:00"),
      shift("sick", "2026-07-01", "SICK", null, null),
    ], profile);

    expect(result.workMinutes).toBe(240);
    expect(result.sickMinutes).toBe(222);
    expect(result.actualMinutes).toBe(462);
  });

  it("does not add sickness to a complete or longer service", () => {
    const result = calculateDailyWorkCredit("2026-07-01", [
      shift("early", "2026-07-01", "EARLY", "06:00", "14:12", 30),
      shift("sick", "2026-07-01", "SICK", null, null),
    ], profile);

    expect(result.workMinutes).toBe(462);
    expect(result.sickMinutes).toBe(0);
    expect(result.actualMinutes).toBe(462);
  });

  it("adds only the non-overlapping part of training", () => {
    const result = calculateDailyWorkCredit("2026-07-01", [
      shift("early", "2026-07-01", "EARLY", "06:00", "14:12", 30),
      shift("training", "2026-07-01", "TRAINING", "12:00", "16:00"),
    ], profile);

    expect(result.workMinutes).toBe(462);
    expect(result.trainingMinutes).toBe(108);
    expect(result.overlapMinutes).toBe(132);
    expect(result.actualMinutes).toBe(570);
  });

  it("does not double-count fully overlapping training", () => {
    const result = calculateDailyWorkCredit("2026-07-01", [
      shift("early", "2026-07-01", "EARLY", "06:00", "14:12", 30),
      shift("training", "2026-07-01", "TRAINING", "08:00", "12:00"),
    ], profile);

    expect(result.trainingMinutes).toBe(0);
    expect(result.overlapMinutes).toBe(240);
    expect(result.actualMinutes).toBe(462);
  });

  it("gives no absence credit on weekends or public holidays", () => {
    expect(calculateDailyWorkCredit("2026-07-04", [
      shift("sick", "2026-07-04", "SICK", null, null),
    ], profile).actualMinutes).toBe(0);
    expect(calculateDailyWorkCredit("2026-01-01", [
      shift("vacation", "2026-01-01", "VACATION", null, null),
    ], profile).actualMinutes).toBe(0);
  });
});
