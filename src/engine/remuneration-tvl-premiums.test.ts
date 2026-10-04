import { describe, expect, it } from "vitest";
import oldValue from "../../rules/packages/reviewed/tvl-kr-tdl/2025-11.json";
import currentValue from "../../rules/packages/reviewed/tvl-kr-tdl/2026-04.json";
import type {
  DatedRemunerationProfile,
  TvlEmploymentCategory,
} from "@/domain/remuneration-profile";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { createRuleResolver } from "@/rules/rule-resolver";
import { BUNDLED_LEGAL_RULES } from "@/rules/bundled-rules";
import { validateRulePackage } from "@/rules/validation";
import { calculateDatedShiftTimePremiums } from "./remuneration-premiums";
import { resolveRemunerationContext } from "./remuneration-context";
import { remunerationShiftDays } from "./remuneration-shift-days";
import { calculateTvlShiftDayPremiums, type TvlSaturdayFacts } from "./remuneration-tvl-premiums";
import { candidate, history, resolver, shift, work } from "./remuneration-test-fixtures";

const packages = [oldValue, currentValue] as RuleTariffPackage[];
const catalog = resolver(packages);
function profile(
  weeklyMinutes = 2310,
  level = "1",
  region = "WEST_38_5",
  tvlEmploymentCategory: TvlEmploymentCategory | null = null,
): DatedRemunerationProfile {
  return {
    ...history("2025-11-01"),
    data: {
      version: 4,
      weeklyMinutes,
      selection: {
        kind: "tariff",
        packageId: "tvl-kr-tdl",
        variant: "SECTION_43",
        region,
        group: "KR5",
        level,
        fullTimeWeeklyMinutes: 2310,
        tvlEmploymentCategory,
      },
    },
  };
}
const run = (entry = shift(), profiles = [profile()], rules = catalog, month?: string) =>
  calculateDatedShiftTimePremiums(entry, work, profiles, rules, month);
const saturday = shift({ date: "2026-09-19", startTime: "13:00", endTime: "14:00" });
function withFacts(facts: TvlSaturdayFacts, category: TvlEmploymentCategory | null) {
  const day = remunerationShiftDays(saturday, work.timeZone)[0];
  const context = resolveRemunerationContext(
    day.date,
    [profile(2310, "1", "WEST_38_5", category)],
    catalog,
  );
  if (context.kind !== "tvl-kr") throw new Error("Expected KR context");
  const base = {
    ...run(saturday).positions[0],
    status: "calculated" as const,
    issue: null,
    amountCents: 0,
  };
  return calculateTvlShiftDayPremiums(base, day, saturday, work, context, catalog, facts);
}

describe("TV-L KR time premiums from source-backed policy", () => {
  // KR5 stage 3 April 2026: 3178.23 / (38.5 × 4.348) = 18.99 EUR/hour.
  it.each([
    ["2026-09-15", "20:00", "21:00", 0, null],
    ["2026-09-15", "21:00", "22:00", 380, "tvl-night"],
    ["2026-09-15", "05:00", "06:00", 380, "tvl-night"],
    ["2026-09-15", "06:00", "07:00", 0, null],
    ["2026-09-20", "08:00", "09:00", 475, "tvl-sunday"],
    ["2026-12-24", "06:00", "07:00", 665, "tvl-pre-holiday"],
    ["2026-12-31", "06:00", "07:00", 665, "tvl-pre-holiday"],
    ["2026-10-03", "13:00", "14:00", 665, "tvl-holiday-with-time-off"],
  ])("calculates %s %s–%s independently", (date, startTime, endTime, cents, ruleId) => {
    const result = run(
      shift({ date: String(date), startTime: String(startTime), endTime: String(endTime) }),
    );
    expect(result.totalCents).toBe(cents);
    expect(result.complete).toBe(true);
    expect(result.positions[0].basis.ruleId).toBe(ruleId);
    expect(result.positions[0].source.packageId).toBe("tvl-kr-tdl");
  });
  it("adds night to the highest calendar premium without double counting Sunday", () => {
    const result = run(shift({ date: "2026-11-01", startTime: "21:00", endTime: "22:00" }));
    expect(result.totalCents).toBe(1045);
    expect(result.positions.map((item) => item.basis.ruleId)).toEqual([
      "tvl-night",
      "tvl-holiday-with-time-off",
    ]);
    expect(
      run(
        shift({
          date: "2026-10-03",
          startTime: "13:00",
          endTime: "14:00",
          holidayPremiumMode: "WITHOUT_TIME_OFF",
        }),
      ).totalCents,
    ).toBe(2564);
  });
  it.each(["1", "6"])(
    "uses stage 3 even with personal stage %s and part-time employment",
    (level) => {
      const result = run(shift({ startTime: "21:00", endTime: "22:00" }), [profile(1155, level)]);
      expect(result.totalCents).toBe(380);
      expect(result.positions[0].basis.hourlyRateCents).toBe(1899);
    },
  );
  it("does not duplicate night rounding at midnight and uses one duration-only pause", () => {
    const result = run(shift({ startTime: "23:00", endTime: "01:00", breakMinutes: 30 }));
    expect(result.totalCents).toBe(570);
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0].basis.minutes).toBe(90);
    expect(result.status).toBe("estimated");
  });
  it.each([
    ["2026-03-29", 240, 1471],
    ["2026-10-25", 360, 2279],
  ])("counts actual elapsed night minutes on %s", (date, minutes, cents) => {
    const result = run(shift({ date: String(date), startTime: "00:00", endTime: "05:00" }));
    const night = result.positions.find((item) => item.basis.ruleId === "tvl-night")!;
    expect(night.basis.minutes).toBe(minutes);
    expect(night.amountCents).toBe(cents);
  });
  it("splits table and month boundaries with their own hourly amounts", () => {
    const entry = shift({ date: "2026-03-31", startTime: "23:00", endTime: "01:00" });
    expect(run(entry).totalCents).toBe(748);
    expect(run(entry, [profile()], catalog, "2026-03").totalCents).toBe(368);
    expect(run(entry, [profile()], catalog, "2026-04").totalCents).toBe(380);
  });
  it.each([
    ["2026-12-15", 365],
    ["2027-01-15", 370],
  ])("uses the current East university working-time basis on %s", (date, cents) => {
    expect(
      run(shift({ date: String(date), startTime: "21:00", endTime: "22:00" }), [
        profile(1155, "6", "EAST_UNIVERSITY_HOSPITAL"),
      ]).totalCents,
    ).toBe(cents);
  });
  it("does not infer Saturday treatment from a shift name", () => {
    for (const type of ["EARLY", "LATE", "NIGHT", "DAY"] as const) {
      const result = run({ ...saturday, type });
      expect(result.totalCents).toBeNull();
      expect(result.positions[0].issue?.code).toBe("PROFILE_INVALID");
    }
    expect(run({ ...saturday, startTime: "12:00", endTime: "13:00" }).totalCents).toBe(0);
    expect(run({ ...saturday, startTime: "21:00", endTime: "22:00" }).totalCents).toBe(380);
  });
  it.each([
    [false, null, 380],
    [true, "SALARIED_SECTION_38_5_1", 64],
    [true, "OTHER", 0],
    [true, null, null],
    [null, "OTHER", null],
    [null, "SALARIED_SECTION_38_5_1", null],
  ] as const)("handles Saturday facts %s/%s", (shiftWork, category, cents) => {
    expect(withFacts({ shiftWork }, category)[0].amountCents).toBe(cents);
  });
  it("reads the dated profile category but never treats it as a confirmed shift-work fact", () => {
    const before = profile(2310, "1", "WEST_38_5", "SALARIED_SECTION_38_5_1");
    const after = {
      ...profile(2310, "1", "WEST_38_5", "OTHER"),
      effectiveFrom: "2026-09-20",
    };
    expect(resolveRemunerationContext("2026-09-19", [before, after], catalog)).toMatchObject({
      kind: "tvl-kr",
      employmentCategory: "SALARIED_SECTION_38_5_1",
    });
    expect(resolveRemunerationContext("2026-09-20", [before, after], catalog)).toMatchObject({
      kind: "tvl-kr",
      employmentCategory: "OTHER",
    });
    expect(run(saturday, [before, after]).totalCents).toBeNull();
    expect(run({ ...saturday, date: "2026-09-26" }, [before, after]).totalCents).toBeNull();
    if (before.data.selection.kind !== "tariff") throw new Error("fixture");
    const { tvlEmploymentCategory: _, ...legacySelection } = before.data.selection;
    const legacy: DatedRemunerationProfile = {
      ...before,
      data: { ...before.data, version: 1, selection: legacySelection },
    };
    expect(resolveRemunerationContext(saturday.date, [legacy], catalog)).toMatchObject({
      kind: "tvl-kr",
      employmentCategory: null,
    });
    expect(run(saturday, [legacy]).totalCents).toBeNull();
  });
  it("keeps missing holiday data unavailable", () => {
    const missing = createRuleResolver({
      tariff: packages,
      legal: BUNDLED_LEGAL_RULES,
      holiday: [],
    });
    const result = run(shift(), [profile()], missing);
    expect(result.totalCents).toBeNull();
    expect(result.positions[0].issue?.code).toBe("HOLIDAY_RULES_UNAVAILABLE");
  });
  it("reads rates from the versioned policy, not engine constants", () => {
    const p = packages[1];
    const changed = {
      ...p,
      rules: {
        ...p.rules,
        tvlTimePremiumPolicy: {
          ...p.rules.tvlTimePremiumPolicy!,
          nightBasisPoints: 3000,
        },
      },
    };
    expect(
      run(shift({ startTime: "21:00", endTime: "22:00" }), [profile()], resolver([changed]))
        .totalCents,
    ).toBe(570);
  });
  it.each(["source", "date", "window", "step", "factor", "capability"] as const)(
    "rejects invalid policy %s",
    (change) => {
      const p = structuredClone(packages[1]);
      const policy = p.rules.tvlTimePremiumPolicy!;
      if (change === "source") policy.sourceIds = ["missing"];
      if (change === "date") policy.preHolidayMonthDays = ["02-30"];
      if (change === "window") policy.nightWindow.endMinute = policy.nightWindow.startMinute;
      if (change === "step") policy.referenceStepId = "1";
      if (change === "factor") policy.monthlyFactorThousandths = 0;
      if (change === "capability") p.rules.selection!.capabilities.timePremiums = "UNSUPPORTED";
      expect(validateRulePackage(p).ok).toBe(false);
      expect(run(shift(), [profile()], resolver([p])).totalCents).toBeNull();
    },
  );
  it("rejects the policy on a foreign contract", () => {
    expect(
      validateRulePackage({
        ...candidate,
        rules: {
          ...candidate.rules,
          tvlTimePremiumPolicy: packages[1].rules.tvlTimePremiumPolicy,
        },
      }).ok,
    ).toBe(false);
  });
});
