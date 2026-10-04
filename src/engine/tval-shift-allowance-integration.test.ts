import { describe, expect, it } from "vitest";
import type { DatedRemunerationProfile, TvalEmployerScope } from "@/domain/remuneration-profile";
import {
  allowanceConfirmationPeriods,
  prepareAllowanceConfirmation,
} from "@/features/analysis/allowance-confirmation-model";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import value from "../../rules/packages/reviewed/tval-pflege-tdl/2026-04.json";
import { history, resolver, work } from "./remuneration-test-fixtures";
import { deriveDatedAllowanceAssessments } from "./remuneration-assessment";
import { calculateDatedMonthlyRemuneration } from "./remuneration-month";

const catalog = resolver([value as RuleTariffPackage]);
function profile(
  scope: TvalEmployerScope | null = "SECTION_43",
  date = "2026-04-01",
  weeklyMinutes = 2310,
): DatedRemunerationProfile {
  return {
    ...history(date),
    data: {
      version: 6,
      weeklyMinutes,
      selection: {
        kind: "tariff",
        packageId: "tval-pflege-tdl",
        variant: "CARE",
        region: "WEST_38_5",
        group: "regular",
        level: "1",
        fullTimeWeeklyMinutes: 2310,
        tvalEmployerScope: scope,
      },
    },
  };
}
function input(profiles = [profile()]) {
  return {
    month: "2026-09",
    shifts: [],
    workProfile: work,
    history: profiles,
    settings: {
      workplaceCoverage: "AROUND_THE_CLOCK" as const,
      assignment: "PERMANENT" as const,
      updatedAt: work.updatedAt,
    },
    resolver: catalog,
  };
}
function confirm(
  profiles = [profile()],
  status: "ALTERNATING_MONTHLY" | "NONE" = "ALTERNATING_MONTHLY",
) {
  const saved = prepareAllowanceConfirmation({
    month: "2026-09",
    from: "2026-09-01",
    through: "2026-09-30",
    status,
    history: profiles,
    resolver: catalog,
    current: { month: "2026-09", revision: 0, updatedAt: null, decisions: [] },
  });
  return saved.decisions.map((d) => ({
    ...d,
    revision: 1,
    confirmedAt: work.updatedAt,
    updatedAt: work.updatedAt,
  }));
}
function result(profiles = [profile()], decisions = confirm(profiles)) {
  const data = input(profiles);
  const assessment = deriveDatedAllowanceAssessments({ ...data, decisions });
  const pay = calculateDatedMonthlyRemuneration({
    ...data,
    allowanceEntitlements: assessment.entitlements,
  });
  return {
    assessment,
    pay,
    positions: pay.allowances.positions.filter((p) => p.id.startsWith("tval-shift-allowance:")),
  };
}
describe("TVA-L explicit confirmation to monthly allowance", () => {
  it.each([
    ["GENERAL", 15000],
    ["SECTION_43", 18750],
  ] as const)("calculates confirmed %s from the actual tariff package", (scope, cents) => {
    const profiles = [profile(scope)];
    const periods = allowanceConfirmationPeriods("2026-09", profiles, catalog);
    expect(periods).toHaveLength(1);
    expect(periods[0].available).toBe(true);
    expect(periods[0].label).toContain("TVA-L");
    const r = result(profiles);
    expect(r.assessment.complete).toBe(true);
    expect(r.positions).toHaveLength(1);
    expect(r.positions[0].amountCents).toBe(cents);
    expect(r.pay.estimatedGrossCents).toBeNull();
  });
  it("does not infer a TVA-L entitlement from the TVöD workplace settings", () => {
    const r = result([profile()], []);
    expect(r.assessment.complete).toBe(false);
    expect(r.assessment.entitlements).toEqual([]);
    expect(r.positions[0].amountCents).toBeNull();
  });
  it("keeps an unknown employer scope unavailable but accepts explicit no-claim", () => {
    const profiles = [profile(null)];
    expect(result(profiles).positions[0].amountCents).toBeNull();
    expect(result(profiles, confirm(profiles, "NONE")).positions[0].amountCents).toBe(0);
  });
  it("does not reuse a confirmation from a different tariff region", () => {
    const decisions = confirm().map((d) => ({ ...d, tariff: { ...d.tariff, region: "EAST" } }));
    const r = result([profile()], decisions);
    expect(r.assessment.complete).toBe(false);
    expect(r.positions[0].amountCents).toBeNull();
  });
  it("prorates each dated employer scope and applies part time only once", () => {
    const profiles = [
      profile("GENERAL", "2026-04-01", 1155),
      profile("SECTION_43", "2026-09-16", 1155),
    ];
    const r = result(profiles);
    expect(r.positions.map((p) => p.amountCents)).toEqual([3750, 4688]);
    expect(r.positions.reduce((sum, p) => sum + (p.amountCents ?? 0), 0)).toBe(8438);
  });
  it("does not add an employer scope to legacy TVA-L profiles", () => {
    const current = profile();
    if (current.data.selection.kind !== "tariff") throw new Error("fixture");
    const { tvalEmployerScope: _, ...selection } = current.data.selection;
    const legacy: DatedRemunerationProfile = {
      ...current,
      data: { ...current.data, version: 1, selection },
    };
    const r = result([legacy]);
    expect(r.positions[0].amountCents).toBeNull();
    expect(legacy.data.selection).not.toHaveProperty("tvalEmployerScope");
  });
});
