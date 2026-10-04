import { describe, expect, it } from "vitest";
import { Temporal } from "@js-temporal/polyfill";
import { createRuleResolver } from "@/rules/rule-resolver";
import { BUNDLED_HOLIDAY_RULES } from "@/rules/bundled-rules";
import existing from "../../rules/packages/reviewed/de-arbzg-care/2026-01.json";
import type { RuleLegalPackage } from "@/rules/contracts.generated";
import { calculateYouthCompliance } from "./youth-compliance";
import {
  at,
  service,
  youthFacts,
  youthInput,
  youthPackage,
  youthProfile,
} from "./youth-test-fixtures";

describe("Jugendarbeitsschutz daily and boundary reference cases", () => {
  it("accepts an eight-hour day with two properly placed half-hour pauses", () => {
    const { entry, details } = service();
    const result = calculateYouthCompliance(youthInput({ shifts: [entry], details: [details] }));
    expect(result.status).toBe("NO_FINDINGS");
    expect(result.findings).toEqual([]);
  });
  it("detects excess daily time using the active package, not a hardcoded limit", () => {
    const { entry, details } = service();
    const reduced = structuredClone(youthPackage);
    reduced.rules.youthProtection!.workingTime.dailyMinutes = 420;
    const ruleResolver = createRuleResolver(
      { tariff: [], legal: [reduced], holiday: BUNDLED_HOLIDAY_RULES },
      { tariff: "unused", legal: reduced.packageId, holiday: BUNDLED_HOLIDAY_RULES[0].packageId },
    );
    const result = calculateYouthCompliance(
      youthInput({ shifts: [entry], details: [details], ruleResolver }),
    );
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "DAILY_TIME",
        severity: "WARNING",
        packageId: youthPackage.packageId,
        versionId: youthPackage.versionId,
        sourceIds: ["jarbschg-2024"],
      }),
    );
  });
  it("does not accept 8.5 hours unless a shortened workday is explicitly confirmed", () => {
    const { entry, details } = service("2026-09-15", "08:00", "17:30");
    expect(
      calculateYouthCompliance(youthInput({ shifts: [entry], details: [details] })).findings.some(
        (f) => f.code === "DAILY_TIME",
      ),
    ).toBe(true);
  });
  it("keeps a newly recorded exam and the preceding final-exam day incomplete until § 10 is assessed", () => {
    const before = service("2026-09-18", "08:00", "17:00"),
      exam = service("2026-09-21", "08:00", "12:00", [], true);
    const details = {
      ...exam.details,
      data: {
        version: 2 as const,
        pauses: [],
        school: null,
        exam: {
          kind: "EXAM" as const,
          requiredByRuleOrContract: true,
          finalWritten: true,
          precedingWorkDate: "2026-09-18",
          participation: [{ start: at("2026-09-21", "08:00"), end: at("2026-09-21", "12:00") }],
          travelToWorkMinutes: 0,
          travelFromWorkMinutes: 0,
        },
      },
    };
    const result = calculateYouthCompliance(
      youthInput({
        shifts: [before.entry, exam.entry],
        details: [before.details, details],
      }),
    );
    expect(result.status).toBe("INCOMPLETE");
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "EXAM_ASSESSMENT_PENDING", date: "2026-09-21" }),
    );
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "EXAM_PRECEDING_DAY_PENDING", date: "2026-09-18" }),
    );
    expect(
      result.findings.some(
        (f) => f.code === "EXAM_PRECEDING_DAY_PENDING" && f.date === "2026-09-20",
      ),
    ).toBe(false);
    expect(result.findings.some((f) => f.code === "DAILY_TIME" && f.date === "2026-09-21")).toBe(
      false,
    );
    const unknown = calculateYouthCompliance(
      youthInput({
        shifts: [before.entry, exam.entry],
        details: [
          before.details,
          {
            ...details,
            data: {
              ...details.data,
              exam: { ...details.data.exam, precedingWorkDate: null },
            },
          },
        ],
      }),
    );
    expect(unknown.findings).toContainEqual(
      expect.objectContaining({ code: "EXAM_PRECEDING_WORKDAY_UNKNOWN", date: "2026-09-21" }),
    );
    expect(unknown.findings.some((f) => f.code === "EXAM_PRECEDING_DAY_PENDING")).toBe(false);
  });
  it("counts sub-fifteen-minute interruptions as work and does not accept their sum as a valid break", () => {
    const { entry, details } = service("2026-09-15", "08:00", "14:00", [
      ["10:00", "10:10"],
      ["12:00", "12:10"],
    ]);
    const codes = calculateYouthCompliance(
      youthInput({ shifts: [entry], details: [details] }),
    ).findings.map((f) => f.code);
    expect(codes).toContain("BREAK_DURATION");
    expect(codes).toContain("CONTINUOUS_TIME");
  });
  it("detects early pauses, insufficient duration and late interruptions", () => {
    const { entry, details } = service("2026-09-15", "08:00", "17:00", [["08:15", "08:45"]]);
    const codes = calculateYouthCompliance(
      youthInput({ shifts: [entry], details: [details] }),
    ).findings.map((f) => f.code);
    expect(codes).toContain("BREAK_POSITION");
    expect(codes).toContain("BREAK_DURATION");
    expect(codes).toContain("CONTINUOUS_TIME");
  });
  it("never treats stored total minutes as evidence of actual pause position", () => {
    const { entry } = service();
    const result = calculateYouthCompliance(youthInput({ shifts: [entry] }));
    expect(result.status).toBe("INCOMPLETE");
    expect(result.findings.some((f) => f.code === "PAUSE_DATA_MISSING")).toBe(true);
    expect(result.findings.some((f) => f.code === "DAILY_TIME")).toBe(false);
  });
  it("requires birth date and full-time school duty, regardless of training status", () => {
    const { entry, details } = service();
    for (const data of [
      { ...youthProfile.data, birthDate: null },
      { ...youthProfile.data, fullTimeCompulsorySchooling: null },
      { ...youthProfile.data, fullTimeCompulsorySchooling: true },
      { ...youthProfile.data, birthDate: "2012-01-01" },
    ]) {
      expect(
        calculateYouthCompliance(
          youthInput({
            shifts: [entry],
            details: [details],
            profiles: [{ ...youthProfile, data }],
          }),
        ).status,
      ).toBe("INCOMPLETE");
    }
  });
  it("stops youth daily findings on the 18th birthday and marks transitional weekly coverage", () => {
    const before = service("2026-09-14", "08:00", "17:30"),
      birthday = service("2026-09-15", "08:00", "17:30");
    const result = calculateYouthCompliance(
      youthInput({
        profiles: [{ ...youthProfile, data: { ...youthProfile.data, birthDate: "2008-09-15" } }],
        shifts: [before.entry, birthday.entry],
        details: [before.details, birthday.details],
      }),
    );
    expect(result.findings.filter((f) => f.code === "DAILY_TIME").map((f) => f.date)).toEqual([
      "2026-09-14",
    ]);
    expect(result.assessedDates).not.toContain("2026-09-15");
    expect(result.findings.some((f) => f.code === "PARTIAL_YOUTH_WEEK")).toBe(true);
  });
  it("requires confirmed multishift operation for work after 20:00", () => {
    const s = service("2026-09-15", "17:00", "22:00", [["19:00", "19:30"]]);
    const input = youthInput({ shifts: [s.entry], details: [s.details] });
    expect(
      calculateYouthCompliance(input).findings.some((f) => f.code === "EMPLOYMENT_WINDOW"),
    ).toBe(true);
    expect(
      calculateYouthCompliance({
        ...input,
        facts: [{ ...youthFacts, multiShiftOperation: true }],
      }).findings.some((f) => f.code === "EMPLOYMENT_WINDOW"),
    ).toBe(false);
  });
  it("finds less than twelve hours of daily rest", () => {
    const late = service("2026-09-14", "17:00", "22:00", [["19:00", "19:30"]]),
      early = service("2026-09-15", "08:00", "12:00", []);
    expect(
      calculateYouthCompliance(
        youthInput({
          shifts: [late.entry, early.entry],
          details: [late.details, early.details],
          facts: [{ ...youthFacts, multiShiftOperation: true }],
        }),
      ).findings,
    ).toContainEqual(expect.objectContaining({ code: "DAILY_REST", date: "2026-09-15" }));
  });
  it("detects six employment days and over forty hours across the month boundary", () => {
    const list = Array.from({ length: 6 }, (_, i) =>
      service(Temporal.PlainDate.from("2026-08-31").add({ days: i }).toString()),
    );
    const codes = calculateYouthCompliance(
      youthInput({ shifts: list.map((x) => x.entry), details: list.map((x) => x.details) }),
    ).findings.map((f) => f.code);
    expect(codes).toContain("WORKING_DAYS");
    expect(codes).toContain("WEEKLY_TIME");
  });
  it("does not fill a valid old catalog from a hidden youth fallback", () => {
    const ruleResolver = createRuleResolver(
      { tariff: [], legal: [existing as RuleLegalPackage], holiday: BUNDLED_HOLIDAY_RULES },
      { tariff: "unused", legal: existing.packageId, holiday: BUNDLED_HOLIDAY_RULES[0].packageId },
    );
    const result = calculateYouthCompliance(youthInput({ ruleResolver }));
    expect(result.status).toBe("INCOMPLETE");
    expect(result.findings.every((f) => f.code === "YOUTH_RULES_MISSING")).toBe(true);
  });
  it("marks unverified special exceptions incomplete instead of issuing definitive standard-rule violations", () => {
    const { entry, details } = service("2026-09-15", "08:00", "18:00");
    const result = calculateYouthCompliance(
      youthInput({
        shifts: [entry],
        details: [details],
        facts: [{ ...youthFacts, otherExceptions: true }],
      }),
    );
    expect(result.status).toBe("INCOMPLETE");
    expect(result.findings.every((f) => f.severity !== "WARNING")).toBe(true);
  });
});
