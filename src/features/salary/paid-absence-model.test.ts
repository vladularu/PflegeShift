import { describe, expect, it } from "vitest";
import type { SavedPaidAbsence } from "@/domain/paid-absence";
import { shift, work } from "@/engine/remuneration-test-fixtures";
import {
  paidAbsenceEntries,
  paidAbsenceField,
  paidTimeText,
  preparePaidAbsence,
} from "./paid-absence-model";

const entry = shift({
  type: "VACATION",
  title: "Urlaub",
  allDay: true,
  startTime: null,
  endTime: null,
});
const record: SavedPaidAbsence = {
  shiftId: entry.id,
  shiftRevision: entry.revision,
  shiftDate: entry.date,
  shiftUpdatedAt: entry.updatedAt,
  timeZone: work.timeZone,
  paidMinutes: 462,
  revision: 2,
  confirmedAt: work.updatedAt,
  updatedAt: work.updatedAt,
};
describe("paid absence form model", () => {
  it("lists only active absences of the selected month without inventing paid hours", () => {
    const working = shift({ id: "work" });
    const deleted = { ...entry, id: "deleted", deletedAt: work.updatedAt };
    const outside = { ...entry, id: "outside", date: "2026-08-31" };
    expect(paidAbsenceEntries("2026-09", [working, deleted, outside, entry])).toEqual([entry]);
    expect(paidAbsenceField(entry, work.timeZone, null)).toBe("");
    expect(() => paidAbsenceEntries("2026-13", [entry])).toThrow();
  });
  it.each(["VACATION", "SICK", "FREE", "TRAINING"] as const)(
    "allows explicit time for %s without assuming eight hours",
    (type) => {
      const absent = { ...entry, type, allDay: false };
      expect(paidAbsenceEntries("2026-09", [absent])).toEqual([absent]);
      expect(paidAbsenceField(absent, work.timeZone, null)).toBe("");
    },
  );
  it.each([
    ["7:42", 462],
    ["0:00", 0],
    ["25:00", 1500],
    [" 01:01 ", 61],
  ])("parses %s as %s minutes", (text, minutes) => {
    expect(preparePaidAbsence(entry, work.timeZone, record, String(text))).toEqual({
      shiftId: entry.id,
      expectedShiftRevision: entry.revision,
      expectedShiftDate: entry.date,
      expectedShiftUpdatedAt: entry.updatedAt,
      timeZone: work.timeZone,
      expectedRevision: 2,
      paidMinutes: minutes,
    });
    expect(
      preparePaidAbsence(entry, work.timeZone, null, paidTimeText(Number(minutes))).paidMinutes,
    ).toBe(minutes);
  });
  it.each(["", "7,42", "7.7", "7:60", "7:4", "1e3", "-1:00", "25:01", "26:00", "7:42 h"])(
    "rejects ambiguous or invalid %s",
    (text) => {
      expect(() => preparePaidAbsence(entry, work.timeZone, null, text)).toThrow("Stunden:Minuten");
    },
  );
  it("distinguishes zero from explicit revocation", () => {
    expect(preparePaidAbsence(entry, work.timeZone, record, null).paidMinutes).toBeNull();
    expect(paidAbsenceField(entry, work.timeZone, { ...record, paidMinutes: null })).toBe("");
    expect(paidAbsenceField(entry, work.timeZone, { ...record, paidMinutes: 0 })).toBe("0:00");
  });
  it.each([
    { shiftRevision: 9 },
    { shiftDate: "2026-09-14" },
    { shiftUpdatedAt: "2026-09-01T00:00:00Z" },
    { timeZone: "Europe/London" },
  ])("does not silently reuse stale confirmation %j", (change) => {
    expect(paidAbsenceField(entry, work.timeZone, { ...record, ...change })).toBe("");
  });
  it("rejects a different parent, deleted absence or ordinary work entry", () => {
    expect(() =>
      preparePaidAbsence(entry, work.timeZone, { ...record, shiftId: "other" }, "1:00"),
    ).toThrow("anderen Eintrag");
    expect(() =>
      preparePaidAbsence({ ...entry, deletedAt: work.updatedAt }, work.timeZone, record, "1:00"),
    ).toThrow("aktive Abwesenheit");
    expect(() => preparePaidAbsence(shift(), work.timeZone, null, "1:00")).toThrow(
      "aktive Abwesenheit",
    );
  });
});
