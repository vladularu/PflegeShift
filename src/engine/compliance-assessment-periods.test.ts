import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";
import { calculateMonthlyCompliance } from "./compliance";
import { shift, work, resolver } from "./remuneration-test-fixtures";

const base = { profile: work, ruleResolver: resolver() };
function days(from: string, through: string, night = false) {
  const result = [];
  for (
    let date = Temporal.PlainDate.from(from);
    date.toString() <= through;
    date = date.add({ days: 1 })
  ) {
    result.push(
      shift({
        id: date.toString() + (night ? "20:00" : "07:00"),
        date: date.toString(),
        type: "EARLY",
        startTime: night ? "20:00" : "07:00",
        endTime: night ? "06:00" : "17:00",
        breakMinutes: 0,
      }),
    );
  }
  return result;
}
function calculate(month: string, shifts = days("2026-09-01", "2026-09-30"), regularNight = false) {
  return calculateMonthlyCompliance(month, shifts, base.profile.timeZone, {
    ruleResolver: base.ruleResolver,
    federalState: base.profile.federalState,
    allEmploymentWorkRecorded: true,
    sundayHolidayWorkEligible: true,
    regularRotatingNightWork: regularNight,
    referenceDate: "2027-07-01",
  });
}
describe("adult compliance evidence horizons", () => {
  it("retains a full calculation horizon even if there are no findings", () => {
    const result = calculate("2026-09", []);
    expect(result.assessmentRange!.from <= "2026-01-01").toBe(true);
    expect(result.assessmentRange!.through >= "2027-03-31").toBe(true);
    expect(result.issues).toEqual([]);
  });
  it("records both standard-average alternatives through the latest deadline, including overnight end day", () => {
    const result = calculate("2026-09", days("2026-09-16", "2027-03-31"));
    const finding = result.issues.find((i) => i.rule === "ARBZG_3_OVER_8H")!;
    expect(finding).toBeDefined();
    expect(finding.assessmentRanges).toEqual([{ from: "2026-09-16", through: "2027-03-16" }]);
  });
  it("keeps the annual qualification dependency of an inferred night worker", () => {
    const result = calculate("2026-09", days("2026-07-01", "2026-10-30", true));
    const finding = result.issues.find((i) => i.rule === "ARBZG_6_NIGHT_AVERAGE")!;
    expect(finding).toBeDefined();
    expect(finding.assessmentRanges).toContainEqual({ from: "2026-01-01", through: "2027-01-01" });
  });
  it("does not invent annual night-day counting when regular rotating night work is confirmed", () => {
    const result = calculate("2026-09", days("2026-09-01", "2026-10-30", true), true);
    const finding = result.issues.find((i) => i.rule === "ARBZG_6_NIGHT_AVERAGE")!;
    expect(finding).toBeDefined();
    expect(finding.assessmentRanges).toEqual([{ from: "2026-09-01", through: "2026-10-01" }]);
  });
  it("tags the free-Sunday quota with the year rather than the displayed month", () => {
    const sundays = days("2026-01-01", "2026-12-31").filter(
      (s) => Temporal.PlainDate.from(s.date).dayOfWeek === 7,
    );
    const result = calculate("2026-12", sundays);
    const findings = result.issues.filter((i) => i.rule === "ARBZG_11_FREE_SUNDAYS");
    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings)
      expect(finding.assessmentRanges).toEqual([{ from: "2026-01-01", through: "2027-01-01" }]);
  });
  it("retains the full shared-allocation horizon for missing replacement days", () => {
    const result = calculate("2026-09", days("2026-01-01", "2027-03-31"));
    const finding = result.issues.find((i) => i.rule === "ARBZG_11_SUNDAY_REST")!;
    expect(finding).toBeDefined();
    expect(finding.assessmentRanges).toEqual([result.assessmentRange]);
  });
});
