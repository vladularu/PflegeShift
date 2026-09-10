import { describe, expect, it } from "vitest";
import { createMonthGrid } from "@/engine/calendar";
import { buildCalendarMorphPlan, type MeasuredCalendarMorphNode } from "./calendar-morph-geometry";

const viewport = { x: 10, y: 150, width: 420, height: 700 };
function nodes(month: string): MeasuredCalendarMorphNode[] {
  const base = {
    month,
    fontSize: 10,
    color: "white",
    mutedColor: "gray",
    today: month + "-06",
    todayColor: "black",
    todayBackground: "pink",
  };
  return [
    { ...base, kind: "MINI", rect: { x: 290, y: 440, width: 124, height: 126 } },
    ...createMonthGrid(month).flatMap((cell, index): MeasuredCalendarMorphNode[] =>
      cell.inMonth
        ? [
            {
              ...base,
              kind: "DAY",
              date: cell.date,
              fontSize: 17,
              rect: {
                x: 15 + (index % 7) * 60,
                y: 185 + Math.floor(index / 7) * 100,
                width: 30,
                height: 30,
              },
            },
          ]
        : [],
    ),
  ];
}

describe("measured calendar morph geometry", () => {
  it.each(["2026-01", "2026-09", "2026-12", "2028-02"])("matches every date for %s", (month) => {
    const input = nodes(month);
    const result = buildCalendarMorphPlan(month, input, viewport);
    expect(result).not.toBeNull();
    expect(result!.days.map((day) => day.date)).toEqual(
      createMonthGrid(month)
        .filter((cell) => cell.inMonth)
        .map((cell) => cell.date),
    );
    const today = result!.days.find((day) => day.day === 6)!;
    expect(today.background).toBe("pink");
    expect(today.targetBackground).toBe("pink");
  });

  it("tracks the real year scroll position instead of deriving a position from the month index", () => {
    const input = nodes("2026-09");
    const before = buildCalendarMorphPlan("2026-09", input, viewport)!;
    const after = buildCalendarMorphPlan(
      "2026-09",
      input.map((node) =>
        node.kind === "MINI" ? { ...node, rect: { ...node.rect, y: node.rect.y - 170 } } : node,
      ),
      viewport,
    )!;
    expect(after.days[0].from.y).toBe(before.days[0].from.y - 170);
    expect(after.days[0].to).toEqual(before.days[0].to);
  });

  it("rejects missing days, invalid measurements and a pager that has not reached its destination", () => {
    const input = nodes("2026-01");
    expect(buildCalendarMorphPlan("2026-01", input.slice(0, -1), viewport)).toBeNull();
    expect(buildCalendarMorphPlan("2026-01", input, { ...viewport, width: 0 })).toBeNull();
    expect(
      buildCalendarMorphPlan(
        "2026-01",
        input.map((node) =>
          node.kind === "DAY" ? { ...node, rect: { ...node.rect, y: node.rect.y + 800 } } : node,
        ),
        viewport,
      ),
    ).toBeNull();
  });
});
