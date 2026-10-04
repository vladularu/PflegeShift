import { describe, expect, it } from "vitest";
import old from "../../rules/packages/reviewed/tval-pflege-tdl/2025-11.json";
import current from "../../rules/packages/reviewed/tval-pflege-tdl/2026-04.json";
import january from "../../rules/packages/reviewed/tval-pflege-tdl/2027-01.json";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import type { DatedRemunerationProfile, TvalEmployerScope } from "@/domain/remuneration-profile";
import { BUNDLED_LEGAL_RULES } from "@/rules/bundled-rules";
import { createRuleResolver } from "@/rules/rule-resolver";
import {
  calculateDatedShiftTimePremiums,
  calculateMonthlyTimeRemuneration,
} from "./remuneration-premiums";
import {
  calculateTvalShiftDayPremiums,
  type TvalSaturdayFacts,
} from "./remuneration-tval-premiums";
import { resolveRemunerationContext } from "./remuneration-context";
import { remunerationShiftDays } from "./remuneration-shift-days";
import { history, resolver, shift, work } from "./remuneration-test-fixtures";

const packages = [old, current, january] as RuleTariffPackage[];
const catalog = resolver(packages);
function profile(
  weeklyMinutes = 2310,
  scope: TvalEmployerScope | null = "GENERAL",
  level = "1",
): DatedRemunerationProfile {
  return {
    ...history("2025-11-01"),
    data: {
      version: 6,
      weeklyMinutes,
      selection: {
        kind: "tariff",
        packageId: "tval-pflege-tdl",
        variant: "CARE",
        region: "WEST_38_5",
        group: "regular",
        level,
        fullTimeWeeklyMinutes: 2310,
        tvalEmployerScope: scope,
      },
    },
  };
}
const run = (entry = shift(), profiles = [profile()], rules = catalog, month?: string) =>
  calculateDatedShiftTimePremiums(entry, work, profiles, rules, month);
function factsRun(
  scope: TvalEmployerScope | null,
  facts: TvalSaturdayFacts,
  entry = shift({
    date: "2026-09-19",
    startTime: "13:00",
    endTime: "14:00",
  }),
) {
  const profiles = [profile(2310, scope)];
  const day = remunerationShiftDays(entry, work.timeZone)[0];
  const context = resolveRemunerationContext(day.date, profiles, catalog);
  if (context.kind !== "tval-training") throw new Error("TVA-L context expected");
  const base = {
    ...run(entry, profiles).positions[0],
    status: "calculated" as const,
    amountCents: 0,
    issue: null,
  };
  return calculateTvalShiftDayPremiums(base, day, entry, work, context, catalog, facts);
}

describe("TVA-L time premiums in the dated monthly path", () => {
  // 1440.70 / (38.5 * 4.348) -> 8.61 EUR/h; then 20%=1.72, 25%=2.15,
  // 35%=3.01, 135%=11.62 EUR/h. The rounded hourly premium is multiplied by time.
  it.each([
    ["2026-09-15", "20:00", "21:00", 0],
    ["2026-09-15", "21:00", "22:00", 172],
    ["2026-09-15", "05:00", "06:00", 172],
    ["2026-09-15", "06:00", "07:00", 0],
    ["2026-09-20", "08:00", "09:00", 215],
    ["2026-12-24", "05:00", "06:00", 172],
    ["2026-12-24", "06:00", "07:00", 301],
    ["2026-12-31", "06:00", "07:00", 301],
    ["2026-10-03", "13:00", "14:00", 301],
  ])("calculates boundary %s %s–%s", (date, startTime, endTime, amount) => {
    const r = run(
      shift({ date: String(date), startTime: String(startTime), endTime: String(endTime) }),
    );
    expect(r.totalCents).toBe(amount);
    expect(r.complete).toBe(true);
    expect(r.positions[0].source.packageId).toBe("tval-pflege-tdl");
  });
  it("pays only the highest day premium and adds night", () => {
    const r = run(
      shift({
        date: "2026-11-01",
        startTime: "21:00",
        endTime: "22:00",
        holidayPremiumMode: "WITHOUT_TIME_OFF",
      }),
    );
    expect(r.totalCents).toBe(1334);
    expect(r.positions.map((p) => p.basis.ruleId)).toEqual([
      "tval-night",
      "tval-holiday-without-time-off",
    ]);
  });
  it.each([
    [2310, "1", 172],
    [1155, "1", 172],
    [2310, "2", 180],
    [2310, "3", 193],
  ])("uses own training level, no extra part-time reduction (%s/%s)", (weekly, level, amount) => {
    const r = run(shift({ startTime: "21:00", endTime: "22:00" }), [
      profile(Number(weekly), "GENERAL", String(level)),
    ]);
    expect(r.totalCents).toBe(amount);
  });
  it("preserves hourly rounding through midnight and monthly regrouping", () => {
    const entry = shift({ startTime: "23:00", endTime: "02:00" });
    const r = run(entry);
    expect(r.totalCents).toBe(516); // not 517 from 8.61 * 20% * 3 before hourly rounding
    expect(r.positions).toHaveLength(1);
    expect(r.positions[0].basis).toMatchObject({
      hourlyRateCents: 861,
      percentageBasisPoints: 2000,
      roundedPremiumHourlyCents: 172,
      minutes: 180,
    });
    expect(
      calculateMonthlyTimeRemuneration("2026-09", [entry], work, [profile()], catalog).totalCents,
    ).toBe(516);
  });
  it("splits a table change and a month boundary without mixing rates", () => {
    const entry = shift({ date: "2026-03-31", startTime: "23:00", endTime: "01:00" });
    const r = run(entry);
    expect(r.positions.map((p) => p.basis.roundedPremiumHourlyCents)).toEqual([165, 172]);
    expect(r.totalCents).toBe(337);
    expect(run(entry, [profile()], catalog, "2026-04").totalCents).toBe(172);
  });
  it("marks duration-only pause placement as estimated", () => {
    const r = run(shift({ startTime: "23:00", endTime: "01:00", breakMinutes: 30 }));
    expect(r.totalCents).toBe(258);
    expect(r.status).toBe("estimated");
    expect(r.positions[0].basis.minutes).toBe(90);
  });
  it.each([
    ["2026-03-29", 240, 660],
    ["2026-10-25", 360, 1032],
  ])("uses elapsed minutes through DST %s", (date, minutes, amount) => {
    const r = run(shift({ date: String(date), startTime: "00:00", endTime: "05:00" }));
    const night = r.positions.find((p) => p.basis.ruleId === "tval-night")!;
    expect(night.basis.minutes).toBe(minutes);
    expect(night.amountCents).toBe(amount);
  });
  it.each([
    ["GENERAL", false, null, 172],
    ["SECTION_43", false, null, 172],
    [null, false, null, 172],
    ["GENERAL", true, null, 0],
    ["SECTION_43", true, "SALARIED_SECTION_38_5_1", 64],
    ["SECTION_43", true, "OTHER", 0],
    [null, true, "OTHER", 0],
    [null, true, "SALARIED_SECTION_38_5_1", null],
    ["SECTION_43", true, null, null],
    ["GENERAL", null, null, null],
    ["SECTION_43", null, "OTHER", null],
  ] as const)(
    "handles Saturday scope=%s shift=%s category=%s",
    (scope, shiftWork, employmentCategory, amount) => {
      const positions = factsRun(scope, { shiftWork, employmentCategory });
      expect(positions[0].amountCents).toBe(amount);
      if (amount === null) expect(positions[0].status).toBe("unavailable");
    },
  );
  it("keeps missing Saturday facts unknown, not zero", () => {
    const r = run(shift({ date: "2026-09-19", startTime: "13:00", endTime: "14:00" }));
    expect(r.totalCents).toBeNull();
    expect(r.positions[0].issue?.code).toBe("PROFILE_INVALID");
  });
  it.each([
    ["12:00", "13:00"],
    ["21:00", "22:00"],
  ])("does not require Saturday facts outside its window %s–%s", (startTime, endTime) => {
    const r = run(shift({ date: "2026-09-19", startTime, endTime }));
    expect(r.complete).toBe(true);
  });
  it("keeps a dominating holiday known even if Saturday facts are absent", () => {
    expect(
      run(shift({ date: "2026-10-03", startTime: "13:00", endTime: "14:00" })).totalCents,
    ).toBe(301);
  });
  it("keeps night known when holiday data is unavailable", () => {
    const noHolidays = createRuleResolver({
      tariff: packages,
      legal: BUNDLED_LEGAL_RULES,
      holiday: [],
    });
    const r = run(shift({ startTime: "21:00", endTime: "22:00" }), [profile()], noHolidays);
    expect(r.totalCents).toBeNull();
    expect(r.knownSubtotalCents).toBe(172);
    expect(r.positions.find((p) => p.amountCents === null)?.issue?.code).toBe(
      "HOLIDAY_RULES_UNAVAILABLE",
    );
  });
  it("keeps old drafts without a premium policy unavailable", () => {
    const p = structuredClone(current) as RuleTariffPackage;
    delete p.rules.tvalTimePremiumPolicy;
    p.rules.selection!.capabilities.timePremiums = "UNSUPPORTED";
    expect(run(shift(), [profile()], resolver([p])).totalCents).toBeNull();
  });
});
