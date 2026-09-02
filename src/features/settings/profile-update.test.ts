import { describe, expect, it } from "vitest";

import type { TariffProfile } from "@/domain/types";
import { resolveSalaryUpdate } from "@/features/settings/profile-update";

const draft: TariffProfile = {
  payGroup: "P8",
  payLevel: 4,
  sector: "BT_K",
  tariffRegion: "OTHER",
  fullTimeWeeklyMinutes: 2_310,
};

describe("settings profile update", () => {
  it("does not create a tariff while editing the work model", () => {
    expect(resolveSalaryUpdate("WORK", null, 345_050, "TVOED_P", draft, null)).toEqual({
      tariff: null,
      manualMonthlyGrossCents: 345_050,
    });
  });

  it("preserves an existing tariff while editing the work model", () => {
    const existing = { ...draft, payLevel: 5 as const };
    expect(resolveSalaryUpdate("WORK", existing, null, "MANUAL", draft, 345_050)).toEqual({
      tariff: existing,
      manualMonthlyGrossCents: null,
    });
  });

  it("applies TVöD-P and clears a previous manual value", () => {
    expect(resolveSalaryUpdate("TARIFF", null, 345_050, "TVOED_P", draft, 345_050)).toEqual({
      tariff: draft,
      manualMonthlyGrossCents: null,
    });
  });

  it("does not invent a salary mode before a deliberate selection", () => {
    expect(resolveSalaryUpdate("TARIFF", null, null, "UNSET", draft, null)).toEqual({
      tariff: null,
      manualMonthlyGrossCents: null,
    });
  });

  it("applies the manual value and clears a previous tariff", () => {
    expect(resolveSalaryUpdate("TARIFF", draft, null, "MANUAL", draft, 345_050)).toEqual({
      tariff: null,
      manualMonthlyGrossCents: 345_050,
    });
  });
});
