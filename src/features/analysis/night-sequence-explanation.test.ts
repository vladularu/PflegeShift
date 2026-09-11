import { describe, expect, it } from "vitest";
import type { ShiftEntry } from "@/domain/types";
import { explainNightSequence } from "./night-sequence-explanation";

function shift(date: string, overrides: Partial<ShiftEntry> = {}): ShiftEntry {
  return {
    id: date,
    kind: "SHIFT",
    date,
    templateId: null,
    title: "Dienst",
    type: "NIGHT",
    startTime: "21:00",
    endTime: "07:00",
    breakMinutes: 60,
    color: "#000000",
    symbol: "N",
    note: null,
    overtimeMinutes: 0,
    holidayPremiumMode: "WITH_TIME_OFF",
    revision: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    deletedAt: null,
    ...overrides,
  };
}
const sequence = [shift("2026-07-02"), shift("2026-07-23"), shift("2026-07-24")];
const explain = (entries: readonly ShiftEntry[] = sequence, month = "2026-07") =>
  explainNightSequence(entries, month, "Europe/Berlin");

describe("simple calendar-based night explanation", () => {
  it("recognizes normal hospital nights without asking for pause times", () => {
    expect(explain()).toMatchObject({
      dates: sequence.map((item) => item.date),
      deadline: "2026-08-03",
      uncertain: false,
    });
  });
  it("uses working times rather than the template title or NIGHT label", () => {
    expect(
      explain(sequence.map((item) => ({ ...item, type: "CUSTOM", title: "Mein Dienst" }))).dates,
    ).toHaveLength(3);
    expect(
      explain(sequence.map((item) => ({ ...item, startTime: "08:00", endTime: "16:00" }))).dates,
    ).toEqual([]);
  });
  it("includes following-month entries through the complete deadline day", () => {
    expect(explain([sequence[0], sequence[1], shift("2026-08-03")]).dates).toHaveLength(3);
    expect(explain([sequence[0], sequence[1], shift("2026-08-04")]).dates).toEqual([]);
  });
  it("includes previous-year anchors for January", () => {
    expect(
      explain([shift("2026-12-20"), shift("2027-01-02"), shift("2027-01-03")], "2027-01").dates,
    ).toHaveLength(3);
  });
  it("does not show a sequence wholly outside the selected month", () => {
    expect(explain([shift("2026-06-02"), shift("2026-06-03"), shift("2026-06-04")]).dates).toEqual(
      [],
    );
  });
  it("finds a selected-month follow-up even if earlier candidates also exist", () => {
    expect(
      explain([shift("2026-06-20"), shift("2026-06-21"), shift("2026-06-22"), shift("2026-07-01")])
        .dates,
    ).toContain("2026-07-01");
  });
  it("keeps pause-sensitive qualification uncertain", () => {
    const entries = sequence.map((item) => ({
      ...item,
      startTime: "20:00",
      endTime: "23:00",
      breakMinutes: 30,
    }));
    expect(explain(entries)).toMatchObject({ dates: [], uncertain: true });
  });
  it.each([119, 120])("handles the %s-minute qualification boundary", (minutes) => {
    const entries = sequence.map((item) => ({
      ...item,
      startTime: "21:00",
      endTime: minutes === 119 ? "22:59" : "23:00",
      breakMinutes: 0,
    }));
    expect(explain(entries).dates).toHaveLength(minutes === 120 ? 3 : 0);
  });
  it.each(["2026-03-28", "2026-10-24"])("handles a full overnight shift across DST: %s", (date) => {
    const month = date.slice(0, 7);
    const entries = [shift(`${month}-02`), shift(`${month}-03`), shift(date)];
    expect(explain(entries, month).dates).toHaveLength(3);
  });
  it("does not guess a duplicated local time during autumn DST", () => {
    expect(explain([shift("2026-10-25", { startTime: "02:30" })], "2026-10").uncertain).toBe(true);
  });
  it("does not guess a nonexistent local time during spring DST", () => {
    expect(explain([shift("2026-03-29", { startTime: "02:30" })], "2026-03").uncertain).toBe(true);
  });
  it("never converts vacation or sickness into worked nights", () => {
    expect(
      explain([
        sequence[0],
        shift("2026-07-23", { type: "VACATION", allDay: true }),
        shift("2026-07-24", { type: "SICK", allDay: true }),
      ]),
    ).toMatchObject({ dates: [], hasAbsence: true });
  });
  it("keeps deletion and edits fresh without a cached result", () => {
    expect(
      explain(sequence.map((item, i) => (i === 2 ? { ...item, deletedAt: item.updatedAt } : item)))
        .dates,
    ).toEqual([]);
    expect(
      explain(
        sequence.map((item, i) =>
          i === 2 ? { ...item, startTime: "08:00", endTime: "16:00" } : item,
        ),
      ).dates,
    ).toEqual([]);
    expect(explain().dates).toHaveLength(3);
  });
  it("does not infer a failed allowance claim from an empty calendar", () => {
    expect(explain([]).title).toBe("Noch keine passende Nachtdienstfolge erkennbar");
    expect(explain([])).not.toHaveProperty("allowanceStatus");
  });
  it.each([-1, 9999, Number.NaN])(
    "treats invalid pause duration as uncertainty: %s",
    (breakMinutes) => {
      expect(explain([shift("2026-07-02", { breakMinutes }), ...sequence.slice(1)])).toMatchObject({
        dates: [],
        uncertain: true,
      });
    },
  );
  it("does not use overlapping or duplicate entries as two nights", () => {
    expect(explain([...sequence, sequence[0]])).toMatchObject({ dates: [], uncertain: true });
    expect(explain([...sequence, { ...sequence[0], id: "other" }]).dates).toEqual([]);
  });
  it("ignores unrelated years, deleted absences and all-day entries", () => {
    expect(
      explain([
        ...sequence,
        shift("2027-07-02", { breakMinutes: -1 }),
        shift("2026-07-10", { type: "SICK", deletedAt: "2026-07-11T00:00:00Z" }),
        shift("2026-07-11", { allDay: true }),
      ]),
    ).toMatchObject({ dates: sequence.map((item) => item.date), hasAbsence: false });
  });
  it("is immutable and independent of entry order", () => {
    const frozen = Object.freeze([...sequence].reverse().map((item) => Object.freeze(item)));
    const before = JSON.stringify(frozen);
    expect(explain(frozen)).toEqual(explain());
    expect(JSON.stringify(frozen)).toBe(before);
    expect(Object.isFrozen(explain().dates)).toBe(true);
  });
});
