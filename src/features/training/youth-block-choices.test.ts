import { describe, expect, it } from "vitest";
import { service } from "@/engine/youth-test-fixtures";
import { work } from "@/engine/remuneration-test-fixtures";
import { youthBlockTrainingChoices } from "./youth-block-choices";

const school = service("2026-09-14", "08:00", "13:00", [], true);
school.details = {
  ...school.details,
  data: {
    ...school.details.data,
    school: {
      lessons: [{ start: "2026-09-14T06:00:00Z", end: "2026-09-14T11:00:00Z" }],
      travelToWorkMinutes: 0,
      travelFromWorkMinutes: 0,
      block: { startDate: "2026-09-14", endDate: "2026-09-18" },
    },
  },
};
const extra = service("2026-09-17", "14:00", "16:00", []);
const outside = service("2026-09-21", "14:00", "16:00", []);
const choices = (
  entries = [school.entry, extra.entry, outside.entry],
  details = [school.details, extra.details, outside.details],
  from = "01.09.2026",
  next: string | null = null,
) => youthBlockTrainingChoices(entries, details, work.timeZone, from, next);

describe("school-block candidate selection", () => {
  it("shows only a current timed work shift inside the recorded block and profile", () => {
    expect(choices().map((choice) => choice.shift.id)).toEqual([extra.entry.id]);
    expect(choices(undefined, undefined, "18.09.2026")).toEqual([]);
    expect(choices(undefined, undefined, "01.09.2026", "2026-09-17")).toEqual([]);
  });
  it("does not offer changed work, unknown pauses, changed school or ambiguous rows", () => {
    expect(
      choices([school.entry, { ...extra.entry, revision: extra.entry.revision + 1 }]).length,
    ).toBe(0);
    expect(
      choices(undefined, [
        school.details,
        { ...extra.details, data: { ...extra.details.data, pauses: null } },
      ]).length,
    ).toBe(0);
    expect(
      choices(undefined, [
        { ...school.details, shiftRevision: school.details.shiftRevision + 1 },
        extra.details,
      ]).length,
    ).toBe(0);
    expect(choices(undefined, [school.details, extra.details, extra.details]).length).toBe(0);
  });
});
