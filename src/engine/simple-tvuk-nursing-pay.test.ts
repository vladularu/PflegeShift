import { describe, expect, it } from "vitest";
import {
  requireTvUkNursingTariff,
  TVUK_NURSING_GROUPS,
  tvUkLevelsForGroup,
  type TvUkNursingGroup,
  type TvUkNursingTariff,
  type TvUkPayLevel,
} from "@/domain/tvuk-nursing-tariff";
import { createRuleResolver } from "@/rules/rule-resolver";
import type { ShiftEntry, UserProfile } from "@/domain/types";
import {
  calculateTvUkNursingMonth,
  calculateTvUkNursingShift,
  getTvUkNursingTable,
  type TvUkCalculationOptions,
} from "./simple-tvuk-nursing-pay";

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
const options = { regularShiftWork: false };
function shift(overrides: Partial<ShiftEntry> = {}): ShiftEntry {
  return {
    kind: "SHIFT",
    id: "tvuk-shift",
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
// Independent transcription of AGU Anlage B 2024, page 3. Each row includes
// its printed first stage; later source tables are checked against signed raises.
const baseline: [TvUkNursingGroup, number, number[]][] = [
  ["PUK15", 2, [5531, 5814, 6097, 6379, 6663]],
  ["PUK14", 2, [5312, 5595, 5877, 6160, 6443]],
  ["PUK13", 2, [5092, 5319, 5548, 5775, 6004]],
  ["PUK12", 2, [4872, 5100, 5328, 5556, 5783]],
  ["PUK11", 2, [4653, 4843, 5032, 5220, 5476]],
  ["PUK10", 3, [4488, 4818, 5059, 5218]],
  ["PUK9L", 2, [3906, 4025, 4142, 4367, 4593]],
  ["PUK9", 3, [4349, 4517, 4694, 4918, 5089]],
  ["PUK8", 2, [3830, 3962, 4082, 4309, 4536, 4708]],
  ["PUK7", 2, [3590, 3831, 3963, 4143, 4367, 4543]],
  ["PUK6", 1, [3185, 3344, 3513, 3682, 3766, 3929]],
  ["PUK5", 1, [2918, 3147, 3213, 3317, 3395, 3583]],
];
const dates = ["2024-10", "2025-10", "2026-10", "2027-12", "2028-07"];
const references = baseline.flatMap(([group, first, values]) =>
  values.flatMap((value, index) => {
    const v2025 = Math.floor((value * 1037 + 500) / 1000);
    const v2026 = Math.floor((v2025 * 1000 + Math.max(100000, v2025 * 28) + 500) / 1000);
    const v2027 = Math.floor((v2026 * 1013 + 500) / 1000);
    const v2028 = Math.floor((v2027 * 1013 + 500) / 1000);
    return [value, v2025, v2026, v2027, v2028].map(
      (amount, period) => [dates[period], group, first + index, amount] as const,
    );
  }),
);
function premium(entry: ShiftEntry, config: TvUkCalculationOptions = options) {
  return calculateTvUkNursingShift(entry, work, selection, config);
}

describe("simple TV-UK nursing", () => {
  it.each(references)(
    "matches official %s %s stage %i at %i euro",
    (month, payGroup, payLevel, amount) => {
      const result = calculateTvUkNursingMonth(
        month,
        [],
        work,
        { payGroup, payLevel: payLevel as TvUkPayLevel },
        options,
      );
      expect(result.available).toBe(true);
      expect(result.fullTimeTableAmount).toBe(amount);
      expect(result.personalBaseAmount).toBe(amount);
    },
  );
  it("covers exactly 315 cells and the complete legal group/stage selection", () => {
    expect(references).toHaveLength(315);
    expect(baseline.map(([g]) => g).sort()).toEqual([...TVUK_NURSING_GROUPS].sort());
    for (const [group, first, values] of baseline)
      expect(tvUkLevelsForGroup(group)).toEqual(values.map((_, i) => first + i));
    for (const month of dates) {
      const table = getTvUkNursingTable(month + "-01")!;
      expect(Object.keys(table.groups).sort()).toEqual([...TVUK_NURSING_GROUPS].sort());
      expect(
        Object.values(table.groups).reduce((sum, row) => sum + Object.keys(row).length, 0),
      ).toBe(63);
    }
  });
  it.each([null, undefined])("accepts no selection: %s", (value) =>
    expect(requireTvUkNursingTariff(value)).toBeNull(),
  );
  it.each([
    {},
    [],
    "PUK8",
    { payGroup: "PUK8", payLevel: 1 },
    { payGroup: "PUK9", payLevel: 2 },
    { payGroup: "PUK10", payLevel: 7 },
    { payGroup: "PUK9L", payLevel: 7 },
    { payGroup: "PUK8", payLevel: "7" },
    { payGroup: "PUK8", payLevel: 7, region: "WEST" },
  ])("rejects invalid selection %j", (value) =>
    expect(() => requireTvUkNursingTariff(value)).toThrow(),
  );
  it("accepts seventh stage only where it actually exists", () =>
    expect(requireTvUkNursingTariff({ payGroup: "PUK8", payLevel: 7 })).toEqual({
      payGroup: "PUK8",
      payLevel: 7,
    }));
  it.each([
    ["2025-09-30", 4082],
    ["2025-10-01", 4233],
    ["2026-09-30", 4233],
    ["2026-10-01", 4352],
    ["2027-11-30", 4352],
    ["2027-12-01", 4409],
    ["2028-06-30", 4409],
    ["2028-07-01", 4466],
    ["2028-08-01", 4466],
  ] as const)("selects correct dated table %s", (date, amount) =>
    expect(getTvUkNursingTable(date)?.groups.PUK8["4"]).toBe(amount * 100),
  );
  it("does not silently reuse a table before the first sourced month", () => {
    expect(getTvUkNursingTable("2024-09-30")).toBeNull();
    expect(calculateTvUkNursingMonth("2024-09", [], work, selection, options)).toMatchObject({
      available: false,
      estimatedGrossAmount: null,
      personalBaseAmount: null,
    });
    expect(() => premium(shift({ date: "2024-09-30" }))).toThrow();
  });
  it("includes the fixed nursing allowance and no TVöD or flat shift allowance", () =>
    expect(calculateTvUkNursingMonth("2026-10", [], work, selection, options)).toMatchObject({
      personalBaseAmount: 4352,
      careAllowanceAmount: 200,
      estimatedGrossAmount: 4552,
      allowanceAmount: 0,
      tvoedAllowanceAmount: 0,
    }));
  it("does not assign the nursing allowance to P-UK5", () =>
    expect(
      calculateTvUkNursingMonth("2026-10", [], work, { payGroup: "PUK5", payLevel: 1 }, options),
    ).toMatchObject({ careAllowanceAmount: 0, estimatedGrossAmount: 3126 }));
  it("prorates only base and fixed allowance, not hourly premiums", () => {
    const result = calculateTvUkNursingMonth(
      "2026-10",
      [shift()],
      { ...work, weeklyMinutes: 1155 },
      selection,
      options,
    );
    expect(result.personalBaseAmount).toBe(2176);
    expect(result.careAllowanceAmount).toBe(100);
    expect(result.timePremiumAmount).toBe(67.6);
    expect(result.estimatedGrossAmount).toBe(2343.6);
  });
  it.each([0, -1, 2311, 1.5, NaN])(
    "rejects impossible personal weekly minutes %s",
    (weeklyMinutes) =>
      expect(
        calculateTvUkNursingMonth("2026-10", [], { ...work, weeklyMinutes }, selection, options)
          .available,
      ).toBe(false),
  );
  it("keeps mandatory night time credit out of cash, with separate 20/35-percent lines", () => {
    const result = premium(shift());
    expect(result.netMinutes).toBe(600);
    expect(result.nightCompensatoryMinutes).toBe(30);
    expect(result.premiumLines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "night",
          minutes: 360,
          percentage: 20,
          hourlyRate: 26,
          amount: 31.2,
        }),
        expect.objectContaining({
          key: "night",
          minutes: 240,
          percentage: 35,
          hourlyRate: 26,
          amount: 36.4,
        }),
      ]),
    );
    expect(result.totalAmount).toBe(67.6);
  });
  it.each([
    ["2024-10-01", 30, 29.26],
    ["2024-12-31", 30, 29.26],
    ["2025-01-01", 35, 34.13],
    ["2025-01-02", 35, 34.13],
  ] as const)(
    "dates core-night cash and mandatory time credit correctly on %s",
    (date, percentage, amount) => {
      const result = premium(shift({ date, startTime: "00:00", endTime: "04:00" }));
      expect(result.premiumLines.find((p) => p.key === "night")).toMatchObject({
        minutes: 240,
        hourlyRate: 24.38,
        percentage,
        amount,
      });
      expect(result.nightCompensatoryMinutes).toBe(12);
    },
  );
  it.each([
    ["2024-12-29", 25, 12.19],
    ["2025-01-05", 40, 19.5],
  ] as const)("dates the Sunday increase correctly on %s", (date, percentage, amount) => {
    const result = premium(shift({ date, startTime: "08:00", endTime: "10:00" }));
    expect(result.premiumLines).toEqual([
      expect.objectContaining({ key: "sunday", minutes: 120, percentage, amount }),
    ]);
    expect(result.nightCompensatoryMinutes).toBe(0);
  });
  it("keeps the historic outer night rate and fixed allowance in the monthly estimate", () => {
    const result = calculateTvUkNursingMonth(
      "2024-12",
      [shift({ date: "2024-12-27" })],
      work,
      selection,
      options,
    );
    expect(result).toMatchObject({
      personalBaseAmount: 4082,
      careAllowanceAmount: 200,
      timePremiumAmount: 58.52,
      estimatedGrossAmount: 4340.52,
      nightCompensatoryMinutes: 30,
    });
    expect(result.shiftBreakdowns[0].premiumLines).toEqual([
      expect.objectContaining({ key: "night", percentage: 20, minutes: 360, amount: 29.26 }),
      expect.objectContaining({ key: "night", percentage: 30, minutes: 240, amount: 29.26 }),
    ]);
  });
  it("applies the new rate at midnight across the 2024/2025 boundary", () => {
    const result = premium(shift({ date: "2024-12-31", startTime: "23:00", endTime: "01:00" }));
    expect(result.premiumLines.filter((p) => p.key === "night")).toEqual([
      expect.objectContaining({ percentage: 20, hourlyRate: 24.38, minutes: 60, amount: 4.88 }),
      expect.objectContaining({ percentage: 35, hourlyRate: 24.38, minutes: 60, amount: 8.53 }),
    ]);
    expect(result.nightCompensatoryMinutes).toBe(6);
    expect(result.totalAmount).toBe(25.61);
  });
  it("estimates the existing unpaid pause in the middle of the actual shift", () => {
    const result = premium(shift({ breakMinutes: 60 }));
    expect(result.netMinutes).toBe(540);
    expect(result.nightCompensatoryMinutes).toBe(27);
    expect(result.totalAmount).toBe(58.5);
  });
  it("pays a night pause only with the explicit workplace condition", () => {
    const result = premium(shift({ breakMinutes: 60 }), {
      regularShiftWork: false,
      paidNightBreaks: true,
    });
    expect(result.netMinutes).toBe(600);
    expect(result.totalAmount).toBe(67.6);
    expect(result.nightCompensatoryMinutes).toBe(30);
  });
  it("never pays a daytime pause merely because night pauses were confirmed", () =>
    expect(
      premium(shift({ startTime: "08:00", endTime: "16:00", breakMinutes: 60 }), {
        regularShiftWork: true,
        paidNightBreaks: true,
      }).netMinutes,
    ).toBe(420));
  it("uses 20–6 night boundaries and 6–20 daytime shift premium", () => {
    const result = premium(shift({ startTime: "19:00", endTime: "07:00" }), {
      regularShiftWork: true,
    });
    expect(result.premiumLines.find((p) => p.key === "shift")).toMatchObject({
      minutes: 120,
      percentage: 2.8,
      amount: 1.46,
    });
    expect(result.nightCompensatoryMinutes).toBe(30);
    expect(result.totalAmount).toBe(69.06);
  });
  it("does not invent daytime premium from the shift title", () =>
    expect(premium(shift({ startTime: "08:00", endTime: "16:00" })).premiumLines).toEqual([]));
  it("uses only the highest calendar premium on a Sunday public holiday", () => {
    const result = premium(shift({ date: "2027-10-03", startTime: "08:00", endTime: "10:00" }));
    expect(result.premiumLines).toEqual([
      expect.objectContaining({ key: "sunday", percentage: 40, amount: 20.8 }),
    ]);
  });
  it.each(["WITH_TIME_OFF", "WITHOUT_TIME_OFF"] as const)(
    "holiday always pays 25 percent with %s",
    (holidayPremiumMode) =>
      expect(
        premium(
          shift({ date: "2026-10-03", startTime: "08:00", endTime: "10:00", holidayPremiumMode }),
        ).totalAmount,
      ).toBe(13),
  );
  it.each(["2026-12-24", "2026-12-31"])(
    "pays the whole special day %s, including before 6",
    (date) =>
      expect(
        premium(shift({ date, startTime: "05:00", endTime: "06:00" })).premiumLines.find(
          (p) => p.key === "preholiday",
        ),
      ).toMatchObject({ minutes: 60, percentage: 25, amount: 6.5 }),
  );
  it("has no Saturday premium", () =>
    expect(
      premium(shift({ date: "2026-10-10", startTime: "08:00", endTime: "10:00" })).totalAmount,
    ).toBe(0));
  it("bases all premiums on the selected actual stage", () => {
    const result = calculateTvUkNursingShift(
      shift(),
      work,
      { payGroup: "PUK8", payLevel: 7 },
      options,
    );
    expect(result.premiumLines[0].hourlyRate).toBe(29.98);
    expect(result.totalAmount).toBe(77.95);
  });
  it("keeps cash lines separate across the table-change midnight", () => {
    const result = premium(shift({ date: "2026-09-30", startTime: "23:00", endTime: "01:00" }));
    expect(result.premiumLines).toEqual([
      expect.objectContaining({ percentage: 20, hourlyRate: 25.29, minutes: 60, amount: 5.06 }),
      expect.objectContaining({ percentage: 35, hourlyRate: 26, minutes: 60, amount: 9.1 }),
    ]);
    expect(result.nightCompensatoryMinutes).toBe(6);
  });
  it.each([
    ["2026-10-24", 660, 300],
    ["2026-03-28", 540, 180],
  ] as const)(
    "counts real elapsed night minutes across DST %s",
    (date, netMinutes, coreMinutes) => {
      const result = premium(shift({ date }));
      expect(result.netMinutes).toBe(netMinutes);
      expect(result.nightCompensatoryMinutes).toBe(netMinutes / 20);
      expect(result.premiumLines.find((p) => p.percentage === 35)?.minutes).toBe(coreMinutes);
    },
  );
  it("pays only explicitly confirmed payable overtime using own stage plus 25 percent", () => {
    const unconfirmed = premium(
      shift({ startTime: "08:00", endTime: "10:00", overtimeMinutes: 60 }),
    );
    expect(unconfirmed.overtimeBaseAmount + unconfirmed.overtimePremiumAmount).toBe(0);
    const confirmed = premium(
      shift({
        startTime: "08:00",
        endTime: "10:00",
        overtimeMinutes: 60,
        tariffOvertimeConfirmed: true,
      }),
    );
    expect(confirmed).toMatchObject({
      overtimeBaseAmount: 26,
      overtimePremiumAmount: 6.5,
      totalAmount: 32.5,
    });
  });
  it("caps confirmed overtime at actual paid minutes after the pause", () =>
    expect(
      premium(
        shift({
          startTime: "08:00",
          endTime: "10:00",
          breakMinutes: 60,
          overtimeMinutes: 120,
          tariffOvertimeConfirmed: true,
        }),
      ),
    ).toMatchObject({ netMinutes: 60, overtimeBaseAmount: 26, overtimePremiumAmount: 6.5 }));
  it("excludes deleted shifts, leave, training and shifts starting outside the month", () => {
    const result = calculateTvUkNursingMonth(
      "2026-10",
      [
        shift({ deletedAt: "2026-10-06" }),
        shift({ type: "VACATION" }),
        shift({ type: "TRAINING" }),
        shift({ date: "2026-09-30" }),
      ],
      work,
      selection,
      options,
    );
    expect(result.shiftBreakdowns).toEqual([]);
    expect(result.estimatedGrossAmount).toBe(4552);
  });
  it("assigns a crossing night to its starting month without double counting", () => {
    const entries = [shift({ date: "2026-10-31" })];
    expect(
      calculateTvUkNursingMonth("2026-10", entries, work, selection, options).shiftBreakdowns,
    ).toHaveLength(1);
    expect(
      calculateTvUkNursingMonth("2026-11", entries, work, selection, options).shiftBreakdowns,
    ).toHaveLength(0);
  });
  it("does not call a failed holiday lookup a zero premium", () =>
    expect(() =>
      calculateTvUkNursingShift(
        shift(),
        work,
        selection,
        options,
        createRuleResolver({ legal: [], holiday: [], tariff: [] }),
      ),
    ).toThrow());
  it("preserves an explicit assessment and reports time credit independently", () => {
    const result = calculateTvUkNursingMonth("2026-10", [shift()], work, selection, options);
    expect(result.nightCompensatoryMinutes).toBe(30);
    expect(result.estimatedGrossAmount).toBe(4619.6);
  });
  it.each([{ regularShiftWork: "yes" }, { regularShiftWork: false, paidNightBreaks: "yes" }])(
    "requires explicit valid shift assumptions %j",
    (input) =>
      expect(() =>
        calculateTvUkNursingMonth("2026-10", [], work, selection, input as never),
      ).toThrow(),
  );
  it.each(["2026-13", "2026-1", "wrong"])("rejects malformed month %s", (month) =>
    expect(() => calculateTvUkNursingMonth(month, [], work, selection, options)).toThrow(),
  );
});
