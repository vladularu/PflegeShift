import { describe, expect, it } from "vitest";

import legalCandidateValue from "../../rules/packages/reviewed/de-arbzg-care/2026-01.json";
import type { ShiftEntry } from "@/domain/types";
import {
  calculateMonthlyCompliance,
  prepareComplianceIntervalsIncrementally,
} from "@/engine/compliance";
import type { RuleLegalPackage } from "@/rules/contracts.generated";
import { createRuleResolver } from "@/rules/rule-resolver";

const legalV6Resolver = createRuleResolver(
  { tariff: [], legal: [legalCandidateValue as RuleLegalPackage], holiday: [] },
  { tariff: "unused", legal: "de-arbzg-care", holiday: "unused" },
);

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
  it("reports every unresolved profile evidence boundary without hiding the calculation", () => {
    const result = calculateMonthlyCompliance(
      "2026-07",
      [shift("night", "2026-07-01", "21:00", "07:00", 30, "NIGHT")],
      "Europe/Berlin",
      {
        allEmploymentWorkRecorded: null,
        federalState: "BY",
        holidayRegion: "UNKNOWN",
        regularRotatingNightWork: null,
      },
    );

    expect(result.issues.map((item) => item.rule)).toEqual(
      expect.arrayContaining([
        "ARBZG_DATA_ALL_EMPLOYMENT",
        "ARBZG_6_NIGHT_STATUS_UNKNOWN",
        "HOLIDAY_REGION_UNKNOWN",
        "ARBZG_4_BREAK_PLACEMENT_UNVERIFIED",
      ]),
    );
  });

  it("keeps the one-calendar-month alternative open through its later deadline", () => {
    const shifts = [
      shift("late", "2026-01-29", "13:00", "22:00", 30, "LATE"),
      shift("early", "2026-01-30", "08:30", "16:30", 30, "EARLY"),
    ];
    const atCalendarMonthDeadline = calculateMonthlyCompliance("2026-01", shifts, "Europe/Berlin", {
      referenceDate: "2026-02-28",
      ruleResolver: legalV6Resolver,
    }).issues.find((item) => item.rule === "ARBZG_5_REST_11H");
    const afterCalendarMonthDeadline = calculateMonthlyCompliance(
      "2026-01",
      shifts,
      "Europe/Berlin",
      { referenceDate: "2026-03-01", ruleResolver: legalV6Resolver },
    ).issues.find((item) => item.rule === "ARBZG_5_REST_11H");

    expect(atCalendarMonthDeadline?.severity).toBe("warning");
    expect(afterCalendarMonthDeadline?.severity).toBe("critical");
  });

  it("prepares cold interval conversion in bounded batches without changing results", () => {
    const shifts = Array.from({ length: 55 }, (_, index) =>
      shift(`batch-${index}`, `2026-07-${String((index % 28) + 1).padStart(2, "0")}`),
    );
    const preparation = prepareComplianceIntervalsIncrementally(shifts, "Europe/Berlin", 20);
    const checkpoints: number[] = [];
    while (true) {
      const step = preparation.next();
      if (step.done) break;
      checkpoints.push(step.value);
    }

    expect(checkpoints).toEqual([20, 40, 55]);
    expect(calculateMonthlyCompliance("2026-07", shifts, "Europe/Berlin").month).toBe("2026-07");
  });

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

  it("reports a cross-date overlap without duplicating it as negative rest", () => {
    const result = calculateMonthlyCompliance(
      "2026-07",
      [
        shift("night", "2026-07-01", "22:00", "06:00", 0, "NIGHT"),
        shift("early", "2026-07-02", "05:00", "13:00", 0, "EARLY"),
      ],
      "Europe/Berlin",
    );

    expect(result.issues.filter((item) => item.rule === "SHIFT_OVERLAP")).toHaveLength(1);
    expect(result.issues.some((item) => item.rule === "ARBZG_5_REST_10H")).toBe(false);
  });

  it("keeps zero-minute rest as a rest violation when shifts only touch", () => {
    const result = calculateMonthlyCompliance(
      "2026-07",
      [
        shift("late", "2026-07-01", "16:00", "00:00", 0, "LATE"),
        shift("early", "2026-07-02", "00:00", "08:00", 0, "EARLY"),
      ],
      "Europe/Berlin",
    );

    expect(result.issues.some((item) => item.rule === "SHIFT_OVERLAP")).toBe(false);
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

  it("allows four consecutive night shifts without a series warning", () => {
    const shifts = Array.from({ length: 4 }, (_, index) =>
      shift(
        `night-${index + 1}`,
        `2026-07-${String(index + 1).padStart(2, "0")}`,
        "21:00",
        "07:00",
        60,
        "NIGHT",
      ),
    );

    const result = calculateMonthlyCompliance("2026-07", shifts, "Europe/Berlin");

    expect(result.issues.some((item) => item.rule === "PLANNING_NIGHT_SERIES")).toBe(false);
  });

  it("warns from five consecutive night shifts", () => {
    const shifts = Array.from({ length: 5 }, (_, index) =>
      shift(
        `night-${index + 1}`,
        `2026-07-${String(index + 1).padStart(2, "0")}`,
        "21:00",
        "07:00",
        60,
        "NIGHT",
      ),
    );

    const result = calculateMonthlyCompliance("2026-07", shifts, "Europe/Berlin");
    const warning = result.issues.find((item) => item.rule === "PLANNING_NIGHT_SERIES");

    expect(warning).toMatchObject({
      kind: "PLANNING",
      severity: "warning",
      title: "Fünf oder mehr Nachtdienste in Folge",
    });
  });

  it("recognizes a five-night series from actual hours instead of the saved shift type", () => {
    const shifts = Array.from({ length: 5 }, (_, index) =>
      shift(
        `custom-night-${index + 1}`,
        `2026-07-${String(index + 1).padStart(2, "0")}`,
        "21:00",
        "07:00",
        60,
        "CUSTOM",
      ),
    );

    const result = calculateMonthlyCompliance("2026-07", shifts, "Europe/Berlin");

    expect(result.issues.some((item) => item.rule === "PLANNING_NIGHT_SERIES")).toBe(true);
  });

  it("keeps the deferred night-series recovery hint disabled", () => {
    const result = calculateMonthlyCompliance(
      "2026-07",
      [
        shift("night-1", "2026-07-01", "21:00", "07:00", 60, "NIGHT"),
        shift("night-2", "2026-07-02", "21:00", "07:00", 60, "NIGHT"),
        shift("early", "2026-07-04", "06:00", "14:00", 30, "EARLY"),
      ],
      "Europe/Berlin",
    );

    expect(result.issues.some((item) => item.rule === "PLANNING_NIGHT_RECOVERY")).toBe(false);
  });

  it("ignores vacation, sickness and free entries", () => {
    const result = calculateMonthlyCompliance(
      "2026-07",
      [
        {
          ...shift("vacation", "2026-07-01"),
          type: "VACATION",
          startTime: null,
          endTime: null,
          breakMinutes: 0,
        },
        {
          ...shift("sick", "2026-07-02"),
          type: "SICK",
          startTime: null,
          endTime: null,
          breakMinutes: 0,
        },
        {
          ...shift("free", "2026-07-03"),
          type: "FREE",
          startTime: null,
          endTime: null,
          breakMinutes: 0,
        },
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

  it("reports a short hospital rest period without duplicating it as daily working time", () => {
    const result = calculateMonthlyCompliance(
      "2026-10",
      [
        shift("late", "2026-10-03", "13:18", "21:30", 30, "LATE"),
        shift("early", "2026-10-04", "06:00", "14:12", 30, "EARLY"),
      ],
      "Europe/Berlin",
    );

    expect(result.issues.some((item) => item.rule === "ARBZG_5_REST_10H")).toBe(true);
    expect(result.issues.some((item) => item.rule === "ARBZG_3_MAX_10H")).toBe(false);
  });

  it("accepts one extended night shift when the long section 3 window balances it", () => {
    const result = calculateMonthlyCompliance(
      "2026-07",
      [shift("night", "2026-07-01", "21:00", "07:30", 60, "NIGHT")],
      "Europe/Berlin",
      { federalState: "NW", referenceDate: "2026-08-01", weeklyMinutes: 2_310 },
    );

    expect(result.issues.some((item) => item.rule === "ARBZG_3_OVER_8H")).toBe(false);
    expect(result.issues.some((item) => item.rule === "ARBZG_6_NIGHT_AVERAGE")).toBe(false);
  });

  it("reports the monthly night-work average only when it remains above eight hours", () => {
    const denseNightMonth = Array.from({ length: 31 }, (_, index) =>
      shift(
        `night-${index + 1}`,
        `2026-07-${String(index + 1).padStart(2, "0")}`,
        "21:00",
        "07:30",
        60,
        "NIGHT",
      ),
    );
    const open = calculateMonthlyCompliance("2026-07", denseNightMonth, "Europe/Berlin", {
      federalState: "NW",
      referenceDate: "2026-07-15",
      weeklyMinutes: 2_310,
      regularRotatingNightWork: true,
    }).issues.find((item) => item.rule === "ARBZG_6_NIGHT_AVERAGE");
    const expired = calculateMonthlyCompliance("2026-07", denseNightMonth, "Europe/Berlin", {
      federalState: "NW",
      referenceDate: "2026-08-01",
      weeklyMinutes: 2_310,
      regularRotatingNightWork: true,
    }).issues.find((item) => item.rule === "ARBZG_6_NIGHT_AVERAGE");

    expect(open).toMatchObject({
      severity: "warning",
      title: "Ausgleich der Nachtarbeitszeit offen",
    });
    expect(expired).toMatchObject({
      severity: "critical",
      title: "Ausgleich der Nachtarbeitszeit fehlt",
    });
  });

  it("accepts the four-week alternative when the calendar-month average alone is high", () => {
    const dates = [...Array.from({ length: 19 }, (_, index) => index + 1), 29, 30, 31];
    const shifts = dates.map((day) =>
      shift(
        `night-${day}`,
        `2026-07-${String(day).padStart(2, "0")}`,
        "21:00",
        "08:00",
        60,
        "NIGHT",
      ),
    );

    const result = calculateMonthlyCompliance("2026-07", shifts, "Europe/Berlin", {
      federalState: "NW",
      referenceDate: "2026-09-01",
      regularRotatingNightWork: true,
    });

    expect(result.issues.some((item) => item.rule === "ARBZG_6_NIGHT_AVERAGE")).toBe(false);
  });

  it("does not invent working time for vacation or sickness under legal contract v3", () => {
    const nightShifts = Array.from({ length: 21 }, (_, index) =>
      shift(
        `night-${index + 1}`,
        `2026-07-${String(index + 1).padStart(2, "0")}`,
        "21:00",
        "08:00",
        60,
        "NIGHT",
      ),
    );
    const absences = Array.from({ length: 5 }, (_, index) => ({
      ...shift(`vacation-${index + 1}`, `2026-07-${String(index + 22).padStart(2, "0")}`),
      type: "VACATION" as const,
      startTime: null,
      endTime: null,
      breakMinutes: 0,
    }));

    const result = calculateMonthlyCompliance(
      "2026-07",
      [...nightShifts, ...absences],
      "Europe/Berlin",
      {
        federalState: "NW",
        referenceDate: "2026-09-01",
        weeklyMinutes: 2_310,
        regularRotatingNightWork: true,
      },
    );

    expect(result.issues.some((item) => item.rule === "ARBZG_6_NIGHT_AVERAGE")).toBe(false);
  });

  it("establishes night-worker status from 48 recorded night-work days in the year", () => {
    const januaryNights = Array.from({ length: 17 }, (_, index) =>
      shift(
        `january-night-${index + 1}`,
        `2026-01-${String(index + 1).padStart(2, "0")}`,
        "21:00",
        "07:30",
        60,
        "NIGHT",
      ),
    );
    const julyNights = Array.from({ length: 31 }, (_, index) =>
      shift(
        `july-night-${index + 1}`,
        `2026-07-${String(index + 1).padStart(2, "0")}`,
        "21:00",
        "07:30",
        60,
        "NIGHT",
      ),
    );

    const result = calculateMonthlyCompliance(
      "2026-07",
      [...januaryNights, ...julyNights],
      "Europe/Berlin",
      { federalState: "NW", referenceDate: "2026-09-01" },
    );

    expect(result.issues.some((item) => item.rule === "ARBZG_6_NIGHT_AVERAGE")).toBe(true);
  });

  it("keeps night duties above ten net hours immediately critical", () => {
    const result = calculateMonthlyCompliance(
      "2026-07",
      [shift("long-night", "2026-07-01", "21:00", "08:30", 30, "NIGHT")],
      "Europe/Berlin",
      { federalState: "NW", referenceDate: "2026-07-01", weeklyMinutes: 2_310 },
    );

    expect(result.issues.some((item) => item.rule === "ARBZG_3_MAX_10H")).toBe(true);
  });

  it("hides a shortened hospital rest period after an automatic compensation match", () => {
    const result = calculateMonthlyCompliance(
      "2026-10",
      [
        shift("late", "2026-10-01", "13:00", "22:00", 30, "LATE"),
        shift("early", "2026-10-02", "08:30", "16:30", 30, "EARLY"),
        shift("next", "2026-10-04", "08:30", "16:30", 30, "DAY"),
      ],
      "Europe/Berlin",
      { referenceDate: "2026-10-31" },
    );

    expect(result.issues.some((item) => item.rule === "ARBZG_5_REST_11H")).toBe(false);
  });

  it("uses each compensating rest period only once", () => {
    const result = calculateMonthlyCompliance(
      "2026-10",
      [
        shift("late", "2026-10-01", "13:00", "22:00", 30, "LATE"),
        shift("early", "2026-10-02", "08:00", "16:00", 30, "EARLY"),
        shift("next-early", "2026-10-03", "02:00", "10:00", 30, "EARLY"),
        shift("after-break", "2026-10-05", "08:00", "16:00", 30, "DAY"),
      ],
      "Europe/Berlin",
      { referenceDate: "2026-10-31" },
    );

    expect(result.issues.filter((item) => item.rule === "ARBZG_5_REST_11H")).toHaveLength(1);
  });

  it("distinguishes an open compensation window from an expired one", () => {
    const shifts = [
      shift("late", "2026-10-01", "13:00", "22:00", 30, "LATE"),
      shift("early", "2026-10-02", "08:30", "16:30", 30, "EARLY"),
    ];
    const open = calculateMonthlyCompliance("2026-10", shifts, "Europe/Berlin", {
      referenceDate: "2026-10-10",
    }).issues.find((item) => item.rule === "ARBZG_5_REST_11H");
    const expired = calculateMonthlyCompliance("2026-10", shifts, "Europe/Berlin", {
      referenceDate: "2026-11-01",
    }).issues.find((item) => item.rule === "ARBZG_5_REST_11H");

    expect(open).toMatchObject({
      severity: "warning",
      title: "Ausgleich für verkürzte Ruhezeit offen",
    });
    expect(expired).toMatchObject({
      severity: "critical",
      title: "Ausgleich für verkürzte Ruhezeit fehlt",
    });
  });

  it("recognizes compensation entered in the following month", () => {
    const result = calculateMonthlyCompliance(
      "2026-07",
      [
        shift("late", "2026-07-30", "13:00", "22:00", 30, "LATE"),
        shift("early", "2026-07-31", "08:30", "16:30", 30, "EARLY"),
        shift("august", "2026-08-02", "08:30", "16:30", 30, "DAY"),
      ],
      "Europe/Berlin",
      { referenceDate: "2026-08-31" },
    );

    expect(result.issues.some((item) => item.rule === "ARBZG_5_REST_11H")).toBe(false);
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
