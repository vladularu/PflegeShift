import { describe, expect, it } from "vitest";
import reference from "./simple-tvl-kr-table-reference.json";
import {
  requireTvlKrTariff,
  tvlKrLevelsForGroup,
  type TvlKrGroup,
  type TvlKrTariff,
} from "@/domain/tvl-kr-tariff";
import type { AllowanceStatus, PayLevel, ShiftEntry, UserProfile } from "@/domain/types";
import { bundledRuleResolver } from "@/rules/rule-resolver";
import {
  calculateTvlKrMonth,
  calculateTvlKrShift,
  getTvlKrUniversityFullTimeMinutes,
} from "./simple-tvl-kr-pay";

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
const selection: TvlKrTariff = { payGroup: "KR8", payLevel: 4 };
const options = { allowanceStatus: "NONE" as const, saturdayShiftWork: true };
function shift(overrides: Partial<ShiftEntry> = {}): ShiftEntry {
  return {
    kind: "SHIFT",
    id: "tvl-shift",
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
const refs = reference as [string, TvlKrGroup, PayLevel, number][];

describe("simple TV-L nursing at university hospitals", () => {
  it.each(refs)(
    "matches independently extracted TdL table %s %s step %i",
    (month, payGroup, payLevel, cents) => {
      const result = calculateTvlKrMonth(month, [], work, { payGroup, payLevel }, "WEST", options);
      expect(result.available).toBe(true);
      expect(result.fullTimeTableAmount).toBe(cents / 100);
      expect(result.personalBaseAmount).toBe(cents / 100);
    },
  );
  it("keeps the independent reference complete", () => expect(refs).toHaveLength(268));
  it.each([
    ["2025-11", 159.06],
    ["2026-04", 163.51],
    ["2027-03", 166.78],
    ["2028-01", 168.45],
  ] as const)("includes the sourced general nursing allowance in %s", (month, amount) => {
    const result = calculateTvlKrMonth(month, [], work, selection, "WEST", options);
    expect(result.careAllowanceAmount).toBe(amount);
    expect(result.tvoedAllowanceAmount).toBe(0);
  });
  it("shows ordinary nursing pay without inventing a 45-euro functional allowance", () => {
    const result = calculateTvlKrMonth("2026-10", [], work, selection, "WEST", options);
    expect(result.personalBaseAmount).toBe(4052.74);
    expect(result.estimatedGrossAmount).toBe(4216.25);
    expect(result.confirmedAllowance).toBeNull();
  });
  it("scales base, nursing allowance and monthly shift allowance by personal part time", () => {
    const result = calculateTvlKrMonth(
      "2026-07",
      [],
      { ...work, weeklyMinutes: 1155 },
      selection,
      "WEST",
      { ...options, allowanceStatus: "ALTERNATING_MONTHLY" },
    );
    expect(result.personalBaseAmount).toBe(2026.37);
    expect(result.careAllowanceAmount).toBe(81.76);
    expect(result.allowanceAmount).toBe(125);
    expect(result.estimatedGrossAmount).toBe(2233.13);
  });
  it.each([
    ["2026-06", "SHIFT_MONTHLY", 60],
    ["2026-07", "SHIFT_MONTHLY", 100],
    ["2026-06", "ALTERNATING_MONTHLY", 150],
    ["2026-07", "ALTERNATING_MONTHLY", 250],
  ] as const)("selects dated %s %s allowance", (month, allowanceStatus, amount) => {
    expect(
      calculateTvlKrMonth(month, [], work, selection, "WEST", { ...options, allowanceStatus })
        .allowanceAmount,
    ).toBe(amount);
  });
  it.each([
    ["2026-06", "SHIFT_HOURLY", 2.16],
    ["2026-07", "SHIFT_HOURLY", 5.4],
    ["2026-06", "ALTERNATING_HOURLY", 5.67],
    ["2026-07", "ALTERNATING_HOURLY", 13.41],
  ] as const)("uses only actual net duty time for %s %s", (month, allowanceStatus, amount) => {
    const result = calculateTvlKrMonth(
      month,
      [shift({ date: month + "-08" })],
      work,
      selection,
      "WEST",
      { ...options, allowanceStatus },
    );
    expect(result.shiftBreakdowns[0].netMinutes).toBe(540);
    expect(result.allowanceAmount).toBe(amount);
  });
  it.each([
    ["2026-12-31", 2400],
    ["2027-01-01", 2370],
    ["2027-12-31", 2370],
    ["2028-01-01", 2340],
    ["2028-12-31", 2340],
    ["2029-01-01", 2310],
  ] as const)("uses university hospital East hours at %s", (date, minutes) => {
    expect(getTvlKrUniversityFullTimeMinutes(date, "EAST")).toBe(minutes);
    expect(getTvlKrUniversityFullTimeMinutes(date, "WEST")).toBe(2310);
  });
  it("changes Eastern university hourly basis without changing the monthly table in January 2027", () => {
    const old = calculateTvlKrMonth(
      "2026-12",
      [],
      { ...work, weeklyMinutes: 1200 },
      selection,
      "EAST",
      options,
    );
    const next = calculateTvlKrMonth(
      "2027-01",
      [],
      { ...work, weeklyMinutes: 1200 },
      selection,
      "EAST",
      options,
    );
    expect(old.fullTimeTableAmount).toBe(next.fullTimeTableAmount);
    expect(old.personalBaseAmount).toBe(2026.37);
    expect(next.personalBaseAmount).toBe(2052.02);
    const before = calculateTvlKrShift(
      shift({ date: "2026-12-14" }),
      { ...work, weeklyMinutes: 2400 },
      selection,
      "EAST",
      true,
    );
    const after = calculateTvlKrShift(
      shift({ date: "2027-01-04" }),
      { ...work, weeklyMinutes: 2370 },
      selection,
      "EAST",
      true,
    );
    expect(before.premiumLines.find((p) => p.key === "night")?.hourlyRate).toBe(22.06);
    expect(after.premiumLines.find((p) => p.key === "night")?.hourlyRate).toBe(22.34);
  });
  it("uses KR step 3 rather than the selected step for all time premiums", () => {
    const first = calculateTvlKrShift(shift(), work, { ...selection, payLevel: 2 }, "WEST", true);
    const sixth = calculateTvlKrShift(shift(), work, { ...selection, payLevel: 6 }, "WEST", true);
    expect(first.premiumLines).toEqual(sixth.premiumLines);
    expect(first.premiumLines).toEqual([
      expect.objectContaining({
        key: "night",
        minutes: 480,
        hourlyRate: 22.92,
        percentage: 20,
        amount: 36.67,
      }),
    ]);
  });
  it.each([
    [true, 1.28, 0.64, 100],
    [false, 9.17, 22.92, 20],
  ] as const)("handles Saturday shift work %s", (shiftWork, amount, hourlyRate, percentage) => {
    const result = calculateTvlKrShift(
      shift({ date: "2026-07-11", startTime: "13:00", endTime: "15:00", breakMinutes: 0 }),
      work,
      selection,
      "WEST",
      shiftWork,
    );
    expect(result.premiumLines).toEqual([
      expect.objectContaining({ key: "saturday", minutes: 120, amount, hourlyRate, percentage }),
    ]);
  });
  it.each([
    ["WITH_TIME_OFF", 16.04],
    ["WITHOUT_TIME_OFF", 61.88],
  ] as const)(
    "uses the highest holiday/Saturday premium with mode %s",
    (holidayPremiumMode, amount) => {
      const result = calculateTvlKrShift(
        shift({
          date: "2026-10-03",
          startTime: "13:00",
          endTime: "15:00",
          breakMinutes: 0,
          holidayPremiumMode,
        }),
        work,
        selection,
        "WEST",
        true,
      );
      expect(result.premiumLines).toEqual([expect.objectContaining({ key: "holiday", amount })]);
    },
  );
  it("adds night to the highest holiday/Sunday premium, without paying Sunday twice", () => {
    const result = calculateTvlKrShift(
      shift({ date: "2026-11-01", startTime: "21:00", endTime: "23:00", breakMinutes: 0 }),
      work,
      selection,
      "WEST",
      true,
    );
    expect(result.premiumLines).toEqual([
      expect.objectContaining({ key: "night", amount: 9.17 }),
      expect.objectContaining({ key: "holiday", amount: 16.04 }),
    ]);
    expect(result.totalAmount).toBe(25.21);
  });
  it.each(["2026-12-24", "2026-12-31"])(
    "starts the preholiday supplement at 06:00 on %s",
    (date) => {
      const result = calculateTvlKrShift(
        shift({ date, startTime: "05:00", endTime: "07:00", breakMinutes: 0 }),
        work,
        selection,
        "WEST",
        true,
      );
      expect(result.premiumLines).toEqual([
        expect.objectContaining({ key: "night", minutes: 60 }),
        expect.objectContaining({ key: "preholiday", minutes: 60, amount: 8.02 }),
      ]);
    },
  );
  it("counts the repeated hour during autumn daylight saving time only where it occurs", () => {
    const result = calculateTvlKrShift(
      shift({ date: "2026-10-24" }),
      work,
      selection,
      "WEST",
      true,
    );
    expect(result.netMinutes).toBe(600);
    expect(result.premiumLines.find((p) => p.key === "night")).toMatchObject({
      minutes: 540,
      amount: 41.26,
    });
    expect(result.premiumLines.find((p) => p.key === "sunday")).toMatchObject({
      minutes: 420,
      amount: 40.11,
    });
  });
  it("counts fewer actual night minutes over the spring clock change", () => {
    const result = calculateTvlKrShift(
      shift({ date: "2026-03-28" }),
      work,
      selection,
      "WEST",
      true,
    );
    expect(result.netMinutes).toBe(480);
    expect(result.premiumLines.find((p) => p.key === "night")?.minutes).toBe(420);
  });
  it("splits a tariff change at midnight into the correct hourly bases", () => {
    const result = calculateTvlKrShift(
      shift({ date: "2027-02-28" }),
      work,
      selection,
      "WEST",
      true,
    );
    expect(result.premiumLines.find((p) => p.key === "night")).toMatchObject({
      minutes: 480,
      amount: 37.13,
    });
    expect(result.premiumLines.find((p) => p.key === "sunday")?.amount).toBe(17.19);
  });
  it("caps confirmed overtime base at step 4 and uses step 3 for the 30-percent supplement", () => {
    const result = calculateTvlKrShift(
      shift({
        startTime: "08:00",
        endTime: "16:00",
        breakMinutes: 0,
        overtimeMinutes: 60,
        tariffOvertimeConfirmed: true,
      }),
      work,
      { ...selection, payLevel: 6 },
      "WEST",
      true,
    );
    expect(result.overtimeBaseAmount).toBe(24.21);
    expect(result.overtimePremiumAmount).toBe(6.88);
    expect(result.totalAmount).toBe(31.09);
  });
  it("uses the mapped 15-percent overtime rate for KR13", () => {
    const result = calculateTvlKrShift(
      shift({
        startTime: "08:00",
        endTime: "16:00",
        breakMinutes: 0,
        overtimeMinutes: 60,
        tariffOvertimeConfirmed: true,
      }),
      work,
      { payGroup: "KR13", payLevel: 6 },
      "WEST",
      true,
    );
    expect(result.overtimeBaseAmount).toBe(32.3);
    expect(result.overtimePremiumAmount).toBe(4.5);
  });
  it("does not turn unconfirmed overtime into salary", () => {
    const result = calculateTvlKrShift(
      shift({ overtimeMinutes: 60 }),
      work,
      selection,
      "WEST",
      true,
    );
    expect(result.overtimeBaseAmount).toBe(0);
    expect(result.overtimePremiumAmount).toBe(0);
  });
  it("does not infer a night premium from a title", () => {
    const result = calculateTvlKrShift(
      shift({
        title: "Nacht",
        type: "CUSTOM",
        startTime: "08:00",
        endTime: "16:00",
        breakMinutes: 0,
      }),
      work,
      selection,
      "WEST",
      true,
    );
    expect(result.premiumLines).toEqual([]);
  });
  it.each([
    { deletedAt: "2026-01-01T00:00:00Z" },
    { type: "VACATION" as const, allDay: true, startTime: null, endTime: null },
    { type: "TRAINING" as const },
    { date: "2026-08-03" },
  ])("ignores deleted, absent, school and other-month records %j", (overrides) => {
    const result = calculateTvlKrMonth(
      "2026-07",
      [shift(overrides)],
      work,
      selection,
      "WEST",
      options,
    );
    expect(result.shiftBreakdowns).toEqual([]);
    expect(result.timePremiumAmount).toBe(0);
  });
  it.each([0, -1, 2311, NaN, Infinity, 100.5])(
    "leaves invalid weekly minutes %s unavailable",
    (weeklyMinutes) => {
      const result = calculateTvlKrMonth(
        "2026-07",
        [],
        { ...work, weeklyMinutes },
        selection,
        "WEST",
        options,
      );
      expect(result.available).toBe(false);
      expect(result.estimatedGrossAmount).toBeNull();
    },
  );
  it("does not depend on any employee tariff selected by the remote catalog", () => {
    const resolver = {
      ...bundledRuleResolver,
      resolveTariff() {
        throw new Error("Remote tariff must not be read");
      },
    };
    expect(
      calculateTvlKrMonth("2026-07", [shift()], work, selection, "WEST", options, resolver)
        .available,
    ).toBe(true);
  });
  it("does not replace missing holiday rules with zero euro", () => {
    const resolver = {
      ...bundledRuleResolver,
      resolveHoliday(date: string) {
        return {
          ok: false as const,
          error: {
            code: "RULE_PACKAGE_NOT_FOUND" as const,
            kind: "HOLIDAY" as const,
            packageId: "german-holidays",
            effectiveDate: date,
            message: "Holiday source missing",
          },
        };
      },
    };
    expect(() => calculateTvlKrShift(shift(), work, selection, "WEST", true, resolver)).toThrow(
      "Holiday source missing",
    );
  });
  it("keeps unsupported dates unavailable and rejects a crossing duty", () => {
    expect(calculateTvlKrMonth("2025-10", [], work, selection, "WEST", options).available).toBe(
      false,
    );
    expect(getTvlKrUniversityFullTimeMinutes("2025-10-31", "WEST")).toBeNull();
    expect(() =>
      calculateTvlKrShift(shift({ date: "2025-10-31" }), work, selection, "WEST", true),
    ).toThrow("TV-L-Pflegetabelle");
  });
  it.each([
    {},
    [],
    { payGroup: "P8", payLevel: 4 },
    { payGroup: "KR7", payLevel: 1 },
    { payGroup: "KR8", payLevel: "4" },
    { payGroup: "KR8", payLevel: 4, sector: "BT_K" },
  ])("rejects invalid or foreign salary selections %j", (value) =>
    expect(() => requireTvlKrTariff(value)).toThrow("TV-L"),
  );
  it("offers only the sourced KR levels", () => {
    expect(tvlKrLevelsForGroup("KR5")).toEqual([1, 2, 3, 4, 5, 6]);
    expect(tvlKrLevelsForGroup("KR6")).toEqual([1, 2, 3, 4, 5, 6]);
    expect(tvlKrLevelsForGroup("KR7")).toEqual([2, 3, 4, 5, 6]);
    expect(requireTvlKrTariff(null)).toBeNull();
  });
  it("rejects malformed or contradictory calculation options", () => {
    expect(() => calculateTvlKrMonth("2026-7", [], work, selection, "WEST", options)).toThrow();
    expect(() =>
      calculateTvlKrMonth("2026-07", [], work, selection, "WEST", {
        ...options,
        allowanceStatus: "INVALID" as AllowanceStatus,
      }),
    ).toThrow();
    expect(() =>
      calculateTvlKrMonth("2026-07", [], work, selection, "WEST", {
        ...options,
        confirmedAllowance: "SHIFT_MONTHLY",
      }),
    ).toThrow();
  });
});
