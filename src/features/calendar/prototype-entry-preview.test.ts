import { describe, expect, it } from "vitest";
import type { CalendarEntry } from "@/domain/types";
import { prototypeEntryPreview } from "./prototype-entry-preview";

const shift: CalendarEntry = {
  kind: "SHIFT",
  id: "shift",
  date: "2026-01-01",
  templateId: null,
  title: "Früh",
  type: "EARLY",
  startTime: "07:00",
  endTime: "15:00",
  breakMinutes: 30,
  color: "#123456",
  symbol: "F",
  note: null,
  overtimeMinutes: 0,
  holidayPremiumMode: "WITH_TIME_OFF",
  revision: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  deletedAt: null,
};
describe("bounded prototype preview", () => {
  it("shows a fitting two-line shift without reserving a needless overflow row", () => {
    expect(prototypeEntryPreview([shift], 2, true)).toEqual({ entries: [shift], overflowCount: 0 });
  });
  it("reserves overflow for dense days and handles zero space", () => {
    const entries = Array.from({ length: 20 }, (_, i) => ({ ...shift, id: String(i) }));
    expect(prototypeEntryPreview(entries, 3, true)).toEqual({
      entries: [entries[0]],
      overflowCount: 19,
    });
    expect(prototypeEntryPreview(entries, 0, true)).toEqual({ entries: [], overflowCount: 20 });
    expect(prototypeEntryPreview([shift], 1, false).entries).toHaveLength(1);
  });
});
