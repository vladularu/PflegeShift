import { describe, expect, it } from "vitest";

import { addMonths, createMonthGrid, monthRange } from "@/engine/calendar";

describe("calendar engine", () => {
  it("builds a Monday-first six-week grid", () => {
    const grid = createMonthGrid("2026-07");
    expect(grid).toHaveLength(42);
    expect(grid[0]).toMatchObject({ date: "2026-06-29", inMonth: false });
    expect(grid.find((cell) => cell.date === "2026-07-01")).toMatchObject({
      day: 1,
      inMonth: true,
    });
  });

  it("handles leap years and month arithmetic", () => {
    expect(monthRange("2028-02")).toEqual({
      start: "2028-02-01",
      end: "2028-02-29",
    });
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });
});
