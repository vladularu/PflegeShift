import { describe, expect, it } from "vitest";

import type { ShiftEntry, UserProfile } from "@/domain/types";
import {
  calculateMonthlySummary,
  calculateMonthlyTargetMinutes,
} from "@/engine/monthly-summary";

const profile = {
  federalState: "NW",
  weeklyMinutes: 2_310,
  timeZone: "Europe/Berlin",
} satisfies Pick<UserProfile, "federalState" | "weeklyMinutes" | "timeZone">;

function entry(overrides: Partial<ShiftEntry> & Pick<ShiftEntry, "id" | "date" | "type">): ShiftEntry {
  const absence = ["VACATION", "SICK", "FREE"].includes(overrides.type);
  return {
    kind: "SHIFT",
    templateId: null,
    title: overrides.type,
    startTime: absence ? null : "08:00",
    endTime: absence ? null : "16:00",
    breakMinutes: absence ? 0 : 30,
    color: "#2F80ED",
    symbol: "D",
    note: null,
    overtimeMinutes: 0,
    holidayPremiumMode: "WITH_TIME_OFF",
    revision: 1,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

describe("monthly summary", () => {
  it("calculates target hours from weekdays minus public holidays", () => {
    expect(calculateMonthlyTargetMinutes("2026-05", profile)).toBe(8_316);
  });

  it("separates work, training, absence credit and free entries", () => {
    const summary = calculateMonthlySummary(
      "2026-07",
      [
        entry({ id: "work", date: "2026-07-01", type: "DAY" }),
        entry({ id: "training", date: "2026-07-02", type: "TRAINING" }),
        entry({ id: "vacation", date: "2026-07-03", type: "VACATION" }),
        entry({ id: "sick", date: "2026-07-04", type: "SICK" }),
        entry({ id: "free", date: "2026-07-05", type: "FREE" }),
        entry({ id: "deleted", date: "2026-07-06", type: "DAY", deletedAt: "2026-07-07T00:00:00.000Z" }),
      ],
      profile,
    );

    expect(summary.work).toEqual({ minutes: 450, entryCount: 1 });
    expect(summary.training).toEqual({ minutes: 450, entryCount: 1 });
    expect(summary.vacation).toEqual({ minutes: 462, entryCount: 1 });
    expect(summary.sick).toEqual({ minutes: 462, entryCount: 1 });
    expect(summary.free).toEqual({ minutes: 0, entryCount: 1 });
    expect(summary.actualMinutes).toBe(1_824);
  });
});
