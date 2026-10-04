import { describe, expect, it, vi } from "vitest";
import { ownRemunerationFixture } from "@/domain/own-remuneration-test-fixtures";
import { validateRemunerationProfileData } from "@/domain/remuneration-profile";
import {
  remunerationFormValues,
  remunerationDataFromForm,
} from "@/features/settings/remuneration-editor-values";
import { calculateDatedMonthlyRemuneration } from "./remuneration-month";
import { resolveRemunerationContext } from "./remuneration-context";
import { history, resolver, shift, work } from "./remuneration-test-fixtures";

describe("own components integration boundary during calculator and editor delivery", () => {
  const data = validateRemunerationProfileData({
    version: 2,
    weeklyMinutes: 1155,
    selection: {
      kind: "own-configured",
      configuration: ownRemunerationFixture(),
    },
  });
  const profile = { ...history("2026-09-01"), data };
  it("never treats own components as TVöD or silently discards them in the editor", () => {
    const existing = resolver();
    const lookup = vi.fn(existing.resolveTariff);
    const catalog = { ...existing, resolveTariff: lookup };
    expect(resolveRemunerationContext("2026-09-22", [profile], catalog)).toMatchObject({
      kind: "own-configured",
      configuration: ownRemunerationFixture(),
      source: { kind: "profile", packageId: null },
    });
    expect(lookup).not.toHaveBeenCalled();
    expect(remunerationDataFromForm(remunerationFormValues(data), "2026-09-22", catalog)).toEqual(
      data,
    );
    expect(lookup).not.toHaveBeenCalled();
  });
  it("calculates the real monthly base and night premium without tariff fallback", () => {
    const result = calculateDatedMonthlyRemuneration({
      month: "2026-09",
      shifts: [shift()],
      workProfile: work,
      history: [profile],
      allowanceEntitlements: [],
      resolver: resolver(),
    });
    expect(result.complete).toBe(true);
    expect(result.timePremiums.totalCents).toBe(1250);
    expect(result.estimatedGrossCents).toBe(201250);
    expect(result.positions.every((line) => line.source.packageId === null)).toBe(true);
  });
});
