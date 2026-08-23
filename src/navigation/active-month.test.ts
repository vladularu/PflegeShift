import { describe, expect, it, vi } from "vitest";

import {
  calendarTabShouldOpenToday,
  createActiveMonthCoordinator,
  requestCalendarTodayOnReselect,
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

  it("publishes a Today request only for a focused calendar reselect", () => {
    const coordinator = createActiveMonthCoordinator("2026-08");
    const listener = vi.fn();
    const unsubscribe = coordinator.subscribeTodayRequests(listener);

    expect(requestCalendarTodayOnReselect(coordinator, false)).toBe(false);
    expect(coordinator.getTodayRequestRevision()).toBe(0);
    expect(listener).not.toHaveBeenCalled();

    expect(requestCalendarTodayOnReselect(coordinator, true)).toBe(true);
    expect(coordinator.getTodayRequestRevision()).toBe(1);
    expect(coordinator.hasPendingTodayRequest(1)).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    coordinator.requestToday();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps the newest Today request pending until it is completed", () => {
    const coordinator = createActiveMonthCoordinator("2026-08");

    const firstRevision = coordinator.requestToday();
    const secondRevision = coordinator.requestToday();

    coordinator.completeTodayRequest(firstRevision);
    expect(coordinator.hasPendingTodayRequest(secondRevision)).toBe(true);

    coordinator.completeTodayRequest(secondRevision);
    expect(coordinator.hasPendingTodayRequest(secondRevision)).toBe(false);
  });
});
