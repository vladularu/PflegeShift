import { describe, expect, it } from "vitest";

import { SHIFT_TYPE_SCROLL_BEHAVIOR } from "@/features/day-editor/day-editor-layout";

describe("day editor layout", () => {
  it("keeps horizontally hidden shift types discoverable", () => {
    expect(SHIFT_TYPE_SCROLL_BEHAVIOR).toEqual({
      persistentScrollbar: true,
      showsHorizontalScrollIndicator: true,
    });
  });
});
