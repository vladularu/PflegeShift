import { describe, expect, it } from "vitest";
import reference from "./simple-tval-table-reference.json";
import { requireTvalPflegeTariff, type TvalPflegeTariff } from "@/domain/tval-pflege-tariff";
import type { ShiftEntry, UserProfile } from "@/domain/types";
import {
  calculateTvalPflegeMonth,
  calculateTvalPflegeShift,
  getTvalPflegeFullTimeMinutes,
  getTvalPflegeRulePackage,
} from "./simple-tval-pflege-pay";
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

const refs = reference as [string, 1 | 2 | 3, number][];
const run = (
  month = "2026-10",
  changes: Partial<UserProfile> = {},
  allowanceStatus = options.allowanceStatus as
    | typeof options.allowanceStatus
    | "SHIFT_MONTHLY"
    | "ALTERNATING_MONTHLY"
    | "SHIFT_HOURLY"
    | "ALTERNATING_HOURLY",
  shifts: ShiftEntry[] = [],
) =>
  calculateTvalPflegeMonth(month, shifts, { ...work, ...changes }, selection, {
    ...options,
    allowanceStatus,
  });
const day = (date: string, startTime = "08:00", endTime = "10:00") =>
  shift({ date, startTime, endTime, breakMinutes: 0 });
describe("simple TVA-L Pflege at university hospitals", () => {
  it.each(refs)("matches independent PDF table %s year%i", (month, trainingYear, cents) => {
    const value = calculateTvalPflegeMonth(
      month,
      [],
      work,
      { ...selection, trainingYear },
      options,
    );
    expect(value.available).toBe(true);
    expect(value.fullTimeTableAmount).toBe(cents / 100);
    expect(value.personalBaseAmount).toBe(cents / 100);
    expect(value.estimatedGrossAmount).toBe(cents / 100);
  });
  it("has all fifteen independent reference values", () => expect(refs).toHaveLength(15));
  it.each([
    ["2026-12-31", 2400],
    ["2027-01-01", 2370],
    ["2028-01-01", 2340],
    ["2029-01-01", 2310],
  ] as const)("uses dated East university full time at%s", (date, minutes) =>
    expect(getTvalPflegeFullTimeMinutes(date, "EAST")).toBe(minutes),
  );
  it("keeps West full time at38.5 hours", () =>
    expect(getTvalPflegeFullTimeMinutes("2027-03-01", "WEST")).toBe(2310));
  it("never relabels source DRAFT packages as remotely active", () => {
    const p = getTvalPflegeRulePackage("2026-10-01")!;
    expect(p.status).toBe("DRAFT");
    expect(p.review.status).toBe("DRAFT");
  });
  it("scales monthly base and 75 percent allowance once for part time", () => {
    const p = run("2026-10", { weeklyMinutes: 1155 }, "ALTERNATING_MONTHLY");
    expect(p.personalBaseAmount).toBe(720.35);
    expect(p.allowanceAmount).toBe(93.75);
    expect(p.estimatedGrossAmount).toBe(814.1);
  });
  it.each([
    ["2026-06", "SHIFT_MONTHLY", 45],
    ["2026-06", "ALTERNATING_MONTHLY", 112.5],
    ["2026-07", "SHIFT_MONTHLY", 75],
    ["2026-07", "ALTERNATING_MONTHLY", 187.5],
  ] as const)("dates 75 percent shift rate %s %s", (month, status, amount) =>
    expect(run(month, {}, status).allowanceAmount).toBe(amount),
  );
  it("rounds hourly allowance share before multiplying worked hours", () => {
    const p = run("2026-10", {}, "ALTERNATING_HOURLY", [shift({ date: "2026-10-05" })]);
    expect(p.allowanceAmount).toBe(10.08);
  });
  it("does not import employee nursing allowance", () => {
    const p = run();
    expect(p.careAllowanceAmount).toBe(0);
    expect(p.tvoedAllowanceAmount).toBe(0);
  });
  it("keeps a confirmed decision separate", () =>
    expect(
      calculateTvalPflegeMonth("2026-10", [], work, selection, {
        ...options,
        allowanceStatus: "SHIFT_MONTHLY",
        confirmedAllowance: "SHIFT_MONTHLY",
      }).confirmedAllowance,
    ).toBe("SHIFT_MONTHLY"));
  it("uses training hourly basis and rounds premium hourly before total", () => {
    const p = calculateTvalPflegeShift(shift({ date: "2026-10-05" }), work, selection, true);
    expect(p.netMinutes).toBe(540);
    expect(p.premiumLines).toEqual([
      expect.objectContaining({ key: "night", minutes: 480, hourlyRate: 8.61, amount: 13.76 }),
    ]);
  });
  it.each([
    ["2026-10-04", "sunday", 4.3],
    ["2026-10-03", "holiday", 6.02],
  ] as const)("calculates%s %s", (date, key, amount) =>
    expect(calculateTvalPflegeShift(day(date), work, selection, true).premiumLines).toEqual([
      expect.objectContaining({ key, amount }),
    ]),
  );
  it("uses without-time-off holiday rate and highest calendar premium", () => {
    const p = calculateTvalPflegeShift(
      { ...day("2026-12-27"), date: "2026-12-26", holidayPremiumMode: "WITHOUT_TIME_OFF" },
      work,
      selection,
      true,
    );
    expect(p.premiumLines).toEqual([expect.objectContaining({ key: "holiday", amount: 23.24 })]);
  });
  it.each(["2026-12-24", "2026-12-31"])("starts preholiday at06:00%s", (date) => {
    const p = calculateTvalPflegeShift(day(date, "05:00", "07:00"), work, selection, true);
    expect(p.premiumLines).toEqual([
      expect.objectContaining({ key: "night", minutes: 60, amount: 1.72 }),
      expect.objectContaining({ key: "preholiday", minutes: 60, amount: 3.01 }),
    ]);
  });
  it.each([
    [true, 0.64],
    [false, 1.72],
  ] as const)("uses explicit Saturday shift scope %s", (scope, amount) =>
    expect(
      calculateTvalPflegeShift(day("2026-10-10", "14:00", "15:00"), work, selection, scope)
        .premiumLines,
    ).toEqual([expect.objectContaining({ key: "saturday", amount })]),
  );
  it("keeps full-time hourly premium when personal base is part time", () =>
    expect(
      calculateTvalPflegeShift(day("2026-10-04"), { ...work, weeklyMinutes: 1155 }, selection, true)
        .premiumLines[0].amount,
    ).toBe(4.3));
  it("counts repeated autumn hour with actual paused net time", () => {
    const p = calculateTvalPflegeShift(shift({ date: "2026-10-24" }), work, selection, true);
    expect(p.netMinutes).toBe(600);
    expect(p.premiumLines.find((l) => l.key === "night")).toMatchObject({
      minutes: 540,
      amount: 15.48,
    });
    expect(p.premiumLines.find((l) => l.key === "sunday")).toMatchObject({
      minutes: 420,
      amount: 15.05,
    });
  });
  it("counts spring skipped hour", () => {
    const p = calculateTvalPflegeShift(shift({ date: "2026-03-28" }), work, selection, true);
    expect(p.netMinutes).toBe(480);
    expect(p.premiumLines.find((l) => l.key === "night")).toMatchObject({
      minutes: 420,
      amount: 11.55,
    });
  });
  it("splits training increase at midnight", () => {
    const p = calculateTvalPflegeShift(shift({ date: "2027-02-28" }), work, selection, true);
    expect(p.premiumLines.find((l) => l.key === "night")).toMatchObject({
      minutes: 480,
      amount: 14.11,
    });
  });
  it("only pays explicitly confirmed overtime", () => {
    const s = { ...day("2026-10-05", "08:00", "16:00"), overtimeMinutes: 60 };
    expect(calculateTvalPflegeShift(s, work, selection, true).overtimeBaseAmount).toBe(0);
    const p = calculateTvalPflegeShift(
      { ...s, tariffOvertimeConfirmed: true },
      work,
      selection,
      true,
    );
    expect(p.overtimeBaseAmount).toBe(8.61);
    expect(p.overtimePremiumAmount).toBe(2.58);
    expect(p.totalAmount).toBe(11.19);
  });
  it("uses training overtime without employee level cap", () => {
    const p = calculateTvalPflegeShift(
      {
        ...day("2026-10-05", "08:00", "16:00"),
        overtimeMinutes: 60,
        tariffOvertimeConfirmed: true,
      },
      work,
      { ...selection, trainingYear: 3 },
      true,
    );
    expect(p.overtimeBaseAmount).toBe(9.64);
    expect(p.overtimePremiumAmount).toBe(2.89);
  });
  it("ignores deleted and other-month shifts in monthly totals", () =>
    expect(
      run("2026-10", {}, "NONE", [
        shift(),
        shift({ date: "2026-10-05", deletedAt: "2026-10-06T00:00:00Z" }),
      ]).timePremiumAmount,
    ).toBe(0));
  it.each([0, -1, 2400, NaN, 2310.5])(
    "makes invalid weeklyminutes%s unavailable",
    (weeklyMinutes) => expect(run("2026-10", { weeklyMinutes }).available).toBe(false),
  );
  it("keeps months before checked sources unavailable", () => {
    const p = run("2025-10");
    expect(p.available).toBe(false);
    expect(p.estimatedGrossAmount).toBeNull();
    expect(getTvalPflegeRulePackage("2025-10-31")).toBeNull();
  });
  it("rejects an out-of-source service", () =>
    expect(() =>
      calculateTvalPflegeShift(shift({ date: "2025-10-31" }), work, selection, true),
    ).toThrow(/TVA-L/));
  it.each([
    {},
    [],
    "TVA-L",
    { ...selection, trainingYear: 4 },
    { ...selection, universityRegion: "OTHER" },
    { ...selection, sector: "BT_K" },
  ])("rejects malformed selection%j", (value) =>
    expect(() => requireTvalPflegeTariff(value)).toThrow(),
  );
  it("accepts only the explicit two-field training selection", () => {
    expect(requireTvalPflegeTariff(selection)).toEqual(selection);
    expect(requireTvalPflegeTariff(null)).toBeNull();
  });
  it("rejects invalid month or contradictory allowance decision", () => {
    expect(() => run("2026-13")).toThrow();
    expect(() =>
      calculateTvalPflegeMonth("2026-10", [], work, selection, {
        ...options,
        confirmedAllowance: "SHIFT_MONTHLY",
      }),
    ).toThrow();
  });
});
