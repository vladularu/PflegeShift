import { describe, expect, it } from "vitest";

import type { TariffProfile } from "@/domain/types";
import { resolveTariffUpdate } from "@/features/settings/profile-update";

const draft: TariffProfile = {
  payGroup: "P8",
  payLevel: 4,
  sector: "BT_K",
  tariffRegion: "OTHER",
  fullTimeWeeklyMinutes: 2_310,
};

describe("settings profile update", () => {
  it("does not create a tariff while editing the work model", () => {
    expect(resolveTariffUpdate("WORK", null, draft)).toBeNull();
  });

  it("preserves an existing tariff while editing the work model", () => {
    const existing = { ...draft, payLevel: 5 as const };
    expect(resolveTariffUpdate("WORK", existing, draft)).toBe(existing);
  });

  it("applies the draft only from the tariff editor", () => {
    expect(resolveTariffUpdate("TARIFF", null, draft)).toBe(draft);
  });
});
