import { describe, expect, it } from "vitest";
import oldValue from "../../rules/packages/reviewed/tvaoed-pflege-vka/2025-04.json";
import newValue from "../../rules/packages/reviewed/tvaoed-pflege-vka/2026-05.json";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { createRuleResolver } from "@/rules/rule-resolver";
import { BUNDLED_LEGAL_RULES } from "@/rules/bundled-rules";
import { calculateDatedShiftTimePremiums } from "./remuneration-premiums";
import { history, resolver, shift, work } from "./remuneration-test-fixtures";

function training(
  from = "2025-04-01",
  year = "1",
  weeklyMinutes = 2310,
  variant = "BT_K",
): DatedRemunerationProfile {
  return {
    ...history(from),
    data: {
      version: 1,
      weeklyMinutes,
      selection: {
        kind: "tariff",
        packageId: "tvaoed-pflege-vka",
        variant,
        region: "OTHER",
        group: "b",
        level: year,
        fullTimeWeeklyMinutes: variant === "BT_K" ? 2310 : 2340,
      },
    },
  };
}
const packages = [oldValue, newValue] as RuleTariffPackage[];
const catalog = resolver(packages);
const run = (entry = shift(), profiles = [training()], rules = catalog, month?: string) =>
  calculateDatedShiftTimePremiums(entry, work, profiles, rules, month);

describe("TVAöD-Pflege time premiums", () => {
  // VKA 2026 b/year 1: 1490.69 / (38.5 × 4.348) = 8.91 EUR/hour.
  // Expectations below are independent reference arithmetic, not read from JSON.
  it.each([
    ["NIGHT", "2026-09-15", "21:00", "22:00", 178, "night"],
    ["LATE", "2026-09-19", "13:00", "14:00", 178, "saturday"],
    ["EARLY", "2026-09-20", "08:00", "09:00", 223, "sunday"],
    ["EARLY", "2026-12-24", "06:00", "07:00", 312, "pre-holiday"],
    ["EARLY", "2026-12-31", "06:00", "07:00", 312, "pre-holiday"],
    ["EARLY", "2026-10-03", "13:00", "14:00", 312, "holiday-with-time-off"],
  ] as const)("%s on %s %s-%s gives %i cents", (type, date, startTime, endTime, cents, ruleId) => {
    const result = run(shift({ type, date, startTime, endTime }));
    expect(result).toMatchObject({ complete: true, status: "calculated", totalCents: cents });
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0].basis).toMatchObject({
      ruleId,
      minutes: 60,
      hourlyRateCents: 891,
    });
    expect(result.positions[0].source.packageId).toBe("tvaoed-pflege-vka");
  });
  it("uses the highest calendar premium and adds night separately", () => {
    // 1 November 2026 is Sunday and a holiday in NRW: no additional Sunday premium.
    const result = run(
      shift({
        date: "2026-11-01",
        startTime: "21:00",
        endTime: "22:00",
        holidayPremiumMode: "WITHOUT_TIME_OFF",
      }),
    );
    expect(result.totalCents).toBe(1381); // 178 night + round(891 × 1.35) = 1203.
    expect(result.positions.map((p) => p.basis.ruleId).sort()).toEqual([
      "holiday-without-time-off",
      "night",
    ]);
  });
  it("does not read the legacy P group or reduce part-time hourly premiums again", () => {
    const full = run();
    expect(full.totalCents).toBe(356);
    const part = run(shift(), [training("2025-04-01", "1", 1155)]);
    expect(part).toMatchObject({ totalCents: 356, status: "estimated" });
    expect(
      calculateDatedShiftTimePremiums(shift(), { ...work, tariff: null }, [training()], catalog),
    ).toEqual(full);
  });
  it("respects the BT-B 39-hour denominator", () => {
    const result = run(shift(), [training("2025-04-01", "1", 2340, "BT_B")]);
    expect(result.totalCents).toBe(352); // round(8.79 × 20% × 2h).
    expect(result.positions[0].basis.hourlyRateCents).toBe(879);
  });
  it("pays Saturday under BT-K and BT-B special provisions, also with rotating night work", () => {
    const entry = shift({ date: "2026-09-19", startTime: "13:00", endTime: "14:00" });
    expect(run(entry).totalCents).toBe(178);
    expect(run(entry, [training("2025-04-01", "1", 2340, "BT_B")]).totalCents).toBe(176);
  });
  it("counts neither Saturday before 13 nor ordinary weekday daytime", () => {
    for (const date of ["2026-09-19", "2026-09-15"])
      expect(run(shift({ date, startTime: "08:00", endTime: "09:00" }))).toMatchObject({
        complete: true,
        totalCents: 0,
      });
  });
  it("switches table and holiday at midnight without rewriting the earlier segment", () => {
    const entry = shift({ date: "2026-04-30" });
    expect(run(entry).totalCents).toBe(659);
    expect(run(entry, [training()], catalog, "2026-04").totalCents).toBe(169);
    expect(run(entry, [training()], catalog, "2026-05").totalCents).toBe(490);
    expect(run(entry).positions.map((p) => p.source.versionId)).toEqual([
      "2025-04",
      "2026-05",
      "2026-05",
    ]);
  });
  it("uses the explicitly dated training-year change, not year three for everyone", () => {
    expect(run(shift(), [training(), training("2026-09-16", "2")]).totalCents).toBe(363);
    expect(run(shift(), [training("2025-04-01", "3")]).totalCents).toBe(395);
  });
  it("uses the catalog's minimum night premium as fixed hourly money when needed", () => {
    const synthetic = structuredClone(newValue) as RuleTariffPackage;
    synthetic.rules.payTables[0].entries[0].monthlyCents = 10000;
    const result = run(shift(), [training()], resolver([synthetic]));
    expect(result.totalCents).toBe(256);
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0].basis).toMatchObject({
      hourlyRateCents: 128,
      percentageBasisPoints: null,
      minutes: 120,
    });
    expect(result.positions[0].label).toContain("Mindestzuschlag");
  });
  it("places a duration-only pause once for the whole shift and labels the estimate", () => {
    const result = run(shift({ startTime: "22:00", endTime: "02:00", breakMinutes: 30 }));
    expect(result).toMatchObject({ netMinutes: 210, totalCents: 624, status: "estimated" });
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0].basis).toMatchObject({
      minutes: 210,
      pauseMethod: "centered-duration-estimate",
    });
  });
  it.each([
    ["2026-03-29", 120, 761],
    ["2026-10-25", 240, 1604],
  ])("counts actual elapsed minutes over DST %s", (date, minutes, totalCents) => {
    expect(run(shift({ date, startTime: "01:00", endTime: "04:00" }))).toMatchObject({
      netMinutes: minutes,
      totalCents,
    });
  });
  it("does not fabricate zero when holiday rules are absent", () => {
    const rules = createRuleResolver({ tariff: packages, legal: BUNDLED_LEGAL_RULES, holiday: [] });
    const result = run(shift(), [training()], rules);
    expect(result).toMatchObject({ complete: false, totalCents: null });
    expect(result.positions[0].issue?.code).toBe("HOLIDAY_RULES_UNAVAILABLE");
  });
  it("does not silently apply an employee step or an incomplete calendar rule set", () => {
    const invalid = structuredClone(newValue) as RuleTariffPackage;
    invalid.rules.premiumRules[0].rateBasis = "TABLE_STEP";
    invalid.rules.premiumRules[0].referenceStepId = "s3";
    expect(run(shift(), [training()], resolver([invalid])).complete).toBe(false);
    invalid.rules.premiumRules.pop();
    expect(run(shift(), [training()], resolver([invalid])).totalCents).toBeNull();
  });
});
