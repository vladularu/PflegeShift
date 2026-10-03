import { describe, expect, it } from "vitest";
import { service, work } from "./training-test-fixtures";
import { youthBlockShiftBinding } from "./youth-block-binding";

describe("school-block extra-training confirmation binding", () => {
  it("ties a confirmation to the exact shift, timezone and saved pauses", () => {
    const { entry, details } = service("2026-09-17", "14:00", "16:00", []);
    const binding = youthBlockShiftBinding(entry, details, work.timeZone);
    expect(binding).toContain("youth-block-v1");
    expect(binding).not.toBe(entry.id);
    expect(
      youthBlockShiftBinding({ ...entry, revision: entry.revision + 1 }, details, work.timeZone),
    ).toBeNull();
    expect(youthBlockShiftBinding(entry, details, "Europe/Paris")).toBeNull();
    expect(
      youthBlockShiftBinding(entry, { ...details, revision: details.revision + 1 }, work.timeZone),
    ).not.toBe(binding);
    expect(
      youthBlockShiftBinding(
        entry,
        {
          ...details,
          data: {
            ...details.data,
            pauses: [{ start: "2026-09-17T14:30:00Z", end: "2026-09-17T14:45:00Z" }],
          },
        },
        work.timeZone,
      ),
    ).not.toBe(binding);
  });

  it("refuses unknown pauses, school/exam classification and deleted work", () => {
    const { entry, details } = service("2026-09-17", "14:00", "16:00", []);
    expect(
      youthBlockShiftBinding(
        entry,
        { ...details, data: { ...details.data, pauses: null } },
        work.timeZone,
      ),
    ).toBeNull();
    expect(
      youthBlockShiftBinding(
        entry,
        {
          ...details,
          data: {
            ...details.data,
            school: {
              lessons: [],
              block: null,
              travelToWorkMinutes: 0,
              travelFromWorkMinutes: 0,
            },
          },
        },
        work.timeZone,
      ),
    ).toBeNull();
    expect(
      youthBlockShiftBinding({ ...entry, deletedAt: work.updatedAt }, details, work.timeZone),
    ).toBeNull();
  });
});
