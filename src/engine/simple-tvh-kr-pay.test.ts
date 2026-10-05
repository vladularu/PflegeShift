import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";
import reference from "./simple-tvh-kr-reference.json";
import {
  TVH_KR_GROUPS,
  requireTvhKrTariff,
  tvhKrLevelsForGroup,
  type TvhKrTariff,
} from "@/domain/tvh-kr-tariff";
import type { AllowanceStatus, ShiftEntry, UserProfile } from "@/domain/types";
import { calculateTvhKrMonth, calculateTvhKrShift } from "./simple-tvh-kr-pay";
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
const options = { allowanceStatus: "NONE" as const, saturdayShiftWork: false };
function shift(overrides: Partial<ShiftEntry> = {}): ShiftEntry {
  return {
    kind: "SHIFT",
    id: "tvh-shift",
    date: "2026-07-06",
    templateId: null,
    title: "Dienst",
    type: "EARLY",
    startTime: "10:00",
    endTime: "11:00",
    breakMinutes: 0,
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
const monthlyRows = reference.flatMap((r) =>
  TVH_KR_GROUPS.flatMap((g) =>
    tvhKrLevelsForGroup(g).map((l, i) => [r.month, g, l, r.monthly[g][i]] as const),
  ),
);
const hourRows = reference.flatMap((r) =>
  [2310, 2400].flatMap((f) =>
    TVH_KR_GROUPS.flatMap((g) =>
      tvhKrLevelsForGroup(g).map(
        (l, i) => [r.month, g, l, f, (f === 2310 ? r.hourly385 : r.hourly40)[g][i]] as const,
      ),
    ),
  ),
);
const premiumRows = reference.flatMap((r) =>
  [2310, 2400].flatMap((f) =>
    TVH_KR_GROUPS.map(
      (g) => [r.month, g, f, (f === 2310 ? r.premiums385 : r.premiums40)[g]] as const,
    ),
  ),
);
function weekday(month: string, day: number) {
  let d = Temporal.PlainYearMonth.from(month).toPlainDate({ day: 1 });
  while (d.dayOfWeek !== day) d = d.add({ days: 1 });
  return d.toString();
}
describe("simple TV-H nursing", () => {
  it.each(monthlyRows)(
    "matches source monthly table %s %s %s",
    (month, payGroup, payLevel, cents) => {
      const r = calculateTvhKrMonth(month, [], work, { ...selection, payGroup, payLevel }, options);
      expect(r.fullTimeTableAmount).toBe(cents / 100);
      expect(r.personalBaseAmount).toBe(cents / 100);
    },
  );
  it("covers all 192 official monthly cells", () => expect(monthlyRows).toHaveLength(192));
  it.each(hourRows)(
    "matches official hourly cents %s %s %s / %i",
    (month, payGroup, payLevel, fullTimeWeeklyMinutes, cents) => {
      const s = { payGroup, payLevel, fullTimeWeeklyMinutes } as TvhKrTariff;
      const w = { ...work, weeklyMinutes: fullTimeWeeklyMinutes };
      const r = calculateTvhKrMonth(month, [], w, s, options);
      expect(
        Math.round(
          (r.fullTimeTableAmount! * 10000) / Math.round((fullTimeWeeklyMinutes * 4348) / 600),
        ),
      ).toBe(cents);
      const ot = calculateTvhKrShift(
        shift({ date: weekday(month, 1), overtimeMinutes: 60, tariffOvertimeConfirmed: true }),
        w,
        s,
        options,
      );
      const ref = reference.find((x) => x.month === month)!;
      const levels = tvhKrLevelsForGroup(payGroup);
      const cap = typeof payLevel === "number" && payLevel > 4 ? 4 : payLevel;
      expect(ot.overtimeBaseAmount).toBe(
        (fullTimeWeeklyMinutes === 2310 ? ref.hourly385 : ref.hourly40)[payGroup][
          levels.indexOf(cap)
        ] / 100,
      );
    },
  );
  it.each(premiumRows)(
    "matches printed premium rates %s %s / %i",
    (month, payGroup, fullTimeWeeklyMinutes, rates) => {
      const s = { payGroup, payLevel: 4, fullTimeWeeklyMinutes } as TvhKrTariff;
      const w = { ...work, weeklyMinutes: fullTimeWeeklyMinutes };
      const year = month.slice(0, 4);
      const cases: [string, string, string, string, number, Partial<ShiftEntry>?][] = [
        [weekday(month, 1), "21:00", "22:00", "night", rates[7]],
        [
          Temporal.PlainDate.from(weekday(month, 7)).add({ days: 7 }).toString(),
          "10:00",
          "11:00",
          "sunday",
          rates[2],
        ],
        [year + "-10-03", "10:00", "11:00", "holiday", rates[4]],
        [
          year + "-10-03",
          "10:00",
          "11:00",
          "holiday",
          rates[3],
          { holidayPremiumMode: "WITHOUT_TIME_OFF" },
        ],
        [year + "-12-24", "06:00", "07:00", "preholiday", rates[5]],
        [weekday(month, 6), "13:00", "14:00", "saturday", rates[9]],
      ];
      for (const [date, startTime, endTime, key, cents, extra] of cases)
        expect(
          calculateTvhKrShift(
            shift({ date, startTime, endTime, ...extra }),
            w,
            s,
            options,
          ).premiumLines.find((p) => p.key === key)?.amount,
        ).toBe(cents / 100);
      const ot = calculateTvhKrShift(
        shift({ date: weekday(month, 1), overtimeMinutes: 60, tariffOvertimeConfirmed: true }),
        w,
        s,
        options,
      );
      expect(ot.overtimePremiumAmount).toBe(rates[1] / 100);
    },
  );
  it.each(["1a", "1b"] as const)("preserves distinct entry step %s", (payLevel) =>
    expect(requireTvhKrTariff({ ...selection, payGroup: "KR5", payLevel })?.payLevel).toBe(
      payLevel,
    ),
  );
  it.each([
    { ...selection, payLevel: 1 },
    { ...selection, payLevel: "1a" },
    { ...selection, payGroup: "KR17" },
    { ...selection, payLevel: 7 },
    { ...selection, fullTimeWeeklyMinutes: 2340 },
    { ...selection, extra: true },
  ])("rejects invalid TV-H selection", (value) =>
    expect(() => requireTvhKrTariff(value)).toThrow(),
  );
  it.each([
    ["2025-07", null, 0],
    ["2025-08", 3989.14, 138.04],
    ["2026-06", 3989.14, 138.04],
    ["2026-07", 4108.81, 142.22],
    ["2027-09", 4108.81, 142.22],
    ["2027-10", 4223.86, 146.2],
  ] as const)("switches dates %s", (month, amount, care) => {
    const r = calculateTvhKrMonth(month, [], work, selection, options);
    expect(r.fullTimeTableAmount).toBe(amount);
    expect(r.careAllowanceAmount).toBe(care);
    expect(r.available).toBe(amount !== null);
  });
  it("includes nursing allowance only KR5–12 and no TVöD-specific allowance", () => {
    for (const g of TVH_KR_GROUPS) {
      const r = calculateTvhKrMonth("2026-10", [], work, { ...selection, payGroup: g }, options);
      expect(r.careAllowanceAmount).toBe(Number(g.slice(2)) <= 12 ? 142.22 : 0);
      expect(r.tvoedAllowanceAmount).toBe(0);
    }
  });
  it("scales base and monthly allowances once for part time, premiums use full-time stage3", () => {
    const r = calculateTvhKrMonth("2026-10", [], { ...work, weeklyMinutes: 1155 }, selection, {
      ...options,
      allowanceStatus: "ALTERNATING_MONTHLY",
    });
    expect(r.personalBaseAmount).toBe(2054.41);
    expect(r.careAllowanceAmount).toBe(71.11);
    expect(r.allowanceAmount).toBe(100);
  });
  it.each([
    ["2026-09", "SHIFT_MONTHLY", 40],
    ["2026-10", "SHIFT_MONTHLY", 100],
    ["2026-09", "ALTERNATING_MONTHLY", 105],
    ["2026-10", "ALTERNATING_MONTHLY", 200],
  ] as const)("dates shift allowance %s %s", (month, allowanceStatus, amount) =>
    expect(
      calculateTvhKrMonth(month, [], work, selection, { ...options, allowanceStatus })
        .allowanceAmount,
    ).toBe(amount),
  );
  it("splits hourly allowance across October boundary", () => {
    const r = calculateTvhKrMonth(
      "2026-09",
      [shift({ date: "2026-09-30", startTime: "23:00", endTime: "01:00" })],
      work,
      selection,
      { ...options, allowanceStatus: "SHIFT_HOURLY" },
    );
    expect(r.allowanceAmount).toBe(0.84);
  });
  it("does not pay ordinary nursing Saturday premium during shift work", () =>
    expect(
      calculateTvhKrShift(
        shift({ date: "2026-10-10", startTime: "13:00", endTime: "14:00" }),
        work,
        selection,
        { ...options, saturdayShiftWork: true },
      ).premiumLines,
    ).toEqual([]));
  it("pays highest calendar premium together with night", () => {
    const r = calculateTvhKrShift(
      shift({ date: "2027-10-03", startTime: "00:00", endTime: "01:00" }),
      work,
      selection,
      options,
    );
    expect(r.premiumLines.map((p) => p.key)).toEqual(["night", "holiday"]);
  });
  it("keeps proper night and preholiday cutoffs", () => {
    const r = calculateTvhKrShift(
      shift({ date: "2026-12-24", startTime: "05:00", endTime: "07:00" }),
      work,
      selection,
      options,
    );
    expect(r.premiumLines.find((p) => p.key === "preholiday")?.minutes).toBe(60);
    expect(r.premiumLines.find((p) => p.key === "night")?.minutes).toBe(60);
  });
  it("rounds hourly premium before accumulated hours", () =>
    expect(
      calculateTvhKrShift(
        shift({ date: "2026-07-05", startTime: "10:00", endTime: "12:00" }),
        work,
        selection,
        options,
      ).premiumLines[0].amount,
    ).toBe(11.64));
  it("deducts unpaid pauses but includes paid alternating shift pauses", () => {
    const s = shift({ startTime: "21:00", endTime: "07:00", breakMinutes: 60 });
    const unpaid = calculateTvhKrShift(s, work, selection, options);
    const paid = calculateTvhKrShift(s, work, selection, {
      ...options,
      allowanceStatus: "ALTERNATING_MONTHLY",
    });
    expect(unpaid.netMinutes).toBe(540);
    expect(paid.netMinutes).toBe(600);
    expect(unpaid.premiumLines[0].minutes).toBe(480);
    expect(paid.premiumLines[0].minutes).toBe(540);
  });
  it.each([
    ["2026-03-28", 480],
    ["2026-10-24", 600],
  ] as const)("counts actual minutes over DST %s", (date, minutes) =>
    expect(
      calculateTvhKrShift(
        shift({ date, startTime: "21:00", endTime: "06:00" }),
        work,
        selection,
        options,
      ).netMinutes,
    ).toBe(minutes),
  );
  it("ignores unconfirmed overtime and deleted/non-work entries", () => {
    expect(
      calculateTvhKrShift(shift({ overtimeMinutes: 60 }), work, selection, options)
        .overtimeBaseAmount,
    ).toBe(0);
    expect(
      calculateTvhKrShift(shift({ deletedAt: work.createdAt }), work, selection, options)
        .totalAmount,
    ).toBe(0);
    expect(
      calculateTvhKrShift(shift({ type: "VACATION" }), work, selection, options).totalAmount,
    ).toBe(0);
  });
  it.each([0, -1, 2400, 2310.5])(
    "does not fabricate pay for invalid contracted minutes %s",
    (weeklyMinutes) =>
      expect(
        calculateTvhKrMonth("2026-10", [], { ...work, weeklyMinutes }, selection, options)
          .available,
      ).toBe(false),
  );
  it("rejects malformed month and invalid allowance inputs", () => {
    expect(() => calculateTvhKrMonth("2026-13", [], work, selection, options)).toThrow();
    expect(() =>
      calculateTvhKrMonth("2026-10", [], work, selection, {
        ...options,
        allowanceStatus: "BAD" as AllowanceStatus,
      }),
    ).toThrow();
  });
});
