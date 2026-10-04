import { act, renderHook } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { UserProfile } from "@/domain/types";
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
