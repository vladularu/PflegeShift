import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type { TvalCareAllowances } from "@/domain/tval-care-allowances";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import type { SavedTvlShiftWork } from "@/domain/saved-tvl-shift-work";
import { history, resolver, shift, work } from "./remuneration-test-fixtures";
import { tvlFact } from "./tvl-shift-work-test-fixtures";
import { calculateMonthlyDatedAllowances } from "./remuneration-allowances";

const packages: RuleTariffPackage[] = ["2025-11", "2026-04", "2027-01", "2027-03", "2028-01"].map(
  (v) =>
    JSON.parse(
      readFileSync(
        new URL(`../../rules/packages/reviewed/tval-pflege-tdl/${v}.json`, import.meta.url),
        "utf8",
      ),
    ),
);
const rules = resolver(packages);
function profile(facts: TvalCareAllowances | null, weeklyMinutes = 2310): DatedRemunerationProfile {
  return {
    ...history("2025-11-01"),
    data: {
      version: 8,
      weeklyMinutes,
      selection: {
        kind: "tariff",
        packageId: "tval-pflege-tdl",
        variant: "CARE",
        region: "WEST_38_5",
        group: "regular",
        level: "1",
        fullTimeWeeklyMinutes: 2310,
        tvalEmployerScope: "SECTION_43",
        tvlEmploymentCategory: "SALARIED_SECTION_38_5_1",
        tvalCareAllowances: facts,
      },
    },
  };
}
const confirmed = { paidEntitlement: true, clinical: "HIGHER", burnCare: false } as const;
function scenario(month = "2026-09", facts: TvalCareAllowances | null = confirmed, weekly = 2310) {
  const p = profile(facts, weekly);
  const entry = shift({
    date: month + "-10",
    startTime: "12:00",
    endTime: "14:00",
    breakMinutes: 0,
  });
  const calculate = (saved: readonly SavedTvlShiftWork[] = [], profiles = [p], entries = [entry]) =>
    calculateMonthlyDatedAllowances(month, entries, work, profiles, [], rules, saved);
  const fact = (minutes: number) => ({
    ...tvlFact(null, entry, p),
    burnCareIntervals: minutes ? [{ from: 0, until: minutes }] : [],
  });
  return { p, entry, calculate, fact };
}
const clinical = (result: ReturnType<typeof calculateMonthlyDatedAllowances>) =>
  result.positions.filter((p) => p.basis.ruleId === "tval-part-iv:clinical");
const burn = (result: ReturnType<typeof calculateMonthlyDatedAllowances>) =>
  result.positions.find((p) => p.basis.ruleId === "tval-part-iv:burn-month-full-hours")!;
const offset = (result: ReturnType<typeof calculateMonthlyDatedAllowances>) =>
  result.positions.find((p) => p.basis.ruleId === "tval-part-iv:burn-month-offset");

describe("TVA-L clinical and actual burn-care payments through monthly calculation", () => {
  it.each(["2025-11", "2026-04", "2027-01", "2027-03", "2028-01"])(
    "uses training rather than KR values in %s",
    (month) => {
      for (const [tier, amount] of [
        ["LOWER", 4500],
        ["HIGHER", 7500],
        ["NONE", 0],
      ] as const) {
        const result = scenario(month, { ...confirmed, clinical: tier }).calculate();
        expect(clinical(result)).toHaveLength(1);
        expect(clinical(result)[0]).toMatchObject({
          amountCents: amount,
          source: { packageId: "tval-pflege-tdl" },
          basis: { percentageBasisPoints: 5000 },
        });
        expect(result.complete).toBe(false); // BAT claims remain independently unsupported.
      }
    },
  );
  it.each([
    null,
    { ...confirmed, clinical: null },
    { ...confirmed, paidEntitlement: null },
    { ...confirmed, burnCare: null },
  ] as const)("keeps unconfirmed facts unavailable %#", (facts) => {
    expect(clinical(scenario("2026-09", facts).calculate())[0].amountCents).toBeNull();
  });
  it("applies training share then part-time then calendar period only once", () => {
    const s = scenario("2026-09", confirmed, 1155);
    expect(clinical(s.calculate())[0].amountCents).toBe(3750);
    expect(
      clinical(s.calculate([], [{ ...s.p, effectiveFrom: "2026-09-16" }]))[0].amountCents,
    ).toBe(1875);
  });
  it.each([false, null] as const)(
    "does not require burn facts when clinical claim is explicitly absent, paid=%s",
    (paid) => {
      const result = scenario("2026-09", {
        clinical: "NONE",
        burnCare: null,
        paidEntitlement: paid,
      }).calculate();
      expect(clinical(result)[0].amountCents).toBe(0);
    },
  );
  it.each([
    ["2025-11", 91],
    ["2026-04", 93],
    ["2027-01", 93],
    ["2027-03", 95],
    ["2028-01", 96],
  ] as const)("rounds hourly training amount before multiplying in %s", (month, rate) => {
    for (const weekly of [2310, 1155]) {
      const s = scenario(month, { ...confirmed, burnCare: true }, weekly);
      const result = s.calculate([s.fact(120)]);
      expect(burn(result).amountCents).toBe(rate * 2);
      expect(offset(result)?.amountCents).toBe(-rate * 2);
      expect(clinical(result)[0].amountCents).toBe(weekly === 2310 ? 7500 : 3750);
    }
  });
  it.each([
    [0, 0],
    [59, 0],
    [60, 93],
    [119, 93],
    [120, 186],
  ])("uses only full recorded hours: %i minutes", (minutes, cents) => {
    const s = scenario("2026-09", { ...confirmed, burnCare: true });
    expect(burn(s.calculate([s.fact(minutes)])).amountCents).toBe(cents);
  });
  it("does not infer actual burn activity from the complete scheduled shift", () => {
    const s = scenario("2026-09", { ...confirmed, burnCare: true });
    expect(burn(s.calculate()).amountCents).toBeNull();
    expect(clinical(s.calculate())[0].amountCents).toBeNull();
  });
  it.each([
    { shiftRevision: 2 },
    { profileRevision: 2 },
    { timeZone: "Europe/Paris" },
    { burnCareIntervals: [{ from: 0, until: 180 }] },
  ])("rejects stale or invalid recorded activity %#", (change) => {
    const s = scenario("2026-09", { ...confirmed, burnCare: true });
    expect(burn(s.calculate([{ ...s.fact(60), ...change }])).amountCents).toBeNull();
  });
  it("caps the monthly deduction at the personal clinical amount", () => {
    const s = scenario("2026-09", { ...confirmed, burnCare: true }, 60);
    const entry = { ...s.entry, endTime: "15:00" };
    const result = s.calculate(
      [{ ...tvlFact(null, entry, s.p), burnCareIntervals: [{ from: 0, until: 180 }] }],
      [s.p],
      [entry],
    );
    expect(clinical(result)[0].amountCents).toBe(195);
    expect(offset(result)?.amountCents).toBe(-195);
    expect(burn(result).amountCents).toBe(279);
  });
  it("offsets only once across different dated clinical claims", () => {
    const s = scenario("2026-09", { ...confirmed, clinical: "LOWER", burnCare: true });
    const next = { ...profile(confirmed), effectiveFrom: "2026-09-16" };
    const result = s.calculate([s.fact(120)], [s.p, next]);
    expect(clinical(result).map((p) => p.amountCents)).toEqual([2250, 3750]);
    expect(offset(result)?.amountCents).toBe(-186);
    expect(offset(result)?.source.profileEffectiveFrom).toBeNull();
  });
  it("adds remaining minutes across actual intervals but rejects duplicate confirmations", () => {
    const s = scenario("2026-09", { ...confirmed, burnCare: true });
    const record = {
      ...s.fact(0),
      burnCareIntervals: [
        { from: 0, until: 30 },
        { from: 60, until: 90 },
      ],
    };
    expect(burn(s.calculate([record])).amountCents).toBe(93);
    expect(burn(s.calculate([record, record])).amountCents).toBeNull();
  });
  it("uses elapsed hours during the autumn clock change", () => {
    const s = scenario("2026-10", { ...confirmed, burnCare: true });
    const entry = { ...s.entry, date: "2026-10-25", startTime: "01:00", endTime: "04:00" };
    const record = { ...tvlFact(null, entry, s.p), burnCareIntervals: [{ from: 0, until: 240 }] };
    expect(burn(s.calculate([record], [s.p], [entry])).amountCents).toBe(372);
  });
  it("allocates midnight activity to each actual calendar month without duplication", () => {
    const s = scenario("2026-09", { ...confirmed, burnCare: true });
    const entry = { ...s.entry, date: "2026-09-30", startTime: "23:00", endTime: "01:00" };
    const record = { ...tvlFact(null, entry, s.p), burnCareIntervals: [{ from: 0, until: 120 }] };
    for (const month of ["2026-09", "2026-10"]) {
      const result = calculateMonthlyDatedAllowances(month, [entry], work, [s.p], [], rules, [
        record,
      ]);
      expect(burn(result).amountCents).toBe(93);
      expect(offset(result)?.amountCents).toBe(-93);
    }
  });
});
