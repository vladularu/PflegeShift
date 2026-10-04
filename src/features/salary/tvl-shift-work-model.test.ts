import { describe, expect, it } from "vitest";
import { tvlProfile, tvlSaturday } from "@/engine/tvl-shift-work-test-fixtures";
import { history, work } from "@/engine/remuneration-test-fixtures";
import { tvlShiftWorkChoices } from "./tvl-shift-work-model";

describe("TV-L service selection", () => {
  it("keeps actual care entry available when estimated pause placement consumes one profile day", () => {
    const entry = { ...tvlSaturday, startTime: "23:59", endTime: "01:00", breakMinutes: 60 };
    const next = { ...tvlProfile(), effectiveFrom: "2026-09-20" };
    const choices = tvlShiftWorkChoices("2026-09", [entry], [tvlProfile(), next], work.timeZone);
    expect(choices.map((c) => c.dates)).toEqual([["2026-09-19"], ["2026-09-20"]]);
  });
  it("requires an explicit dated TV-L profile, never a shift title or old TVöD profile", () => {
    for (const profiles of [[], [history()], [{ ...tvlProfile(), effectiveFrom: null }]]) {
      expect(tvlShiftWorkChoices("2026-09", [tvlSaturday], profiles, work.timeZone)).toEqual([]);
    }
    expect(
      tvlShiftWorkChoices("2026-09", [tvlSaturday], [tvlProfile()], work.timeZone),
    ).toHaveLength(1);
  });
  it("excludes tombstones, all-day entries, absences and other months", () => {
    const entries = [
      { ...tvlSaturday, id: "deleted", deletedAt: work.updatedAt },
      { ...tvlSaturday, id: "all-day", allDay: true },
      { ...tvlSaturday, id: "vacation", type: "VACATION" as const },
      { ...tvlSaturday, id: "other", date: "2026-10-19" },
    ];
    expect(tvlShiftWorkChoices("2026-09", entries, [tvlProfile()], work.timeZone)).toEqual([]);
  });
  it("includes a preceding-month shift only for the actual current-month profile", () => {
    const entry = { ...tvlSaturday, date: "2026-08-31", startTime: "23:00", endTime: "01:00" };
    const next = { ...tvlProfile(), effectiveFrom: "2026-09-01" };
    const choices = tvlShiftWorkChoices("2026-09", [entry], [tvlProfile(), next], work.timeZone);
    expect(choices).toHaveLength(1);
    expect(choices[0].dates).toEqual(["2026-09-01"]);
    expect(choices[0].profile).toBe(next);
  });
  it("offers separate confirmations for profile periods crossed during one service", () => {
    const entry = { ...tvlSaturday, startTime: "23:00", endTime: "01:00" };
    const next = { ...tvlProfile(), effectiveFrom: "2026-09-20" };
    const choices = tvlShiftWorkChoices("2026-09", [entry], [tvlProfile(), next], work.timeZone);
    expect(choices.map((c) => c.dates)).toEqual([["2026-09-19"], ["2026-09-20"]]);
    expect(new Set(choices.map((c) => c.key)).size).toBe(2);
    expect(tvlShiftWorkChoices("2026-09", [entry], [tvlProfile()], work.timeZone)[0].dates).toEqual(
      ["2026-09-19", "2026-09-20"],
    );
  });
  it("rejects invalid route months", () => {
    expect(() => tvlShiftWorkChoices("2026-13", [], [], work.timeZone)).toThrow();
  });
});
