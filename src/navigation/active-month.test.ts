import { describe, expect, it } from "vitest";

import {
  calendarTabShouldOpenToday,
  createActiveMonthCoordinator,
  requireActiveMonth,
} from "@/navigation/active-month";

describe("active month coordinator", () => {
  it("shares the latest valid month without React updates", () => {
    const coordinator = createActiveMonthCoordinator("2026-08");

    expect(coordinator.getMonth()).toBe("2026-08");
    expect(coordinator.setMonth("2027-01")).toBe("2027-01");
    expect(coordinator.getMonth()).toBe("2027-01");
  });

  it("rejects malformed and impossible months", () => {
    expect(() => requireActiveMonth("2026-8")).toThrow();
    expect(() => requireActiveMonth("2026-13")).toThrow();
  });

  it("uses Today only when the calendar tab is selected again", () => {
    expect(calendarTabShouldOpenToday(false)).toBe(false);
    expect(calendarTabShouldOpenToday(true)).toBe(true);
  });
});
