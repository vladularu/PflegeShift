import { describe, expect, it } from "vitest";

import { SHIFT_TYPE_GRID_STYLE } from "@/features/day-editor/day-editor-layout";

describe("day editor layout", () => {
  it("shows every shift type without a hidden horizontal submenu", () => {
    expect(SHIFT_TYPE_GRID_STYLE).toEqual({
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    });
  });
});
