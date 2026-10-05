import { calculateMonthlyAnalysis } from "@/features/analysis/monthly-analysis";
import { selectTvlKrAssessmentShifts } from "./simple-tvl-kr-profile-pay";
import { selectTvUkAssessmentShifts } from "./simple-tvuk-nursing-profile-pay";
import { selectTvhKrAssessmentShifts } from "./simple-tvh-kr-profile-pay";
import { describe, expect, it, vi } from "vitest";
import type { MonthlyTariffDecision, ShiftEntry, UserProfile } from "@/domain/types";
import { bundledRuleResolver, createRuleResolver } from "@/rules/rule-resolver";
import { createManualMonthlyPayEstimate } from "./pay-fallback";
import {
  createSimpleMonthlyPayCache,
  type SimpleMonthlyPayInput,
} from "./simple-monthly-pay-cache";
import { calculateMonthlyPayEstimate, DEFAULT_TVOED_WORK_PATTERN_SETTINGS } from "./simple-pay";

// The report adapter also exports native error UI; isolate that presentation layer.
vi.mock("@/features/analysis/rule-computation", () => ({
  captureRuleComputation: (calculate: () => unknown) => ({ ok: true, value: calculate() }),
}));

const work: UserProfile = {
  federalState: "HE",
  holidayRegion: "NONE",
  weeklyMinutes: 2310,
  timeZone: "Europe/Berlin",
  regularRotatingNightWork: false,
  sundayHolidayWorkEligible: true,
  allEmploymentWorkRecorded: true,
  tariff: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};
const tvh: UserProfile = {
  ...work,
  tvhKrTariff: { payGroup: "KR8", payLevel: 4, fullTimeWeeklyMinutes: 2310 },
};
function duty(overrides: Partial<ShiftEntry> = {}): ShiftEntry {
  return {
    kind: "SHIFT",
    id: "cache-duty",
    date: "2026-10-05",
    templateId: null,
    title: "Nacht",
    type: "NIGHT",
    startTime: "21:00",
    endTime: "07:00",
    breakMinutes: 60,
    color: "#EEAA22",
    symbol: "N",
    note: null,
    overtimeMinutes: 0,
    tariffOvertimeConfirmed: false,
    holidayPremiumMode: "WITH_TIME_OFF",
    revision: 1,
    createdAt: work.createdAt,
    updatedAt: work.updatedAt,
    deletedAt: null,
    ...overrides,
  };
}
function input(): SimpleMonthlyPayInput {
  const shifts = [duty()];
  return {
    month: "2026-10",
    shifts,
    assessmentShifts: shifts,
    profile: tvh,
    decision: null,
    workPatternSettings: DEFAULT_TVOED_WORK_PATTERN_SETTINGS,
    ruleResolver: bundledRuleResolver,
  };
}

describe("shared monthly cache safeguards", () => {
  it("reuses equal content after objects and arrays are reloaded", () => {
    const cache = createSimpleMonthlyPayCache();
    const calculate = vi.fn(() => createManualMonthlyPayEstimate("2026-10", 12345));
    const first = input();
    const saved = cache(first, calculate);
    const loaded = {
      ...first,
      profile: { ...first.profile },
      shifts: first.shifts.map((s) => ({ ...s })),
      assessmentShifts: first.assessmentShifts.map((s) => ({ ...s })),
      workPatternSettings: { ...first.workPatternSettings },
    };
    expect(cache(loaded, calculate)).toBe(saved);
    expect(calculate).toHaveBeenCalledTimes(1);
  });
  it("separates immutable catalog resolver instances", () => {
    const cache = createSimpleMonthlyPayCache();
    const calculate = vi.fn(() => createManualMonthlyPayEstimate("2026-10", 12345));
    const first = input();
    const old = cache(first, calculate);
    expect(cache({ ...first, ruleResolver: createRuleResolver() }, calculate)).not.toBe(old);
    expect(calculate).toHaveBeenCalledTimes(2);
  });
  it("retries unavailable rules without keeping the failed result", () => {
    const cache = createSimpleMonthlyPayCache();
    const available = createManualMonthlyPayEstimate("2026-10", 12345);
    const calculate = vi
      .fn()
      .mockReturnValueOnce({ ...available, available: false })
      .mockReturnValue(available);
    expect(cache(input(), calculate).available).toBe(false);
    expect(cache(input(), calculate).available).toBe(true);
    expect(cache(input(), calculate)).toBe(available);
    expect(calculate).toHaveBeenCalledTimes(2);
  });
  it("retries thrown calculation failures", () => {
    const cache = createSimpleMonthlyPayCache();
    const calculate = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("rules unavailable");
      })
      .mockImplementation(() => createManualMonthlyPayEstimate("2026-10", 12345));
    expect(() => cache(input(), calculate)).toThrow("rules unavailable");
    expect(cache(input(), calculate).available).toBe(true);
    expect(calculate).toHaveBeenCalledTimes(2);
  });
  it("protects shared nested results from mutation by another caller", () => {
    const cache = createSimpleMonthlyPayCache();
    const calculate = () => createManualMonthlyPayEstimate("2026-10", 12345);
    const saved = cache(input(), calculate);
    expect(Object.isFrozen(saved.assessment.criteria)).toBe(true);
    expect(() => (saved.shiftBreakdowns as unknown as unknown[]).push({})).toThrow(TypeError);
    expect(cache(input(), calculate).shiftBreakdowns).toHaveLength(0);
  });
  it("keeps only 24 recent results and refreshes a reused result's position", () => {
    const cache = createSimpleMonthlyPayCache();
    const calculate = vi.fn((month: string) => createManualMonthlyPayEstimate(month, 12345));
    const load = (month: string) => cache({ ...input(), month }, () => calculate(month));
    const months = Array.from(
      { length: 24 },
      (_, i) => `${2026 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`,
    );
    const first = load(months[0]);
    for (const month of months.slice(1)) load(month);
    expect(load(months[0])).toBe(first);
    load("2028-01");
    expect(load(months[0])).toBe(first);
    expect(calculate).toHaveBeenCalledTimes(25);
    load(months[1]);
    expect(calculate).toHaveBeenCalledTimes(26);
  });
});

const profiles: readonly [string, UserProfile][] = [
  [
    "TVöD-P",
    {
      ...work,
      tariff: {
        payGroup: "P8",
        payLevel: 4,
        sector: "BT_K",
        tariffRegion: "OTHER",
        fullTimeWeeklyMinutes: 2310,
      },
    },
  ],
  [
    "TVöD E",
    {
      ...work,
      vkaETariff: { payGroup: "E9b", payLevel: 4, sector: "BT_K", tariffRegion: "OTHER" },
    },
  ],
  [
    "TVAöD Pflege",
    { ...work, nursingTrainingTariff: { trainingYear: 1, sector: "BT_K", tariffRegion: "OTHER" } },
  ],
  ["TV-L", { ...work, tvlKrTariff: { payGroup: "KR8", payLevel: 4, universityRegion: "WEST" } }],
  ["TV-UK", { ...work, tvUkNursingTariff: { payGroup: "PUK8", payLevel: 4 } }],
  ["TV-H", tvh],
  ["manual", { ...work, manualMonthlyGrossCents: 12345 }],
];
describe("shared pay entry point", () => {
  it.each(profiles.filter(([name]) => ["TV-L", "TV-UK", "TV-H"].includes(name)))(
    "reuses the real overview result when opening %s salary details",
    (_name, profile) => {
      const shifts = [
        duty({ id: "overview-night" }),
        duty({
          id: "overview-early",
          date: "2026-10-03",
          type: "EARLY",
          startTime: "07:00",
          endTime: "15:00",
        }),
      ];
      const resolver = createRuleResolver();
      const overview = calculateMonthlyAnalysis(
        "2026-10",
        shifts,
        profile,
        [],
        undefined,
        resolver,
      );
      const assessmentShifts = profile.tvhKrTariff
        ? selectTvhKrAssessmentShifts(shifts, "2026-10")
        : profile.tvUkNursingTariff
          ? selectTvUkAssessmentShifts(shifts, "2026-10")
          : selectTvlKrAssessmentShifts(shifts, "2026-10");
      const details = calculateMonthlyPayEstimate(
        "2026-10",
        overview.monthShifts,
        profile,
        null,
        assessmentShifts,
        undefined,
        resolver,
      );
      expect(overview.pay.ok).toBe(true);
      if (overview.pay.ok) expect(details).toBe(overview.pay.value);
    },
  );

  it.each(profiles)("shares %s results between equivalent screen inputs", (_name, profile) => {
    const shifts = [duty()];
    const resolver = createRuleResolver();
    const overview = calculateMonthlyPayEstimate(
      "2026-10",
      shifts,
      profile,
      null,
      shifts,
      undefined,
      resolver,
    );
    const details = calculateMonthlyPayEstimate(
      "2026-10",
      shifts.map((s) => ({ ...s })),
      { ...profile },
      null,
      shifts.map((s) => ({ ...s })),
      { ...DEFAULT_TVOED_WORK_PATTERN_SETTINGS },
      resolver,
    );
    expect(overview.available).toBe(true);
    expect(details).toBe(overview);
  });
  it("updates pauses without requiring a revision or timestamp change", () => {
    const paused = duty();
    const old = calculateMonthlyPayEstimate("2026-10", [paused], tvh, null);
    expect(old.timePremiumAmount).toBe(37.2);
    const next = calculateMonthlyPayEstimate(
      "2026-10",
      [{ ...paused, breakMinutes: 0 }],
      tvh,
      null,
    );
    expect(next.timePremiumAmount).toBe(41.85);
    expect(next).not.toBe(old);
    expect(calculateMonthlyPayEstimate("2026-10", [paused], tvh, null)).toBe(old);
  });
  it("updates weekly hours and pay group with unchanged profile metadata", () => {
    const old = calculateMonthlyPayEstimate("2026-10", [], tvh, null);
    expect(old.personalBaseAmount).toBe(4108.81);
    const partTime = calculateMonthlyPayEstimate(
      "2026-10",
      [],
      { ...tvh, weeklyMinutes: 1155 },
      null,
    );
    expect(partTime.personalBaseAmount).toBe(2054.41);
    const promoted = calculateMonthlyPayEstimate(
      "2026-10",
      [],
      { ...tvh, tvhKrTariff: { ...tvh.tvhKrTariff!, payGroup: "KR9" } },
      null,
    );
    expect(promoted.personalBaseAmount).not.toBe(old.personalBaseAmount);
  });
  it("applies a new month and its dated table", () => {
    const old = calculateMonthlyPayEstimate("2026-10", [], tvh, null);
    const next = calculateMonthlyPayEstimate("2027-10", [], tvh, null);
    expect(next.month).toBe("2027-10");
    expect(next.personalBaseAmount).toBeGreaterThan(old.personalBaseAmount!);
  });
  it("updates confirmed allowance and paid-break calculations", () => {
    const shifts = [duty()];
    const old = calculateMonthlyPayEstimate("2026-10", shifts, tvh, null);
    const decision: MonthlyTariffDecision = {
      month: "2026-10",
      allowanceStatus: "ALTERNATING_MONTHLY",
      revision: 1,
      confirmedAt: work.createdAt,
      updatedAt: work.updatedAt,
    };
    const next = calculateMonthlyPayEstimate("2026-10", shifts, tvh, decision);
    expect(old.allowanceAmount).toBe(0);
    expect(next.allowanceAmount).toBe(200);
    expect(next.shiftBreakdowns[0].netMinutes).toBe(600);
    expect(old.shiftBreakdowns[0].netMinutes).toBe(540);
  });
  it("updates the assessment lookback and workplace settings", () => {
    const shifts = [duty()];
    const rotation = [
      duty({
        id: "early",
        date: "2026-10-03",
        type: "EARLY",
        startTime: "07:00",
        endTime: "15:00",
      }),
      duty({ id: "late", date: "2026-10-04", type: "LATE", startTime: "13:00", endTime: "21:00" }),
      ...shifts,
    ];
    const old = calculateMonthlyPayEstimate("2026-10", shifts, tvh, null);
    const settings = {
      workplaceCoverage: "AROUND_THE_CLOCK" as const,
      assignment: "PERMANENT" as const,
      updatedAt: work.updatedAt,
    };
    const next = calculateMonthlyPayEstimate("2026-10", shifts, tvh, null, rotation, settings);
    expect(old.allowanceAmount).toBe(0);
    expect(next.allowanceAmount).toBe(200);
    const changed = calculateMonthlyPayEstimate("2026-10", shifts, tvh, null, rotation, {
      ...settings,
      assignment: "TEMPORARY",
    });
    expect(changed.allowanceAmount).not.toBe(200);
  });
  it("updates holiday modes and overtime entitlement separately", () => {
    const holiday = duty({ date: "2026-10-03" });
    const withTimeOff = calculateMonthlyPayEstimate("2026-10", [holiday], tvh, null);
    const withoutTimeOff = calculateMonthlyPayEstimate(
      "2026-10",
      [{ ...holiday, holidayPremiumMode: "WITHOUT_TIME_OFF" }],
      tvh,
      null,
    );
    expect(withoutTimeOff.timePremiumAmount).toBeGreaterThan(withTimeOff.timePremiumAmount);
    const extra = duty({ overtimeMinutes: 120 });
    const unconfirmed = calculateMonthlyPayEstimate("2026-10", [extra], tvh, null);
    const confirmed = calculateMonthlyPayEstimate(
      "2026-10",
      [{ ...extra, tariffOvertimeConfirmed: true }],
      tvh,
      null,
    );
    expect(unconfirmed.overtimeAmount).toBe(0);
    expect(confirmed.overtimeAmount).toBeGreaterThan(0);
  });
});
