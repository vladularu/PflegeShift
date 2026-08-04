import { act, renderHook } from "@testing-library/react-native";
import { afterEach, describe, expect, it, jest } from "@jest/globals";

import type { ShiftEntry, UserProfile } from "@/domain/types";
import { useDeferredMonthlyCompliance } from "@/features/analysis/use-monthly-compliance";

jest.mock("@/features/analysis/use-local-reference-date", () => ({
  useLocalReferenceDate: () => "2026-08-04",
}));

const PROFILE: UserProfile = {
  federalState: "NW",
  weeklyMinutes: 2_400,
  timeZone: "Europe/Berlin",
  tariff: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function shift(id: string, endTime: string): ShiftEntry {
  return {
    kind: "SHIFT",
    id,
    date: "2026-08-03",
    templateId: null,
    title: id,
    type: "DAY",
    startTime: "06:00",
    endTime,
    breakMinutes: 30,
    color: "#2F80ED",
    symbol: "D",
    note: null,
    overtimeMinutes: 0,
    holidayPremiumMode: "WITH_TIME_OFF",
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  };
}

describe("useDeferredMonthlyCompliance", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("finishes outside the render phase and commits the requested result", async () => {
    jest.useFakeTimers();
    const shifts = [shift("long", "18:30")];
    const screen = await renderHook(() =>
      useDeferredMonthlyCompliance({
        enabled: true,
        month: "2026-08",
        profile: PROFILE,
        shifts,
      }),
    );

    expect(screen.result.current.result).toBeNull();
    await act(async () => {
      jest.runAllTimers();
    });
    expect(screen.result.current.result?.criticalCount).toBeGreaterThan(0);
  });

  it("cancels stale work when the input changes", async () => {
    jest.useFakeTimers();
    const first = [shift("long", "18:30")];
    const second = [shift("normal", "14:00")];
    const screen = await renderHook(
      ({ shifts }: { readonly shifts: readonly ShiftEntry[] }) =>
        useDeferredMonthlyCompliance({
          enabled: true,
          month: "2026-08",
          profile: PROFILE,
          shifts,
        }),
      { initialProps: { shifts: first } },
    );

    await act(async () => {
      jest.advanceTimersToNextTimer();
    });
    await screen.rerender({ shifts: second });
    await act(async () => {
      jest.runAllTimers();
    });

    expect(screen.result.current.result?.criticalCount).toBe(0);
  });
});
