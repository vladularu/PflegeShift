import { describe, expect, it } from "vitest";

import {
  accessibleChipBackgroundColor,
  chipTextColor,
} from "@/theme/color-contrast";

describe("accessible service chips", () => {
  it("keeps the label color consistently white", () => {
    expect(chipTextColor).toBe("#FFFFFF");
  });

  it("keeps dark colors and tones down bright colors only for display", () => {
    expect(accessibleChipBackgroundColor("#7E57C2")).toBe("#7E57C2");
    expect(accessibleChipBackgroundColor("#F2A93B")).not.toBe("#F2A93B");
    expect(accessibleChipBackgroundColor("transparent")).toBe("transparent");
  });
});
