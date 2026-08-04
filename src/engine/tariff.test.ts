import { describe, expect, it } from "vitest";

import { PAY_GROUPS, PAY_LEVELS, type TariffProfile } from "@/domain/types";
import {
  getIndividualHourlyRate,
  getMonthlyTableAmount,
  getPremiumHourlyRate,
  getTariffVersion,
} from "@/engine/tariff";

const tariff: TariffProfile = {
  payGroup: "P8",
  payLevel: 4,
  sector: "BT_K",
  fullTimeWeeklyMinutes: 2_310,
};

describe("TVöD-P tariff tables", () => {
  it("uses the May 2026 table and stage 3 premium basis", () => {
    expect(getMonthlyTableAmount(tariff, "2026-07-01")).toBe(4075.58);
    expect(getIndividualHourlyRate(tariff, "2026-07-01")).toBe(24.03);
    expect(getPremiumHourlyRate(tariff, "2026-07-01")).toBe(22.78);
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
      for (const payLevel of PAY_LEVELS) {
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
