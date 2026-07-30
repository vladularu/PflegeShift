import { describe, expect, it } from "vitest";

import type { ShiftEntry } from "@/domain/types";
import { calculateMonthlyCompliance } from "@/engine/compliance";

function shift(
  id: string,
  date: string,
  startTime = "08:00",
  endTime = "16:00",
  breakMinutes = 30,
  type: ShiftEntry["type"] = "DAY",
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

describe("ArbZG compliance", () => {
  it("flags more than ten net hours and insufficient break", () => {
    const result = calculateMonthlyCompliance(
      "2026-07",
      [shift("long", "2026-07-01", "07:00", "18:00", 15)],
      "Europe/Berlin",
    );
    expect(result.issues.map((item) => item.rule)).toContain("ARBZG_3_MAX_10H");
    expect(result.issues.map((item) => item.rule)).toContain("ARBZG_4_BREAK");
  });

  it("uses the preceding eight days for rest-time checks", () => {
    const result = calculateMonthlyCompliance(
      "2026-07",
      [
        shift("late", "2026-06-30", "14:00", "23:00", 30, "LATE"),
        shift("early", "2026-07-01", "06:00", "14:00", 30, "EARLY"),
      ],
      "Europe/Berlin",
    );
    expect(result.issues.some((item) => item.rule === "ARBZG_5_REST_10H")).toBe(true);
  });

  it("separates legal issues from planning hints", () => {
    const shifts = Array.from({ length: 7 }, (_, index) =>
      shift(String(index), `2026-07-${String(index + 1).padStart(2, "0")}`),
    );
    const result = calculateMonthlyCompliance("2026-07", shifts, "Europe/Berlin");
    const streak = result.issues.find((item) => item.rule === "PLANNING_7_DAYS");
    expect(streak?.kind).toBe("PLANNING");
    expect(streak?.severity).toBe("warning");
  });

  it("ignores vacation, sickness and free entries", () => {
    const result = calculateMonthlyCompliance(
      "2026-07",
      [
        { ...shift("vacation", "2026-07-01"), type: "VACATION", startTime: null, endTime: null, breakMinutes: 0 },
        { ...shift("sick", "2026-07-02"), type: "SICK", startTime: null, endTime: null, breakMinutes: 0 },
        { ...shift("free", "2026-07-03"), type: "FREE", startTime: null, endTime: null, breakMinutes: 0 },
      ],
      "Europe/Berlin",
    );
    expect(result.issues).toHaveLength(0);
  });

  it("does not treat entries on the same day as a rest-period boundary", () => {
    const result = calculateMonthlyCompliance(
      "2026-07",
      [
        shift("morning", "2026-07-01", "06:00", "10:00", 0),
        shift("evening", "2026-07-01", "18:00", "22:00", 0),
      ],
      "Europe/Berlin",
    );
    expect(result.issues.some((item) => item.rule.startsWith("ARBZG_5_"))).toBe(false);
  });

  it("credits a qualifying interruption provisionally", () => {
    const result = calculateMonthlyCompliance(
      "2026-07",
      [
        shift("first", "2026-07-01", "08:00", "12:00", 0),
        shift("second", "2026-07-01", "12:30", "15:30", 0),
      ],
      "Europe/Berlin",
    );
    expect(result.issues.some((item) => item.rule === "ARBZG_4_INTERRUPTION")).toBe(true);
    expect(result.issues.some((item) => item.rule === "ARBZG_4_BREAK")).toBe(false);
  });

  it("does not credit gaps shorter than fifteen minutes as a break", () => {
    const result = calculateMonthlyCompliance(
      "2026-07",
      [
        shift("first", "2026-07-01", "08:00", "12:00", 0),
        shift("second", "2026-07-01", "12:10", "15:10", 0),
      ],
      "Europe/Berlin",
    );
    expect(result.issues.some((item) => item.rule === "ARBZG_4_BREAK")).toBe(true);
    expect(result.issues.some((item) => item.rule === "ARBZG_4_CONTINUOUS")).toBe(true);
  });

  it("uses the latest overnight end and earliest next-day start", () => {
    const result = calculateMonthlyCompliance(
      "2026-07",
      [
        shift("day", "2026-07-01", "08:00", "12:00", 0),
        shift("night", "2026-07-01", "21:00", "07:00", 60, "NIGHT"),
        shift("next", "2026-07-02", "16:00", "20:00", 0),
      ],
      "Europe/Berlin",
    );
    expect(result.issues.some((item) => item.rule === "ARBZG_5_REST_10H")).toBe(true);
  });

  it("starts a new working-time period after exactly ten hours of rest", () => {
    const result = calculateMonthlyCompliance(
      "2026-07",
      [
        shift("first", "2026-07-01", "06:00", "14:00", 30),
        shift("next", "2026-07-02", "00:00", "08:00", 30),
      ],
      "Europe/Berlin",
    );
    expect(result.issues.some((item) => item.rule === "ARBZG_3_MAX_10H")).toBe(false);
    expect(result.issues.some((item) => item.rule === "ARBZG_5_REST_10H")).toBe(false);
    expect(result.issues.some((item) => item.rule === "ARBZG_5_REST_11H")).toBe(true);
  });

  it("marks gross shifts over sixteen hours as planning warnings", () => {
    const result = calculateMonthlyCompliance(
      "2026-07",
      [shift("very-long", "2026-07-01", "06:00", "23:00", 60)],
      "Europe/Berlin",
    );
    const warning = result.issues.find((item) => item.rule === "TIME_GROSS_OVER_16H");
    expect(warning?.kind).toBe("PLANNING");
    expect(warning?.severity).toBe("warning");
  });
});
