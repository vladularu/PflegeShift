import { describe, expect, it } from "vitest";

import { SHIFT_COLOR_GRID, SHIFT_COLOR_SWATCHES } from "@/theme/color-grid";
import { SHIFT_TYPE_COLORS } from "@/theme/shift-colors";
import { DEFAULT_SHIFT_SYMBOLS, isShiftSymbolId, SHIFT_SYMBOLS } from "@/theme/shift-symbols";

describe("shift appearance catalog", () => {
  it("provides a dense ten-column color grid", () => {
    expect(SHIFT_COLOR_GRID).toHaveLength(18);
    expect(SHIFT_COLOR_GRID.every((row) => row.length === 10)).toBe(true);
    expect(SHIFT_COLOR_SWATCHES.length).toBeGreaterThanOrEqual(180);
    expect(new Set(SHIFT_COLOR_SWATCHES).size).toBe(SHIFT_COLOR_SWATCHES.length);
    expect(SHIFT_COLOR_SWATCHES.every((color) => /^#[0-9A-F]{6}$/.test(color))).toBe(true);
  });

  it("uses compact persistent symbol ids and complete defaults", () => {
    expect(SHIFT_SYMBOLS.every((symbol) => symbol.id.length <= 4)).toBe(true);
    expect(Object.values(DEFAULT_SHIFT_SYMBOLS).every(isShiftSymbolId)).toBe(true);
  });

  it("uses the reference-like standard shift colors", () => {
    expect(SHIFT_TYPE_COLORS).toMatchObject({
      EARLY: "#59CA50",
      LATE: "#E74C55",
      NIGHT: "#FFA338",
      DAY: "#25A3B9",
      TRAINING: "#347ED1",
      VACATION: "#929292",
      SICK: "#F09A3E",
    });
  });
});
