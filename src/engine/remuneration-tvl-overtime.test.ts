import { describe, expect, it } from "vitest";
import oldValue from "../../rules/packages/reviewed/tvl-kr-tdl/2025-11.json";
import currentValue from "../../rules/packages/reviewed/tvl-kr-tdl/2026-04.json";
import nextValue from "../../rules/packages/reviewed/tvl-kr-tdl/2027-03.json";
import futureValue from "../../rules/packages/reviewed/tvl-kr-tdl/2028-01.json";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  calculateDatedShiftOvertime,
  calculateMonthlyDatedOvertime,
} from "./remuneration-overtime";
import { calculateAssessedMonthlyRemuneration } from "./remuneration-month";
import { resolver, shift, work } from "./remuneration-test-fixtures";
import { tvlProfile } from "./tvl-shift-work-test-fixtures";
import { buildAnnualAvailableReportSteps } from "@/features/analysis/annual-core-report";

const catalog = resolver([oldValue, currentValue, nextValue, futureValue] as RuleTariffPackage[]);
const settings = { workplaceCoverage: "UNKNOWN", assignment: "UNKNOWN", updatedAt: null } as const;
function profile(
  group = 5,
  level = 1,
  weeklyMinutes = 2310,
  region = "WEST_38_5",
): DatedRemunerationProfile {
  const value = tvlProfile();
  if (value.data.selection.kind !== "tariff") throw new Error("fixture");
  return {
    ...value,
    effectiveFrom: "2025-11-01",
    data: {
      ...value.data,
      weeklyMinutes,
      selection: { ...value.data.selection, group: "KR" + group, level: String(level), region },
    },
  };
}
const entry = shift({
  startTime: "07:00",
  endTime: "16:00",
  breakMinutes: 30,
  overtimeMinutes: 60,
  tariffOvertimeConfirmed: true,
});
const run = (profiles = [profile()], record = entry, rules = catalog) =>
  calculateDatedShiftOvertime(record, work, profiles, rules);

// Independently calculated from the source table, not from the adapter under test:
// full-time monthly cents / 167.398, hourly half-up; stage 4 cap; stage 3 premium.
const referenceRows: [number, number, number[], number, number][] = [
  [5, 1, [1704, 1855, 1899, 1970, 1970, 1970], 1899, 570],
  [6, 1, [1770, 1881, 1987, 2215, 2215, 2215], 1987, 596],
  [7, 2, [2076, 2192, 2374, 2374, 2374], 2192, 658],
  [8, 2, [2192, 2292, 2421, 2421, 2421], 2292, 688],
  [9, 2, [2371, 2487, 2564, 2564, 2564], 2487, 746],
  [10, 2, [2487, 2564, 2780, 2780, 2780], 2564, 769],
  [11, 2, [2628, 2710, 2915, 2915, 2915], 2710, 813],
  [12, 2, [2770, 2856, 3073, 3073, 3073], 2856, 857],
  [13, 2, [2911, 3002, 3230, 3230, 3230], 3002, 450],
  [14, 2, [2982, 3075, 3309, 3309, 3309], 3075, 461],
  [15, 2, [3052, 3148, 3388, 3388, 3388], 3148, 472],
  [16, 2, [3117, 3221, 3559, 3559, 3559], 3221, 483],
  [17, 2, [3187, 3294, 3638, 3638, 3638], 3294, 494],
];
const cells = referenceRows.flatMap(([group, start, bases, reference, premium]) =>
  bases.map((base, i) => ({ group, level: start + i, base, reference, premium })),
);
describe("explicit TV-L/KR overtime", () => {
  it.each(cells)(
    "KR$group step $level has separate base/reference amounts",
    ({ group, level, base, reference, premium }) => {
      const result = run([profile(group, level)]);
      expect(result).toMatchObject({
        complete: true,
        status: "estimated",
        totalCents: base + premium,
      });
      expect(result.positions.map((p) => p.amountCents)).toEqual([base, premium]);
      expect(result.positions[1].basis).toMatchObject({
        rateCents: reference,
        percentageBasisPoints: group <= 12 ? 3000 : 1500,
        minutes: 60,
      });
      expect(result.positions[0].source).toMatchObject({
        packageId: "tvl-kr-tdl",
        versionId: "2026-04",
      });
    },
  );
  it("does not reduce the same hour twice for part-time or read legacy P pay", () => {
    expect(run([profile(5, 1, 1155)]).totalCents).toBe(2274);
    expect(
      calculateDatedShiftOvertime(entry, { ...work, tariff: null }, [profile()], catalog),
    ).toEqual(run());
  });
  it("uses the explicit full-time region and its dated changes", () => {
    expect(run([profile(5, 1, 2310, "EAST")]).positions.map((p) => p.amountCents)).toEqual([
      1640, 548,
    ]);
    expect(
      run([profile(5, 1, 2310, "EAST_UNIVERSITY_HOSPITAL")], {
        ...entry,
        date: "2027-01-15",
      }).positions.map((p) => p.amountCents),
    ).toEqual([1661, 555]);
  });
  it("requires confirmation and actual working minutes", () => {
    expect(run(undefined, { ...entry, tariffOvertimeConfirmed: false }).positions).toEqual([]);
    expect(run(undefined, { ...entry, overtimeMinutes: 0 }).positions).toEqual([]);
    expect(run(undefined, { ...entry, type: "VACATION" }).positions).toEqual([]);
    expect(run(undefined, { ...entry, deletedAt: entry.updatedAt }).positions).toEqual([]);
    expect(run(undefined, { ...entry, overtimeMinutes: 9999 }).totalCents).toBeNull();
  });
  it("gets percentages from the catalog and rounds the hourly premium before multiplying minutes", () => {
    const pkg = structuredClone(currentValue) as RuleTariffPackage;
    pkg.rules.tvlOvertimePolicy!.groupRates[0].percentageBasisPoints = 2500;
    expect(run(undefined, entry, resolver([pkg])).positions.map((p) => p.amountCents)).toEqual([
      1704, 475,
    ]);
    // 18.99 * 30% = 5.697 -> 5.70; 17 minutes -> 1.615 -> 1.62.
    expect(
      run(undefined, { ...entry, overtimeMinutes: 17 }).positions.map((p) => p.amountCents),
    ).toEqual([483, 162]);
  });
  it.each(["missing", "duplicate", "disabled", "reference"] as const)(
    "leaves %s rules unavailable, not zero",
    (mode) => {
      const pkg = structuredClone(currentValue) as RuleTariffPackage;
      if (mode === "missing") {
        delete pkg.rules.tvlOvertimePolicy;
        pkg.rules.selection!.capabilities.overtime = "UNSUPPORTED";
      }
      if (mode === "duplicate")
        pkg.rules.tvlOvertimePolicy!.groupRates.push({
          ...pkg.rules.tvlOvertimePolicy!.groupRates[0],
        });
      if (mode === "disabled") pkg.rules.selection!.capabilities.overtime = "UNSUPPORTED";
      if (mode === "reference") pkg.rules.tvlOvertimePolicy!.maximumBaseStepId = "unknown";
      expect(run(undefined, entry, resolver([pkg]))).toMatchObject({
        complete: false,
        totalCents: null,
      });
    },
  );
  it("requires explicit distribution at table and month boundaries", () => {
    const record = {
      ...entry,
      date: "2026-03-31",
      startTime: "23:00",
      endTime: "01:00",
      breakMinutes: 0,
    };
    expect(run(undefined, record).positions[0].issue?.code).toBe("OVERTIME_ALLOCATION_REQUIRED");
    const allocations = [
      { date: "2026-03-31", minutes: 30 },
      { date: "2026-04-01", minutes: 30 },
    ];
    const before = calculateDatedShiftOvertime(
      record,
      work,
      [profile()],
      catalog,
      allocations,
      "2026-03",
    );
    const after = calculateDatedShiftOvertime(
      record,
      work,
      [profile()],
      catalog,
      allocations,
      "2026-04",
    );
    expect(before.positions.map((p) => p.amountCents)).toEqual([822, 276]);
    expect(after.positions.map((p) => p.amountCents)).toEqual([852, 285]);
    expect(before.totalCents! + after.totalCents!).toBe(2235);
  });
  it("detects a full-time divisor change even within one table version", () => {
    const record = {
      ...entry,
      date: "2026-12-31",
      startTime: "23:00",
      endTime: "01:00",
      breakMinutes: 0,
    };
    const profiles = [profile(5, 1, 2310, "EAST_UNIVERSITY_HOSPITAL")];
    expect(run(profiles, record).positions[0].issue?.code).toBe("OVERTIME_ALLOCATION_REQUIRED");
    const result = calculateDatedShiftOvertime(record, work, profiles, catalog, [
      { date: "2026-12-31", minutes: 30 },
      { date: "2027-01-01", minutes: 30 },
    ]);
    expect(result.positions.map((p) => p.amountCents)).toEqual([820, 274, 831, 278]);
  });
  it("detects a changed dated profile during the shift", () => {
    const next = { ...profile(13, 2), effectiveFrom: "2026-09-16" };
    const record = { ...entry, startTime: "23:00", endTime: "01:00", breakMinutes: 0 };
    expect(run([profile(), next], record).positions[0].issue?.code).toBe(
      "OVERTIME_ALLOCATION_REQUIRED",
    );
  });
  it("does not merge a working-time change inside the same month and version", () => {
    const pkg = structuredClone(currentValue) as RuleTariffPackage;
    const rules = pkg.rules.employmentWorkingTimeRules!.filter(
      (rule) => rule.regionId === "EAST_UNIVERSITY_HOSPITAL",
    );
    rules[0].validTo = "2026-09-15";
    rules[1].validFrom = "2026-09-16";
    const record = { ...entry, startTime: "23:00", endTime: "01:00", breakMinutes: 0 };
    const profiles = [profile(5, 1, 2310, "EAST_UNIVERSITY_HOSPITAL")];
    const resolved = resolver([pkg]);
    expect(run(profiles, record, resolved).positions[0].issue?.code).toBe(
      "OVERTIME_ALLOCATION_REQUIRED",
    );
    const result = calculateDatedShiftOvertime(record, work, profiles, resolved, [
      { date: "2026-09-15", minutes: 30 },
      { date: "2026-09-16", minutes: 30 },
    ]);
    expect(result.positions.map((p) => p.amountCents)).toEqual([820, 274, 831, 278]);
  });
  it.each([
    ["2025-11-01", 1644, 552],
    ["2026-04-01", 1704, 570],
    ["2027-03-01", 1738, 581],
    ["2028-01-01", 1755, 587],
  ] as const)("resolves the source table on %s", (date, base, premium) => {
    expect(run(undefined, { ...entry, date }).positions.map((p) => p.amountCents)).toEqual([
      base,
      premium,
    ]);
  });
  it("uses both reference steps from the policy rather than hardcoded stages", () => {
    const pkg = structuredClone(currentValue) as RuleTariffPackage;
    pkg.rules.tvlOvertimePolicy!.maximumBaseStepId = "2";
    pkg.rules.tvlOvertimePolicy!.premiumReferenceStepId = "2";
    expect(
      run([profile(5, 6)], entry, resolver([pkg])).positions.map((p) => p.amountCents),
    ).toEqual([1855, 557]);
  });
  it("uses the same confirmed positions in monthly and annual output without implying complete gross", () => {
    const month = calculateAssessedMonthlyRemuneration({
      month: "2026-09",
      shifts: [entry],
      workProfile: work,
      history: [profile()],
      settings,
      resolver: catalog,
    });
    expect(month.overtime).toEqual(
      calculateMonthlyDatedOvertime("2026-09", [entry], work, [profile()], catalog),
    );
    expect(month.overtime.totalCents).toBe(2274);
    expect(month.complete).toBe(false);
    const steps = buildAnnualAvailableReportSteps(
      2026,
      [entry],
      work,
      [],
      settings,
      "2026-12-31",
      catalog,
      {
        remuneration: {
          status: "ready",
          profiles: [profile()],
          shifts: [entry],
          overtimeAllocations: [],
          allowanceDecisions: [],
          paidAbsences: [],
        },
      },
    );
    for (;;) {
      const next = steps.next();
      if (next.done) {
        const amounts = next.value.remuneration!.months.flatMap(
          (m) => m.result?.overtime.positions ?? [],
        );
        expect(amounts.map((p) => p.amountCents)).toEqual([1704, 570]);
        break;
      }
    }
  });
});
