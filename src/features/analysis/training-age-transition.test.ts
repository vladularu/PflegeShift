import { describe, expect, it } from "vitest";
import type { ComplianceIssue, MonthlyComplianceResult } from "@/domain/types";
import { calculateMonthlyCompliance } from "@/engine/compliance";
import { service, youthFacts, youthInput, youthProfile } from "@/engine/youth-test-fixtures";
import { trainingCompliance } from "./training-compliance";
import { isAdultServiceFinding } from "./training-adult-findings";

const { effectiveFrom: _date, ...youth } = youthFacts;
const saved = {
  ...youthProfile,
  data: { ...youthProfile.data, version: 2 as const, birthDate: "2008-09-15", youth },
};
function run(dates: readonly string[], birthday: string | null = "2008-09-15") {
  const base = youthInput();
  const services = dates.map((date) => service(date, "07:00", "20:00"));
  const shifts = services.map((s) => s.entry);
  const adult = calculateMonthlyCompliance("2026-09", shifts, base.profile.timeZone, {
    ruleResolver: base.ruleResolver,
    federalState: base.profile.federalState,
    weeklyMinutes: base.profile.weeklyMinutes,
    allEmploymentWorkRecorded: true,
    referenceDate: "2026-09-30",
  });
  const input = {
    ...base,
    shifts,
    adult,
    training: {
      profiles: [{ ...saved, data: { ...saved.data, birthDate: birthday } }],
      shifts: services.map((s) => s.details),
    },
  };
  return { input, result: trainingCompliance(input)! };
}

describe("adult service findings at the age boundary", () => {
  it("shows actual adult maximum-hour findings from the birthday, not before it", () => {
    const { result } = run(["2026-09-14", "2026-09-15", "2026-09-16"]);
    expect(result.issues.filter((i) => i.rule === "ARBZG_3_MAX_10H").map((i) => i.date)).toEqual([
      "2026-09-15",
      "2026-09-16",
    ]);
    expect(result.issues.some((i) => i.date === "2026-09-14" && i.rule.includes("JArbSchG"))).toBe(
      true,
    );
    expect(result.trainingComplete).toBe(false); // Compensation periods are not cleared by this fix.
    expect(result.criticalCount).toBe(
      result.issues.filter((i) => i.severity === "critical").length,
    );
  });
  it("does not treat unknown birth data as an adult confirmation", () => {
    expect(run(["2026-09-16"], null).result.issues.some((i) => i.rule === "ARBZG_3_MAX_10H")).toBe(
      false,
    );
  });
  it("recomputes age after a same-revision correction instead of retaining adult warnings", () => {
    const { input, result } = run(["2026-09-16"]);
    expect(result.issues.some((i) => i.rule === "ARBZG_3_MAX_10H")).toBe(true);
    const corrected = trainingCompliance({
      ...input,
      training: {
        ...input.training,
        profiles: [{ ...saved, data: { ...saved.data, birthDate: "2009-09-15" } }],
      },
    })!;
    expect(corrected.issues.some((i) => i.rule === "ARBZG_3_MAX_10H")).toBe(false);
  });
  it("retains known youth findings but reports missing adult results", () => {
    const { input } = run(["2026-09-14", "2026-09-16"]);
    const result = trainingCompliance({ ...input, adult: null })!;
    expect(result.trainingComplete).toBe(false);
    expect(result.issues.some((i) => i.description.includes("noch nicht vor"))).toBe(true);
    expect(result.issues.some((i) => i.date === "2026-09-14" && i.severity === "warning")).toBe(
      true,
    );
  });
  it("does not restore a period-wide finding just because it is displayed after the birthday", () => {
    const { input } = run(["2026-09-16"]);
    const base = input.adult.issues.find((i) => i.rule === "ARBZG_3_MAX_10H")!;
    const unsupported: ComplianceIssue = { ...base, id: "average", rule: "ARBZG_3_AVERAGE" };
    const adult: MonthlyComplianceResult = {
      ...input.adult,
      issues: [...input.adult.issues, unsupported],
    };
    expect(trainingCompliance({ ...input, adult })!.issues.some((i) => i.id === "average")).toBe(
      false,
    );
  });
  it("keeps the leap-day birthday juvenile through 28 February in a non-leap year", () => {
    const base = youthInput({ month: "2026-02" });
    const s = service("2026-02-28", "07:00", "20:00");
    const adult = calculateMonthlyCompliance("2026-02", [s.entry], base.profile.timeZone, {
      ruleResolver: base.ruleResolver,
    });
    const result = trainingCompliance({
      ...base,
      adult,
      shifts: [s.entry],
      training: {
        profiles: [{ ...saved, data: { ...saved.data, birthDate: "2008-02-29" } }],
        shifts: [s.details],
      },
    })!;
    expect(result.issues.some((i) => i.rule === "ARBZG_3_MAX_10H")).toBe(false);
  });
  it("does not apply adult rules to a service crossing into the birthday from the juvenile day", () => {
    const record = service("2026-09-14", "21:00", "09:00", []);
    const finding: ComplianceIssue = {
      id: "crossing",
      date: "2026-09-15",
      kind: "LEGAL",
      severity: "critical",
      rule: "ARBZG_3_MAX_10H",
      title: "",
      description: "",
      relatedShiftIds: [record.entry.id],
    };
    expect(isAdultServiceFinding(finding, [record.entry], (date) => date >= "2026-09-15")).toBe(
      false,
    );
    expect(
      isAdultServiceFinding({ ...finding, relatedShiftIds: ["missing"] }, [], () => true),
    ).toBe(false);
    expect(
      isAdultServiceFinding({ ...finding, relatedShiftIds: [] }, [record.entry], () => true),
    ).toBe(false);
  });
  it("does not treat an overnight service's end day as irrelevant when age is unknown there", () => {
    const record = service("2026-09-15", "23:00", "08:00", []);
    const finding: ComplianceIssue = {
      id: "overnight",
      date: "2026-09-15",
      kind: "LEGAL",
      severity: "critical",
      rule: "ARBZG_3_MAX_10H",
      title: "",
      description: "",
      relatedShiftIds: [record.entry.id],
    };
    expect(isAdultServiceFinding(finding, [record.entry], (date) => date === "2026-09-15")).toBe(
      false,
    );
    expect(isAdultServiceFinding(finding, [record.entry], () => true)).toBe(true);
    expect(
      isAdultServiceFinding(
        finding,
        [{ ...record.entry, endTime: "00:00" }],
        (date) => date === "2026-09-15",
      ),
    ).toBe(true);
  });
});
