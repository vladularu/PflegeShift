import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";

import type { ShiftEntry } from "@/domain/types";
import { calculateMonthlyCompliance } from "@/engine/compliance";
import {
  BUNDLED_HOLIDAY_RULES,
  BUNDLED_LEGAL_RULES,
  BUNDLED_TARIFF_RULES,
} from "@/rules/bundled-rules";
import type { RuleLegalPackage } from "@/rules/contracts.generated";
import { createRuleResolver } from "@/rules/rule-resolver";

function timedShift(id: string, date: string, type: ShiftEntry["type"] = "DAY"): ShiftEntry {
  return {
    kind: "SHIFT",
    id,
    date,
    templateId: null,
    title: type,
    type,
    startTime: "08:00",
    endTime: "18:45",
    breakMinutes: 45,
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

function absence(id: string, date: string, type: "VACATION" | "SICK" | "FREE"): ShiftEntry {
  return {
    ...timedShift(id, date, type),
    startTime: null,
    endTime: null,
    breakMinutes: 0,
  };
}

function nightShift(id: string, date: string): ShiftEntry {
  return {
    ...timedShift(id, date, "NIGHT"),
    startTime: "21:00",
    endTime: "08:00",
    breakMinutes: 60,
  };
}

function datesBetween(start: string, end: string): string[] {
  const result: string[] = [];
  for (
    let date = Temporal.PlainDate.from(start);
    Temporal.PlainDate.compare(date, end) <= 0;
    date = date.add({ days: 1 })
  ) {
    result.push(date.toString());
  }
  return result;
}

function statutoryDates(start: string, end: string): string[] {
  return datesBetween(start, end).filter((value) => Temporal.PlainDate.from(value).dayOfWeek <= 6);
}

function v3Resolver() {
  const legal = structuredClone(BUNDLED_LEGAL_RULES[0]) as RuleLegalPackage;
  Object.assign(legal, { engineContractVersion: 3 });
  delete legal.rules.workingTime.standardAverage;
  return createRuleResolver({
    tariff: BUNDLED_TARIFF_RULES,
    legal: [legal],
    holiday: BUNDLED_HOLIDAY_RULES,
  });
}

describe("ArbZG section 3 standard working-time average", () => {
  it("accepts an isolated extended day when the long window balances it", () => {
    const result = calculateMonthlyCompliance(
      "2026-07",
      [timedShift("extended", "2026-07-01")],
      "Europe/Berlin",
      { referenceDate: "2027-02-01" },
    );

    expect(result.issues.some((item) => item.rule === "ARBZG_3_OVER_8H")).toBe(false);
  });

  it("reports a persistently excessive average as open and then overdue", () => {
    const shifts = statutoryDates("2026-07-01", "2026-12-31").map((date, index) =>
      timedShift(`dense-${index}`, date),
    );
    const open = calculateMonthlyCompliance("2026-07", shifts, "Europe/Berlin", {
      referenceDate: "2026-12-01",
    }).issues.find((item) => item.rule === "ARBZG_3_OVER_8H");
    const overdue = calculateMonthlyCompliance("2026-07", shifts, "Europe/Berlin", {
      referenceDate: "2027-01-01",
    }).issues.find((item) => item.rule === "ARBZG_3_OVER_8H");

    expect(open).toMatchObject({
      severity: "warning",
      title: "Ausgleich der Tagesarbeitszeit offen",
      date: "2026-07-01",
    });
    expect(overdue).toMatchObject({
      severity: "critical",
      title: "Ausgleich der Tagesarbeitszeit fehlt",
      date: "2026-07-01",
    });
  });

  it("accepts the 24-week alternative when the six-month average alone is excessive", () => {
    const firstWindow = statutoryDates("2026-07-01", "2026-12-15")
      .slice(0, 115)
      .map((date, index) => timedShift(`first-window-${index}`, date));
    const lateWindow = statutoryDates("2026-12-16", "2026-12-31").map((date, index) =>
      timedShift(`late-window-${index}`, date),
    );

    const result = calculateMonthlyCompliance(
      "2026-07",
      [...firstWindow, ...lateWindow],
      "Europe/Berlin",
      { referenceDate: "2027-02-01" },
    );

    expect(result.issues.some((item) => item.rule === "ARBZG_3_OVER_8H")).toBe(false);
  });

  it("keeps vacation and sickness neutral instead of using them as compensation", () => {
    const dates = statutoryDates("2026-07-01", "2026-12-31");
    const worked = dates.slice(0, 100).map((date, index) => timedShift(`worked-${index}`, date));
    const neutralAbsences = dates
      .slice(100)
      .map((date, index) =>
        absence(`absence-${index}`, date, index % 2 === 0 ? "VACATION" : "SICK"),
      );
    const freeDays = dates.slice(100).map((date, index) => absence(`free-${index}`, date, "FREE"));

    const neutralResult = calculateMonthlyCompliance(
      "2026-07",
      [...worked, ...neutralAbsences],
      "Europe/Berlin",
      { referenceDate: "2027-02-01" },
    );
    const freeResult = calculateMonthlyCompliance(
      "2026-07",
      [...worked, ...freeDays],
      "Europe/Berlin",
      { referenceDate: "2027-02-01" },
    );

    expect(neutralResult.issues.some((item) => item.rule === "ARBZG_3_OVER_8H")).toBe(true);
    expect(freeResult.issues.some((item) => item.rule === "ARBZG_3_OVER_8H")).toBe(false);
  });

  it("preserves the immediate over-eight-hour warning for legal contract v3", () => {
    const result = calculateMonthlyCompliance(
      "2026-07",
      [timedShift("extended-v3", "2026-07-01")],
      "Europe/Berlin",
      { referenceDate: "2026-07-01", ruleResolver: v3Resolver() },
    );

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        rule: "ARBZG_3_OVER_8H",
        severity: "warning",
        title: "Tagesarbeitszeit über 8 Stunden",
      }),
    );
  });

  it("leaves qualified night-worker averages exclusively to section 6", () => {
    const shifts = statutoryDates("2026-07-01", "2026-12-31").map((date, index) =>
      nightShift(`night-${index}`, date),
    );

    const result = calculateMonthlyCompliance("2026-07", shifts, "Europe/Berlin", {
      referenceDate: "2027-02-01",
      regularRotatingNightWork: true,
    });

    expect(result.issues.some((item) => item.rule === "ARBZG_3_OVER_8H")).toBe(false);
    expect(result.issues.some((item) => item.rule === "ARBZG_6_NIGHT_AVERAGE")).toBe(true);
  });
});
