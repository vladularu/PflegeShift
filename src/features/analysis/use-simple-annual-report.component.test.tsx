import { act, renderHook } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { UserProfile, ShiftEntry } from "@/domain/types";
import { DEFAULT_TVOED_WORK_PATTERN_SETTINGS } from "@/engine/simple-pay";
import { useSimpleAnnualReport } from "./use-simple-annual-report";

jest.mock("@/application/remuneration-provider", () => ({
  useRemunerationData: () => {
    throw new Error("Dated remuneration must stay inactive");
  },
}));
jest.mock("@/application/training-provider", () => ({
  useTrainingData: () => {
    throw new Error("Training forms must stay inactive");
  },
}));
jest.mock("./use-local-reference-date", () => ({ useLocalReferenceDate: () => "2026-10-04" }));
jest.mock("@/ui/schedule-idle-work", () => ({
  scheduleIdleWork: (work: () => void) => {
    const handle = setTimeout(work, 0);
    return () => clearTimeout(handle);
  },
}));
let mockYouth: boolean | null = false;
const mockRetryPreferences = jest.fn();
jest.mock("@/features/settings/check-preferences", () => ({
  useCheckPreferences: () => ({
    youthEnabled: mockYouth,
    error: mockYouth === null ? "Prüfungseinstellungen konnten nicht geladen werden." : null,
    retry: mockRetryPreferences,
  }),
}));
const profile: UserProfile = {
  federalState: "HE",
  holidayRegion: "NONE",
  weeklyMinutes: 2310,
  timeZone: "Europe/Berlin",
  tariff: null,
  manualMonthlyGrossCents: 320000,
  regularRotatingNightWork: false,
  sundayHolidayWorkEligible: true,
  allEmploymentWorkRecorded: true,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};
const input = {
  enabled: true,
  entries: [],
  profile,
  tariffDecisions: [],
  workPatternSettings: DEFAULT_TVOED_WORK_PATTERN_SETTINGS,
  year: 2026,
};
beforeEach(() => {
  mockYouth = false;
  mockRetryPreferences.mockClear();
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});
async function finish() {
  await act(async () => {
    await jest.runAllTimersAsync();
  });
}

describe("original annual salary flow", () => {
  it("calculates the old profile without a remuneration date or training settings", async () => {
    const { result } = await renderHook(() => useSimpleAnnualReport(input));
    await finish();
    expect(result.current.error).toBeNull();
    expect(result.current.report).toMatchObject({
      availablePayMonthCount: 12,
      estimatedGrossAmount: 38400,
    });
    expect(result.current.report?.remuneration).toBeUndefined();
  });
  it("recalculates after the simple salary form changes the amount", async () => {
    const { result, rerender } = await renderHook(
      ({ current }: { current: UserProfile }) =>
        useSimpleAnnualReport({ ...input, profile: current }),
      { initialProps: { current: profile } },
    );
    await finish();
    await rerender({ current: { ...profile, manualMonthlyGrossCents: 340000 } });
    await finish();
    expect(result.current.report).toMatchObject({
      availablePayMonthCount: 12,
      estimatedGrossAmount: 40800,
    });
  });
  it("does not calculate an inactive annual page", async () => {
    const { result } = await renderHook(() => useSimpleAnnualReport({ ...input, enabled: false }));
    await finish();
    expect(result.current.report).toBeNull();
  });
});

it("invalidates cached year checks on activation and preserves salary, then restores the original checks", async () => {
  const entry: ShiftEntry = {
    kind: "SHIFT",
    id: "youth",
    date: "2026-10-01",
    templateId: null,
    title: "Dienst",
    type: "LATE",
    startTime: "13:00",
    endTime: "22:00",
    breakMinutes: 60,
    color: "#123456",
    symbol: "D",
    note: null,
    overtimeMinutes: 0,
    holidayPremiumMode: "WITH_TIME_OFF",
    revision: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    deletedAt: null,
  };
  const entries = [entry];
  const screen = await renderHook(() => useSimpleAnnualReport({ ...input, entries }));
  await finish();
  const adult = screen.result.current.report;
  expect(adult).not.toBeNull();
  mockYouth = true;
  await screen.rerender({});
  expect(screen.result.current.report).toBeNull();
  await finish();
  expect(screen.result.current.report?.months[9]?.checkCounts?.legal.infoCount).toBeGreaterThan(
    adult!.months[9]!.checkCounts!.legal.infoCount,
  );
  expect(screen.result.current.report?.estimatedGrossAmount).toBe(adult?.estimatedGrossAmount);
  mockYouth = false;
  await screen.rerender({});
  await finish();
  expect(screen.result.current.report?.months[9]?.checkCounts).toEqual(
    adult!.months[9]!.checkCounts,
  );
  mockYouth = null;
  await screen.rerender({});
  expect(screen.result.current.report).toBeNull();
  expect(screen.result.current.coreReport).toBeNull();
  expect(screen.result.current.error).toContain("nicht geladen");
  await act(async () => screen.result.current.retry());
  expect(mockRetryPreferences).toHaveBeenCalled();
});
