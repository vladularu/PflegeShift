import { describe, expect, it } from "vitest";

import type { TestScenario } from "@/domain/types";
import { generateTestPlan } from "@/engine/test-data-generator";

describe("test data generator", () => {
  const scenarios: readonly TestScenario[] = [
    "NORMAL_ROTATION",
    "PREMIUM_MONTH",
    "COMPLIANCE_CASES",
    "UI_STRESS",
  ];

  it.each(scenarios)("generates %s deterministically", (scenario) => {
    const request = { startMonth: "2028-02", range: 3 as const, scenario };
    expect(generateTestPlan(request, "NW")).toEqual(generateTestPlan(request, "NW"));
  });

  it("covers leap years and year boundaries", () => {
    const plan = generateTestPlan(
      { startMonth: "2027-12", range: 3, scenario: "NORMAL_ROTATION" },
      "NW",
    );
    expect(plan.months).toEqual(["2027-12", "2028-01", "2028-02"]);
    expect(plan.shifts.some((item) => item.date === "2028-02-29")).toBe(true);
  });

  it("creates about 1,800 UI stress records over twelve months", () => {
    const plan = generateTestPlan(
      { startMonth: "2026-01", range: 12, scenario: "UI_STRESS" },
      "NW",
    );
    const count = plan.shifts.length + plan.appointments.length;
    expect(count).toBeGreaterThanOrEqual(1_800);
    expect(count).toBeLessThan(1_850);
  });

  it("uses actual holidays and reports months without holiday or preholiday", () => {
    const may = generateTestPlan(
      { startMonth: "2026-05", range: 1, scenario: "PREMIUM_MONTH" },
      "NW",
    );
    expect(may.shifts.some((item) => item.holidayPremiumMode === "WITHOUT_TIME_OFF")).toBe(true);

    const august = generateTestPlan(
      { startMonth: "2026-08", range: 1, scenario: "PREMIUM_MONTH" },
      "NW",
    );
    expect(august.warnings).toHaveLength(1);
  });

  it("leaves tariff decisions empty so test runs exercise automatic detection", () => {
    const normal = generateTestPlan(
      { startMonth: "2026-07", range: 1, scenario: "NORMAL_ROTATION" },
      "NW",
    );
    const premiums = generateTestPlan(
      { startMonth: "2026-07", range: 1, scenario: "PREMIUM_MONTH" },
      "NW",
    );

    expect(normal.decisions).toEqual([]);
    expect(premiums.decisions).toEqual([]);
  });

  it("contains the intended compliance patterns", () => {
    const plan = generateTestPlan(
      { startMonth: "2026-03", range: 1, scenario: "COMPLIANCE_CASES" },
      "NW",
    );
    expect(plan.shifts.some((item) => item.title === "Über 10 Stunden")).toBe(true);
    expect(plan.shifts.filter((item) => item.title.startsWith("Nachtserie"))).toHaveLength(5);
    expect(plan.shifts.filter((item) => item.date === "2026-03-05")).toHaveLength(2);
  });
});
