import { buildAnnualAvailableReportSteps } from "@/features/analysis/annual-core-report";
import { DEFAULT_TVOED_WORK_PATTERN_SETTINGS } from "./tvoed-pattern";
import { describe, expect, it } from "vitest";
import type { MonthlyTariffDecision, ShiftEntry, UserProfile } from "@/domain/types";
import type { TvUkNursingTariff } from "@/domain/tvuk-nursing-tariff";
import { bundledRuleResolver } from "@/rules/rule-resolver";
import {
  calculateMonthlyPayEstimate,
  calculateShiftPremiumBreakdown,
  calculateMonthlyTvoedAssessment,
} from "./simple-pay";
import { selectTvUkAssessmentShifts } from "./simple-tvuk-nursing-profile-pay";
const work: UserProfile = {
  federalState: "BW",
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
const selection: TvUkNursingTariff = { payGroup: "PUK8", payLevel: 4 };
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

const profile: UserProfile = { ...work, tvUkNursingTariff: selection };
const decision: MonthlyTariffDecision = {
  month: "2026-10",
  allowanceStatus: "ALTERNATING_MONTHLY",
  revision: 1,
  confirmedAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};
const rotation = [
  shift({ id: "early", date: "2026-10-05", startTime: "07:00", endTime: "15:00", type: "EARLY" }),
  shift({ id: "late", date: "2026-10-06", startTime: "13:00", endTime: "21:00", type: "LATE" }),
];
describe("TV-UK through simple app salary entry points", () => {
  it("uses the saved TV-UK table and nursing allowance instead of TVöD or manual pay", () =>
    expect(calculateMonthlyPayEstimate("2026-10", [], profile, null)).toMatchObject({
      available: true,
      personalBaseAmount: 4352,
      careAllowanceAmount: 200,
      tvoedAllowanceAmount: 0,
      allowanceAmount: 0,
      estimatedGrossAmount: 4552,
    }));
  it("keeps night time credit distinct from the money displayed", () =>
    expect(calculateMonthlyPayEstimate("2026-10", [shift()], profile, null)).toMatchObject({
      timePremiumAmount: 67.6,
      nightCompensatoryMinutes: 30,
      estimatedGrossAmount: 4619.6,
    }));
  it("ignores an old VKA alternating-shift allowance confirmation", () => {
    const pay = calculateMonthlyPayEstimate("2026-10", [shift()], profile, decision);
    expect(pay.allowanceAmount).toBe(0);
    expect(pay.confirmedAllowance).toBeNull();
    expect(pay.estimatedGrossAmount).toBe(4619.6);
  });
  it("estimates the own 2.8-percent daytime premium from a regular monthly rotation", () => {
    const pay = calculateMonthlyPayEstimate("2026-10", rotation, profile, null);
    expect(pay.assessment.shiftWork).toBe("DETECTED");
    expect(pay.allowanceAmount).toBe(0);
    expect(pay.timePremiumAmount).toBe(16.12);
    expect(pay.estimatedGrossAmount).toBe(4568.12);
  });
  it("does not import TV-L's two-hour start-change minimum", () => {
    const entries = [
      shift({ startTime: "07:00", endTime: "20:00", type: "EARLY" }),
      shift({ date: "2026-10-06", startTime: "08:00", endTime: "21:00", type: "LATE" }),
    ];
    expect(
      calculateMonthlyTvoedAssessment("2026-10", entries, entries, undefined, undefined, profile)
        .assessment?.shiftWork,
    ).toBe("DETECTED");
  });
  it("does not invent regular shift duty from a daytime-only span", () => {
    const entries = [
      shift({ startTime: "07:00", endTime: "15:00", type: "EARLY" }),
      shift({ date: "2026-10-06", startTime: "08:00", endTime: "16:00", type: "EARLY" }),
    ];
    const pay = calculateMonthlyPayEstimate("2026-10", entries, profile, null);
    expect(pay.assessment.shiftWork).toBe("REVIEW");
    expect(pay.timePremiumAmount).toBe(0);
  });
  it("selects only this month's active shifts for the simple pattern estimate", () =>
    expect(
      selectTvUkAssessmentShifts(
        [shift(), shift({ date: "2026-09-30" }), shift({ deletedAt: "2026-10-06" })],
        "2026-10",
      ),
    ).toHaveLength(1));
  it("passes the explicit shift-work context through the single-shift API", () => {
    const daytime = shift({ startTime: "08:00", endTime: "10:00" });
    expect(calculateShiftPremiumBreakdown(daytime, profile, undefined, false).totalAmount).toBe(0);
    expect(calculateShiftPremiumBreakdown(daytime, profile, undefined, true).totalAmount).toBe(
      1.46,
    );
  });
  it("reports all twelve months as tariff pay with their actual historical table", () => {
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
    expect(result.value.estimatedGrossAmount).toBe(53553);
    expect(result.value.months[9].timePremiumAmount).toBe(0);
  });
});
