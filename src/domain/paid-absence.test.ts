import { describe, expect, it } from "vitest";
import { isCurrentPaidAbsence, validatePaidAbsence, type SavedPaidAbsence } from "./paid-absence";
import { shift, work } from "@/engine/remuneration-test-fixtures";

const entry = shift({ type: "VACATION", allDay: true, startTime: null, endTime: null });
const record: SavedPaidAbsence = {
  shiftId: entry.id,
  shiftRevision: 1,
  shiftDate: entry.date,
  shiftUpdatedAt: entry.updatedAt,
  timeZone: work.timeZone,
  paidMinutes: 462,
  revision: 1,
  confirmedAt: "2026-09-22T00:00:00Z",
  updatedAt: "2026-09-22T00:00:00Z",
};

describe("paid absence confirmation contract", () => {
  it.each([null, 0, 1, 462, 1500])(
    "preserves paid minutes %s without inventing hours",
    (paidMinutes) => {
      const value = validatePaidAbsence({ ...record, paidMinutes });
      expect(value).toEqual({ ...record, paidMinutes });
      expect(Object.isFrozen(value)).toBe(true);
      expect(isCurrentPaidAbsence(value, entry, work.timeZone)).toBe(paidMinutes !== null);
    },
  );
  it.each([
    null,
    [],
    {},
    { ...record, extra: 1 },
    { ...record, paidMinutes: undefined },
    { ...record, paidMinutes: -1 },
    { ...record, paidMinutes: 1501 },
    { ...record, paidMinutes: 1.5 },
    { ...record, paidMinutes: NaN },
    { ...record, paidMinutes: Infinity },
    { ...record, shiftId: " " },
    { ...record, shiftRevision: 0 },
    { ...record, revision: 1.5 },
    { ...record, timeZone: "+01:00" },
    { ...record, timeZone: "Invalid/Zone" },
    { ...record, shiftDate: "2026-02-30" },
    { ...record, shiftUpdatedAt: "bad" },
    { ...record, confirmedAt: "2026-09-23T00:00:00Z" },
    { ...record, shiftUpdatedAt: "2026-09-23T00:00:00Z" },
    { ...record, updatedAt: "bad" },
  ])("rejects malformed or conflicting record %#", (value) => {
    expect(() => validatePaidAbsence(value)).toThrow();
  });
  it("invalidates confirmations after revision, date, timestamp, timezone or entry-type changes", () => {
    expect(isCurrentPaidAbsence(record, entry, work.timeZone)).toBe(true);
    for (const changed of [
      { ...entry, id: "other" },
      { ...entry, revision: 2 },
      { ...entry, date: "2026-09-16" },
      { ...entry, updatedAt: "2026-09-22T00:00:00Z" },
      { ...entry, deletedAt: work.updatedAt },
      shift(),
    ])
      expect(isCurrentPaidAbsence(record, changed, work.timeZone)).toBe(false);
    expect(isCurrentPaidAbsence(record, entry, "UTC")).toBe(false);
  });
});
