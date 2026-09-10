import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";

import type { ShiftEntry } from "@/domain/types";
import { calculateMonthlyCompliance } from "@/engine/compliance";
import { BUNDLED_LEGAL_RULES } from "@/rules/bundled-rules";
import type { RuleLegalPackage } from "@/rules/contracts.generated";
import { createRuleResolver } from "@/rules/rule-resolver";

function shift(id: string, date: string, startTime = "08:00", endTime = "16:00"): ShiftEntry {
  return {
    kind: "SHIFT",
    id,
    date,
    templateId: null,
    title: "Dienst",
    type: "DAY",
    startTime,
    endTime,
    breakMinutes: 30,
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

function free(id: string, date: string): ShiftEntry {
  return {
    ...shift(id, date),
    title: "Frei",
    type: "FREE",
    allDay: true,
    startTime: null,
    endTime: null,
    breakMinutes: 0,
  };
}

function absence(id: string, date: string): ShiftEntry {
  return {
    ...free(id, date),
    title: "Urlaub",
    type: "VACATION",
  };
}

function blockUnenteredWeekdays(
  startValue: string,
  endValue: string,
  excludedDates: readonly string[] = [],
): ShiftEntry[] {
  const excluded = new Set(excludedDates);
  const entries: ShiftEntry[] = [];
  for (
    let date = Temporal.PlainDate.from(startValue);
    Temporal.PlainDate.compare(date, endValue) <= 0;
    date = date.add({ days: 1 })
  ) {
    const value = date.toString();
    if (date.dayOfWeek !== 7 && !excluded.has(value)) {
      entries.push(absence(`absence-${value}`, value));
    }
  }
  return entries;
}

function rulesForContract(version: 4 | 5) {
  const legal = JSON.parse(JSON.stringify(BUNDLED_LEGAL_RULES[0])) as RuleLegalPackage;
  if (version === 4) {
    Object.assign(legal, { engineContractVersion: 4 });
    delete legal.rules.sundayHolidayRest;
  }
  return createRuleResolver({ tariff: [], legal: [legal], holiday: [] });
}

describe("ArbZG Sunday and public-holiday rest", () => {
  it("fails closed when section 10 eligibility is denied or still unknown", () => {
    const denied = calculateMonthlyCompliance(
      "2026-07",
      [shift("denied", "2026-07-05")],
      "Europe/Berlin",
      {
        federalState: "NW",
        referenceDate: "2026-07-31",
        sundayHolidayWorkEligible: false,
      },
    );
    const unknown = calculateMonthlyCompliance(
      "2026-07",
      [shift("unknown", "2026-07-05")],
      "Europe/Berlin",
      {
        federalState: "NW",
        referenceDate: "2026-07-31",
        sundayHolidayWorkEligible: null,
      },
    );

    expect(denied.issues).toContainEqual(
      expect.objectContaining({ rule: "ARBZG_10_ELIGIBILITY", severity: "critical" }),
    );
    expect(unknown.issues).toContainEqual(
      expect.objectContaining({ rule: "ARBZG_10_ELIGIBILITY", severity: "warning" }),
    );
  });

  it("does not emit a section 10 evidence issue after explicit confirmation", () => {
    const result = calculateMonthlyCompliance(
      "2026-07",
      [shift("eligible", "2026-07-05")],
      "Europe/Berlin",
      {
        federalState: "NW",
        referenceDate: "2026-07-31",
        sundayHolidayWorkEligible: true,
      },
    );

    expect(result.issues.some((item) => item.rule === "ARBZG_10_ELIGIBILITY")).toBe(false);
  });

  it("accepts a dedicated FREE day with a connected 35-hour rest block", () => {
    const result = calculateMonthlyCompliance(
      "2026-07",
      [
        ...blockUnenteredWeekdays("2026-06-22", "2026-07-18", ["2026-07-05", "2026-07-06"]),
        shift("sunday", "2026-07-05"),
        free("replacement", "2026-07-06"),
        shift("next", "2026-07-07", "06:00", "14:00"),
      ],
      "Europe/Berlin",
      { federalState: "NW", referenceDate: "2026-07-31" },
    );

    expect(result.issues.some((item) => item.rule === "ARBZG_11_SUNDAY_REST")).toBe(false);
  });

  it("accepts an unentered weekday as the replacement rest day", () => {
    const result = calculateMonthlyCompliance(
      "2026-07",
      [
        ...blockUnenteredWeekdays("2026-06-22", "2026-07-18", ["2026-07-05", "2026-07-06"]),
        shift("sunday", "2026-07-05"),
        shift("next", "2026-07-07", "06:00", "14:00"),
      ],
      "Europe/Berlin",
      { federalState: "NW", referenceDate: "2026-07-31" },
    );

    expect(result.issues.some((item) => item.rule === "ARBZG_11_SUNDAY_REST")).toBe(false);
    expect(result.issues.some((item) => item.rule === "ARBZG_11_REST_CONNECTION")).toBe(false);
  });

  it("separately warns when a FREE day has less than the regular 35-hour connection", () => {
    const result = calculateMonthlyCompliance(
      "2026-07",
      [
        ...blockUnenteredWeekdays("2026-06-22", "2026-07-18", ["2026-07-05", "2026-07-06"]),
        shift("sunday", "2026-07-05", "12:00", "20:00"),
        free("replacement", "2026-07-06"),
        shift("next", "2026-07-07", "06:00", "14:00"),
      ],
      "Europe/Berlin",
      { federalState: "NW", referenceDate: "2026-07-31" },
    );

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        rule: "ARBZG_11_REST_CONNECTION",
        severity: "warning",
        date: "2026-07-05",
      }),
    );
    expect(result.issues.some((item) => item.rule === "ARBZG_11_SUNDAY_REST")).toBe(false);
  });

  it("detects Sunday work from an overnight Saturday shift", () => {
    const result = calculateMonthlyCompliance(
      "2026-07",
      [
        ...blockUnenteredWeekdays("2026-06-22", "2026-07-18", ["2026-07-04"]),
        shift("overnight", "2026-07-04", "22:00", "06:00"),
      ],
      "Europe/Berlin",
      { federalState: "NW", referenceDate: "2026-07-31" },
    );

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        rule: "ARBZG_11_SUNDAY_REST",
        date: "2026-07-05",
        relatedShiftIds: ["overnight"],
      }),
    );
  });

  it("accepts a replacement rest day before the worked Sunday", () => {
    const result = calculateMonthlyCompliance(
      "2026-07",
      [
        ...blockUnenteredWeekdays("2026-06-22", "2026-07-18", ["2026-06-29", "2026-07-05"]),
        free("replacement", "2026-06-29"),
        shift("sunday", "2026-07-05"),
      ],
      "Europe/Berlin",
      { federalState: "NW", referenceDate: "2026-07-31" },
    );

    expect(result.issues.some((item) => item.rule === "ARBZG_11_SUNDAY_REST")).toBe(false);
  });

  it("warns when the loaded range cannot prove the connected rest around a matched day", () => {
    const result = calculateMonthlyCompliance(
      "2026-07",
      [
        ...blockUnenteredWeekdays("2026-06-22", "2026-07-18", ["2026-07-05", "2026-07-06"]),
        shift("sunday", "2026-07-05"),
        free("replacement", "2026-07-06"),
      ],
      "Europe/Berlin",
      {
        federalState: "NW",
        referenceDate: "2026-07-31",
        sundayHolidayWorkEligible: true,
      },
    );

    expect(result.issues.some((item) => item.rule === "ARBZG_11_SUNDAY_REST")).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ rule: "ARBZG_11_REST_CONNECTION", severity: "warning" }),
    );
  });

  it("accepts the last possible day of the inclusive Sunday matching window", () => {
    const result = calculateMonthlyCompliance(
      "2026-07",
      [
        ...blockUnenteredWeekdays("2026-06-22", "2026-07-18", ["2026-07-05", "2026-07-18"]),
        shift("sunday", "2026-07-05"),
        free("replacement", "2026-07-18"),
      ],
      "Europe/Berlin",
      { federalState: "NW", referenceDate: "2026-07-31" },
    );

    expect(result.issues.some((item) => item.rule === "ARBZG_11_SUNDAY_REST")).toBe(false);
  });

  it("requires separate replacement days for separate Sunday obligations", () => {
    const result = calculateMonthlyCompliance(
      "2026-07",
      [
        ...blockUnenteredWeekdays("2026-06-22", "2026-07-25", [
          "2026-07-05",
          "2026-07-12",
          "2026-07-13",
        ]),
        shift("sunday-1", "2026-07-05"),
        shift("sunday-2", "2026-07-12"),
        free("replacement", "2026-07-13"),
      ],
      "Europe/Berlin",
      { federalState: "NW", referenceDate: "2026-08-01" },
    );

    expect(result.issues.filter((item) => item.rule === "ARBZG_11_SUNDAY_REST")).toHaveLength(1);
  });

  it("checks work on a weekday public holiday with the eight-week period", () => {
    const result = calculateMonthlyCompliance(
      "2026-10",
      [
        ...blockUnenteredWeekdays("2026-08-09", "2026-11-27", ["2026-10-03"]),
        shift("holiday", "2026-10-03"),
      ],
      "Europe/Berlin",
      { federalState: "NW", referenceDate: "2026-12-01" },
    );

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        rule: "ARBZG_11_HOLIDAY_REST",
        severity: "critical",
        date: "2026-10-03",
      }),
    );
  });

  it("uses the inclusive 56-day holiday period without an off-by-one", () => {
    const atBoundary = calculateMonthlyCompliance(
      "2026-10",
      [
        ...blockUnenteredWeekdays("2026-08-09", "2026-11-27", ["2026-10-03", "2026-11-27"]),
        shift("holiday", "2026-10-03"),
        free("replacement", "2026-11-27"),
      ],
      "Europe/Berlin",
      { federalState: "NW", referenceDate: "2026-12-01" },
    );
    const outsideBoundary = calculateMonthlyCompliance(
      "2026-10",
      [
        ...blockUnenteredWeekdays("2026-08-09", "2026-11-27", ["2026-10-03"]),
        shift("holiday", "2026-10-03"),
        free("replacement", "2026-11-28"),
      ],
      "Europe/Berlin",
      { federalState: "NW", referenceDate: "2026-12-01" },
    );

    expect(atBoundary.issues.some((item) => item.rule === "ARBZG_11_HOLIDAY_REST")).toBe(false);
    expect(outsideBoundary.issues).toContainEqual(
      expect.objectContaining({ rule: "ARBZG_11_HOLIDAY_REST", severity: "critical" }),
    );
  });

  it("does not use a public holiday itself as a replacement day", () => {
    const result = calculateMonthlyCompliance(
      "2026-09",
      [
        ...blockUnenteredWeekdays("2026-09-14", "2026-10-10", ["2026-10-03"]),
        shift("sunday", "2026-09-27"),
        free("holiday-free", "2026-10-03"),
      ],
      "Europe/Berlin",
      { federalState: "NW", referenceDate: "2026-10-31" },
    );

    expect(result.issues).toContainEqual(
      expect.objectContaining({ rule: "ARBZG_11_SUNDAY_REST", severity: "critical" }),
    );
  });

  it("creates only the Sunday obligation when a state holiday falls on Sunday", () => {
    const result = calculateMonthlyCompliance(
      "2026-04",
      [...blockUnenteredWeekdays("2026-03-23", "2026-04-18"), shift("easter-sunday", "2026-04-05")],
      "Europe/Berlin",
      { federalState: "BB", referenceDate: "2026-04-30" },
    );

    expect(result.issues.filter((item) => item.rule === "ARBZG_11_SUNDAY_REST")).toHaveLength(1);
    expect(result.issues.some((item) => item.rule === "ARBZG_11_HOLIDAY_REST")).toBe(false);
  });

  it("flags the first Sunday that would leave fewer than 15 Sundays free", () => {
    const sundays: ShiftEntry[] = [];
    for (
      let date = Temporal.PlainDate.from("2026-01-01");
      date.year === 2026;
      date = date.add({ days: 1 })
    ) {
      if (date.dayOfWeek === 7 && sundays.length < 38) {
        sundays.push(shift(`sunday-${sundays.length + 1}`, date.toString()));
      }
    }
    const excessDate = sundays.at(-1)!.date;
    const result = calculateMonthlyCompliance(excessDate.slice(0, 7), sundays, "Europe/Berlin", {
      federalState: "NW",
      referenceDate: "2026-12-31",
    });

    expect(result.issues.filter((item) => item.rule === "ARBZG_11_FREE_SUNDAYS")).toEqual([
      expect.objectContaining({ severity: "critical", date: excessDate }),
    ]);
  });

  it("does not guess holiday-specific compliance without a federal state", () => {
    const result = calculateMonthlyCompliance(
      "2026-07",
      [...blockUnenteredWeekdays("2026-06-22", "2026-07-18"), shift("sunday", "2026-07-05")],
      "Europe/Berlin",
      { referenceDate: "2026-07-31" },
    );

    expect(result.issues.some((item) => item.rule.startsWith("ARBZG_11_"))).toBe(false);
  });

  it("keeps legal engine contract v4 behavior unchanged", () => {
    const result = calculateMonthlyCompliance(
      "2026-07",
      [shift("sunday", "2026-07-05")],
      "Europe/Berlin",
      {
        federalState: "NW",
        referenceDate: "2026-07-31",
        ruleResolver: rulesForContract(4),
      },
    );

    expect(result.issues.some((item) => item.rule.startsWith("ARBZG_11_"))).toBe(false);
  });

  it("preserves 23/25-hour Sunday boundaries when sharing date preparation", () => {
    for (const [saturday, sunday, monday, shortRest] of [
      ["2026-03-28", "2026-03-29", "2026-03-30", true],
      ["2026-10-24", "2026-10-25", "2026-10-26", false],
    ] as const) {
      const entries = [
        shift("before", saturday, "08:00", "19:00"),
        shift("after", monday, "06:00", "14:00"),
      ];
      // 35 wall-clock hours: 34 at the spring transition, 36 in autumn, 35 in UTC.
      for (const timeZone of ["Europe/Berlin", "UTC", "Europe/Berlin"]) {
        const options = { federalState: "NW" as const, referenceDate: "2026-12-31" };
        const result = calculateMonthlyCompliance(sunday.slice(0, 7), entries, timeZone, options);
        const hasConnectionIssue = result.issues.some(
          (item) => item.date === sunday && item.rule === "ARBZG_11_REST_CONNECTION",
        );
        expect(hasConnectionIssue).toBe(timeZone === "Europe/Berlin" && shortRest);
        expect(calculateMonthlyCompliance(sunday.slice(0, 7), entries, timeZone, options)).toEqual(
          result,
        );
      }
    }
  });

  it("keeps Sunday checks active and reports missing holiday coverage", () => {
    const result = calculateMonthlyCompliance(
      "2026-07",
      [...blockUnenteredWeekdays("2026-06-22", "2026-07-18"), shift("sunday", "2026-07-05")],
      "Europe/Berlin",
      {
        federalState: "NW",
        referenceDate: "2026-07-31",
        ruleResolver: rulesForContract(5),
      },
    );

    expect(result.issues.some((item) => item.rule === "ARBZG_11_SUNDAY_REST")).toBe(true);
    expect(result.issues.some((item) => item.rule === "HOLIDAY_CATALOG_COVERAGE")).toBe(true);
  });
});
