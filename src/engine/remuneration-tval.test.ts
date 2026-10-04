import { describe, expect, it } from "vitest";
import type {
  DatedRemunerationProfile,
  RemunerationSelection,
} from "@/domain/remuneration-profile";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import p2025 from "../../rules/packages/reviewed/tval-pflege-tdl/2025-11.json";
import p2026 from "../../rules/packages/reviewed/tval-pflege-tdl/2026-04.json";
import p2027a from "../../rules/packages/reviewed/tval-pflege-tdl/2027-01.json";
import p2027b from "../../rules/packages/reviewed/tval-pflege-tdl/2027-03.json";
import p2028 from "../../rules/packages/reviewed/tval-pflege-tdl/2028-01.json";
import { history, resolver, shift, work } from "./remuneration-test-fixtures";
import { resolveRemunerationContext } from "./remuneration-context";
import { calculateMonthlyBaseRemuneration } from "./remuneration-base";
import { calculateDatedMonthlyRemuneration } from "./remuneration-month";

const rules = resolver([p2025, p2026, p2027a, p2027b, p2028] as RuleTariffPackage[]);
function trainee(
  date = "2025-11-01",
  weeklyMinutes = 2310,
  changes: Partial<Extract<RemunerationSelection, { kind: "tariff" }>> = {},
): DatedRemunerationProfile {
  return {
    ...history(date),
    data: {
      version: 1,
      weeklyMinutes,
      selection: {
        kind: "tariff",
        packageId: "tval-pflege-tdl",
        variant: "CARE",
        region: "WEST_38_5",
        group: "regular",
        level: "1",
        fullTimeWeeklyMinutes: 2310,
        ...changes,
      },
    },
  };
}
const base = (month: string, profiles = [trainee()]) =>
  calculateMonthlyBaseRemuneration(month, profiles, rules);

describe("TVA-L Pflege dated base pay", () => {
  it.each([
    ["2025-11", 138070],
    ["2026-03", 138070],
    ["2026-04", 144070],
    ["2027-01", 144070],
    ["2027-03", 150070],
    ["2028-01", 153070],
  ])("uses the independent table for %s", (month, amount) => {
    const result = base(String(month));
    expect(result.totalCents).toBe(amount);
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0]!.source.packageId).toBe("tval-pflege-tdl");
    expect(result.positions[0]!.label).toContain("1. vergütetes Ausbildungsjahr");
  });
  it.each([
    ["regular", "1", 144070],
    ["regular", "2", 150670],
    ["regular", "3", 161300],
    ["assistant", "1", 129682],
    ["assistant", "2", 135096],
  ])("resolves %s period %s", (group, level, amount) => {
    const result = base("2027-01", [
      trainee("2027-01-01", 2310, { group: String(group), level: String(level) }),
    ]);
    expect(result.totalCents).toBe(amount);
    if (group === "assistant") expect(result.positions[0]!.label).not.toContain("Ausbildungsjahr");
  });
  it("does not infer a higher year from elapsed calendar time or invent early assistant pay", () => {
    expect(base("2028-01").totalCents).toBe(153070);
    expect(
      base("2026-12", [trainee("2026-01-01", 2310, { group: "assistant" })]).totalCents,
    ).toBeNull();
  });
  it("uses dated confirmed changes and marks fractional training pay as an estimate", () => {
    const result = base("2027-06", [trainee(), trainee("2027-06-16", 1155, { level: "2" })]);
    expect(result.positions.map((p) => p.amountCents)).toEqual([75035, 39168]);
    expect(result.status).toBe("estimated");
    expect(result.totalCents).toBe(114203);
  });
  it("does not fill missing salary history", () => {
    const result = base("2027-06", [trainee("2027-06-16")]);
    expect(result.totalCents).toBeNull();
    expect(result.knownSubtotalCents).toBe(75035);
  });
  it.each([
    ["2026-12", 2400],
    ["2027-01", 2370],
    ["2028-01", 2340],
    ["2029-01", 2310],
  ])("uses dated full-time rules in %s instead of the persisted fallback", (month, minutes) => {
    const result = base(String(month), [
      trainee("2025-11-01", 1200, {
        region: "EAST_UNIVERSITY_HOSPITAL",
        fullTimeWeeklyMinutes: 60,
      }),
    ]);
    expect(result.positions[0]!.basis.fullTimeWeeklyMinutes).toBe(minutes);
  });
  it.each([
    { group: "P5" },
    { group: "regular", level: "4" },
    { variant: "BT_K" },
    { region: "OTHER" },
  ])("rejects a foreign selection %j", (changes) => {
    expect(
      resolveRemunerationContext("2027-01-01", [trainee("2027-01-01", 2310, changes)], rules).kind,
    ).toBe("unavailable");
  });
  it("includes known night premiums without declaring incomplete gross complete", () => {
    const result = calculateDatedMonthlyRemuneration({
      month: "2026-09",
      shifts: [shift()],
      workProfile: work,
      history: [trainee()],
      allowanceEntitlements: [],
      resolver: rules,
    });
    expect(result.base.totalCents).toBe(144070);
    expect(result.timePremiums.totalCents).toBe(344);
    expect(result.allowances.totalCents).toBeNull();
    expect(result.estimatedGrossCents).toBeNull();
    expect(result.knownSubtotalCents).toBe(144414);
  });
  it("rejects an old full-time extent after a reduction and accepts a dated correction", () => {
    const old = trainee("2025-11-01", 2400, { region: "EAST_UNIVERSITY_HOSPITAL" });
    expect(base("2026-12", [old]).totalCents).toBe(144070);
    expect(base("2027-01", [old]).totalCents).toBeNull();
    expect(
      base("2027-01", [old, trainee("2027-01-01", 2370, { region: "EAST_UNIVERSITY_HOSPITAL" })])
        .totalCents,
    ).toBe(144070);
  });
});
