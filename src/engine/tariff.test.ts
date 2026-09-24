import { describe, expect, it } from "vitest";

import tariffCandidateValue from "../../rules/packages/reviewed/tvoed-vka-bt-k/2026-05-r3.json";
import { PAY_GROUPS, payLevelsForGroup, type TariffProfile } from "@/domain/types";
import {
  getIndividualHourlyRate,
  getMonthlyTableAmount,
  getPremiumHourlyRate,
  getTariffVersion,
} from "@/engine/tariff";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { createRuleResolver } from "@/rules/rule-resolver";

const tariff: TariffProfile = {
  payGroup: "P8",
  payLevel: 4,
  sector: "BT_K",
  tariffRegion: "OTHER",
  fullTimeWeeklyMinutes: 2_310,
};

describe("TVöD-P tariff tables", () => {
  it.each([
    ["P5", "2026-04-30", [2828, 3060.63, 3129.01, 3243.28, 3329.01, 3530.4]],
    ["P6", "2026-04-30", [2930.44, 3100.59, 3271.86, 3636.14, 3729, 3904.1]],
    ["P5", "2026-05-01", [2907.18, 3146.33, 3216.62, 3334.09, 3422.22, 3629.25]],
    ["P6", "2026-05-01", [3012.49, 3187.41, 3363.47, 3737.95, 3833.41, 4013.41]],
  ] as const)("matches the official six stages for %s at %s", (payGroup, date, amounts) => {
    for (const payLevel of payLevelsForGroup(payGroup)) {
      expect(getMonthlyTableAmount({ ...tariff, payGroup, payLevel }, date)).toBe(
        amounts[payLevel - 1],
      );
    }
  });

  it("excludes stage 1 for P7–P16 instead of materializing zero pay", () => {
    for (const payGroup of PAY_GROUPS.filter((group) => group !== "P5" && group !== "P6")) {
      expect(payLevelsForGroup(payGroup)).toEqual([2, 3, 4, 5, 6]);
      expect(getMonthlyTableAmount({ ...tariff, payGroup, payLevel: 1 }, "2026-05-01")).toBeNull();
      expect(getTariffVersion("2026-05-01")?.monthly[payGroup][1]).toBeUndefined();
    }
  });

  it.each([
    ["BT_K", "OTHER", 2310, 17.37, 19.22],
    ["BT_K", "KAV_BW", 2340, 17.14, 18.97],
    ["BT_B", "OTHER", 2340, 17.14, 18.97],
  ] as const)(
    "uses contractual working time for new groups in %s/%s",
    (sector, tariffRegion, fullTimeWeeklyMinutes, individual, premium) => {
      const p5: TariffProfile = {
        payGroup: "P5",
        payLevel: 1,
        sector,
        tariffRegion,
        fullTimeWeeklyMinutes,
      };
      expect(getIndividualHourlyRate(p5, "2026-05-01")).toBe(individual);
      expect(getPremiumHourlyRate(p5, "2026-05-01")).toBe(premium);
    },
  );

  it("uses the May 2026 table and stage 3 premium basis", () => {
    expect(getMonthlyTableAmount(tariff, "2026-07-01")).toBe(4075.58);
    expect(getIndividualHourlyRate(tariff, "2026-07-01")).toBe(24.03);
    expect(getPremiumHourlyRate(tariff, "2026-07-01")).toBe(22.78);
  });

  it("derives candidate hourly rates from sector and tariff-region working time", () => {
    const resolver = createRuleResolver(
      {
        tariff: [tariffCandidateValue as RuleTariffPackage],
        legal: [],
        holiday: [],
      },
      { tariff: "tvoed-vka-bt-k", legal: "unused", holiday: "unused" },
    );
    expect(getIndividualHourlyRate(tariff, "2026-07-01", resolver)).toBe(24.35);
    expect(
      getIndividualHourlyRate(
        { ...tariff, tariffRegion: "KAV_BW", fullTimeWeeklyMinutes: 2340 },
        "2026-07-01",
        resolver,
      ),
    ).toBe(24.03);
    expect(
      getIndividualHourlyRate(
        { ...tariff, sector: "BT_B", fullTimeWeeklyMinutes: 2340 },
        "2026-07-01",
        resolver,
      ),
    ).toBe(24.03);
  });

  it("selects versions at their exact boundaries", () => {
    expect(getTariffVersion("2025-04-01")?.id).toContain("2025-04");
    expect(getTariffVersion("2026-04-30")?.id).toContain("2025-04");
    expect(getTariffVersion("2026-05-01")?.id).toContain("2026-05");
    expect(getTariffVersion("2027-03-31")?.id).toContain("2026-05");
  });

  it("does not silently use a table outside its validity", () => {
    expect(getTariffVersion("2025-03-31")).toBeNull();
    expect(getTariffVersion("2027-04-01")).toBeNull();
  });

  it("contains monthly and hourly values for every supported group and stage", () => {
    for (const payGroup of PAY_GROUPS) {
      for (const payLevel of payLevelsForGroup(payGroup)) {
        const candidate: TariffProfile = {
          ...tariff,
          payGroup,
          payLevel,
        };
        const previousMonthly = getMonthlyTableAmount(candidate, "2026-04-30");
        const currentMonthly = getMonthlyTableAmount(candidate, "2026-05-01");
        const currentHourly = getIndividualHourlyRate(candidate, "2026-05-01");
        expect(previousMonthly, `${payGroup}/${payLevel} previous monthly`).toBeGreaterThan(0);
        expect(currentMonthly, `${payGroup}/${payLevel} current monthly`).toBeGreaterThan(
          previousMonthly!,
        );
        expect(currentHourly, `${payGroup}/${payLevel} current hourly`).toBeGreaterThan(0);
      }
    }
  });
});
