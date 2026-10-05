import { buildAnnualAvailableReportSteps } from "@/features/analysis/annual-core-report";
import { DEFAULT_TVOED_WORK_PATTERN_SETTINGS } from "./tvoed-pattern";
import { describe, expect, it } from "vitest";
import type { ShiftEntry, UserProfile } from "@/domain/types";
import { calculateMonthlyPayEstimate, calculateShiftPremiumBreakdown } from "./simple-pay";
import { selectNursingTrainingAssessmentShifts } from "./simple-nursing-training-pay";
import { bundledRuleResolver } from "@/rules/rule-resolver";
const profile: UserProfile = {
  federalState: "NW",
  holidayRegion: "NONE",
  weeklyMinutes: 2310,
  timeZone: "Europe/Berlin",
  regularRotatingNightWork: false,
  sundayHolidayWorkEligible: true,
  allEmploymentWorkRecorded: true,
  tariff: null,
  nursingTrainingTariff: { trainingYear: 1, sector: "BT_K", tariffRegion: "OTHER" },
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};
function shift(overrides: Partial<ShiftEntry> = {}): ShiftEntry {
  return {
    kind: "SHIFT",
    id: "shift-1",
    date: "2026-07-05",
    templateId: null,
    title: "Nacht",
    type: "NIGHT",
    startTime: "21:00",
    endTime: "07:00",
    breakMinutes: 60,
    color: "#EA5B55",
    symbol: "N",
    note: null,
    overtimeMinutes: 60,
    tariffOvertimeConfirmed: true,
    holidayPremiumMode: "WITH_TIME_OFF",
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

const decision = (
  allowanceStatus: "SHIFT_MONTHLY" | "ALTERNATING_MONTHLY" | "SHIFT_HOURLY" | "ALTERNATING_HOURLY",
) => ({
  month: "2026-07",
  allowanceStatus,
  revision: 1,
  confirmedAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
});
describe("simple TVAöD nursing salary", () => {
  it("includes all twelve trainee months in the existing annual salary report", () => {
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
    expect(result.value.estimatedGrossAmount).toBe(17588.28);
    expect(result.value.months[4].timePremiumAmount).toBe(0);
  });
  it.each([
    [1, 1415.69, 1490.69],
    [2, 1477.07, 1552.07],
    [3, 1578.38, 1653.38],
  ] as const)(
    "selects official table changes for training year %i",
    (trainingYear, oldAmount, newAmount) => {
      const work = {
        ...profile,
        nursingTrainingTariff: { ...profile.nursingTrainingTariff!, trainingYear },
      };
      expect(calculateMonthlyPayEstimate("2026-04", [], work, null).personalBaseAmount).toBe(
        oldAmount,
      );
      const next = calculateMonthlyPayEstimate("2026-05", [], work, null);
      expect(next.personalBaseAmount).toBe(newAmount);
      expect(next.estimatedGrossAmount).toBe(newAmount);
      expect(next.tvoedAllowanceAmount).toBe(0);
      expect(next.careAllowanceAmount).toBe(0);
      expect(next.available).toBe(true);
      expect(calculateMonthlyPayEstimate("2025-04", [], work, null).personalBaseAmount).toBe(
        oldAmount,
      );
    },
  );
  it.each(["2025-03", "2027-04"])("keeps unsupported month %s unavailable", (month) => {
    const pay = calculateMonthlyPayEstimate(month, [], profile, null);
    expect(pay.available).toBe(false);
    expect(pay.estimatedGrossAmount).toBeNull();
  });
  it("uses the trainee's hourly base for night work rather than a P8 reference table", () => {
    const result = calculateShiftPremiumBreakdown(
      shift({ date: "2026-07-06", overtimeMinutes: 0 }),
      profile,
    );
    expect(result.netMinutes).toBe(540);
    expect(result.premiumLines).toEqual([
      expect.objectContaining({
        key: "night",
        minutes: 480,
        hourlyRate: 8.91,
        percentage: 20,
        amount: 14.26,
      }),
    ]);
    expect(result.totalAmount).toBe(14.26);
  });
  it("changes the hourly basis at midnight on 1 May and pays the holiday separately", () => {
    const result = calculateShiftPremiumBreakdown(
      shift({ date: "2026-04-30", breakMinutes: 0, overtimeMinutes: 60 }),
      profile,
    );
    expect(result.premiumLines.find((p) => p.key === "night")).toMatchObject({
      minutes: 540,
      amount: 15.77,
    });
    expect(result.premiumLines.find((p) => p.key === "holiday")).toMatchObject({
      minutes: 420,
      hourlyRate: 8.91,
      percentage: 35,
      amount: 21.83,
    });
    expect(result.overtimeBaseAmount).toBe(8.91);
    expect(result.overtimePremiumAmount).toBe(2.67);
  });
  it("keeps Sunday and holiday alternatives exclusive", () => {
    const result = calculateShiftPremiumBreakdown(
      shift({
        date: "2026-11-01",
        startTime: "08:00",
        endTime: "16:00",
        breakMinutes: 0,
        overtimeMinutes: 0,
      }),
      profile,
    );
    expect(result.premiumLines.map((p) => p.key)).toEqual(["holiday"]);
  });
  it.each([
    ["SHIFT_MONTHLY", 75],
    ["ALTERNATING_MONTHLY", 187.5],
    ["SHIFT_HOURLY", 4.05],
    ["ALTERNATING_HOURLY", 10.08],
  ] as const)("applies 75 percent source rates for %s", (status, amount) => {
    const pay = calculateMonthlyPayEstimate(
      "2026-07",
      [shift({ date: "2026-07-06", overtimeMinutes: 0 })],
      profile,
      decision(status),
    );
    expect(pay.allowanceAmount).toBe(amount);
  });
  it.each(["2025-06", "2026-04", "2026-07"])(
    "has no trainee BT-B region difference across years and shift allowances in %s",
    (month) => {
      const shifts = [shift({ date: month + "-06" })];
      for (const trainingYear of [1, 2, 3] as const) {
        for (const status of [
          "SHIFT_MONTHLY",
          "ALTERNATING_MONTHLY",
          "SHIFT_HOURLY",
          "ALTERNATING_HOURLY",
        ] as const) {
          const run = (tariffRegion: "OTHER" | "KAV_BW") =>
            calculateMonthlyPayEstimate(
              month,
              shifts,
              {
                ...profile,
                weeklyMinutes: 1170,
                nursingTrainingTariff: { trainingYear, sector: "BT_B", tariffRegion },
              },
              { ...decision(status), month },
            );
          const other = run("OTHER");
          const bw = run("KAV_BW");
          expect(other.available).toBe(true);
          expect(other.allowanceAmount).toBeGreaterThan(0);
          expect(bw).toEqual(other);
        }
      }
    },
  );
  it("uses the historical 75 percent shift rate before July 2025", () => {
    expect(
      calculateMonthlyPayEstimate("2025-06", [], profile, {
        ...decision("ALTERNATING_MONTHLY"),
        month: "2025-06",
      }).allowanceAmount,
    ).toBe(116.25);
  });
  it("scales the monthly part-time estimate once and leaves an individual hour unchanged", () => {
    const half = { ...profile, weeklyMinutes: 1155 };
    const pay = calculateMonthlyPayEstimate(
      "2026-07",
      [shift({ date: "2026-07-06", overtimeMinutes: 0 })],
      half,
      decision("ALTERNATING_MONTHLY"),
    );
    expect(pay.personalBaseAmount).toBe(745.35);
    expect(pay.allowanceAmount).toBe(93.75);
    expect(pay.timePremiumAmount).toBe(14.26);
  });
  it("does not turn an hours balance into confirmed overtime", () => {
    const result = calculateShiftPremiumBreakdown(
      shift({ date: "2026-07-06", tariffOvertimeConfirmed: false }),
      profile,
    );
    expect(result.overtimeBaseAmount).toBe(0);
    expect(result.overtimePremiumAmount).toBe(0);
  });
  it("keeps full-time trainee entitlement available without duties and across paid absence", () => {
    const pay = calculateMonthlyPayEstimate(
      "2026-07",
      [shift({ type: "VACATION", startTime: null, endTime: null, allDay: true })],
      profile,
      null,
    );
    expect(pay.personalBaseAmount).toBe(1490.69);
    expect(pay.timePremiumAmount).toBe(0);
  });
  it("does not depend on the availability of employee tariffs for trainee lookback", () => {
    const resolver = {
      ...bundledRuleResolver,
      resolveTariff() {
        throw new Error("Employee tariff must not be read");
      },
    };
    const pay = calculateMonthlyPayEstimate(
      "2026-07",
      [shift({ date: "2026-07-06", overtimeMinutes: 0 })],
      profile,
      null,
      [],
      undefined,
      resolver,
    );
    expect(pay.estimatedGrossAmount).toBe(1504.95);
    expect(
      selectNursingTrainingAssessmentShifts(
        [
          shift({ date: "2026-05-01" }),
          shift({ date: "2026-04-30" }),
          shift({ date: "2026-07-31" }),
          shift({ date: "2026-08-01" }),
        ],
        "2026-07",
      ).map((s) => s.date),
    ).toEqual(["2026-05-01", "2026-07-31"]);
  });
  it("keeps duty minutes correct through summer-time and winter-time changes", () => {
    const spring = calculateShiftPremiumBreakdown(
      shift({ date: "2026-03-28", breakMinutes: 0, overtimeMinutes: 0 }),
      profile,
    );
    const fall = calculateShiftPremiumBreakdown(
      shift({ date: "2026-10-24", breakMinutes: 0, overtimeMinutes: 0 }),
      profile,
    );
    expect(spring.netMinutes).toBe(540);
    expect(spring.premiumLines.find((p) => p.key === "night")?.minutes).toBe(480);
    expect(fall.netMinutes).toBe(660);
    expect(fall.premiumLines.find((p) => p.key === "night")?.minutes).toBe(600);
  });
});
