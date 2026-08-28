import { describe, expect, it } from "vitest";

import type { ShiftEntry, UserProfile } from "@/domain/types";
import { calculateMonthlyCompliance } from "@/engine/compliance";
import { getPublicHolidays } from "@/engine/holidays";
import {
  assessTvoedPattern,
  calculateMonthlyPayEstimate,
  calculateShiftPremiumBreakdown,
} from "@/engine/pay";
import { getMonthlyTableAmount } from "@/engine/tariff";
import { selectAnalysisEntryWindow } from "@/features/analysis/analysis-data";
import {
  BUNDLED_HOLIDAY_RULES,
  BUNDLED_LEGAL_RULES,
  BUNDLED_TARIFF_RULES,
} from "@/rules/bundled-rules";
import type {
  RuleHolidayPackage,
  RuleLegalPackage,
  RuleTariffPackage,
} from "@/rules/contracts.generated";
import { createRuleResolver, type RuleResolver } from "@/rules/rule-resolver";

const profile: UserProfile = {
  federalState: "NW",
  holidayRegion: "NONE",
  weeklyMinutes: 1_155,
  timeZone: "Europe/Berlin",
  regularRotatingNightWork: false,
  sundayHolidayWorkEligible: true,
  allEmploymentWorkRecorded: true,
  tariff: {
    payGroup: "P8",
    payLevel: 4,
    sector: "BT_K",
    tariffRegion: "OTHER",
    fullTimeWeeklyMinutes: 2_310,
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function shift(overrides: Partial<ShiftEntry> = {}): ShiftEntry {
  return {
    kind: "SHIFT",
    id: "shift-1",
    date: "2026-07-06",
    templateId: null,
    title: "Dienst",
    type: "NIGHT",
    startTime: "21:00",
    endTime: "23:00",
    breakMinutes: 0,
    color: "#EA5B55",
    symbol: "N",
    note: null,
    overtimeMinutes: 0,
    holidayPremiumMode: "WITH_TIME_OFF",
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function resolverWith(input: {
  readonly tariff?: RuleTariffPackage;
  readonly legal?: RuleLegalPackage;
  readonly holiday?: RuleHolidayPackage;
}): RuleResolver {
  return createRuleResolver({
    tariff: input.tariff
      ? BUNDLED_TARIFF_RULES.map((item) =>
          item.versionId === input.tariff!.versionId ? input.tariff! : item,
        )
      : BUNDLED_TARIFF_RULES,
    legal: input.legal ? [input.legal] : BUNDLED_LEGAL_RULES,
    holiday: input.holiday ? [input.holiday] : BUNDLED_HOLIDAY_RULES,
  });
}

describe("rule-package-driven calculation engine", () => {
  it("reads table values from the resolved tariff package", () => {
    const tariff = clone(BUNDLED_TARIFF_RULES[1]);
    const entry = tariff.rules.payTables[0].entries.find(
      (candidate) => candidate.groupId === "p8" && candidate.stepId === "s4",
    )!;
    entry.monthlyCents = 123_456;

    expect(getMonthlyTableAmount(profile.tariff!, "2026-07-01", resolverWith({ tariff }))).toBe(
      1234.56,
    );
  });

  it("reads premium, allowance, and work-pattern values from the tariff package", () => {
    const tariff = clone(BUNDLED_TARIFF_RULES[1]);
    tariff.rules.premiumRules.find((rule) => rule.premiumType === "NIGHT")!.percentageBasisPoints =
      1_234;
    tariff.rules.allowanceRules.find((rule) => rule.allowanceType === "care")!.amountCents = 20_000;
    tariff.rules.workPatternPolicy.shiftWorkMinimumShifts = 99;
    const resolver = resolverWith({ tariff });
    const night = shift();

    expect(calculateShiftPremiumBreakdown(night, profile, resolver).premiumLines).toContainEqual(
      expect.objectContaining({ key: "night", percentage: 12.34 }),
    );
    expect(
      calculateMonthlyPayEstimate("2026-07", [night], profile, null, [night], undefined, resolver)
        .careAllowanceAmount,
    ).toBe(100);
    expect(
      assessTvoedPattern(
        [
          shift({ id: "1", type: "EARLY", startTime: "06:00", endTime: "14:00" }),
          shift({
            id: "2",
            date: "2026-07-07",
            type: "LATE",
            startTime: "14:00",
            endTime: "22:00",
          }),
          shift({ id: "3", date: "2026-07-08" }),
          shift({
            id: "4",
            date: "2026-07-09",
            type: "EARLY",
            startTime: "06:00",
            endTime: "14:00",
          }),
        ],
        undefined,
        resolver,
        "2026-07-01",
      ).shiftWork,
    ).not.toBe("DETECTED");
  });

  it("derives public holidays from the resolved holiday package", () => {
    const holiday = clone(BUNDLED_HOLIDAY_RULES[0]);
    holiday.rules.holidays.find((rule) => rule.id === "new-year")!.name = "Neujahr aus Regelpaket";

    expect(getPublicHolidays(2026, "NW", resolverWith({ holiday }))).toContainEqual({
      date: "2026-01-01",
      name: "Neujahr aus Regelpaket",
      scope: "NATIONWIDE",
    });
  });

  it("derives legal thresholds from the resolved legal package", () => {
    const legal = clone(BUNDLED_LEGAL_RULES[0]);
    legal.rules.workingTime.maxDailyMinutes = 500;
    const result = calculateMonthlyCompliance(
      "2026-07",
      [
        shift({
          type: "DAY",
          startTime: "08:00",
          endTime: "17:00",
          breakMinutes: 30,
        }),
      ],
      "Europe/Berlin",
      { referenceDate: "2026-07-31", ruleResolver: resolverWith({ legal }) },
    );

    expect(result.issues).toContainEqual(expect.objectContaining({ rule: "ARBZG_3_MAX_10H" }));
  });

  it("loads analysis inputs across rule-defined lookback and lookahead windows", () => {
    const tariff = clone(BUNDLED_TARIFF_RULES[1]);
    tariff.rules.workPatternPolicy.assessmentLookbackMonths = 1;
    const legal = clone(BUNDLED_LEGAL_RULES[0]);
    legal.engineContractVersion = 1;
    delete legal.rules.nightWork.workerQualification;
    legal.rules.nightWork.averageWindowDays = 5;
    legal.rules.restPeriod.deviations[0].compensationWithinDays = 5;
    legal.rules.planning.consecutiveWorkDaysWarning = 2;
    legal.rules.planning.consecutiveNightShiftsWarning = 2;
    legal.rules.planning.consecutiveWeekendGapDays = 2;
    const resolver = resolverWith({ tariff, legal });

    const result = selectAnalysisEntryWindow(
      [
        shift({ id: "before-allowance", date: "2026-05-31" }),
        shift({ id: "allowance-start", date: "2026-06-01" }),
        shift({ id: "before-compliance", date: "2026-06-27" }),
        shift({ id: "compliance-start", date: "2026-06-28" }),
        shift({ id: "month", date: "2026-07-15" }),
        shift({ id: "compliance-end", date: "2026-08-05" }),
        shift({ id: "after-compliance", date: "2026-08-06" }),
      ],
      "2026-07",
      resolver,
    );

    expect(result.allowanceShifts.map((entry) => entry.id)).toEqual([
      "allowance-start",
      "before-compliance",
      "compliance-start",
      "month",
    ]);
    expect(result.complianceShifts.map((entry) => entry.id)).toEqual([
      "compliance-start",
      "month",
      "compliance-end",
    ]);
  });
});
