import { describe, expect, it } from "vitest";
import examCandidate from "../../rules/packages/reviewed/de-arbzg-care/2026-01-youth-r2.json";
import type { SavedShiftTraining } from "@/domain/training-data";
import type { ShiftEntry } from "@/domain/types";
import type { RuleLegalPackage } from "@/rules/contracts.generated";
import { BUNDLED_HOLIDAY_RULES } from "@/rules/bundled-rules";
import { createRuleResolver } from "@/rules/rule-resolver";
import { calculateYouthCompliance } from "./youth-compliance";
import { at, service, youthFacts, youthInput } from "./youth-test-fixtures";

const legal = examCandidate as RuleLegalPackage;
const resolver = createRuleResolver(
  { tariff: [], legal: [legal], holiday: BUNDLED_HOLIDAY_RULES },
  { tariff: "unused", legal: legal.packageId, holiday: BUNDLED_HOLIDAY_RULES[0].packageId },
);
function examination(
  date: string,
  options: {
    start?: string;
    end?: string;
    pauses?: string[][];
    required?: boolean | null;
    finalWritten?: boolean | null;
    precedingWorkDate?: string | null;
    travel?: number | null;
  } = {},
) {
  const start = options.start ?? "08:00",
    end = options.end ?? "12:00",
    pauses = options.pauses ?? [];
  const base = service(date, start, end, pauses, true);
  const participation = pauses.length
    ? [
        { start: at(date, start), end: at(date, pauses[0][0]) },
        ...pauses.slice(0, -1).map((pause, index) => ({
          start: at(date, pause[1]),
          end: at(date, pauses[index + 1][0]),
        })),
        { start: at(date, pauses.at(-1)![1]), end: at(date, end) },
      ]
    : [{ start: at(date, start), end: at(date, end) }];
  const data: SavedShiftTraining["data"] = {
    version: 2,
    pauses: base.details.data.pauses,
    school: null,
    exam: {
      kind: "EXAM",
      requiredByRuleOrContract: options.required === undefined ? true : options.required,
      finalWritten: options.finalWritten === undefined ? false : options.finalWritten,
      precedingWorkDate: options.precedingWorkDate ?? null,
      participation,
      travelToWorkMinutes: options.travel === undefined ? 0 : options.travel,
      travelFromWorkMinutes: options.travel === undefined ? 0 : options.travel,
    },
  };
  return { entry: base.entry, details: { ...base.details, data } };
}
function assess(
  list: readonly { entry: ShiftEntry; details: SavedShiftTraining }[],
  average = 480,
) {
  return calculateYouthCompliance(
    youthInput({
      shifts: list.map((item) => item.entry),
      details: list.map((item) => item.details),
      facts: [{ ...youthFacts, averageDailyTrainingMinutes: average }],
      ruleResolver: resolver,
    }),
  );
}

describe("source-bound § 10 youth exam assessment", () => {
  it("credits confirmed participation and pauses to the daily limit", () => {
    const s = examination("2026-09-21", {
      start: "08:00",
      end: "18:00",
      pauses: [
        ["10:00", "10:30"],
        ["14:00", "14:30"],
      ],
    });
    const result = assess([s]);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "DAILY_TIME",
        date: "2026-09-21",
        versionId: "2026-01-youth-r2",
      }),
    );
    expect(result.findings.some((item) => item.code === "EXAM_ASSESSMENT_PENDING")).toBe(false);
  });
  it("checks the confirmed preceding workday, not the previous calendar day", () => {
    const prior = service("2026-09-18", "08:00", "17:00"),
      exam = examination("2026-09-21", {
        finalWritten: true,
        precedingWorkDate: "2026-09-18",
      });
    const result = assess([prior, exam]);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "EXAM_PRECEDING_WORKDAY_NOT_FREE",
        date: "2026-09-18",
        severity: "WARNING",
        sourceIds: ["jarbschg-2024"],
      }),
    );
    expect(
      result.findings.some((item) => item.date === "2026-09-20" && item.code.startsWith("EXAM")),
    ).toBe(false);
    expect(result.findings.some((item) => item.code === "EXAM_PRECEDING_DAY_PENDING")).toBe(false);
  });
  it("checks the confirmed average on a released day without a calendar entry", () => {
    const exam = examination("2026-09-21", {
      finalWritten: true,
      precedingWorkDate: "2026-09-18",
    });
    const result = assess([exam], 540);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "DAILY_TIME", date: "2026-09-18" }),
    );
  });
  it("keeps the five-day classification open when the credited prior day is decisive", () => {
    const work = ["14", "15", "16", "17", "19"].map((day) =>
      service(`2026-09-${day}`, "08:00", "16:00"),
    );
    const exam = examination("2026-09-21", {
      finalWritten: true,
      precedingWorkDate: "2026-09-18",
    });
    const result = assess([...work, exam]);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "EXAM_WEEKDAY_CREDIT_UNCLEAR",
        severity: "INCOMPLETE",
        date: "2026-09-14",
      }),
    );
    expect(result.findings.some((item) => item.code === "WORKING_DAYS")).toBe(false);
  });
  it("does not credit an overnight exam twice without day-specific intervals", () => {
    const base = service("2026-09-21", "22:00", "06:00", [], true);
    const details: SavedShiftTraining = {
      ...base.details,
      data: {
        version: 2,
        pauses: [],
        school: null,
        exam: {
          kind: "EXAM",
          requiredByRuleOrContract: true,
          finalWritten: false,
          precedingWorkDate: null,
          participation: [{ start: at("2026-09-21", "22:00"), end: at("2026-09-22", "06:00") }],
          travelToWorkMinutes: 0,
          travelFromWorkMinutes: 0,
        },
      },
    };
    const result = assess([{ entry: base.entry, details }]);
    expect(result.status).toBe("INCOMPLETE");
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "EXAM_CROSS_DAY_UNSUPPORTED", severity: "INCOMPLETE" }),
    );
  });
  it("does not treat an unclassified gap between exam sessions as credited time", () => {
    const base = examination("2026-09-21");
    const data: SavedShiftTraining["data"] = {
      ...base.details.data,
      exam: {
        ...base.details.data.exam!,
        participation: [
          { start: at("2026-09-21", "08:00"), end: at("2026-09-21", "09:00") },
          { start: at("2026-09-21", "11:00"), end: at("2026-09-21", "12:00") },
        ],
      },
    };
    const result = assess([{ entry: base.entry, details: { ...base.details, data } }]);
    expect(result.status).toBe("INCOMPLETE");
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "EXAM_INTERVAL_GAP_UNCLASSIFIED", severity: "INCOMPLETE" }),
    );
  });
  it("keeps missing eligibility and necessary travel data incomplete", () => {
    const s = examination("2026-09-21", { required: null, travel: null });
    const result = assess([s]);
    expect(result.status).toBe("INCOMPLETE");
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "EXAM_BASIS_UNCONFIRMED", severity: "INCOMPLETE" }),
    );
    expect(result.findings.some((item) => item.code === "DAILY_TIME")).toBe(false);
  });
  it("uses a confirmed exam-to-work route without an unresolved-position finding", () => {
    const base = examination("2026-09-21", { start: "08:00", end: "12:00", travel: 0 });
    const work = service("2026-09-21", "12:30", "15:30", []);
    const exam: SavedShiftTraining = {
      ...base.details,
      data: {
        ...base.details.data,
        version: 3,
        exam: {
          ...base.details.data.exam!,
          travelToWorkMinutes: 20,
          travelToWorkInterval: {
            start: at("2026-09-21", "12:00"),
            end: at("2026-09-21", "12:20"),
          },
          travelFromWorkInterval: null,
        },
      },
    };
    const matched = assess([{ entry: base.entry, details: exam }, work]);
    expect(matched.findings.some((item) => item.code === "EXAM_TRAVEL_POSITION")).toBe(false);
    const unmatched = assess([{ entry: base.entry, details: exam }]);
    expect(unmatched.findings).toContainEqual(
      expect.objectContaining({ code: "EXAM_TRAVEL_POSITION", severity: "INCOMPLETE" }),
    );
  });
});
