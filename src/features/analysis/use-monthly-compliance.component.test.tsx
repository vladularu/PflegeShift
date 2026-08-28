import { act, renderHook } from "@testing-library/react-native";
import { afterEach, describe, expect, it, jest } from "@jest/globals";

import type { ShiftEntry, UserProfile } from "@/domain/types";
import { useDeferredMonthlyCompliance } from "@/features/analysis/use-monthly-compliance";
import { bundledRuleResolver, type RuleResolver } from "@/rules/rule-resolver";

jest.mock("@/features/analysis/use-local-reference-date", () => ({
  useLocalReferenceDate: () => "2026-08-04",
}));

const PROFILE: UserProfile = {
  federalState: "NW",
  holidayRegion: "NONE",
  weeklyMinutes: 2_400,
  timeZone: "Europe/Berlin",
  regularRotatingNightWork: false,
  sundayHolidayWorkEligible: true,
  allEmploymentWorkRecorded: true,
  tariff: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const LENIENT_RESOLVER: RuleResolver = Object.freeze({
  ...bundledRuleResolver,
  resolveLegal: (effectiveDate: string) => {
    const resolved = bundledRuleResolver.resolveLegal(effectiveDate);
    if (!resolved.ok) return resolved;
    return {
      ok: true as const,
      value: {
        ...resolved.value,
        rules: {
          ...resolved.value.rules,
          workingTime: {
            ...resolved.value.rules.workingTime,
            maxDailyMinutes: 1_440,
          },
        },
      },
    };
  },
});

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

  it("does not commit work produced for a previous resolver snapshot", async () => {
    jest.useFakeTimers();
    const shifts = [shift("long", "18:30")];
    const screen = await renderHook(
      ({ ruleResolver }: { readonly ruleResolver: RuleResolver }) =>
        useDeferredMonthlyCompliance({
          enabled: true,
          month: "2026-08",
          profile: PROFILE,
          ruleResolver,
          shifts,
        }),
      { initialProps: { ruleResolver: bundledRuleResolver } },
    );

    await act(async () => {
      jest.advanceTimersToNextTimer();
    });
    await screen.rerender({ ruleResolver: LENIENT_RESOLVER });
    await act(async () => {
      jest.runAllTimers();
    });

    expect(
      screen.result.current.result?.issues.some((issue) => issue.rule === "ARBZG_3_MAX_10H"),
    ).toBe(false);
  });
});
