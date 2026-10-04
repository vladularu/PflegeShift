import { describe, expect, it } from "vitest";
import {
  validateSavedShiftTraining,
  type SavedShiftTraining,
  type ShiftTrainingData,
} from "@/domain/training-data";
import type { ShiftEntry } from "@/domain/types";
import { shift } from "./remuneration-test-fixtures";
import {
  deriveCaritasDraftMonthWorkSlices,
  deriveCaritasDraftWorkSlices,
} from "./caritas-care-draft-work-slices";

const zone = "Europe/Berlin";

function details(parent: ShiftEntry, pauses: ShiftTrainingData["pauses"]): SavedShiftTraining {
  return validateSavedShiftTraining({
    shiftId: parent.id,
    shiftRevision: parent.revision,
    shiftDate: parent.date,
    shiftUpdatedAt: parent.updatedAt,
    timeZone: zone,
    data: { version: 1, pauses, school: null },
    revision: 1,
    updatedAt: parent.updatedAt,
  });
}

describe("Caritas candidate bridge from saved actual pauses to net work", () => {
  it("excludes the recorded pause exactly, without a centered estimate", () => {
    const parent = shift({ type: "EARLY", startTime: "07:00", endTime: "15:00", breakMinutes: 30 });
    expect(
      deriveCaritasDraftWorkSlices(
        parent,
        details(parent, [{ start: "2026-09-15T09:30:00Z", end: "2026-09-15T10:00:00Z" }]),
        zone,
      ),
    ).toEqual({
      kind: "confirmed-net-slices",
      shiftId: parent.id,
      detailRevision: 1,
      workedMinutes: 450,
      slices: [
        { date: "2026-09-15", fromMinute: 420, throughMinute: 690 },
        { date: "2026-09-15", fromMinute: 720, throughMinute: 900 },
      ],
    });
  });

  it("splits the midnight crossing at the correct local date", () => {
    const parent = shift({ startTime: "21:00", endTime: "07:00", breakMinutes: 30 });
    expect(
      deriveCaritasDraftWorkSlices(
        parent,
        details(parent, [{ start: "2026-09-15T23:00:00Z", end: "2026-09-15T23:30:00Z" }]),
        zone,
      ),
    ).toMatchObject({
      kind: "confirmed-net-slices",
      workedMinutes: 570,
      slices: [
        { date: "2026-09-15", fromMinute: 1260, throughMinute: 1440 },
        { date: "2026-09-16", fromMinute: 0, throughMinute: 60 },
        { date: "2026-09-16", fromMinute: 90, throughMinute: 420 },
      ],
    });
  });

  it("requires an explicit empty pause record even when the shift has zero pause minutes", () => {
    const parent = shift({ startTime: "07:00", endTime: "08:00", breakMinutes: 0 });
    expect(deriveCaritasDraftWorkSlices(parent, null, zone)).toEqual({
      kind: "unavailable",
      reason: "PAUSES_MISSING_OR_STALE",
    });
    expect(deriveCaritasDraftWorkSlices(parent, details(parent, null), zone)).toEqual({
      kind: "unavailable",
      reason: "PAUSES_MISSING_OR_STALE",
    });
    expect(deriveCaritasDraftWorkSlices(parent, details(parent, []), zone)).toMatchObject({
      kind: "confirmed-net-slices",
      workedMinutes: 60,
    });
  });

  it("rejects stale revisions and contradictory pause totals", () => {
    const parent = shift({ startTime: "07:00", endTime: "15:00", breakMinutes: 30 });
    const saved = details(parent, [{ start: "2026-09-15T09:30:00Z", end: "2026-09-15T10:00:00Z" }]);
    expect(deriveCaritasDraftWorkSlices({ ...parent, revision: 2 }, saved, zone)).toEqual({
      kind: "unavailable",
      reason: "PAUSES_MISSING_OR_STALE",
    });
    expect(deriveCaritasDraftWorkSlices({ ...parent, breakMinutes: 15 }, saved, zone)).toEqual({
      kind: "unavailable",
      reason: "PAUSE_DATA_INVALID",
    });
  });

  it.each(["2026-03-29", "2026-10-25"])(
    "does not misprice the DST transition on %s as ordinary clock minutes",
    (date) => {
      const parent = shift({ date, startTime: "00:00", endTime: "06:00", breakMinutes: 0 });
      expect(deriveCaritasDraftWorkSlices(parent, details(parent, []), zone)).toEqual({
        kind: "unavailable",
        reason: "DST_TRANSITION_UNSUPPORTED",
      });
    },
  );

  it("rejects all-day and non-work entries", () => {
    const parent = shift({ type: "VACATION", allDay: true, startTime: null, endTime: null });
    expect(deriveCaritasDraftWorkSlices(parent, null, zone)).toEqual({
      kind: "unavailable",
      reason: "NOT_TIMED_WORK",
    });
  });

  it("collects a month with the previous month's night duty, but excludes the next month's minutes", () => {
    const night = shift({
      id: "august-night",
      date: "2026-08-31",
      startTime: "23:00",
      endTime: "02:00",
    });
    const day = shift({ id: "september-day", startTime: "07:00", endTime: "08:00" });
    const collected = deriveCaritasDraftMonthWorkSlices({
      month: "2026-09",
      shifts: [night, day],
      details: [details(night, []), details(day, [])],
      timeZone: zone,
      entriesComplete: true,
    });
    expect(collected).toEqual({
      kind: "confirmed-month-net-slices",
      month: "2026-09",
      workedMinutes: 180,
      slices: [
        { shiftId: night.id, date: "2026-09-01", fromMinute: 0, throughMinute: 120 },
        { shiftId: day.id, date: "2026-09-15", fromMinute: 420, throughMinute: 480 },
      ],
    });
  });

  it("does not declare a month complete with missing records, ambiguous records or overlap", () => {
    const first = shift({ id: "a", startTime: "07:00", endTime: "08:00" });
    const second = shift({ id: "b", startTime: "07:30", endTime: "08:30" });
    const base = {
      month: "2026-09",
      shifts: [first, second],
      timeZone: zone,
      entriesComplete: true,
    };
    expect(deriveCaritasDraftMonthWorkSlices({ ...base, details: [] })).toEqual({
      kind: "unavailable",
      reason: "PAUSES_MISSING_OR_STALE",
      shiftId: "a",
    });
    expect(
      deriveCaritasDraftMonthWorkSlices({
        ...base,
        details: [details(first, []), details(first, [])],
      }),
    ).toEqual({
      kind: "unavailable",
      reason: "DETAILS_AMBIGUOUS",
      shiftId: "a",
    });
    expect(
      deriveCaritasDraftMonthWorkSlices({
        ...base,
        details: [details(first, []), details(second, [])],
      }),
    ).toEqual({
      kind: "unavailable",
      reason: "WORKED_SLICES_OVERLAP",
    });
    expect(
      deriveCaritasDraftMonthWorkSlices({ ...base, details: [], entriesComplete: false }),
    ).toEqual({
      kind: "unavailable",
      reason: "ENTRIES_INCOMPLETE",
    });
  });

  it("does not silently skip a timed work category whose hours are missing", () => {
    const missing = shift({ type: "EARLY", allDay: true, startTime: null, endTime: null });
    expect(
      deriveCaritasDraftMonthWorkSlices({
        month: "2026-09",
        shifts: [missing],
        details: [],
        timeZone: zone,
        entriesComplete: true,
      }),
    ).toEqual({ kind: "unavailable", reason: "WORK_TIME_MISSING", shiftId: missing.id });
  });
});
