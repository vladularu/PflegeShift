import { describe, it, expect } from "vitest";
import { Temporal } from "@js-temporal/polyfill";
import examCandidate from "../../rules/packages/reviewed/de-arbzg-care/2026-01-youth-r2.json";
import type { SavedTrainingProfile, TrainingProfileData } from "@/domain/training-data";
import type { RuleLegalPackage } from "@/rules/contracts.generated";
import { youthEntries } from "./youth-intervals";
import { calculateAdultTraining } from "./adult-training";
import { calculateYouthCompliance } from "./youth-compliance";
import {
  at,
  service,
  youthInput,
  youthProfile,
  youthFacts,
  youthPackage,
} from "./youth-test-fixtures";
import { createRuleResolver } from "@/rules/rule-resolver";
import { BUNDLED_HOLIDAY_RULES } from "@/rules/bundled-rules";
import { youthBlockShiftBinding } from "@/domain/youth-block-binding";

const examLegal = examCandidate as RuleLegalPackage;
const examResolver = createRuleResolver(
  { tariff: [], legal: [examLegal], holiday: BUNDLED_HOLIDAY_RULES },
  { tariff: "unused", legal: examLegal.packageId, holiday: BUNDLED_HOLIDAY_RULES[0].packageId },
);

function profile(
  basis: NonNullable<TrainingProfileData["training"]>["legalBasis"] = "BBIG",
  birthDate = "2000-01-01",
): SavedTrainingProfile {
  return {
    ...youthProfile,
    data: {
      ...youthProfile.data,
      birthDate,
      status: "training",
      training: {
        profession: basis === "PFLBG" ? "Pflegefachperson" : "Ausbildungsberuf",
        legalBasis: basis,
        startedOn: "2026-01-01",
        expectedEndOn: null,
        year: 1,
        yearConfirmedFrom: "2026-01-01",
        shorteningMonths: null,
      },
    },
  };
}
function school(date = "2026-09-15", count = 6, block = false) {
  const units = [
    ["08:00", "08:45"],
    ["08:45", "09:30"],
    ["09:45", "10:30"],
    ["10:30", "11:15"],
    ["11:30", "12:15"],
    ["12:15", "13:00"],
  ];
  const s = service(
    date,
    "08:00",
    units[count - 1][1],
    [
      ["09:30", "09:45"],
      ["11:15", "11:30"],
    ],
    true,
  );
  const monday = Temporal.PlainDate.from(date).subtract({
    days: Temporal.PlainDate.from(date).dayOfWeek - 1,
  });
  return {
    ...s,
    details: {
      ...s.details,
      data: {
        ...s.details.data,
        school: {
          lessons: units
            .slice(0, count)
            .map(([start, end]) => ({ start: at(date, start), end: at(date, end) })),
          travelToWorkMinutes: 0,
          travelFromWorkMinutes: 0,
          block: block
            ? { startDate: monday.toString(), endDate: monday.add({ days: 4 }).toString() }
            : null,
        },
      },
    },
  };
}
function examination(
  options: {
    date?: string;
    required?: boolean | null;
    finalWritten?: boolean | null;
    precedingWorkDate?: string | null;
    travel?: number | null;
  } = {},
) {
  const date = options.date ?? "2026-09-21";
  const s = service(date, "08:00", "12:00", [], true);
  s.details = {
    ...s.details,
    data: {
      version: 2,
      pauses: [],
      school: null,
      exam: {
        kind: "EXAM",
        requiredByRuleOrContract: options.required === undefined ? true : options.required,
        finalWritten: options.finalWritten === undefined ? false : options.finalWritten,
        precedingWorkDate: options.precedingWorkDate ?? null,
        participation: [{ start: at(date, "08:00"), end: at(date, "12:00") }],
        travelToWorkMinutes: options.travel === undefined ? 0 : options.travel,
        travelFromWorkMinutes: options.travel === undefined ? 0 : options.travel,
      },
    },
  };
  return s;
}
function assess(
  list: ReturnType<typeof service>[],
  basis: NonNullable<TrainingProfileData["training"]>["legalBasis"] = "BBIG",
  patch: Partial<ReturnType<typeof youthInput>> = {},
) {
  const input = youthInput({
    shifts: list.map((s) => s.entry),
    details: list.map((s) => s.details),
    profiles: [profile(basis)],
    ...patch,
  });
  const problems: { date: string; code: string; message: string; id: string }[] = [];
  const entries = youthEntries(input, (date, code, message, id) =>
    problems.push({ date, code, message, id }),
  );
  return calculateAdultTraining(input, entries, problems);
}
describe("adult training release and separate credit", () => {
  it("exposes BBiG exam and preceding-day credits separately from ordinary duty time", () => {
    const exam = examination({ finalWritten: true, precedingWorkDate: "2026-09-18" });
    const result = calculateYouthCompliance(
      youthInput({
        shifts: [exam.entry],
        details: [exam.details],
        profiles: [profile("BBIG")],
        ruleResolver: examResolver,
      }),
    );
    expect(result.trainingTimeDays).toEqual([
      { date: "2026-09-18", basis: "BBIG", minutes: 480 },
      { date: "2026-09-21", basis: "BBIG", minutes: 240 },
    ]);
    const duty = service("2026-09-22");
    const dutyOnly = calculateYouthCompliance(
      youthInput({
        shifts: [duty.entry],
        details: [duty.details],
        profiles: [profile("BBIG")],
        ruleResolver: examResolver,
      }),
    );
    expect(dutyOnly.trainingTimeDays).toEqual([]);
  });
  it("labels PflBG school attendance without borrowing the BBiG school-day lump sum", () => {
    const day = school();
    const result = calculateYouthCompliance(
      youthInput({
        shifts: [day.entry],
        details: [day.details],
        profiles: [profile("PFLBG")],
        ruleResolver: examResolver,
      }),
    );
    expect(result.trainingTimeDays).toEqual([{ date: "2026-09-15", basis: "PFLBG", minutes: 300 }]);
    const nursingExam = examination({ finalWritten: true, precedingWorkDate: "2026-09-18" });
    const nursingExamResult = calculateYouthCompliance(
      youthInput({
        shifts: [nursingExam.entry],
        details: [nursingExam.details],
        profiles: [profile("PFLBG")],
        ruleResolver: examResolver,
      }),
    );
    expect(nursingExamResult.trainingTimeDays).toEqual([
      { date: "2026-09-21", basis: "PFLBG", minutes: null },
    ]);
    const unknownExam = examination({ required: null });
    const incomplete = calculateYouthCompliance(
      youthInput({
        shifts: [unknownExam.entry],
        details: [unknownExam.details],
        profiles: [profile("BBIG")],
        ruleResolver: examResolver,
      }),
    );
    expect(incomplete.trainingTimeDays).toEqual([
      { date: "2026-09-21", basis: "BBIG", minutes: null },
    ]);
  });
  it("credits a confirmed BBiG exam and its explicitly confirmed preceding workday", () => {
    const result = assess(
      [examination({ finalWritten: true, precedingWorkDate: "2026-09-18" })],
      "BBIG",
      { ruleResolver: examResolver },
    );
    expect(result.dailyCredits.get("2026-09-21")).toBe(240);
    expect(result.dailyCredits.get("2026-09-18")).toBe(480);
    expect(result.dailyCredits.get("2026-09-20")).not.toBe(480);
    expect(result.findings.some((f) => f.code.startsWith("EXAM_"))).toBe(false);
  });
  it("warns when the explicitly confirmed preceding workday still contains a duty", () => {
    const result = assess(
      [
        examination({ finalWritten: true, precedingWorkDate: "2026-09-18" }),
        service("2026-09-18", "08:00", "16:00", []),
      ],
      "BBIG",
      { ruleResolver: examResolver },
    );
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "EXAM_PRECEDING_WORKDAY_NOT_FREE",
        date: "2026-09-18",
        sourceIds: ["bbig-2025"],
      }),
    );
  });
  it("keeps an unconfirmed exam basis or missing travel facts incomplete", () => {
    const unconfirmed = assess([examination({ required: null })], "BBIG", {
      ruleResolver: examResolver,
    });
    expect(unconfirmed.dailyCredits.get("2026-09-21")).toBeNull();
    expect(unconfirmed.findings).toContainEqual(
      expect.objectContaining({ code: "EXAM_BASIS_UNCONFIRMED", sourceIds: ["bbig-2025"] }),
    );
    const missingTravel = assess([examination({ travel: null })], "BBIG", {
      ruleResolver: examResolver,
    });
    expect(missingTravel.dailyCredits.get("2026-09-21")).toBeNull();
    expect(missingTravel.findings.some((f) => f.code === "EXAM_CREDIT_MISSING")).toBe(true);
  });
  it("reports a simultaneous duty without counting the exam as resolved credit", () => {
    const result = assess([examination(), service("2026-09-21", "09:00", "11:00", [])], "BBIG", {
      ruleResolver: examResolver,
    });
    expect(result.dailyCredits.get("2026-09-21")).toBeNull();
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "EXAM_RELEASE_OVERLAP", severity: "WARNING" }),
    );
  });
  it("does not double-credit overlapping exam entries", () => {
    const first = examination();
    const second = examination();
    second.entry = { ...second.entry, id: "second-exam" };
    second.details = { ...second.details, shiftId: "second-exam" };
    const result = assess([first, second], "BBIG", { ruleResolver: examResolver });
    expect(result.dailyCredits.get("2026-09-21")).toBeNull();
    expect(result.findings.some((f) => f.code === "EXAM_MULTIPLE_ENTRIES")).toBe(true);
  });
  it("does not infer the preceding-day average or transfer BBiG credit to PflBG", () => {
    const exam = examination({ finalWritten: true, precedingWorkDate: "2026-09-18" });
    const unknownAverage = assess([exam], "BBIG", {
      ruleResolver: examResolver,
      facts: [{ ...youthFacts, averageDailyTrainingMinutes: null }],
    });
    expect(unknownAverage.dailyCredits.get("2026-09-18")).toBeNull();
    expect(unknownAverage.findings.some((f) => f.code === "EXAM_PRECEDING_AVERAGE_MISSING")).toBe(
      true,
    );
    const nursing = assess([exam], "PFLBG", { ruleResolver: examResolver });
    expect(nursing.dailyCredits.get("2026-09-21")).toBeNull();
    expect(nursing.dailyCredits.has("2026-09-18")).toBe(false);
    expect(nursing.findings.some((f) => f.code === "EXAM_ASSESSMENT_PENDING")).toBe(true);
  });
  it("recognizes a PflBG exam-release clash without borrowing BBiG credit", () => {
    const result = assess([examination(), service("2026-09-21", "09:00", "11:00", [])], "PFLBG", {
      ruleResolver: examResolver,
    });
    expect(result.dailyCredits.get("2026-09-21")).toBeNull();
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "EXAM_RELEASE_OVERLAP",
        sourceIds: ["pflbg-2025"],
        section: "§§ 18, 63 PflBG",
      }),
    );
  });
  it("does not apply adult preceding-day rules before the 18th birthday", () => {
    const result = assess(
      [examination({ finalWritten: true, precedingWorkDate: "2026-09-18" })],
      "BBIG",
      { ruleResolver: examResolver, profiles: [profile("BBIG", "2008-09-19")] },
    );
    expect(result.dailyCredits.get("2026-09-21")).toBe(240);
    expect(result.dailyCredits.get("2026-09-18")).toBeNull();
    expect(result.findings.some((f) => f.code === "EXAM_PRECEDING_DAY_PENDING")).toBe(true);
  });
  it("keeps an explicit exam and its preceding workday incomplete for adult trainees", () => {
    const s = service("2026-09-21", "08:00", "12:00", [], true);
    s.details = {
      ...s.details,
      data: {
        version: 2,
        pauses: [],
        school: null,
        exam: {
          kind: "EXAM",
          requiredByRuleOrContract: true,
          finalWritten: true,
          precedingWorkDate: "2026-09-18",
          participation: [{ start: at("2026-09-21", "08:00"), end: at("2026-09-21", "12:00") }],
          travelToWorkMinutes: 0,
          travelFromWorkMinutes: 0,
        },
      },
    };
    const result = assess([s]);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "EXAM_ASSESSMENT_PENDING",
        date: "2026-09-21",
        severity: "INCOMPLETE",
      }),
    );
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "EXAM_PRECEDING_DAY_PENDING",
        date: "2026-09-18",
        severity: "INCOMPLETE",
      }),
    );
    expect(result.dailyCredits.get("2026-09-21")).toBeNull();
  });
  it("does not turn missing adult training times into zero credited minutes", () => {
    const s = school();
    s.entry = { ...s.entry, allDay: true, startTime: null, endTime: null };
    const result = assess([s]);
    expect(result.findings.some((f) => f.code === "TIMES_MISSING")).toBe(true);
    expect(result.dailyCredits.get("2026-09-15")).toBeNull();
  });
  it("protects a long BBiG school day and credits confirmed average training time", () => {
    const result = assess([school(), service("2026-09-15", "14:00", "16:00", [])]);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "PROTECTED_SCHOOL_DAY",
        section: "§ 15 BBiG",
        sourceIds: ["bbig-2025"],
      }),
    );
    expect(result.dailyCredits.get("2026-09-15")).toBe(480 + 120);
    expect(result.findings.some((f) => f.code === "DAILY_TIME")).toBe(false);
  });
  it("uses ordinary class units plus pauses for a shorter school day", () => {
    const result = assess([school("2026-09-15", 5)]);
    expect(result.dailyCredits.get("2026-09-15")).toBe(5 * 45 + 30);
  });
  it("does not assume an average if it has never been confirmed", () => {
    const result = assess([school()], "BBIG", {
      facts: [{ ...youthFacts, averageDailyTrainingMinutes: null }],
    });
    expect(result.dailyCredits.get("2026-09-15")).toBeNull();
    expect(result.findings.some((f) => f.code === "SCHOOL_AVERAGE_MISSING")).toBe(true);
  });
  it("does not apply BBiG long-day or early-start rules to PflBG", () => {
    const result = assess(
      [
        school(),
        service("2026-09-15", "06:00", "07:00", []),
        service("2026-09-15", "14:00", "16:00", []),
      ],
      "PFLBG",
    );
    expect(
      result.findings.some(
        (f) => f.code === "PROTECTED_SCHOOL_DAY" || f.code === "WORK_BEFORE_EARLY_SCHOOL",
      ),
    ).toBe(false);
    expect(result.dailyCredits.get("2026-09-15")).toBe(300);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "PFLBG_PREPARATION", sourceIds: ["pflbg-2025"] }),
    );
  });
  it("detects the separate PflBG right to attend school without conflicting employment", () => {
    const result = assess([school(), service("2026-09-15", "11:30", "13:30", [])], "PFLBG");
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "SCHOOL_RELEASE_OVERLAP", section: "§§ 18, 63 PflBG" }),
    );
  });
  it("checks early school for adult BBiG trainees", () => {
    expect(
      assess([school(), service("2026-09-15", "06:00", "07:00", [])]).findings.some(
        (f) => f.code === "WORK_BEFORE_EARLY_SCHOOL",
      ),
    ).toBe(true);
  });
  it("allows only confirmed additional training within the block limit", () => {
    const list = Array.from({ length: 5 }, (_, i) =>
      school(Temporal.PlainDate.from("2026-09-14").add({ days: i }).toString(), 5, true),
    );
    const extra = service("2026-09-17", "14:00", "16:00", []);
    expect(assess([...list, extra]).findings.some((f) => f.code === "WORK_IN_SCHOOL_BLOCK")).toBe(
      true,
    );
    const legacyId = assess([...list, extra], "BBIG", {
      facts: [{ ...youthFacts, blockTrainingShiftIds: [extra.entry.id] }],
    });
    expect(legacyId.findings.some((f) => f.code === "WORK_IN_SCHOOL_BLOCK")).toBe(true);
    const binding = youthBlockShiftBinding(
      extra.entry,
      extra.details,
      youthInput().profile.timeZone,
    );
    expect(binding).not.toBeNull();
    const allowed = assess([...list, extra], "BBIG", {
      facts: [{ ...youthFacts, blockTrainingShiftIds: [binding!] }],
    });
    expect(allowed.findings.some((f) => f.code === "WORK_IN_SCHOOL_BLOCK")).toBe(false);
    expect(allowed.blockWeeklyCredits.get("2026-09-14")).toBe(2400 + 120);
    const changed = {
      ...extra,
      details: { ...extra.details, revision: extra.details.revision + 1 },
    };
    expect(
      assess([...list, changed], "BBIG", {
        facts: [{ ...youthFacts, blockTrainingShiftIds: [binding!] }],
      }).findings.some((f) => f.code === "WORK_IN_SCHOOL_BLOCK"),
    ).toBe(true);
  });
  it("does not restart the protected-day allowance on the 18th birthday", () => {
    const result = assess(
      [school("2026-09-14"), school("2026-09-17"), service("2026-09-17", "14:00", "16:00", [])],
      "BBIG",
      { profiles: [profile("BBIG", "2008-09-15")] },
    );
    expect(result.findings.some((f) => f.code === "PROTECTED_SCHOOL_DAY")).toBe(false);
    expect(result.dailyCredits.get("2026-09-17")).toBe(300 + 120);
    expect(result.assessedDates).not.toContain("2026-09-14");
  });
  it("retains block violations when adulthood starts after the first school day", () => {
    const list = Array.from({ length: 5 }, (_, i) =>
      school(Temporal.PlainDate.from("2026-09-14").add({ days: i }).toString(), 5, true),
    );
    const result = assess([...list, service("2026-09-17", "14:00", "16:00", [])], "BBIG", {
      profiles: [profile("BBIG", "2008-09-15")],
    });
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "WORK_IN_SCHOOL_BLOCK", date: "2026-09-15" }),
    );
  });
  it("does not select a supported law for an unknown educational basis", () => {
    expect(
      assess([school()], "UNKNOWN").findings.some((f) => f.code === "TRAINING_BASIS_UNKNOWN"),
    ).toBe(true);
  });
  it("uses the active adult-school policy instead of hardcoded youth parameters", () => {
    const changed = structuredClone(youthPackage);
    changed.rules.adultTraining!.bbig.school.protectedDayLessonCount = 7;
    const ruleResolver = createRuleResolver(
      { tariff: [], legal: [changed], holiday: BUNDLED_HOLIDAY_RULES },
      { tariff: "unused", legal: changed.packageId, holiday: BUNDLED_HOLIDAY_RULES[0].packageId },
    );
    expect(
      assess([school(), service("2026-09-15", "14:00", "16:00", [])], "BBIG", {
        ruleResolver,
      }).findings.some((f) => f.code === "PROTECTED_SCHOOL_DAY"),
    ).toBe(false);
  });
});
