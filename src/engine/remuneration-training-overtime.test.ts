import { describe, expect, it } from "vitest";
import oldValue from "../../rules/packages/reviewed/tvaoed-pflege-vka/2025-04.json";
import newValue from "../../rules/packages/reviewed/tvaoed-pflege-vka/2026-05.json";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  calculateDatedShiftOvertime,
  calculateMonthlyDatedOvertime,
} from "./remuneration-overtime";
import { calculateMonthlyBaseRemuneration } from "./remuneration-base";
import { calculateDatedMonthlyRemuneration } from "./remuneration-month";
import { history, resolver, shift, work } from "./remuneration-test-fixtures";

const packages = [oldValue, newValue] as RuleTariffPackage[];
const catalog = resolver(packages);
function training(
  from = "2025-04-01",
  group = "b",
  year = "1",
  weeklyMinutes = 2310,
  variant = "BT_K",
  region = "OTHER",
): DatedRemunerationProfile {
  return {
    ...history(from),
    data: {
      version: 1,
      weeklyMinutes,
      selection: {
        kind: "tariff",
        packageId: "tvaoed-pflege-vka",
        variant,
        region,
        group,
        level: year,
        fullTimeWeeklyMinutes: variant === "BT_K" ? 2310 : 2340,
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
const run = (profiles = [training()], record = entry, rules = catalog) =>
  calculateDatedShiftOvertime(record, work, profiles, rules);

describe("explicit TVAöD-Pflege overtime", () => {
  it("retains one period and the exact source cents for an unchanged training month", () => {
    const result = calculateMonthlyBaseRemuneration("2026-09", [training()], catalog);
    expect(result.positions).toHaveLength(1);
    expect(result.status).toBe("calculated");
    expect(result.totalCents).toBe(149069);
    expect(result.positions[0].basis.proration).toBe("none");
  });
  it("prorates only at the actual mid-month training-year change", () => {
    const result = calculateMonthlyBaseRemuneration(
      "2026-09",
      [training(), training("2026-09-16", "b", "2")],
      catalog,
    );
    expect(result.positions).toHaveLength(2);
    expect(result.positions.map((position) => position.amountCents)).toEqual([74535, 77604]);
    expect(result.totalCents).toBe(152139);
    expect(result.status).toBe("estimated");
  });
  // Independent reference: listed monthly cents / (38.5 * 4.348), rounded to cents.
  // These are draft reference calculations, not evidence of legal approval.
  it.each([
    ["2025-04-15", "b", "1", 846],
    ["2025-04-15", "b", "2", 882],
    ["2025-04-15", "b", "3", 943],
    ["2025-04-15", "c", "1", 771],
    ["2025-04-15", "c", "2", 807],
    ["2025-04-15", "c", "3", 864],
    ["2026-09-15", "b", "1", 891],
    ["2026-09-15", "b", "2", 927],
    ["2026-09-15", "b", "3", 988],
    ["2026-09-15", "c", "1", 816],
    ["2026-09-15", "c", "2", 851],
    ["2026-09-15", "c", "3", 909],
  ] as const)("%s category %s year %s uses %i cents per hour", (date, group, year, hourly) => {
    const result = run([training("2025-04-01", group, year)], { ...entry, date });
    expect(result).toMatchObject({ complete: true, status: "estimated" });
    expect(result.positions.map((p) => p.kind)).toEqual(["overtime-base", "overtime-premium"]);
    expect(result.positions[0].amountCents).toBe(hourly);
    expect(result.positions[1].amountCents).toBe(Math.round(hourly * 0.3));
    expect(result.positions[1].basis).toMatchObject({
      minutes: 60,
      rateCents: hourly,
      percentageBasisPoints: 3000,
      ruleId: "training-overtime",
    });
    expect(result.positions[0].source.packageId).toBe("tvaoed-pflege-vka");
  });

  it.each([
    ["BT_K", "OTHER", 2310, 1158],
    ["BT_K", "KAV_BW", 2310, 1158],
    ["BT_B", "OTHER", 2340, 1143],
    ["BT_B", "KAV_BW", 2340, 1143],
  ] as const)("uses explicit %s/%s working time", (variant, region, weekly, total) => {
    expect(run([training("2025-04-01", "b", "1", weekly, variant, region)]).totalCents).toBe(total);
  });
  it("does not apply the part-time factor to the same hour again or use legacy P pay", () => {
    const profiles = [training("2025-04-01", "b", "1", 1155)];
    const part = run(profiles);
    expect(part.totalCents).toBe(1158);
    expect(
      calculateDatedShiftOvertime(entry, { ...work, tariff: null }, profiles, catalog),
    ).toEqual(part);
  });
  it("requires confirmed payable minutes, not a positive balance or overtime number alone", () => {
    expect(run(undefined, { ...entry, tariffOvertimeConfirmed: false }).positions).toEqual([]);
    expect(run(undefined, { ...entry, overtimeMinutes: 0 }).positions).toEqual([]);
    expect(run(undefined, { ...entry, overtimeMinutes: 9999 }).totalCents).toBeNull();
    expect(run(undefined, { ...entry, type: "VACATION" }).positions).toEqual([]);
  });
  it("gets the percentage from catalog data and retains per-line rounding", () => {
    const next = structuredClone(newValue) as RuleTariffPackage;
    next.rules.premiumRules.find((rule) => rule.premiumType === "OVERTIME")!.percentageBasisPoints =
      2500;
    const result = run(undefined, { ...entry, overtimeMinutes: 30 }, resolver([next]));
    expect(result.positions.map((p) => p.amountCents)).toEqual([446, 111]);
  });
  it.each(["missing", "duplicate", "disabled", "employee-step"] as const)(
    "does not return a plausible zero when the rule is %s",
    (change) => {
      const next = structuredClone(newValue) as RuleTariffPackage;
      const rule = next.rules.premiumRules.find((r) => r.premiumType === "OVERTIME")!;
      if (change === "missing")
        next.rules.premiumRules = next.rules.premiumRules.filter((r) => r !== rule);
      if (change === "duplicate") next.rules.premiumRules.push({ ...rule, id: "ambiguous" });
      if (change === "disabled") next.rules.selection!.capabilities.overtime = "UNSUPPORTED";
      if (change === "employee-step") rule.referenceStepId = "s3";
      expect(run(undefined, entry, resolver([next]))).toMatchObject({
        complete: false,
        totalCents: null,
      });
    },
  );
  it("requires allocation across the table/month change and pays only each month's minutes", () => {
    const record = {
      ...entry,
      date: "2026-04-30",
      startTime: "23:00",
      endTime: "01:00",
      breakMinutes: 0,
    };
    expect(run(undefined, record).positions[0].issue?.code).toBe("OVERTIME_ALLOCATION_REQUIRED");
    const allocations = new Map([
      [
        record.id,
        [
          { date: "2026-04-30", minutes: 30 },
          { date: "2026-05-01", minutes: 30 },
        ],
      ],
    ]);
    expect(
      calculateMonthlyDatedOvertime("2026-04", [record], work, [training()], catalog, allocations)
        .totalCents,
    ).toBe(550);
    expect(
      calculateMonthlyDatedOvertime("2026-05", [record], work, [training()], catalog, allocations)
        .totalCents,
    ).toBe(580);
  });
  it("uses dated training-year changes, not the latest year for historical overtime", () => {
    const profiles = [training(), training("2026-09-16", "b", "2")];
    const record = { ...entry, startTime: "23:00", endTime: "01:00", breakMinutes: 0 };
    expect(run(profiles, record).positions[0].issue?.code).toBe("OVERTIME_ALLOCATION_REQUIRED");
    const result = calculateDatedShiftOvertime(record, work, profiles, catalog, [
      { date: "2026-09-15", minutes: 30 },
      { date: "2026-09-16", minutes: 30 },
    ]);
    expect(result.positions.map((p) => p.amountCents)).toEqual([446, 134, 464, 139]);
    expect(run(profiles).totalCents).toBe(1158);
  });
  it("exposes only known components, not a complete gross salary while allowances are unknown", () => {
    const result = calculateDatedMonthlyRemuneration({
      month: "2026-09",
      shifts: [entry],
      workProfile: work,
      history: [training()],
      allowanceEntitlements: [],
      resolver: catalog,
    });
    expect(result.overtime.totalCents).toBe(1158);
    expect(result.estimatedGrossCents).toBeNull();
    expect(result.complete).toBe(false);
  });
  it("does not extend a reviewed table beyond its supported dates", () => {
    expect(run(undefined, { ...entry, date: "2027-04-01" }).totalCents).toBeNull();
  });
  it("honours saved allocations and rejects revoked or stale confirmations", () => {
    const saved = {
      shiftId: entry.id,
      shiftRevision: entry.revision,
      timeZone: work.timeZone,
      revision: 1,
      confirmedAt: work.createdAt,
      updatedAt: work.updatedAt,
      allocations: [{ date: entry.date, minutes: 60 }],
    };
    expect(
      calculateDatedShiftOvertime(entry, work, [training()], catalog, undefined, undefined, saved)
        .totalCents,
    ).toBe(1158);
    for (const invalid of [
      { ...saved, allocations: null },
      { ...saved, shiftRevision: entry.revision + 1 },
      { ...saved, timeZone: "UTC" },
    ]) {
      const result = calculateDatedShiftOvertime(
        entry,
        work,
        [training()],
        catalog,
        undefined,
        undefined,
        invalid,
      );
      expect(result.totalCents).toBeNull();
      expect(result.positions[0].issue?.code).toBe("OVERTIME_ALLOCATION_REQUIRED");
    }
  });
});
