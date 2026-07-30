import { describe, expect, it } from "vitest";

import {
  appendMonths,
  createMonthWindow,
  prependMonths,
} from "@/features/calendar/month-window";

describe("continuous calendar month window", () => {
  it("starts with twelve past and twenty-four future months", () => {
    const months = createMonthWindow("2026-07", 12, 24);
    expect(months).toHaveLength(37);
    expect(months[0]).toBe("2025-07");
    expect(months[12]).toBe("2026-07");
    expect(months.at(-1)).toBe("2028-07");
  });

  it("extends in both directions without duplicates", () => {
    const initial = createMonthWindow("2026-07", 1, 1);
    expect(prependMonths(initial, 2)).toEqual([
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
    expect(appendMonths(initial, 2)).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
  });
});
