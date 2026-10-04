import { describe, expect, it } from "vitest";
import type {
  DatedRemunerationProfile,
  RemunerationSelection,
} from "@/domain/remuneration-profile";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import oldValue from "../../rules/packages/reviewed/tvl-kr-tdl/2025-11.json";
import currentValue from "../../rules/packages/reviewed/tvl-kr-tdl/2026-04.json";
import nextValue from "../../rules/packages/reviewed/tvl-kr-tdl/2027-03.json";
import futureValue from "../../rules/packages/reviewed/tvl-kr-tdl/2028-01.json";
import { history, resolver, shift, work } from "./remuneration-test-fixtures";
import { resolveRemunerationContext, resolveRemunerationMonth } from "./remuneration-context";
import { calculateMonthlyBaseRemuneration } from "./remuneration-base";
import { calculateDatedMonthlyRemuneration } from "./remuneration-month";
import { deriveDatedAllowanceAssessments } from "./remuneration-assessment";

const packages = [oldValue, currentValue, nextValue, futureValue] as RuleTariffPackage[];
const rules = resolver(packages);
function kr(
  effectiveFrom = "2025-11-01",
  weeklyMinutes = 2310,
  changes: Partial<Extract<RemunerationSelection, { kind: "tariff" }>> = {},
): DatedRemunerationProfile {
  return {
    ...history(effectiveFrom),
    data: {
      version: 1,
      weeklyMinutes,
      selection: {
        kind: "tariff",
        packageId: "tvl-kr-tdl",
        variant: "SECTION_43",
        region: "WEST_38_5",
        group: "KR5",
        level: "1",
        fullTimeWeeklyMinutes: 2310,
        ...changes,
      },
    },
  };
}
const base = (month: string, entries = [kr()]) =>
  calculateMonthlyBaseRemuneration(month, entries, rules);

describe("dated TV-L/KR calculation", () => {
  it.each([
    ["2025-11", 275229, "2025-11"],
    ["2026-03", 275229, "2025-11"],
    ["2026-04", 285229, "2026-04"],
    ["2027-02", 285229, "2026-04"],
    ["2027-03", 290934, "2027-03"],
    ["2027-12", 290934, "2027-03"],
    ["2028-01", 293843, "2028-01"],
  ])("uses the actual KR5/1 table in %s", (month, cents, versionId) => {
    const result = base(String(month));
    expect(result.totalCents).toBe(cents);
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0]!.source).toMatchObject({ packageId: "tvl-kr-tdl", versionId });
    expect(result.positions[0]!.basis.fullTimeMonthlyCents).toBe(cents);
  });
  it.each([
    ["KR5", "1", 285229],
    ["KR6", "1", 296358],
    ["KR7", "2", 347561],
    ["KR8", "6", 446847],
    ["KR17", "6", 707566],
  ])("uses %s/%s without a P-group mapping", (group, level, cents) => {
    expect(
      base("2026-09", [kr("2025-11-01", 2310, { group: String(group), level: String(level) })])
        .totalCents,
    ).toBe(cents);
  });
  it("rounds personal monthly pay once before calculating a calendar-day share", () => {
    expect(base("2026-06", [kr("2025-11-01", 1155)]).totalCents).toBe(142615);
    const result = base("2026-06", [kr(), kr("2026-06-16", 1155)]);
    expect(result.positions.map((position) => position.amountCents)).toEqual([142615, 71308]);
    expect(result.totalCents).toBe(213923);
  });
  it("does not invent salary history before a mid-month profile starts", () => {
    const result = base("2026-06", [kr("2026-06-16", 1155)]);
    expect(result.complete).toBe(false);
    expect(result.totalCents).toBeNull();
    expect(result.knownSubtotalCents).toBe(71308);
    expect(result.positions[0]!.issue?.code).toBe("PROFILE_MISSING");
  });
  it.each([
    ["2026-12", 2400, 142615],
    ["2027-01", 2370, 144420],
    ["2028-01", 2340, 150689],
    ["2029-01", 2310, 152646],
  ])(
    "uses dated East university full-time hours in %s, not the saved fallback",
    (month, minutes, cents) => {
      const result = base(String(month), [
        kr("2025-11-01", 1200, { region: "EAST_UNIVERSITY_HOSPITAL", fullTimeWeeklyMinutes: 60 }),
      ]);
      expect(result.positions[0]!.basis.fullTimeWeeklyMinutes).toBe(minutes);
      expect(result.totalCents).toBe(cents);
    },
  );
  it("requires a corrected employment extent when an old 40-hour profile exceeds the new basis", () => {
    const entry = kr("2025-11-01", 2400, { region: "EAST_UNIVERSITY_HOSPITAL" });
    expect(base("2026-12", [entry]).totalCents).toBe(285229);
    expect(base("2027-01", [entry]).positions[0]!.issue?.code).toBe("PROFILE_INVALID");
    expect(
      base("2027-01", [entry, kr("2027-01-01", 2370, { region: "EAST_UNIVERSITY_HOSPITAL" })])
        .totalCents,
    ).toBe(285229);
  });
  it("splits a source-declared mid-month working-time change even in the same table version", () => {
    const pkg = currentValue as RuleTariffPackage;
    const current = pkg.rules.employmentWorkingTimeRules!.find(
      (rule) => rule.regionId === "WEST_38_5",
    )!;
    const changed: RuleTariffPackage = {
      ...pkg,
      rules: {
        ...pkg.rules,
        employmentWorkingTimeRules: [
          { ...current, validTo: "2026-06-15" },
          {
            ...current,
            id: "synthetic-june-basis",
            validFrom: "2026-06-16",
            fullTimeWeeklyMinutes: 2400,
          },
          ...pkg.rules.employmentWorkingTimeRules!.filter((rule) => rule.regionId !== "WEST_38_5"),
        ],
      },
    };
    const periods = resolveRemunerationMonth("2026-06", [kr()], resolver([changed]));
    expect(periods.map(({ from, through }) => [from, through])).toEqual([
      ["2026-06-01", "2026-06-15"],
      ["2026-06-16", "2026-06-30"],
    ]);
  });
  it.each([
    { group: "P5" },
    { group: "kr5" },
    { group: "KR18" },
    { group: "KR7", level: "1" },
    { variant: "BT_K" },
    { region: "OTHER" },
    { region: "WEST" },
  ])("rejects an invalid KR selection %j", (selection) => {
    expect(
      resolveRemunerationContext("2026-09-01", [kr("2025-11-01", 2310, selection)], rules).kind,
    ).toBe("unavailable");
  });
  it("never fills missing or corrupt remote KR data from bundled TVöD tables", () => {
    expect(calculateMonthlyBaseRemuneration("2026-09", [kr()], resolver([])).totalCents).toBeNull();
    const pkg = currentValue as RuleTariffPackage;
    const broken = {
      ...pkg,
      rules: {
        ...pkg.rules,
        payTables: [
          {
            ...pkg.rules.payTables[0]!,
            entries: pkg.rules.payTables[0]!.entries.filter((entry) => entry.groupId !== "kr5"),
          },
        ],
      },
    };
    expect(
      calculateMonthlyBaseRemuneration("2026-09", [kr()], resolver([broken as RuleTariffPackage]))
        .totalCents,
    ).toBeNull();
  });
  it.each([false, true])("keeps monthly gross incomplete with services=%s", (hasWork) => {
    const shifts = hasWork
      ? [
          shift({
            startTime: "07:00",
            endTime: "15:00",
            overtimeMinutes: 60,
            tariffOvertimeConfirmed: true,
          }),
        ]
      : [];
    const result = calculateDatedMonthlyRemuneration({
      month: "2026-09",
      shifts,
      workProfile: work,
      history: [kr()],
      allowanceEntitlements: [],
      resolver: rules,
    });
    expect(result.base.totalCents).toBe(285229);
    expect(result.allowances.totalCents).toBeNull();
    expect(result.estimatedGrossCents).toBeNull();
    expect(result.knownSubtotalCents).toBe(285229 + (hasWork ? 2274 : 0));
    expect(result.allowances.positions[0]!.issue?.code).toBe("TARIFF_UNSUPPORTED");
    if (hasWork) {
      expect(result.timePremiums.totalCents).toBe(0);
      expect(result.overtime.totalCents).toBe(2274);
      expect(result.overtime.positions.map((position) => position.amountCents)).toEqual([
        1704, 570,
      ]);
    }
  });
  it("does not run the TVöD allowance heuristic for KR profiles", () => {
    const result = deriveDatedAllowanceAssessments({
      month: "2026-09",
      shifts: [shift()],
      workProfile: work,
      history: [kr()],
      settings: {
        workplaceCoverage: "AROUND_THE_CLOCK",
        assignment: "PERMANENT",
        updatedAt: work.updatedAt,
      },
      resolver: rules,
    });
    expect(result.periods[0]).toMatchObject({
      assessment: null,
      entitlement: null,
      issue: { code: "TARIFF_UNSUPPORTED" },
    });
  });
});
