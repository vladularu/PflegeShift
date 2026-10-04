import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";
import type { ComplianceIssue } from "@/domain/types";
import { calculateMonthlyCompliance } from "@/engine/compliance";
import { service, youthFacts, youthInput, youthProfile } from "@/engine/youth-test-fixtures";
import { trainingCompliance } from "./training-compliance";
import { isAdultAssessmentFinding, isAdultAssessmentRange } from "./training-adult-findings";

const { effectiveFrom: _date, ...youth } = youthFacts;
const base = youthInput();
const profile = {
  ...youthProfile,
  data: { ...youthProfile.data, version: 2 as const, birthDate: "2008-09-15", youth },
};
const sundayServices = Array.from({ length: 365 }, (_, i) =>
  Temporal.PlainDate.from("2026-01-01").add({ days: i }),
)
  .filter((d) => d.dayOfWeek === 7)
  .map((d) => service(d.toString(), "07:00", "17:00", []));
function input(birthDate: string | null = profile.data.birthDate) {
  const services = [...sundayServices, service("2026-12-01", "07:00", "20:00", [])];
  const shifts = services.map((s) => s.entry);
  const adult = calculateMonthlyCompliance("2026-12", shifts, base.profile.timeZone, {
    ruleResolver: base.ruleResolver,
    federalState: base.profile.federalState,
    allEmploymentWorkRecorded: true,
    sundayHolidayWorkEligible: true,
    referenceDate: "2026-12-31",
  });
  return {
    ...base,
    month: "2026-12",
    adult,
    shifts,
    training: {
      profiles: [{ ...profile, data: { ...profile.data, birthDate } }],
      shifts: services.map((s) => s.details),
    },
  };
}
describe("adult period findings across the eighteenth birthday", () => {
  it("does not default back to adult law before the first explicitly dated age profile", () => {
    const args = input();
    const future = { ...profile, data: { ...profile.data, effectiveFrom: "2027-01-01" } };
    const result = trainingCompliance({ ...args, training: { profiles: [future], shifts: [] } })!;
    expect(result.trainingComplete).toBe(false);
    expect(result.issues.some((i) => i.rule === "ARBZG_11_FREE_SUNDAYS")).toBe(false);
    expect(result.issues.some((i) => i.title.includes("unvollständig"))).toBe(true);
  });
  it("does not restore a full adult annual quota in a later, wholly adult month", () => {
    const args = input();
    expect(args.adult.issues.some((i) => i.rule === "ARBZG_11_FREE_SUNDAYS")).toBe(true);
    const result = trainingCompliance(args)!;
    expect(result.issues.some((i) => i.rule === "ARBZG_11_FREE_SUNDAYS")).toBe(false);
    expect(result.issues.some((i) => i.rule === "ARBZG_3_MAX_10H")).toBe(true);
    expect(result.trainingComplete).toBe(false);
    expect(result.issues.some((i) => i.description.includes("2026-01-01"))).toBe(true);
  });
  it("leaves the established adult employee result unchanged if its entire horizon is adult", () => {
    const args = input("1990-01-01");
    expect(trainingCompliance(args)).toBe(args.adult);
  });
  it("re-evaluates the same revisions after an age correction", () => {
    const before = trainingCompliance(input())!;
    const after = trainingCompliance(input("1990-01-01"))!;
    expect(before.issues.some((i) => i.rule === "ARBZG_11_FREE_SUNDAYS")).toBe(false);
    expect(after.issues.some((i) => i.rule === "ARBZG_11_FREE_SUNDAYS")).toBe(true);
  });
  it("keeps an adult-only standard-average finding inside a mixed-age month", () => {
    const shifts = Array.from(
      { length: 182 },
      (_, i) =>
        service(
          Temporal.PlainDate.from("2026-09-16").add({ days: i }).toString(),
          "07:00",
          "17:00",
          [],
        ).entry,
    );
    const adult = calculateMonthlyCompliance("2026-09", shifts, base.profile.timeZone, {
      ruleResolver: base.ruleResolver,
      federalState: base.profile.federalState,
      allEmploymentWorkRecorded: true,
      referenceDate: "2027-04-01",
    });
    expect(adult.issues.some((i) => i.rule === "ARBZG_3_OVER_8H")).toBe(true);
    const result = trainingCompliance({
      ...base,
      adult,
      shifts,
      training: { profiles: [profile], shifts: [] },
    })!;
    expect(result.issues.some((i) => i.rule === "ARBZG_3_OVER_8H")).toBe(true);
    expect(result.trainingComplete).toBe(false);
  });
  it("does not use a zero-finding adult report as clearance for mixed prior periods", () => {
    const args = input();
    const result = trainingCompliance({ ...args, adult: { ...args.adult, issues: [] } })!;
    expect(result.trainingComplete).toBe(false);
    expect(result.issues.some((i) => i.id.includes("ADULT_TRANSITION"))).toBe(true);
  });
  it("rejects unknown and malformed interior or boundary days, not only the endpoints", () => {
    const range = { from: "2026-09-15", through: "2026-10-15" };
    expect(isAdultAssessmentRange(range, () => true)).toBe(true);
    for (const unknown of [range.from, "2026-09-30", range.through])
      expect(isAdultAssessmentRange(range, (d) => d !== unknown)).toBe(false);
    expect(isAdultAssessmentRange({ from: range.through, through: range.from }, () => true)).toBe(
      false,
    );
    expect(isAdultAssessmentRange({ from: "bad-date", through: range.through }, () => true)).toBe(
      false,
    );
  });
  it("requires every distinct dependency and the referenced service, not just a displayed adult date", () => {
    const s = service("2026-09-16").entry;
    const finding: ComplianceIssue = {
      id: "night",
      rule: "ARBZG_6_NIGHT_AVERAGE",
      kind: "LEGAL",
      severity: "warning",
      title: "",
      description: "",
      date: s.date,
      relatedShiftIds: [s.id],
      assessmentRanges: [
        { from: "2026-09-16", through: "2026-10-15" },
        { from: "2026-01-01", through: "2026-12-31" },
      ],
    };
    expect(isAdultAssessmentFinding(finding, [s], (d) => d >= "2026-09-15")).toBe(false);
    expect(isAdultAssessmentFinding(finding, [s], () => true)).toBe(true);
    expect(isAdultAssessmentFinding(finding, [], () => true)).toBe(false);
    expect(isAdultAssessmentFinding({ ...finding, assessmentRanges: [] }, [s], () => true)).toBe(
      false,
    );
    expect(
      isAdultAssessmentFinding({ ...finding, assessmentRanges: undefined }, [s], () => true),
    ).toBe(false);
  });
  it("does not silently cross a revoked birth-date confirmation after the displayed month", () => {
    const args = input("1990-01-01");
    const revoked = {
      ...profile,
      data: { ...profile.data, effectiveFrom: "2027-01-01", birthDate: null },
    };
    const result = trainingCompliance({
      ...args,
      training: { ...args.training, profiles: [...args.training.profiles, revoked] },
    })!;
    expect(result.trainingComplete).toBe(false);
    expect(result.issues.some((i) => i.rule === "ARBZG_11_FREE_SUNDAYS")).toBe(false);
    expect(result.issues.some((i) => i.rule === "ARBZG_3_MAX_10H")).toBe(true);
  });
});
