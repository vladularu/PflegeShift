import { describe, expect, it } from "vitest";
import { shift as fixture } from "@/engine/remuneration-test-fixtures";
import {
  emptyInterval,
  isAmbiguousTime,
  pauseTotal,
  trainingTimeEntries,
  trainingTimesDraft,
  trainingTimesFromDraft,
  type IntervalDraft,
} from "./training-times-model";

const zone = "Europe/Berlin";
const shift = fixture({
  date: "2026-09-15",
  type: "TRAINING",
  startTime: "08:00",
  endTime: "15:00",
  breakMinutes: 30,
});
const empty = () => trainingTimesDraft(null, shift, zone);
const interval = (
  start: string,
  end: string,
  rest: Partial<IntervalDraft> = {},
): IntervalDraft => ({ ...emptyInterval(), start, end, ...rest });
describe("school/pause input without inferred legal facts", () => {
  it("does not classify a training service or its title as school", () => {
    expect(trainingTimesFromDraft(empty(), shift, zone)).toEqual({
      version: 1,
      pauses: null,
      school: null,
    });
  });
  it("distinguishes unknown pauses from an explicit zero and actual intervals", () => {
    expect(pauseTotal(trainingTimesFromDraft(empty(), shift, zone))).toBeNull();
    expect(pauseTotal(trainingTimesFromDraft({ ...empty(), pauseMode: "none" }, shift, zone))).toBe(
      0,
    );
    expect(
      pauseTotal(
        trainingTimesFromDraft(
          { ...empty(), pauseMode: "intervals", pauses: [interval("10:00", "10:10")] },
          shift,
          zone,
        ),
      ),
    ).toBe(10);
  });
  it("roundtrips individual lessons, breaks, travel and a school block", () => {
    const draft = {
      ...empty(),
      school: true,
      lessons: [interval("08:00", "08:45"), interval("08:45", "09:30")],
      pauseMode: "intervals" as const,
      pauses: [interval("09:30", "09:45")],
      travelToWork: "20",
      travelFromWork: "0",
      block: true,
      blockStart: "14.09.2026",
      blockEnd: "18.09.2026",
    };
    const data = trainingTimesFromDraft(draft, shift, zone);
    expect(data.school?.lessons).toHaveLength(2);
    expect(data.school?.travelFromWorkMinutes).toBe(0);
    expect(data.school?.travelToWorkMinutes).toBe(20);
    expect(trainingTimesDraft(data, shift, zone)).toEqual(draft);
  });
  it("roundtrips a located necessary school route without inventing a location for old minutes", () => {
    const draft = {
      ...empty(),
      school: true,
      lessons: [interval("08:00", "08:45"), interval("08:45", "09:30")],
      travelToWork: "20",
      travelFromWork: "0",
      travelToWorkInterval: interval("09:30", "09:50"),
    };
    const data = trainingTimesFromDraft(draft, shift, zone);
    expect(data.version).toBe(3);
    expect(data.school?.travelToWorkInterval).toEqual({
      start: "2026-09-15T07:30:00Z",
      end: "2026-09-15T07:50:00Z",
    });
    expect(trainingTimesDraft(data, shift, zone)).toEqual(draft);
    const unlocated = trainingTimesFromDraft({ ...draft, travelToWorkInterval: null }, shift, zone);
    expect(unlocated.version).toBe(1);
    expect(unlocated.school?.travelToWorkInterval).toBeUndefined();
  });
  it("refuses a travel interval whose confirmed duration differs", () => {
    expect(() =>
      trainingTimesFromDraft(
        {
          ...empty(),
          school: true,
          lessons: [interval("08:00", "08:45")],
          travelToWork: "20",
          travelToWorkInterval: interval("08:45", "08:55"),
        },
        shift,
        zone,
      ),
    ).toThrow("Wegezeit");
  });
  it("roundtrips an explicit examination without classifying it as school", () => {
    const draft = {
      ...empty(),
      examKind: "EXAM" as const,
      examRequired: "yes" as const,
      examFinalWritten: "yes" as const,
      examPrecedingWorkDate: "14.09.2026",
      examParticipation: [interval("08:00", "10:00"), interval("10:30", "12:00")],
      examTravelToWork: "0",
      examTravelFromWork: "",
      pauseMode: "intervals" as const,
      pauses: [interval("10:00", "10:30")],
    };
    const data = trainingTimesFromDraft(draft, shift, zone);
    expect(data.version).toBe(2);
    expect(data.school).toBeNull();
    expect(data.exam).toMatchObject({
      kind: "EXAM",
      requiredByRuleOrContract: true,
      finalWritten: true,
      precedingWorkDate: "2026-09-14",
      travelToWorkMinutes: 0,
      travelFromWorkMinutes: null,
    });
    expect(trainingTimesDraft(data, shift, zone)).toEqual(draft);
  });
  it("roundtrips a located necessary exam route without upgrading old unlocated minutes", () => {
    const draft = {
      ...empty(),
      examKind: "EXAM" as const,
      examParticipation: [interval("08:00", "10:00")],
      examTravelToWork: "20",
      examTravelFromWork: "0",
      examTravelToWorkInterval: interval("10:00", "10:20"),
    };
    const data = trainingTimesFromDraft(draft, shift, zone);
    expect(data.version).toBe(3);
    expect(data.exam?.travelToWorkInterval).toEqual({
      start: "2026-09-15T08:00:00Z",
      end: "2026-09-15T08:20:00Z",
    });
    expect(trainingTimesDraft(data, shift, zone)).toEqual(draft);
    const unlocated = trainingTimesFromDraft(
      { ...draft, examTravelToWorkInterval: null },
      shift,
      zone,
    );
    expect(unlocated.version).toBe(2);
    expect(unlocated.exam?.travelToWorkInterval).toBeUndefined();
  });
  it("leaves necessary travel unknown when not entered", () => {
    expect(
      trainingTimesFromDraft(
        { ...empty(), school: true, lessons: [interval("08:00", "08:45")] },
        shift,
        zone,
      ).school?.travelToWorkMinutes,
    ).toBeNull();
  });
  it.each(["-1", "12.5", "1e2", "721"])("rejects invalid travel %s", (travelToWork) => {
    expect(() =>
      trainingTimesFromDraft(
        { ...empty(), school: true, lessons: [interval("08:00", "08:45")], travelToWork },
        shift,
        zone,
      ),
    ).toThrow("Wegezeit");
  });
  it("requires explicit classification on a TRAINING service", () => {
    expect(() =>
      trainingTimesFromDraft(
        { ...empty(), school: true, lessons: [interval("08:00", "08:45")] },
        { ...shift, type: "EARLY" },
        zone,
      ),
    ).toThrow("Ausbildungseintrag");
  });
  it("rejects overlap, outside intervals, empty interval mode and missing lessons", () => {
    for (const values of [
      { ...empty(), pauseMode: "intervals" as const },
      { ...empty(), school: true },
      { ...empty(), pauseMode: "intervals" as const, pauses: [interval("07:00", "07:15")] },
      {
        ...empty(),
        school: true,
        lessons: [interval("08:00", "08:45")],
        pauseMode: "intervals" as const,
        pauses: [interval("08:30", "09:00")],
      },
      {
        ...empty(),
        pauseMode: "intervals" as const,
        pauses: [interval("10:00", "10:30"), interval("10:15", "10:45")],
      },
    ])
      expect(() => trainingTimesFromDraft(values, shift, zone)).toThrow();
  });
  it.each([
    ["16.09.2026", "18.09.2026"],
    ["15.09.2026", "14.09.2026"],
    ["31.02.2026", "18.09.2026"],
  ])("rejects an invalid/outside school block %s–%s", (blockStart, blockEnd) => {
    expect(() =>
      trainingTimesFromDraft(
        {
          ...empty(),
          school: true,
          lessons: [interval("08:00", "08:45")],
          block: true,
          blockStart,
          blockEnd,
        },
        shift,
        zone,
      ),
    ).toThrow();
  });
  it("supports a pause over midnight without silently moving times to the next day", () => {
    const night = { ...shift, startTime: "21:00", endTime: "07:00" };
    const draft = {
      ...empty(),
      pauseMode: "intervals" as const,
      pauses: [interval("23:45", "00:15", { endNextDay: true })],
    };
    expect(pauseTotal(trainingTimesFromDraft(draft, night, zone))).toBe(30);
    expect(() =>
      trainingTimesFromDraft({ ...draft, pauses: [interval("23:45", "00:15")] }, night, zone),
    ).toThrow();
  });
  it("requires explicit occurrences in the double autumn hour and retains them", () => {
    const night = { ...shift, date: "2026-10-24", startTime: "22:00", endTime: "07:00" };
    const p = interval("02:30", "02:15", { startNextDay: true, endNextDay: true });
    expect(isAmbiguousTime(night.date, "02:30", true, zone)).toBe(true);
    expect(() =>
      trainingTimesFromDraft({ ...empty(), pauseMode: "intervals", pauses: [p] }, night, zone),
    ).toThrow("zweimal");
    const draft = {
      ...empty(),
      pauseMode: "intervals" as const,
      pauses: [{ ...p, startOccurrence: "earlier" as const, endOccurrence: "later" as const }],
    };
    const data = trainingTimesFromDraft(draft, night, zone);
    expect(pauseTotal(data)).toBe(45);
    expect(trainingTimesDraft(data, night, zone)).toEqual(draft);
  });
  it("rejects nonexistent spring times rather than shifting them forward", () => {
    const night = { ...shift, date: "2026-03-28", startTime: "22:00", endTime: "07:00" };
    expect(() =>
      trainingTimesFromDraft(
        {
          ...empty(),
          pauseMode: "intervals",
          pauses: [interval("02:00", "03:00", { startNextDay: true, endNextDay: true })],
        },
        night,
        zone,
      ),
    ).toThrow("existiert");
  });
  it("lists only active timed services of the selected month", () => {
    const early = { ...shift, id: "early", date: "2026-09-14" };
    expect(
      trainingTimeEntries(
        [
          shift,
          early,
          { ...shift, id: "deleted", deletedAt: shift.updatedAt },
          { ...shift, id: "other", date: "2026-10-01" },
          { ...shift, id: "all", allDay: true },
        ],
        "2026-09",
      ).map((e) => e.id),
    ).toEqual(["early", shift.id]);
  });
});
