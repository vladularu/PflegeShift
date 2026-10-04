import { describe, expect, it, vi } from "vitest";
import type { OwnRemunerationConfiguration, OwnTimePremium } from "@/domain/own-remuneration";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import { createRuleResolver } from "@/rules/rule-resolver";
import { remunerationBasis } from "@/features/salary/remuneration-presentation";
import {
  calculateDatedShiftTimePremiums,
  calculateMonthlyTimeRemuneration,
} from "./remuneration-premiums";
import { calculateDatedMonthlyRemuneration } from "./remuneration-month";
import { history, resolver, shift, work } from "./remuneration-test-fixtures";

const night: OwnTimePremium = {
  id: "night",
  type: "night",
  window: { startMinute: 1320, endMinute: 360 },
  rate: { kind: "percent", basisPoints: 2500 },
};
const sunday: OwnTimePremium = {
  id: "sunday",
  type: "sunday",
  window: null,
  rate: { kind: "hourly", centsPerHour: 700 },
};
const holiday: OwnTimePremium = {
  ...sunday,
  id: "holiday",
  type: "holiday",
  rate: { kind: "hourly", centsPerHour: 1100 },
};
function config(
  rules: readonly OwnTimePremium[] = [night],
  combination: "add" | "highest" = "add",
): OwnRemunerationConfiguration {
  return {
    base: { kind: "monthly", personalCents: 200000, partialMonth: "calendar-days" },
    percentageBasisHourlyCents: 2000,
    timePremiums: { combination, rules },
    overtime: null,
    fixedAllowances: [],
    specialPayments: [],
  };
}
function own(configuration = config(), date = "2026-01-01"): DatedRemunerationProfile {
  return {
    ...history(date),
    data: { version: 2, weeklyMinutes: 1155, selection: { kind: "own-configured", configuration } },
  };
}
const run = (
  configuration = config(),
  entry = shift(),
  rules = resolver([]),
  profiles = [own(configuration)],
) => calculateDatedShiftTimePremiums(entry, work, profiles, rules);
const fixedNight = (cents: number): OwnTimePremium => ({
  ...night,
  rate: { kind: "hourly", centsPerHour: cents },
});
const sundayShift = () => shift({ date: "2026-09-20", startTime: "22:00", endTime: "23:00" });

describe("personal time premium engine", () => {
  it.each([
    ["add", 1200],
    ["highest", 700],
  ] as const)("combines mixed percentage and fixed-hourly rules using %s", (combination, cents) => {
    const result = run(config([night, sunday], combination), sundayShift());
    expect(result.totalCents).toBe(cents);
    expect(result.netMinutes).toBe(60);
    expect(result.complete).toBe(true);
    expect(result.positions.every((p) => p.source.packageId === null)).toBe(true);
  });
  it("compares unrounded rates rather than percentages or separately rounded cent amounts", () => {
    const percent = {
      ...night,
      id: "percent",
      rate: { kind: "percent" as const, basisPoints: 3333 },
    };
    const fixed = { ...night, id: "fixed", rate: { kind: "hourly" as const, centsPerHour: 666 } };
    const result = run(config([fixed, percent], "highest"));
    expect(result.totalCents).toBe(1333); // 2000 * .3333 * 2h, not 666 * 2h.
    expect(result.positions[0].basis.ruleId).toBe("percent");
  });
  it("breaks equal-rate ties by stable ID independent of input ordering", () => {
    const first = { ...fixedNight(500), id: "a" };
    const second = { ...night, id: "z" };
    for (const rules of [
      [first, second],
      [second, first],
    ]) {
      const result = run(config(rules, "highest"));
      expect(result.totalCents).toBe(1000);
      expect(result.positions).toHaveLength(1);
      expect(result.positions[0].basis.ruleId).toBe("a");
    }
  });
  it("uses the personal hourly wage directly for percentage premiums", () => {
    const result = run({
      ...config(),
      base: { kind: "hourly", centsPerHour: 2500 },
      percentageBasisHourlyCents: null,
    });
    expect(result.totalCents).toBe(1250);
    expect(result.positions[0].basis.hourlyRateCents).toBe(2500);
  });
  it("never derives a missing monthly percentage basis from TVöD or weekly hours", () => {
    const result = run({ ...config(), percentageBasisHourlyCents: null });
    expect(result.totalCents).toBeNull();
    expect(result.knownSubtotalCents).toBe(0);
    expect(result.positions.every((p) => p.issue?.code === "PREMIUM_RATE_MISSING")).toBe(true);
  });
  it("allows fixed-hourly rates and explicit zero percentages without a monthly hours formula", () => {
    expect(run({ ...config([fixedNight(700)]), percentageBasisHourlyCents: null }).totalCents).toBe(
      1400,
    );
    const zero = { ...night, rate: { kind: "percent" as const, basisPoints: 0 } };
    expect(run({ ...config([zero]), percentageBasisHourlyCents: null }).totalCents).toBe(0);
    const zeroResult = run({ ...config([zero]), percentageBasisHourlyCents: null });
    expect(zeroResult.positions).toHaveLength(1);
    expect(zeroResult.positions[0].basis.minutes).toBe(120);
  });
  it("does not require a missing percentage basis outside that rule's window", () => {
    expect(
      run(
        { ...config(), percentageBasisHourlyCents: null },
        shift({ startTime: "08:00", endTime: "10:00" }),
      ).totalCents,
    ).toBe(0);
  });
  it("keeps known addends but cannot select a highest rate against an unknown competitor", () => {
    const rules = [night, sunday];
    const added = run({ ...config(rules), percentageBasisHourlyCents: null }, sundayShift());
    expect(added.totalCents).toBeNull();
    expect(added.knownSubtotalCents).toBe(700);
    const highest = run(
      { ...config(rules, "highest"), percentageBasisHourlyCents: null },
      sundayShift(),
    );
    expect(highest.totalCents).toBeNull();
    expect(highest.knownSubtotalCents).toBe(0);
  });
  it("uses inclusive starts and exclusive ends for an ordinary window", () => {
    const rule = { ...fixedNight(600), window: { startMinute: 480, endMinute: 540 } };
    expect(run(config([rule]), shift({ startTime: "07:59", endTime: "09:01" })).totalCents).toBe(
      600,
    );
  });
  it("deducts a duration-only pause once across midnight and labels its position estimated", () => {
    const result = run(
      config([fixedNight(600)]),
      shift({ startTime: "21:00", endTime: "07:00", breakMinutes: 60 }),
    );
    expect(result.netMinutes).toBe(540);
    expect(result.totalCents).toBe(4200); // 8 qualifying hours minus 1h pause.
    expect(result.status).toBe("estimated");
    expect(result.positions[0].basis).toMatchObject({
      minutes: 420,
      pauseMethod: "centered-duration-estimate",
    });
  });
  it("does not remove a pause that lies outside the premium window", () => {
    const rule = { ...fixedNight(600), window: { startMinute: 480, endMinute: 540 } };
    expect(
      run(config([rule]), shift({ startTime: "08:00", endTime: "16:00", breakMinutes: 60 }))
        .totalCents,
    ).toBe(600);
  });
  it.each([
    ["2026-03-29", 60, 240, 120, 180],
    ["2026-10-25", 120, 180, 120, 300],
  ])(
    "counts actual elapsed premium minutes on DST date %s",
    (date, startMinute, endMinute, premiumMinutes, totalMinutes) => {
      const rule = {
        ...fixedNight(60),
        window: { startMinute: Number(startMinute), endMinute: Number(endMinute) },
      };
      const result = run(
        config([rule]),
        shift({ date: String(date), startTime: "00:00", endTime: "04:00" }),
      );
      expect(result.netMinutes).toBe(totalMinutes);
      expect(result.totalCents).toBe(premiumMinutes);
      expect(result.positions[0].basis.minutes).toBe(premiumMinutes);
    },
  );
  it("qualifies Saturday and Sunday by each worked calendar date", () => {
    const saturday = { ...fixedNight(600), id: "saturday", type: "saturday" as const };
    const result = run(config([saturday, sunday]), shift({ date: "2026-09-19" }));
    expect(result.totalCents).toBe(1300);
    expect(result.positions.map((p) => [p.basis.ruleId, p.basis.minutes])).toEqual([
      ["saturday", 60],
      ["sunday", 60],
    ]);
  });
  it("rounds a fixed-hourly rule only once when midnight does not change its accounting period", () => {
    const result = run(config([fixedNight(15)]), shift({ startTime: "23:59", endTime: "00:01" }));
    expect(result.positions).toHaveLength(1);
    expect(result.totalCents).toBe(1); // 15 * 2/60 = half a cent, HALF_UP.
  });
  it("partitions profile and month changes without reusing the previous rate", () => {
    const first = config([fixedNight(600)]);
    const second = config([fixedNight(1200)]);
    const profiles = [own(first), own(second, "2026-10-01")];
    const entry = shift({ date: "2026-09-30" });
    const result = run(first, entry, resolver([]), profiles);
    expect(result.totalCents).toBe(1800);
    expect(result.positions.map((p) => p.source.profileEffectiveFrom)).toEqual([
      "2026-01-01",
      "2026-10-01",
    ]);
    expect(calculateMonthlyTimeRemuneration("2026-09", [entry], work, profiles).totalCents).toBe(
      600,
    );
    expect(calculateMonthlyTimeRemuneration("2026-10", [entry], work, profiles).totalCents).toBe(
      1200,
    );
  });
  it("uses configured combination rules for a Sunday holiday rather than tariff exclusions", () => {
    const entry = shift({ date: "2026-11-01", startTime: "01:00", endTime: "02:00" });
    expect(run(config([night, sunday, holiday]), entry).totalCents).toBe(2300);
    expect(run(config([night, sunday, holiday], "highest"), entry).totalCents).toBe(1100);
  });
  it("leaves missing holiday coverage unknown while preserving independent addends", () => {
    const empty = createRuleResolver({ tariff: [], legal: [], holiday: [] });
    const added = run(config([night, holiday]), shift(), empty);
    expect(added.totalCents).toBeNull();
    expect(added.knownSubtotalCents).toBe(1000);
    expect(added.positions.some((p) => p.issue?.code === "HOLIDAY_RULES_UNAVAILABLE")).toBe(true);
    const highest = run(config([night, holiday], "highest"), shift(), empty);
    expect(highest.knownSubtotalCents).toBe(0);
    expect(highest.complete).toBe(false);
  });
  it("does not look up tariff or holiday rules when they are irrelevant", () => {
    const existing = resolver([]);
    const tariff = vi.fn(() => {
      throw new Error("Unexpected tariff lookup");
    });
    const holidays = vi.fn(() => {
      throw new Error("Unexpected holiday lookup");
    });
    const rules = { ...existing, resolveTariff: tariff, resolveHoliday: holidays };
    expect(run(config(), shift(), rules).totalCents).toBe(1000);
    const outside = { ...holiday, window: { startMinute: 480, endMinute: 540 } };
    expect(run(config([night, outside]), shift(), rules).totalCents).toBe(1000);
    expect(tariff).not.toHaveBeenCalled();
    expect(holidays).not.toHaveBeenCalled();
  });
  it("does not swallow an unrelated holiday resolver failure", () => {
    const existing = resolver([]);
    expect(() =>
      run(config([holiday]), shift(), {
        ...existing,
        resolveHoliday: () => {
          throw new Error("unexpected");
        },
      }),
    ).toThrow("unexpected");
  });
  it("integrates into the real monthly gross and presents a fixed rate without a fictitious percentage", () => {
    const configuration = config([fixedNight(700)]);
    const result = calculateDatedMonthlyRemuneration({
      month: "2026-09",
      shifts: [shift()],
      workProfile: work,
      history: [own(configuration)],
      allowanceEntitlements: [],
      resolver: resolver([]),
    });
    expect(result.estimatedGrossCents).toBe(201400);
    const text = remunerationBasis(result.timePremiums.positions[0]);
    expect(text).toContain("Zuschlag pro Stunde: 7,00 €");
    expect(text.some((line) => line.includes("%"))).toBe(false);
  });
  it("ignores deleted and all-day absence entries without inventing paid hours", () => {
    for (const entry of [
      shift({ deletedAt: work.updatedAt }),
      shift({ allDay: true, startTime: null, endTime: null, type: "VACATION" }),
    ])
      expect(run(config(), entry)).toMatchObject({ totalCents: 0, netMinutes: 0, positions: [] });
  });
});
