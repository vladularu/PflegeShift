import { describe, expect, it } from "vitest";

import { shiftOverlapsHoliday } from "@/features/day-editor/holiday-premium";
import {
  BUNDLED_HOLIDAY_RULES,
  BUNDLED_LEGAL_RULES,
  BUNDLED_TARIFF_RULES,
} from "@/rules/bundled-rules";
import { createRuleResolver } from "@/rules/rule-resolver";

function resolverWithoutChristmasDay() {
  const holidayPackage = BUNDLED_HOLIDAY_RULES[0];
  return createRuleResolver({
    tariff: BUNDLED_TARIFF_RULES,
    legal: BUNDLED_LEGAL_RULES,
    holiday: [
      {
        ...holidayPackage,
        rules: {
          ...holidayPackage.rules,
          holidays: holidayPackage.rules.holidays.filter(
            (holiday) => holiday.id !== "christmas-day",
          ) as typeof holidayPackage.rules.holidays,
        },
      },
    ],
  });
}

describe("holiday premium overlap", () => {
  it("detects a shift directly on a public holiday", () => {
    expect(shiftOverlapsHoliday("2026-12-25", "08:00", "16:00", "NW")).toBe(true);
  });

  it("detects an overnight shift ending on a public holiday", () => {
    expect(shiftOverlapsHoliday("2026-12-24", "21:00", "07:00", "NW")).toBe(true);
  });

  it("ignores an ordinary day", () => {
    expect(shiftOverlapsHoliday("2026-12-23", "08:00", "16:00", "NW")).toBe(false);
  });

  it("uses the injected resolver for holiday overlap", () => {
    expect(
      shiftOverlapsHoliday("2026-12-25", "08:00", "16:00", "NW", resolverWithoutChristmasDay()),
    ).toBe(false);
    expect(shiftOverlapsHoliday("2026-12-25", "08:00", "16:00", "NW")).toBe(true);
  });
});
