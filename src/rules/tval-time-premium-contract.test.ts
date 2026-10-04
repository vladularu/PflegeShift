import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "./contracts.generated";
import { validateRulePackage } from "./validation";
import { tvalTimePremiumIssues } from "./tval-time-premium-validation";

function candidate(version = "2026-04"): RuleTariffPackage {
  return JSON.parse(
    readFileSync(
      new URL(`../../rules/packages/reviewed/tval-pflege-tdl/${version}.json`, import.meta.url),
      "utf8",
    ),
  );
}

describe("TVA-L time premium contract", () => {
  it.each(["2025-11", "2026-04", "2027-01", "2027-03", "2028-01"])(
    "keeps %s a draft with a declared time-premium engine",
    (version) => {
      const pkg = candidate(version);
      expect(validateRulePackage(pkg)).toMatchObject({ ok: true });
      expect(pkg.status).toBe("DRAFT");
      expect(pkg.rules.selection!.capabilities.timePremiums).toBe("SUPPORTED");
      const p = pkg.rules.tvalTimePremiumPolicy!;
      expect(p.hourlyBasis).toBe("TRAINING_TABLE_FULL_TIME");
      expect(p.monthlyFactorThousandths).toBe(4348);
      expect(p.rounding).toBe("HOURLY_THEN_PREMIUM_THEN_TOTAL");
      expect(p.competition).toBe("HIGHEST_DAY_PREMIUM_PLUS_NIGHT");
      expect([
        p.nightBasisPoints,
        p.sundayBasisPoints,
        p.holidayWithTimeOffBasisPoints,
        p.holidayWithoutTimeOffBasisPoints,
        p.preHolidayBasisPoints,
        p.saturdayBasisPoints,
      ]).toEqual([2000, 2500, 3500, 13500, 3500, 2000]);
      expect(p.nightWindow).toEqual({ startMinute: 1260, endMinute: 360 });
      expect(p.saturdayWindow).toEqual({ startMinute: 780, endMinute: 1260 });
      expect(p.preHolidayWindow).toEqual({ startMinute: 360, endMinute: 0 });
      expect(p.preHolidayMonthDays).toEqual(["12-24", "12-31"]);
      expect(p.hospitalSalariedShiftHourlyCents).toBe(64);
      expect(p.sourceIds).toEqual(["tdl-tval-pflege-2026", "tdl-tv-l-2026"]);
    },
  );
  it.each([
    "source",
    "empty-window",
    "invalid-day",
    "reversed-holiday",
    "old-contract",
    "foreign-engine",
    "historical",
  ])("rejects semantic error: %s", (kind) => {
    const pkg = candidate();
    const p = pkg.rules.tvalTimePremiumPolicy!;
    if (kind === "source") p.sourceIds = ["unknown"];
    if (kind === "empty-window") p.nightWindow.endMinute = p.nightWindow.startMinute;
    if (kind === "invalid-day") p.preHolidayMonthDays = ["02-30"];
    if (kind === "reversed-holiday") p.holidayWithoutTimeOffBasisPoints = 1000;
    if (kind === "old-contract") pkg.engineContractVersion = 12;
    if (kind === "foreign-engine") pkg.rules.selection!.engineId = "tvl-kr-v1";
    if (kind === "historical") pkg.validFrom = "2023-09-30";
    expect(tvalTimePremiumIssues(pkg).length).toBeGreaterThan(0);
    expect(validateRulePackage(pkg).ok).toBe(false);
  });
  it.each([
    ["referenceStepId", "3"],
    ["minimumNightHourlyCents", 128],
    ["hourlyBasis", "KR_STAGE_3"],
    ["rounding", "TOTAL_ONLY"],
    ["competition", "ADD_ALL"],
    ["monthlyFactorThousandths", 0],
  ])("rejects foreign or invalid field %s", (key, value) => {
    const raw = JSON.parse(JSON.stringify(candidate()));
    raw.rules.tvalTimePremiumPolicy[key] = value;
    expect(validateRulePackage(raw).ok).toBe(false);
  });
  it("preserves older drafts without the optional policy", () => {
    const p = candidate();
    delete p.rules.tvalTimePremiumPolicy;
    p.rules.selection!.capabilities.timePremiums = "UNSUPPORTED";
    expect(validateRulePackage(p).ok).toBe(true);
  });
  it("does not advertise premiums without the policy", () => {
    const p = candidate();
    delete p.rules.tvalTimePremiumPolicy;
    expect(validateRulePackage(p).ok).toBe(false);
  });
});
