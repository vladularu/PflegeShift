import { describe, expect, it } from "vitest";

import { holidayShortLabel } from "@/features/calendar/holiday-label";

describe("holiday calendar labels", () => {
  it("uses readable German abbreviations for long holiday names", () => {
    expect(holidayShortLabel("Tag der Deutschen Einheit")).toBe("Tag d. Einheit");
    expect(holidayShortLabel("Christi Himmelfahrt")).toBe("Chr. Himm.");
    expect(holidayShortLabel("1. Weihnachtstag")).toBe("1. Weihn.");
  });

  it("keeps short names and safely truncates unknown long names", () => {
    expect(holidayShortLabel("Neujahr")).toBe("Neujahr");
    expect(holidayShortLabel("Ein sehr langer Sonderfeiertag")).toBe("Ein sehr l…");
  });
});
