import fs from "node:fs";
import { buildAnnualAvailableReportSteps } from "@/features/analysis/annual-core-report";
import { DEFAULT_TVOED_WORK_PATTERN_SETTINGS } from "./tvoed-pattern";
import { describe, expect, it } from "vitest";
import type { ShiftEntry, UserProfile } from "@/domain/types";
import { calculateMonthlyPayEstimate, calculateShiftPremiumBreakdown } from "./simple-pay";
import { selectVkaEAssessmentShifts } from "./simple-vka-e-pay";
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
  vkaETariff: { payGroup: "E9b", payLevel: 4, sector: "BT_K", tariffRegion: "OTHER" },
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
describe("simple nursing TVöD E table pay", () => {
  it.each([
    ["2026-04", "2025-04"],
    ["2026-05", "2026-05"],
  ])("matches every official source cell in %s", (month, csv) => {
    const rows = fs
      .readFileSync("docs/tvoed-vka-anlage-a-" + csv + ".csv", "utf8")
      .trim()
      .split(/\r?\n/)
      .slice(1);
    let count = 0;
    for (const row of rows) {
      const [id, ...values] = row.split(",");
      for (let i = 0; i < values.length; i++) {
        if (!values[i]) continue;
        const pay = calculateMonthlyPayEstimate(
          month,
          [],
          {
            ...profile,
            vkaETariff: {
              ...profile.vkaETariff!,
              payGroup: id.replace("eg", "E") as "E9b",
              payLevel: (i + 1) as 4,
            },
          },
          null,
        );
        expect(pay.fullTimeTableAmount).toBe(Number(values[i]) / 100);
        expect(pay.available).toBe(true);
        count++;
      }
    }
    expect(count).toBe(101);
  });
  it.each(["2025-03", "2027-04"])("does not invent table values outside coverage %s", (month) => {
    const pay = calculateMonthlyPayEstimate(month, [], profile, null);
    expect(pay.available).toBe(false);
    expect(pay.estimatedGrossAmount).toBeNull();
  });
  it("uses step3 of the selected E group for a night hour, independently of personal step", () => {
    const result = calculateShiftPremiumBreakdown(
      shift({ date: "2026-07-06", overtimeMinutes: 0 }),
      profile,
    );
    expect(result.premiumLines).toEqual([
      expect.objectContaining({
        key: "night",
        minutes: 480,
        hourlyRate: 25.11,
        percentage: 20,
        amount: 40.18,
      }),
    ]);
    const other = calculateShiftPremiumBreakdown(
      shift({ date: "2026-07-06", overtimeMinutes: 0 }),
      { ...profile, vkaETariff: { ...profile.vkaETariff!, payLevel: 6 } },
    );
    expect(other.totalAmount).toBe(result.totalAmount);
  });
  it("scales monthly base and fixed/shift allowances once without cutting hourly premiums", () => {
    const pay = calculateMonthlyPayEstimate(
      "2026-07",
      [shift({ date: "2026-07-06", overtimeMinutes: 0 })],
      { ...profile, weeklyMinutes: 1155 },
      decision("ALTERNATING_MONTHLY"),
    );
    expect(pay.personalBaseAmount).toBe(2345.28);
    expect(pay.allowanceAmount).toBe(125);
    expect(pay.tvoedAllowanceAmount).toBe(12.5);
    expect(pay.careAllowanceAmount).toBe(0);
    expect(pay.timePremiumAmount).toBe(40.18);
    expect(pay.estimatedGrossAmount).toBe(2522.96);
  });
  it.each([
    ["BT_K", "OTHER", 2310, 25],
    ["BT_K", "KAV_BW", 2340, 35],
    ["BT_B", "OTHER", 2340, 0],
    ["BT_B", "KAV_BW", 2340, 0],
  ] as const)(
    "uses %s/%s full time and only sourced E fixed allowances",
    (sector, tariffRegion, weeklyMinutes, fixed) => {
      const pay = calculateMonthlyPayEstimate(
        "2026-07",
        [],
        { ...profile, weeklyMinutes, vkaETariff: { ...profile.vkaETariff!, sector, tariffRegion } },
        null,
      );
      expect(pay.personalBaseAmount).toBe(4690.55);
      expect(pay.tvoedAllowanceAmount).toBe(fixed);
      expect(pay.careAllowanceAmount).toBe(0);
    },
  );
  it("caps the personal overtime base at step4 and uses the E9b/E9c premium boundary", () => {
    const make = (payGroup: "E9b" | "E9c") =>
      calculateShiftPremiumBreakdown(shift({ date: "2026-07-06" }), {
        ...profile,
        vkaETariff: { ...profile.vkaETariff!, payGroup, payLevel: 6 },
      });
    expect(make("E9b")).toMatchObject({ overtimeBaseAmount: 28.02, overtimePremiumAmount: 7.53 });
    expect(make("E9c")).toMatchObject({ overtimeBaseAmount: 29.41, overtimePremiumAmount: 4.12 });
    expect(
      calculateShiftPremiumBreakdown(
        shift({ date: "2026-07-06", tariffOvertimeConfirmed: false }),
        profile,
      ).overtimeBaseAmount,
    ).toBe(0);
  });
  it("combines night with the single highest calendar premium", () => {
    const result = calculateShiftPremiumBreakdown(
      shift({ date: "2026-11-01", overtimeMinutes: 0 }),
      profile,
    );
    expect(result.premiumLines.map((p) => p.key)).toEqual(["night", "holiday"]);
    expect(result.premiumLines.find((p) => p.key === "holiday")?.percentage).toBe(35);
  });
  it("applies the E nursing Saturday rule also during shift work", () => {
    const result = calculateShiftPremiumBreakdown(
      shift({
        date: "2026-07-04",
        startTime: "13:00",
        endTime: "21:00",
        breakMinutes: 0,
        overtimeMinutes: 0,
      }),
      profile,
    );
    expect(result.premiumLines).toEqual([
      expect.objectContaining({ key: "saturday", percentage: 20, minutes: 480, amount: 40.18 }),
    ]);
  });
  it("changes hourly values at midnight when the new table starts", () => {
    const result = calculateShiftPremiumBreakdown(
      shift({ date: "2026-04-30", breakMinutes: 0, overtimeMinutes: 60 }),
      profile,
    );
    expect(result.premiumLines.find((p) => p.key === "night")?.minutes).toBe(540);
    expect(result.premiumLines.find((p) => p.key === "holiday")).toMatchObject({
      minutes: 420,
      hourlyRate: 25.11,
    });
    expect(result.overtimeBaseAmount).toBe(28.02);
  });
  it("counts real worked minutes through both clock changes", () => {
    for (const [date, minutes] of [
      ["2026-03-28", 480],
      ["2026-10-24", 600],
    ] as const) {
      const result = calculateShiftPremiumBreakdown(
        shift({ date, breakMinutes: 0, overtimeMinutes: 0 }),
        profile,
      );
      expect(result.premiumLines.find((p) => p.key === "night")?.minutes).toBe(minutes);
    }
  });
  it("includes twelve E salary months and premiums in the familiar annual report", () => {
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
    expect(result.value.estimatedGrossAmount).toBe(56075.56);
    expect(result.value.months[4].timePremiumAmount).toBe(0);
  });
  it("selects the existing two-month nursing assessment window", () => {
    expect(
      selectVkaEAssessmentShifts(
        [
          shift({ date: "2026-04-30" }),
          shift({ date: "2026-05-01" }),
          shift({ date: "2026-07-31" }),
          shift({ date: "2026-08-01" }),
        ],
        "2026-07",
      ).map((s) => s.date),
    ).toEqual(["2026-05-01", "2026-07-31"]);
  });
});
