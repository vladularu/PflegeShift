import { buildAnnualAvailableReportSteps } from "@/features/analysis/annual-core-report";
import { DEFAULT_TVOED_WORK_PATTERN_SETTINGS } from "./tvoed-pattern";
import { describe, expect, it } from "vitest";
import type {
  MonthlyTariffDecision,
  ShiftEntry,
  UserProfile,
  TvoedWorkPatternSettings,
} from "@/domain/types";
import type { TvalPflegeTariff } from "@/domain/tval-pflege-tariff";
import { bundledRuleResolver } from "@/rules/rule-resolver";
import {
  calculateMonthlyPayEstimate,
  calculateShiftPremiumBreakdown,
  calculateMonthlyTvoedAssessment,
} from "./simple-pay";
import { selectTvlKrAssessmentShifts } from "./simple-tvl-kr-profile-pay";
const work: UserProfile = {
  federalState: "NW",
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
const selection: TvalPflegeTariff = { trainingYear: 1, universityRegion: "WEST" };
function shift(overrides: Partial<ShiftEntry> = {}): ShiftEntry {
  return {
    kind: "SHIFT",
    id: "tval-shift",
    date: "2026-07-06",
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
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    deletedAt: null,
    ...overrides,
  };
}

const profile: UserProfile = {
  ...work,
  tvalPflegeTariff: { ...selection, universityRegion: "WEST" },
};
const settings: TvoedWorkPatternSettings = {
  workplaceCoverage: "AROUND_THE_CLOCK",
  assignment: "PERMANENT",
  updatedAt: "2026-01-01T00:00:00Z",
};
const decision: MonthlyTariffDecision = {
  month: "2026-07",
  allowanceStatus: "ALTERNATING_MONTHLY",
  revision: 1,
  confirmedAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
};
const rotation = [
  shift({ date: "2026-07-06", startTime: "07:00", endTime: "15:00", type: "EARLY" }),
  shift({ date: "2026-07-09", startTime: "13:00", endTime: "21:00", type: "LATE" }),
  shift({ date: "2026-07-10" }),
  shift({ date: "2026-07-12", startTime: "07:00", endTime: "15:00", type: "EARLY" }),
  shift({ date: "2026-07-13" }),
  shift({ date: "2026-07-15", startTime: "13:00", endTime: "21:00", type: "LATE" }),
  shift({ date: "2026-07-16" }),
];
describe("TVA-L in the simple salary entry points", () => {
  it("includes twelve independently valued TVA-L months in the familiar annual report", () => {
    const steps = buildAnnualAvailableReportSteps(
      2026,
      [],
      profile,
      [],
      DEFAULT_TVOED_WORK_PATTERN_SETTINGS,
      "2026-10-05",
      bundledRuleResolver,
    );
    let result = steps.next();
    while (!result.done) result = steps.next();
    expect(result.value.salarySource).toBe("TARIFF");
    expect(result.value.availablePayMonthCount).toBe(12);
    // Three months at 1380.70, nine months at 1440.70, no employee care allowance.
    expect(result.value.estimatedGrossAmount).toBe(17108.4);
    expect(result.value.months[4].timePremiumAmount).toBe(0);
  });
  it("uses training base without employee care allowance through the familiar monthly API", () => {
    const pay = calculateMonthlyPayEstimate("2026-07", [], profile, null);
    expect(pay.available).toBe(true);
    expect(pay.tariffLabel).toBe("TVA-L Pflege");
    expect(pay.personalBaseAmount).toBe(1440.7);
    expect(pay.careAllowanceAmount).toBe(0);
    expect(pay.tvoedAllowanceAmount).toBe(0);
    expect(pay.estimatedGrossAmount).toBe(1440.7);
  });
  it("prorates a saved East selection from its changing university full-time basis", () => {
    const east = {
      ...profile,
      weeklyMinutes: 1200,
      tvalPflegeTariff: { ...selection, universityRegion: "EAST" as const },
    };
    expect(calculateMonthlyPayEstimate("2026-12", [], east, null).personalBaseAmount).toBe(720.35);
    expect(calculateMonthlyPayEstimate("2027-01", [], east, null).personalBaseAmount).toBe(729.47);
  });
  it("keeps TVA-L time premiums in the monthly result", () => {
    const pay = calculateMonthlyPayEstimate("2026-07", [shift()], profile, null);
    expect(pay.timePremiumAmount).toBe(13.76);
    expect(pay.shiftBreakdowns[0].premiumLines[0].hourlyRate).toBe(8.61);
  });
  it.each([
    [true, 1.28],
    [false, 3.44],
  ] as const)("passes explicit Saturday shift-work context %s", (context, amount) => {
    const duty = shift({
      date: "2026-07-11",
      startTime: "13:00",
      endTime: "15:00",
      breakMinutes: 0,
    });
    expect(
      calculateShiftPremiumBreakdown(duty, profile, bundledRuleResolver, context).premiumLines[0]
        .amount,
    ).toBe(amount);
  });
  it("uses confirmed alternating allowance and Saturday context in the month API", () => {
    const duty = shift({
      date: "2026-07-11",
      startTime: "13:00",
      endTime: "15:00",
      breakMinutes: 0,
    });
    const pay = calculateMonthlyPayEstimate("2026-07", [duty], profile, decision);
    expect(pay.allowanceAmount).toBe(187.5);
    expect(pay.confirmedAllowance).toBe("ALTERNATING_MONTHLY");
    expect(pay.timePremiumAmount).toBe(1.28);
  });
  it("uses the TVA-L monthly night window and source-bound pattern in the existing allowance API", () => {
    const result = calculateMonthlyTvoedAssessment(
      "2026-07",
      rotation,
      rotation,
      settings,
      bundledRuleResolver,
      profile,
    );
    expect(result.available).toBe(true);
    expect(result.tariffLabel).toBe("TVA-L Pflege");
    expect(result.assessment?.alternatingShiftWork).toBe("DETECTED");
    const pay = calculateMonthlyPayEstimate("2026-07", rotation, profile, null, rotation, settings);
    expect(pay.allowanceAmount).toBe(187.5);
    expect(pay.confirmedAllowance).toBeNull();
  });
  it("keeps coverage and assignment unknown without inventing a monthly allowance", () => {
    const pay = calculateMonthlyPayEstimate("2026-07", rotation, profile, null);
    expect(pay.allowanceAmount).toBe(0);
    expect(pay.assessment.requiresConfirmation).toBe(true);
  });
  it("does not infer shift allowance when the duties cover less than 13 hours", () => {
    const duties = Array.from({ length: 6 }, (_, i) =>
      shift({
        date: "2026-07-" + String(i + 6).padStart(2, "0"),
        startTime: i % 2 ? "13:00" : "07:00",
        endTime: i % 2 ? "19:00" : "15:00",
        type: i % 2 ? "LATE" : "EARLY",
      }),
    );
    const pay = calculateMonthlyPayEstimate("2026-07", duties, profile, null, duties, settings);
    expect(pay.allowanceAmount).toBe(0);
    expect(pay.assessment.shiftWork).toBe("REVIEW");
  });
  it("limits inferred pattern to the requested month and excludes deleted duties", () => {
    const prior = rotation.map((s) => ({ ...s, date: s.date.replace("2026-07", "2026-06") }));
    const deleted = rotation.map((s) => ({ ...s, deletedAt: "2026-07-01T00:00:00Z" }));
    expect(selectTvlKrAssessmentShifts([...prior, ...deleted, ...rotation], "2026-07")).toEqual(
      rotation,
    );
    expect(
      calculateMonthlyPayEstimate("2026-07", [], profile, null, prior, settings).allowanceAmount,
    ).toBe(0);
  });
  it("stays independent from a missing VKA tariff catalog", () => {
    const resolver = {
      ...bundledRuleResolver,
      resolveTariff: () => {
        throw Error("VKA must not be used");
      },
    };
    expect(
      calculateMonthlyPayEstimate("2026-07", [], profile, null, [], settings, resolver).available,
    ).toBe(true);
  });
  it("keeps months before the checked TVA-L sources unavailable", () => {
    const pay = calculateMonthlyPayEstimate("2025-10", [], profile, null);
    expect(pay.available).toBe(false);
    expect(pay.estimatedGrossAmount).toBeNull();
  });
});
