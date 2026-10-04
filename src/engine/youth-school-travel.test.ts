import { describe, expect, it } from "vitest";
import { shift } from "./remuneration-test-fixtures";
import type { YouthEntry } from "./youth-types";
import {
  locatedExamTravel,
  locatedSchoolTravel,
  trainingActivityBounds,
} from "./youth-school-travel";

const school: YouthEntry = {
  shift: shift({ id: "school", type: "TRAINING" }),
  start: Date.parse("2026-09-15T06:00:00Z"),
  end: Date.parse("2026-09-15T07:30:00Z"),
  pauses: [],
  school: {
    lessons: [],
    block: null,
    travelFromWorkMinutes: 0,
    travelToWorkMinutes: 20,
    travelFromWorkInterval: null,
    travelToWorkInterval: {
      start: "2026-09-15T07:30:00Z",
      end: "2026-09-15T07:50:00Z",
    },
  },
  exam: null,
  blockTrainingBinding: null,
};
const work: YouthEntry = {
  ...school,
  shift: shift({ id: "work", type: "EARLY" }),
  start: Date.parse("2026-09-15T08:00:00Z"),
  end: Date.parse("2026-09-15T12:00:00Z"),
  school: null,
};

describe("located necessary school travel", () => {
  it("requires a real, non-overlapping later service", () => {
    expect(locatedSchoolTravel(school, [school, work])).toEqual([
      { start: Date.parse("2026-09-15T07:30:00Z"), end: Date.parse("2026-09-15T07:50:00Z") },
    ]);
    expect(trainingActivityBounds(school, [school, work]).end).toBe(
      Date.parse("2026-09-15T07:50:00Z"),
    );
    expect(locatedSchoolTravel(school, [school])).toBeNull();
    expect(
      locatedSchoolTravel(school, [school, { ...work, start: Date.parse("2026-09-15T07:40:00Z") }]),
    ).toBeNull();
  });
  it("leaves legacy positive minutes unlocated and zero minutes explicitly empty", () => {
    expect(
      locatedSchoolTravel(
        { ...school, school: { ...school.school!, travelToWorkInterval: undefined } },
        [school, work],
      ),
    ).toBeNull();
    expect(
      locatedSchoolTravel({ ...school, school: { ...school.school!, travelToWorkMinutes: 0 } }, [
        school,
        work,
      ]),
    ).toEqual([]);
  });
});

describe("located necessary examination travel", () => {
  const exam: YouthEntry = {
    ...school,
    shift: shift({ id: "exam", type: "TRAINING" }),
    school: null,
    exam: {
      kind: "EXAM",
      requiredByRuleOrContract: true,
      finalWritten: false,
      precedingWorkDate: null,
      participation: [{ start: "2026-09-15T06:00:00Z", end: "2026-09-15T07:30:00Z" }],
      travelFromWorkMinutes: 0,
      travelToWorkMinutes: 20,
      travelFromWorkInterval: null,
      travelToWorkInterval: {
        start: "2026-09-15T07:30:00Z",
        end: "2026-09-15T07:50:00Z",
      },
    },
  };
  it("requires a matched work entry and extends the examination activity bounds", () => {
    expect(locatedExamTravel(exam, [exam, work])).toEqual([
      { start: Date.parse("2026-09-15T07:30:00Z"), end: Date.parse("2026-09-15T07:50:00Z") },
    ]);
    expect(trainingActivityBounds(exam, [exam, work]).end).toBe(Date.parse("2026-09-15T07:50:00Z"));
    expect(locatedExamTravel(exam, [exam])).toBeNull();
    expect(
      locatedExamTravel(exam, [exam, { ...work, start: Date.parse("2026-09-15T07:40:00Z") }]),
    ).toBeNull();
  });
});
