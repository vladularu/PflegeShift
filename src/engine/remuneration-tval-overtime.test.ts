import { describe, expect, it } from "vitest";
import old from "../../rules/packages/reviewed/tval-pflege-tdl/2025-11.json";
import current from "../../rules/packages/reviewed/tval-pflege-tdl/2026-04.json";
import january from "../../rules/packages/reviewed/tval-pflege-tdl/2027-01.json";
import march from "../../rules/packages/reviewed/tval-pflege-tdl/2027-03.json";
import future from "../../rules/packages/reviewed/tval-pflege-tdl/2028-01.json";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type { SavedOvertimeAllocation } from "@/domain/overtime-allocation";
import {
  calculateDatedShiftOvertime,
  calculateMonthlyDatedOvertime,
} from "./remuneration-overtime";
import { calculateDatedMonthlyRemuneration } from "./remuneration-month";
import { history, resolver, shift, work } from "./remuneration-test-fixtures";

const catalog = resolver([old, current, january, march, future] as RuleTariffPackage[]);
function profile(
  level = "1",
  group = "regular",
  region = "WEST_38_5",
  weeklyMinutes = 2310,
): DatedRemunerationProfile {
  return {
    ...history("2025-11-01"),
    data: {
      version: 1,
      weeklyMinutes,
      selection: {
        kind: "tariff",
        packageId: "tval-pflege-tdl",
        variant: "CARE",
        region,
        group,
        level,
        fullTimeWeeklyMinutes: 2310,
      },
    },
  };
}
const entry = shift({
  date: "2026-09-15",
  startTime: "07:00",
  endTime: "16:00",
  breakMinutes: 30,
  overtimeMinutes: 60,
  tariffOvertimeConfirmed: true,
});
const run = (record = entry, profiles = [profile()], rules = catalog) =>
  calculateDatedShiftOvertime(record, work, profiles, rules);

describe("TVA-L confirmed cash-payable overtime", () => {
  // Independent cent references: full table / (full week * 4.348),
  // rounded hourly, then hourly 30% rounded, then worked time per position.
  // These draft calculations do not substitute for legal/entitlement review.
  it.each([
    ["2025-11-15", "1", 825, 248],
    ["2026-04-15", "1", 861, 258],
    ["2026-04-15", "2", 900, 270],
    ["2026-04-15", "3", 964, 289],
    ["2027-01-15", "1", 861, 258],
    ["2027-03-15", "1", 896, 269],
    ["2028-01-15", "1", 914, 274],
  ])("%s level %s uses its own basis %i and premium %i", (date, level, base, premium) => {
    const result = run({ ...entry, date: String(date) }, [profile(String(level))]);
    expect(result).toMatchObject({
      complete: true,
      status: "estimated",
      totalCents: Number(base) + Number(premium),
    });
    expect(result.positions.map((p) => p.amountCents)).toEqual([base, premium]);
    expect(result.positions.map((p) => p.kind)).toEqual(["overtime-base", "overtime-premium"]);
    expect(result.positions[1].basis).toMatchObject({
      ruleId: "tval-overtime-premium",
      rateCents: base,
      percentageBasisPoints: 3000,
      minutes: 60,
    });
    expect(result.positions[0].source.packageId).toBe("tval-pflege-tdl");
  });
  it.each([
    ["2026-09-15", "EAST", 828, 248],
    ["2026-09-15", "EAST_UNIVERSITY_HOSPITAL", 828, 248],
    ["2027-01-15", "EAST_UNIVERSITY_HOSPITAL", 839, 252],
    ["2028-01-15", "EAST_UNIVERSITY_HOSPITAL", 903, 271],
    ["2029-01-15", "EAST_UNIVERSITY_HOSPITAL", 914, 274],
  ])("%s takes dated full-time basis in %s", (date, region, base, premium) => {
    expect(
      run({ ...entry, date: String(date) }, [
        profile("1", "regular", String(region)),
      ]).positions.map((p) => p.amountCents),
    ).toEqual([base, premium]);
  });
  it.each([
    ["2027-01-15", "1", 775, 233],
    ["2027-01-15", "2", 807, 242],
    ["2027-03-15", "1", 811, 243],
    ["2028-01-15", "2", 861, 258],
  ])("keeps assistant month bracket %s/%s separate", (date, level, base, premium) => {
    expect(
      run({ ...entry, date: String(date) }, [profile(String(level), "assistant")]).positions.map(
        (p) => p.amountCents,
      ),
    ).toEqual([base, premium]);
  });
  it("does not reduce the hourly rate twice for part-time training", () => {
    expect(run(entry, [profile("1", "regular", "WEST_38_5", 1155)]).totalCents).toBe(1119);
    expect(
      calculateDatedShiftOvertime(entry, { ...work, tariff: null }, [profile()], catalog),
    ).toEqual(run());
  });
  it("uses catalog parameters and rounds hourly premiums before multiplying minutes", () => {
    expect(run({ ...entry, overtimeMinutes: 180 }).positions.map((p) => p.amountCents)).toEqual([
      2583, 774,
    ]); // Not 775 cents from multiplying the unrounded 30% rate.
    expect(run({ ...entry, overtimeMinutes: 30 }).positions.map((p) => p.amountCents)).toEqual([
      431, 129,
    ]);
    const changed = structuredClone(current) as RuleTariffPackage;
    changed.rules.tvalOvertimePolicy!.percentageBasisPoints = 2500;
    expect(
      run(entry, [profile()], resolver([changed])).positions.map((p) => p.amountCents),
    ).toEqual([861, 215]);
    changed.rules.tvalOvertimePolicy!.monthlyFactorThousandths = 4000;
    expect(
      run(entry, [profile()], resolver([changed])).positions.map((p) => p.amountCents),
    ).toEqual([936, 234]);
  });
  it("does not invent overtime from a balance, unconfirmed minutes or an absence", () => {
    for (const record of [
      { ...entry, tariffOvertimeConfirmed: false },
      { ...entry, overtimeMinutes: 0 },
      { ...entry, type: "VACATION" as const },
      { ...entry, deletedAt: "2026-09-16T00:00:00Z" },
    ])
      expect(run(record).positions).toEqual([]);
    expect(run({ ...entry, overtimeMinutes: 511 }).positions[0].issue?.code).toBe(
      "OVERTIME_MINUTES_INVALID",
    );
  });
  it("keeps old policy-free drafts unavailable instead of fabricating zero pay", () => {
    const draft = structuredClone(current) as RuleTariffPackage;
    delete draft.rules.tvalOvertimePolicy;
    draft.rules.selection!.capabilities.overtime = "UNSUPPORTED";
    expect(run(entry, [profile()], resolver([draft]))).toMatchObject({
      complete: false,
      totalCents: null,
      positions: [{ issue: { code: "OVERTIME_RULE_MISSING" } }],
    });
    expect(run(entry, [profile("6")]).totalCents).toBeNull();
    expect(run(entry, [profile()], resolver([])).totalCents).toBeNull();
  });
  it("requires explicit day allocation across table and month changes", () => {
    const crossing = {
      ...entry,
      date: "2026-03-31",
      startTime: "23:00",
      endTime: "02:00",
      breakMinutes: 0,
      overtimeMinutes: 120,
    };
    expect(run(crossing).positions[0].issue?.code).toBe("OVERTIME_ALLOCATION_REQUIRED");
    const allocations = [
      { date: "2026-03-31", minutes: 60 },
      { date: "2026-04-01", minutes: 60 },
    ];
    const result = calculateDatedShiftOvertime(crossing, work, [profile()], catalog, allocations);
    expect(result.positions.map((p) => p.amountCents)).toEqual([825, 248, 861, 258]);
    expect(
      calculateDatedShiftOvertime(crossing, work, [profile()], catalog, allocations, "2026-03")
        .totalCents,
    ).toBe(1073);
    expect(
      calculateDatedShiftOvertime(crossing, work, [profile()], catalog, allocations, "2026-04")
        .totalCents,
    ).toBe(1119);
  });
  it("uses the new regional working week even within the same package version", () => {
    const crossing = {
      ...entry,
      date: "2028-12-31",
      startTime: "23:00",
      endTime: "01:00",
      breakMinutes: 0,
      overtimeMinutes: 120,
    };
    const profiles = [profile("1", "regular", "EAST_UNIVERSITY_HOSPITAL")];
    expect(run(crossing, profiles).positions[0].issue?.code).toBe("OVERTIME_ALLOCATION_REQUIRED");
    const result = calculateDatedShiftOvertime(crossing, work, profiles, catalog, [
      { date: "2028-12-31", minutes: 60 },
      { date: "2029-01-01", minutes: 60 },
    ]);
    expect(result.positions.map((p) => p.amountCents)).toEqual([903, 271, 914, 274]);
  });
  it("keeps same-basis day allocations together for cent rounding", () => {
    const crossing = { ...entry, startTime: "23:00", endTime: "01:00", breakMinutes: 0 };
    const result = calculateDatedShiftOvertime(crossing, work, [profile()], catalog, [
      { date: "2026-09-15", minutes: 30 },
      { date: "2026-09-16", minutes: 30 },
    ]);
    expect(result.positions.map((p) => p.amountCents)).toEqual([861, 258]);
    expect(result.positions[0].through).toBe("2026-09-16");
  });
  it("rejects stale or withdrawn saved allocations, and includes valid ones once per month", () => {
    const crossing = {
      ...entry,
      date: "2026-03-31",
      startTime: "23:00",
      endTime: "02:00",
      breakMinutes: 0,
      overtimeMinutes: 120,
    };
    const saved: SavedOvertimeAllocation = {
      shiftId: crossing.id,
      shiftRevision: crossing.revision,
      timeZone: work.timeZone,
      revision: 1,
      confirmedAt: "2026-04-02T00:00:00Z",
      updatedAt: "2026-04-02T00:00:00Z",
      allocations: [
        { date: "2026-03-31", minutes: 60 },
        { date: "2026-04-01", minutes: 60 },
      ],
    };
    expect(
      calculateMonthlyDatedOvertime("2026-04", [crossing], work, [profile()], catalog, undefined, [
        saved,
      ]).totalCents,
    ).toBe(1119);
    for (const value of [
      { ...saved, shiftRevision: 2 },
      { ...saved, allocations: null },
    ]) {
      expect(
        calculateDatedShiftOvertime(
          crossing,
          work,
          [profile()],
          catalog,
          undefined,
          "2026-04",
          value,
        ).positions[0].issue?.code,
      ).toBe("OVERTIME_ALLOCATION_REQUIRED");
    }
  });
  it("feeds the real monthly result once and removes pay when confirmation is withdrawn", () => {
    const input = {
      month: "2026-09",
      shifts: [entry],
      workProfile: work,
      history: [profile()],
      allowanceEntitlements: [],
      resolver: catalog,
    };
    const result = calculateDatedMonthlyRemuneration(input);
    expect(result.overtime.totalCents).toBe(1119);
    expect(
      calculateDatedMonthlyRemuneration({
        ...input,
        shifts: [{ ...entry, tariffOvertimeConfirmed: false }],
      }).overtime.totalCents,
    ).toBe(0);
  });
});
