import { describe, expect, it } from "vitest";

import type { ShiftEntry } from "@/domain/types";
import { calculateTimedShiftMinutes } from "@/engine/working-time";

function shift(date: string, startTime: string, endTime: string, breakMinutes: number) {
  return { date, startTime, endTime, breakMinutes } satisfies Pick<
    ShiftEntry,
    "date" | "startTime" | "endTime" | "breakMinutes"
  >;
}

describe("working-time engine", () => {
  it("subtracts breaks from a same-day shift", () => {
    expect(
      calculateTimedShiftMinutes(shift("2026-07-30", "08:00", "16:12", 30), "Europe/Berlin"),
    ).toBe(462);
  });

  it("handles a regular overnight shift", () => {
    expect(
      calculateTimedShiftMinutes(shift("2026-07-30", "21:00", "07:30", 60), "Europe/Berlin"),
    ).toBe(570);
  });

  it("uses elapsed time across daylight-saving changes", () => {
    expect(
      calculateTimedShiftMinutes(shift("2026-03-28", "21:00", "07:30", 60), "Europe/Berlin"),
    ).toBe(510);
    expect(
      calculateTimedShiftMinutes(shift("2026-10-24", "21:00", "07:30", 60), "Europe/Berlin"),
    ).toBe(630);
  });
});
