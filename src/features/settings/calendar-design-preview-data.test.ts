import { describe, expect, it } from "vitest";
import { calendarDesignPreviewData } from "./calendar-design-preview-data";
import { buildCalendarEntryIndex } from "@/features/calendar/calendar-entry-index";
import { createMonthGrid } from "@/engine/calendar";
import type { ShiftTemplate } from "@/domain/types";

describe("calendar design examples", () => {
  it.each(Array.from({ length: 12 }, (_, index) => `2026-${String(index + 1).padStart(2, "0")}`))(
    "keeps every example in the visible two weeks of %s",
    (month) => {
      const examples = calendarDesignPreviewData(month, [], []);
      const visible = createMonthGrid(month)
        .slice(0, 14)
        .map((item) => item.date);
      for (const entry of examples.entries) expect(visible).toContain(entry.date);
      for (const day of examples.holidays.keys()) expect(visible).toContain(day);
      expect(examples.entries.filter((entry) => entry.kind === "SHIFT")).toHaveLength(5);
      expect(
        examples.entries.some((entry) => entry.kind === "SHIFT" && entry.type === "VACATION"),
      ).toBe(true);
      expect(examples.entries.some((entry) => entry.kind === "APPOINTMENT")).toBe(true);
      expect(examples.holidays.size).toBe(1);
    },
  );
  it("uses saved template colors and symbols without modifying the templates or plan", () => {
    const template: ShiftTemplate = {
      id: "mine",
      name: "Mein Frühdienst",
      type: "EARLY",
      startTime: "07:00",
      endTime: "15:00",
      breakMinutes: 30,
      color: "#7E57C2",
      symbol: "star",
      sortOrder: 1,
      revision: 4,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
      deletedAt: null,
    };
    const templates = [Object.freeze(template)];
    const existing = Object.freeze(calendarDesignPreviewData("2026-08", [], []).entries);
    const before = JSON.stringify({ templates, existing });
    const examples = calendarDesignPreviewData("2026-10", templates, existing);
    expect(examples.entries[0]).toMatchObject({
      color: template.color,
      symbol: template.symbol,
      title: "Früh",
      date: "2026-10-01",
    });
    expect(JSON.stringify({ templates, existing })).toBe(before);
    expect(examples.entries).not.toBe(existing);
    expect(examples.entries.every((entry) => entry.id.startsWith("calendar-design-example"))).toBe(
      true,
    );
  });
  it("applies the actual calendar index filters to services and appointments independently", () => {
    const examples = calendarDesignPreviewData("2026-10", [], []);
    expect(
      buildCalendarEntryIndex(examples.entries, { showShifts: false, showAppointments: true })
        .entriesByDate.size,
    ).toBe(1);
    expect(
      buildCalendarEntryIndex(examples.entries, { showShifts: true, showAppointments: false })
        .entriesByDate.size,
    ).toBe(5);
    expect(
      buildCalendarEntryIndex(examples.entries, { showShifts: false, showAppointments: false })
        .entriesByDate.size,
    ).toBe(0);
  });
});
