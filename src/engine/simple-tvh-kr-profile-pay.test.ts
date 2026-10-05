import { buildAnnualAvailableReportSteps } from "@/features/analysis/annual-core-report";
import { DEFAULT_TVOED_WORK_PATTERN_SETTINGS } from "./tvoed-pattern";
import { describe, expect, it } from "vitest";
import type { MonthlyTariffDecision, ShiftEntry, UserProfile } from "@/domain/types";
import type { TvhKrTariff } from "@/domain/tvh-kr-tariff";
import { bundledRuleResolver } from "@/rules/rule-resolver";
import {
  calculateMonthlyPayEstimate,
  calculateShiftPremiumBreakdown,
  calculateMonthlyTvoedAssessment,
} from "./simple-pay";
import { calculateTvhKrAssessment, selectTvhKrAssessmentShifts } from "./simple-tvh-kr-profile-pay";
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
const selection: TvhKrTariff = { payGroup: "KR8", payLevel: 4, fullTimeWeeklyMinutes: 2310 };
function shift(overrides: Partial<ShiftEntry> = {}): ShiftEntry {
  return {
    kind: "SHIFT",
    id: "tvl-shift",
    date: "2026-10-05",
    templateId: null,
    title: "Nacht",
    type: "NIGHT",
    startTime: "20:00",
    endTime: "06:00",
    breakMinutes: 0,
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

const profile: UserProfile = { ...work, tvhKrTariff: selection };
const decision: MonthlyTariffDecision = {
  month: "2026-10",
  allowanceStatus: "ALTERNATING_MONTHLY",
  revision: 1,
  confirmedAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};
const rotation = [
  shift({ date: "2026-10-05", id: "early", startTime: "07:00", endTime: "15:00", type: "EARLY" }),
  shift({ date: "2026-10-06", id: "late", startTime: "13:00", endTime: "21:00", type: "LATE" }),
  shift({ date: "2026-10-07", id: "night", startTime: "21:00", endTime: "07:00", type: "NIGHT" }),
];
const settings = {
  workplaceCoverage: "AROUND_THE_CLOCK" as const,
  assignment: "PERMANENT" as const,
  updatedAt: null,
};
describe("TV-H through existing salary entry points", () => {
  it("routes nursing pay without TVöD amounts or manual fallback", () => {
    const pay = calculateMonthlyPayEstimate("2026-10", [], profile, null);
    expect(pay.available).toBe(true);
    expect(pay.tariffLabel).toBe("TV-H Pflege");
    expect(pay.personalBaseAmount).toBe(4108.81);
    expect(pay.careAllowanceAmount).toBe(142.22);
    expect(pay.tvoedAllowanceAmount).toBe(0);
    expect(pay.estimatedGrossAmount).toBe(4251.03);
  });
  it("uses TV-H's one monthly night requirement with confirmed workplace settings", () => {
    const a = calculateTvhKrAssessment("2026-10", rotation, settings).assessment;
    expect(a?.alternatingShiftWork).toBe("DETECTED");
    expect(a?.suggestedAllowance).toBe("ALTERNATING_MONTHLY");
    expect(
      calculateMonthlyPayEstimate("2026-10", rotation, profile, null, rotation, settings)
        .allowanceAmount,
    ).toBe(200);
  });
  it("does not fabricate around-the-clock coverage or permanent assignment", () => {
    const a = calculateTvhKrAssessment("2026-10", rotation).assessment;
    expect(a?.requiresConfirmation).toBe(true);
    expect(a?.suggestedAllowance).toBe("NONE");
    expect(calculateMonthlyPayEstimate("2026-10", rotation, profile, null).allowanceAmount).toBe(0);
  });
  it("does not import TV-UK's one-hour start-change criterion", () => {
    const small = [
      shift({ startTime: "07:00", endTime: "20:00" }),
      shift({ date: "2026-10-06", startTime: "08:00", endTime: "21:00" }),
      shift({ date: "2026-10-07", startTime: "07:00", endTime: "20:00" }),
    ];
    expect(calculateTvhKrAssessment("2026-10", small, settings).assessment?.shiftWork).toBe(
      "REVIEW",
    );
  });
  it("requires at least two hours of actual night work", () => {
    const a = calculateTvhKrAssessment(
      "2026-10",
      [
        ...rotation.slice(0, 2),
        shift({ date: "2026-10-07", startTime: "20:00", endTime: "22:30" }),
      ],
      settings,
    ).assessment;
    expect(a?.alternatingShiftWork).toBe("NOT_DETECTED");
  });
  it("uses existing employer-confirmed monthly decision and paid breaks", () => {
    const night = shift({ date: "2026-10-05", breakMinutes: 60 });
    const pay = calculateMonthlyPayEstimate("2026-10", [night], profile, decision);
    expect(pay.confirmedAllowance).toBe("ALTERNATING_MONTHLY");
    expect(pay.allowanceAmount).toBe(200);
    expect(pay.shiftBreakdowns[0].netMinutes).toBe(600);
  });
  it("passes shift-work context into single-shift premium calculation", () => {
    const s = shift({ date: "2026-10-10", startTime: "13:00", endTime: "14:00" });
    expect(
      calculateShiftPremiumBreakdown(s, profile, undefined, false).premiumLines[0].amount,
    ).toBe(4.65);
    expect(calculateShiftPremiumBreakdown(s, profile, undefined, true).premiumLines).toEqual([]);
  });
  it("keeps the simple pattern limited to active shifts in this month", () =>
    expect(
      selectTvhKrAssessmentShifts(
        [shift(), shift({ date: "2026-09-30" }), shift({ deletedAt: work.createdAt })],
        "2026-10",
      ),
    ).toHaveLength(1));
  it("routes the shared allowance assessment with the right tariff label", () =>
    expect(
      calculateMonthlyTvoedAssessment("2026-10", rotation, rotation, settings, undefined, profile)
        .tariffLabel,
    ).toBe("TV-H Pflege"));
  it("reports all twelve months as tariff pay and switches the July table", () => {
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
    expect(result.value.estimatedGrossAmount).toBe(50269.26);
    expect(result.value.months[9].timePremiumAmount).toBe(0);
  });
});
