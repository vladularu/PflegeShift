import { describe, expect, it } from "vitest";
import type { MonthlyComplianceResult } from "@/domain/types";
import { youthFacts, youthInput, youthProfile, service } from "@/engine/youth-test-fixtures";
import { UNKNOWN_YOUTH_CONTEXT } from "@/domain/youth-context";
import { trainingCompliance } from "./training-compliance";
const adult: MonthlyComplianceResult = {
  month: "2026-09",
  assessmentRange: { from: "2026-09-01", through: "2026-09-30" },
  criticalCount: 1,
  warningCount: 0,
  infoCount: 1,
  affectedDates: ["2026-09-15"],
  issues: [
    {
      id: "adult",
      date: "2026-09-15",
      kind: "LEGAL",
      severity: "critical",
      rule: "ArbZG",
      title: "Adult finding",
      description: "adult-only rule",
      relatedShiftIds: [],
    },
    {
      id: "planning",
      date: "2026-09-15",
      kind: "PLANNING",
      severity: "info",
      rule: "plan",
      title: "Planning",
      description: "optional",
      relatedShiftIds: [],
    },
  ],
};
const { effectiveFrom: _date, ...context } = youthFacts;
const saved = {
  ...youthProfile,
  data: { ...youthProfile.data, version: 2 as const, youth: context },
};
const input = () => ({ ...youthInput(), adult, training: { profiles: [saved], shifts: [] } });

describe("age-scoped monthly analysis", () => {
  it("preserves adult ArbZG findings while adding adult training release checks", () => {
    const data = {
      ...saved.data,
      birthDate: "2000-01-01",
      status: "training" as const,
      training: {
        profession: "Ausbildung",
        legalBasis: "BBIG" as const,
        startedOn: "2026-01-01",
        expectedEndOn: null,
        year: 1,
        yearConfirmedFrom: "2026-01-01",
        shorteningMonths: null,
      },
    };
    const result = trainingCompliance({
      ...input(),
      training: { profiles: [{ ...saved, data }], shifts: [] },
    });
    expect(result?.issues.some((i) => i.id === "adult")).toBe(true);
    expect(result?.issues.some((i) => i.id.includes("ADULT_TRANSITION"))).toBe(false);
  });
  it("leaves the established flow unchanged when no optional age profile exists", () => {
    expect(trainingCompliance({ ...input(), training: { profiles: [], shifts: [] } })).toBe(adult);
  });
  it("preserves adult-only results for known adult employees", () => {
    const profile = { ...saved, data: { ...saved.data, birthDate: "1990-01-01" } };
    expect(trainingCompliance({ ...input(), training: { profiles: [profile], shifts: [] } })).toBe(
      adult,
    );
  });
  it("replaces adult legal conclusions while retaining optional planning findings", () => {
    const s = service("2026-09-15", "08:00", "17:30");
    const result = trainingCompliance({
      ...input(),
      shifts: [s.entry],
      training: { profiles: [saved], shifts: [s.details] },
    })!;
    expect(result.issues.some((i) => i.id === "adult")).toBe(false);
    expect(result.issues.some((i) => i.id === "planning")).toBe(true);
    expect(result.issues.some((i) => i.rule.includes("JArbSchG") && i.severity === "warning")).toBe(
      true,
    );
    expect(result.issues.some((i) => i.description.includes("2026-01-youth-r1"))).toBe(true);
  });
  it("can assess youth without waiting for the irrelevant adult computation", () => {
    const s = service();
    const result = trainingCompliance({
      ...input(),
      adult: null,
      shifts: [s.entry],
      training: { profiles: [saved], shifts: [s.details] },
    });
    expect(result?.issues).toEqual([]);
  });
  it("does not inherit revoked confirmations from an older profile", () => {
    const later = { ...saved, data: { ...saved.data, effectiveFrom: "2026-09-15", youth: null } };
    const result = trainingCompliance({
      ...input(),
      training: { profiles: [saved, later], shifts: [] },
    });
    expect(result?.issues).toContainEqual(
      expect.objectContaining({
        date: "2026-09-15",
        title: "Jugend-/Ausbildungsprüfung unvollständig",
        kind: "LEGAL",
      }),
    );
  });
  it("does not display unknown birth data as a successful adult check", () => {
    const unknown = {
      ...saved,
      data: { ...saved.data, birthDate: null, youth: UNKNOWN_YOUTH_CONTEXT },
    };
    const result = trainingCompliance({
      ...input(),
      training: { profiles: [unknown], shifts: [] },
    });
    expect(result?.issues.some((i) => i.id === "adult")).toBe(false);
    expect(result?.issues.some((i) => i.title.includes("unvollständig"))).toBe(true);
  });
  it("labels the remaining adult transition explicitly instead of merging incompatible success signals", () => {
    const birthday = { ...saved, data: { ...saved.data, birthDate: "2008-09-15" } };
    const result = trainingCompliance({
      ...input(),
      training: { profiles: [birthday], shifts: [] },
    });
    expect(result?.issues).toContainEqual(
      expect.objectContaining({ title: "Prüfung des Übergangs unvollständig" }),
    );
  });
});
