import { describe, expect, it } from "vitest";

import {
  evaluateTvoedKNightReferences,
  tvoedKNightDeadline,
  type NightReferenceInput,
  type TariffNightObservation,
} from "./tvoed-k-night-reference";

function night(id: string, date: string, endDate: string): TariffNightObservation {
  return {
    id,
    start: `${date}T21:00:00+02:00`,
    end: `${endDate}T07:00:00+02:00`,
    netNightMinutes: 480,
  };
}

const july = [
  night("anchor", "2015-07-02", "2015-07-03"),
  night("first", "2015-07-23", "2015-07-24"),
  night("second", "2015-07-24", "2015-07-25"),
];
function input(overrides: Partial<NightReferenceInput> = {}): NightReferenceInput {
  return {
    nights: july,
    timeZone: "Europe/Berlin",
    completeFrom: "2015-07-01T00:00:00+02:00",
    completeUntil: "2015-09-01T00:00:00+02:00",
    allocatedFollowUpIds: [],
    unresolvedAbsences: [],
    ...overrides,
  };
}

describe("BT-K isolated night-reference kernel (not an entitlement decision)", () => {
  it.each([
    ["2026-01-31T07:00:00+01:00", "2026-02-28"],
    ["2024-01-31T07:00:00+01:00", "2024-02-29"],
    ["2026-12-03T07:00:00+01:00", "2027-01-03"],
    ["2026-07-03T07:00:00+02:00", "2026-08-03"],
  ])("uses an event month, not 28 days: %s", (end, deadline) => {
    expect(tvoedKNightDeadline(end, "Europe/Berlin").deadlineDate).toBe(deadline);
  });

  it("uses local midnight after deadline across DST", () => {
    expect(
      tvoedKNightDeadline("2026-02-28T07:00:00+01:00", "Europe/Berlin").deadlineExclusive,
    ).toBe("2026-03-28T23:00:00Z");
    expect(
      tvoedKNightDeadline("2026-03-01T07:00:00+01:00", "Europe/Berlin").deadlineExclusive,
    ).toBe("2026-04-01T22:00:00Z");
  });

  it("replays BAG July 2/23/24 with explicitly assumed 21:00-07:00 times", () => {
    const result = evaluateTvoedKNightReferences(input())[0];
    expect(result).toMatchObject({
      anchorId: "anchor",
      deadlineDate: "2015-08-03",
      state: "MET",
      eligibleFollowUpIds: ["first", "second"],
    });
  });

  it("accepts nonconsecutive nights", () => {
    expect(
      evaluateTvoedKNightReferences(
        input({ nights: [july[0], july[1], night("later", "2015-07-30", "2015-07-31")] }),
      )[0].state,
    ).toBe("MET");
  });

  it("accepts the second start on the entire deadline day, even ending afterwards", () => {
    const result = evaluateTvoedKNightReferences(
      input({ nights: [july[0], july[1], night("boundary", "2015-08-03", "2015-08-04")] }),
    )[0];
    expect(result.state).toBe("MET");
  });

  it("rejects a second start at the next local midnight", () => {
    const late = {
      ...night("late", "2015-08-04", "2015-08-05"),
      start: "2015-08-04T00:00:00+02:00",
    };
    expect(
      evaluateTvoedKNightReferences(input({ nights: [july[0], july[1], late] }))[0].state,
    ).toBe("NOT_MET");
  });

  it("cannot reuse an allocated follow-up but can use it as a new anchor", () => {
    const result = evaluateTvoedKNightReferences(input({ allocatedFollowUpIds: ["first"] }));
    expect(result[0]).toMatchObject({ state: "NOT_MET", eligibleFollowUpIds: ["second"] });
    expect(result.some((item) => item.anchorId === "first")).toBe(true);
  });

  it("does not infer failure from incomplete recording", () => {
    expect(
      evaluateTvoedKNightReferences(
        input({ nights: [july[0]], completeUntil: "2015-07-20T00:00:00+02:00" }),
      )[0],
    ).toMatchObject({ state: "REVIEW", reasons: ["INCOMPLETE_WINDOW"] });
  });

  it("requires coverage of the anchor and complete follow-up shifts", () => {
    expect(
      evaluateTvoedKNightReferences(input({ completeFrom: "2015-07-03T00:00:00+02:00" }))[0].state,
    ).toBe("REVIEW");
    expect(
      evaluateTvoedKNightReferences(
        input({
          nights: [july[0], july[1], night("boundary", "2015-08-03", "2015-08-04")],
          completeUntil: "2015-08-04T00:00:00+02:00",
        }),
      )[0].state,
    ).toBe("REVIEW");
  });

  it("does not guess qualification when night/pause minutes are unknown", () => {
    expect(
      evaluateTvoedKNightReferences(
        input({ nights: [{ ...july[0], netNightMinutes: null }, ...july.slice(1)] }),
      )[0],
    ).toMatchObject({ state: "REVIEW", reasons: ["UNKNOWN_NIGHT_MINUTES"] });
  });

  it("distinguishes 119 from 120 actual night minutes", () => {
    expect(
      evaluateTvoedKNightReferences(
        input({ nights: [july[0], july[1], { ...july[2], netNightMinutes: 119 }] }),
      )[0].state,
    ).toBe("NOT_MET");
    expect(
      evaluateTvoedKNightReferences(
        input({ nights: [july[0], july[1], { ...july[2], netNightMinutes: 120 }] }),
      )[0].state,
    ).toBe("MET");
  });

  it("flags absence instead of automatically granting or removing an allowance", () => {
    expect(
      evaluateTvoedKNightReferences(
        input({
          unresolvedAbsences: [
            { start: "2015-07-10T00:00:00+02:00", end: "2015-07-12T00:00:00+02:00" },
          ],
        }),
      )[0],
    ).toMatchObject({ state: "REVIEW", reasons: ["ABSENCE"] });
  });

  it("ignores absences outside the window", () => {
    expect(
      evaluateTvoedKNightReferences(
        input({
          unresolvedAbsences: [{ start: "2015-09-10T00:00:00Z", end: "2015-09-12T00:00:00Z" }],
        }),
      )[0].state,
    ).toBe("MET");
  });

  it("is deterministic without mutating caller arrays or allocating IDs", () => {
    const data = input({
      nights: Object.freeze([...july].reverse().map((item) => Object.freeze(item))),
      allocatedFollowUpIds: Object.freeze([]),
    });
    const before = JSON.stringify(data);
    expect(evaluateTvoedKNightReferences(data)).toEqual(evaluateTvoedKNightReferences(input()));
    expect(JSON.stringify(data)).toBe(before);
    expect(Object.isFrozen(evaluateTvoedKNightReferences(data)[0].eligibleFollowUpIds)).toBe(true);
  });

  it("returns no claim for empty input", () => {
    expect(evaluateTvoedKNightReferences(input({ nights: [] }))).toEqual([]);
  });

  it.each([
    { nights: [july[0], july[0]] },
    { nights: [{ ...july[0], id: " " }] },
    { nights: [{ ...july[0], end: july[0].start }] },
    { nights: [{ ...july[0], netNightMinutes: -1 }] },
    { nights: [{ ...july[0], netNightMinutes: 99999 }] },
    { nights: [{ ...july[0], netNightMinutes: Number.NaN }] },
    { nights: [july[0], { ...july[0], id: "overlap" }] },
    { completeUntil: "2015-06-01T00:00:00Z" },
    { timeZone: "invalid" },
  ])("rejects malformed observations: %j", (overrides) => {
    expect(() => evaluateTvoedKNightReferences(input(overrides))).toThrow();
  });
});
