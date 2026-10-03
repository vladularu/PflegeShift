import { describe, expect, it } from "vitest";
import { calculateShiftPremiumBreakdown } from "./pay";
import {
  calculateDatedShiftOvertime,
  calculateMonthlyDatedOvertime,
} from "./remuneration-overtime";
import { bindRemunerationTariffResolver } from "./remuneration-tariff-adapter";
import { candidate, resolver, work, history, shift } from "./remuneration-test-fixtures";

const overtime = (change: Parameters<typeof shift>[0] = {}) =>
  shift({ overtimeMinutes: 60, tariffOvertimeConfirmed: true, ...change });
const run = (entry = overtime(), profiles = [history()], packs = [candidate]) =>
  calculateDatedShiftOvertime(entry, work, profiles, resolver(packs));

describe("dated confirmed overtime", () => {
  it("separates base and premium with rule provenance and reproduces whole-shift results", () => {
    const result = run();
    expect(result).toMatchObject({ complete: true, totalCents: 2314, status: "calculated" });
    expect(result.positions.map((entry) => [entry.kind, entry.amountCents])).toEqual([
      ["overtime-base", 1737],
      ["overtime-premium", 577],
    ]);
    expect(result.positions[1]).toMatchObject({
      source: {
        packageId: candidate.packageId,
        versionId: candidate.versionId,
        profileRevision: 1,
      },
      basis: { minutes: 60, rateCents: 1922, percentageBasisPoints: 3000 },
    });
    const old = calculateShiftPremiumBreakdown(
      overtime(),
      work,
      bindRemunerationTariffResolver(resolver(), candidate.packageId),
    );
    expect(result.totalCents).toBe(
      Math.round((old.overtimeBaseAmount + old.overtimePremiumAmount) * 100),
    );
  });

  it("does not pay unconfirmed extra minutes or a worktime balance", () => {
    expect(run(overtime({ tariffOvertimeConfirmed: false }))).toMatchObject({
      complete: true,
      totalCents: 0,
      positions: [],
    });
    expect(run(overtime({ overtimeMinutes: 0 }))).toMatchObject({ totalCents: 0, positions: [] });
  });

  it("uses the configured step-four cap without prorating overtime by part-time", () => {
    const profile = history("2026-01-01", "P5", 1155, "6");
    const result = run(overtime(), [profile]);
    expect(result.positions.map((entry) => entry.amountCents)).toEqual([1992, 577]);
  });

  it("uses the higher-group overtime rate from the selected package", () => {
    expect(
      run(overtime(), [history("2026-01-01", "P16", 2310, "6")]).positions.map(
        (entry) => entry.amountCents,
      ),
    ).toEqual([3575, 485]);
  });

  it("requires an allocation when the profile changes during a shift", () => {
    const result = run(overtime(), [history(), history("2026-09-16", "P6")]);
    expect(result.totalCents).toBeNull();
    expect(result.positions[0].issue?.code).toBe("OVERTIME_ALLOCATION_REQUIRED");
  });

  it("uses a confirmed daily allocation across a profile change", () => {
    const result = calculateDatedShiftOvertime(
      overtime(),
      work,
      [history(), history("2026-09-16", "P6")],
      resolver(),
      [
        { date: "2026-09-15", minutes: 30 },
        { date: "2026-09-16", minutes: 30 },
      ],
    );
    expect(result.totalCents).toBe(2358);
    expect(result.positions.map((entry) => entry.amountCents)).toEqual([869, 288, 900, 301]);
  });

  it("does not introduce a rounding difference for equal-rate daily allocations", () => {
    const result = calculateDatedShiftOvertime(overtime(), work, [history()], resolver(), [
      { date: "2026-09-16", minutes: 30 },
      { date: "2026-09-15", minutes: 30 },
    ]);
    expect(result.totalCents).toBe(run().totalCents);
    expect(result.positions).toHaveLength(2);
  });

  it("does not reject an explicit allocation based on a fabricated centered pause location", () => {
    const result = calculateDatedShiftOvertime(
      overtime({ breakMinutes: 60 }),
      work,
      [history(), history("2026-09-16", "P6")],
      resolver(),
      [{ date: "2026-09-15", minutes: 60 }],
    );
    expect(result.totalCents).toBe(2314);
    expect(result.positions.every((position) => position.from === "2026-09-15")).toBe(true);
  });

  it("requires month-boundary allocation and counts explicitly allocated minutes once per month", () => {
    const entry = overtime({ date: "2026-09-30" });
    expect(
      calculateMonthlyDatedOvertime("2026-09", [entry], work, [history()], resolver()).positions[0]
        .issue?.code,
    ).toBe("OVERTIME_ALLOCATION_REQUIRED");
    const allocations = new Map([
      [
        entry.id,
        [
          { date: "2026-09-30", minutes: 20 },
          { date: "2026-10-01", minutes: 40 },
        ],
      ],
    ]);
    const september = calculateMonthlyDatedOvertime(
      "2026-09",
      [entry],
      work,
      [history()],
      resolver(),
      allocations,
    );
    const october = calculateMonthlyDatedOvertime(
      "2026-10",
      [entry],
      work,
      [history()],
      resolver(),
      allocations,
    );
    expect(september.positions[0].basis.minutes).toBe(20);
    expect(october.positions[0].basis.minutes).toBe(40);
    expect(september.totalCents).toBe(771);
    expect(october.totalCents).toBe(1542);
  });

  it.each([
    [{ date: "2026-09-15", minutes: 20 }],
    [{ date: "2026-09-14", minutes: 60 }],
    [
      { date: "2026-09-15", minutes: 30 },
      { date: "2026-09-15", minutes: 30 },
    ],
    [{ date: "2026-09-15", minutes: 60.5 }],
    [
      { date: "2026-09-15", minutes: -10 },
      { date: "2026-09-16", minutes: 70 },
    ],
  ])("rejects incomplete or impossible allocations %#", (...allocation) => {
    expect(() =>
      calculateDatedShiftOvertime(overtime(), work, [history()], resolver(), allocation),
    ).toThrow("Tagesaufteilung");
  });

  it.each([121, -1, 0.5])(
    "rejects impossible confirmed overtime rather than silently capping it: %s",
    (minutes) => {
      expect(run(overtime({ overtimeMinutes: minutes })).positions[0].issue?.code).toBe(
        "OVERTIME_MINUTES_INVALID",
      );
    },
  );

  it("does not hide overtime on a zero-net-time service", () => {
    expect(run(overtime({ breakMinutes: 120 })).positions[0].issue?.code).toBe(
      "OVERTIME_MINUTES_INVALID",
    );
  });

  it.each(["s3", "s4"])(
    "reports a missing hourly reference %s instead of a zero payout",
    (stepId) => {
      const pack = structuredClone(candidate);
      const entries = pack.rules.payTables[0].entries;
      const index = entries.findIndex((entry) => entry.groupId === "p5" && entry.stepId === stepId);
      expect(index).toBeGreaterThanOrEqual(0);
      entries.splice(index, 1);
      expect(run(overtime(), [history()], [pack]).positions[0].issue?.code).toBe(
        "OVERTIME_RATE_MISSING",
      );
    },
  );

  it.each([false, true])(
    "reports missing and ambiguous overtime rules: duplicate=%s",
    (duplicate) => {
      const pack = structuredClone(candidate);
      const rule = pack.rules.premiumRules.find(
        (entry) => entry.premiumType === "OVERTIME" && entry.conditions.payGroups?.includes("p5"),
      )!;
      pack.rules.premiumRules = duplicate
        ? [...pack.rules.premiumRules, { ...rule, id: "duplicate-overtime" }]
        : pack.rules.premiumRules.filter((entry) => entry !== rule);
      expect(run(overtime(), [history()], [pack]).positions[0].issue?.code).toBe(
        duplicate ? "OVERTIME_RULE_AMBIGUOUS" : "OVERTIME_RULE_MISSING",
      );
    },
  );

  it("returns an unavailable result for missing history and own-pay overtime parameters", () => {
    expect(run(overtime(), []).positions[0].issue?.code).toBe("PROFILE_MISSING");
    const own = {
      ...history(),
      data: {
        version: 1 as const,
        weeklyMinutes: 2310,
        selection: { kind: "own-monthly" as const, monthlyGrossCents: 300000 },
      },
    };
    expect(run(overtime(), [own]).positions[0].issue?.code).toBe("OWN_OVERTIME_UNCONFIGURED");
  });

  it("ignores deleted services and absences and rejects duplicate service IDs", () => {
    expect(run(overtime({ deletedAt: work.updatedAt })).totalCents).toBe(0);
    expect(run(overtime({ type: "VACATION", allDay: true })).totalCents).toBe(0);
    expect(() =>
      calculateMonthlyDatedOvertime(
        "2026-09",
        [overtime(), overtime()],
        work,
        [history()],
        resolver(),
      ),
    ).toThrow("mehrfach");
  });

  it("uses actual elapsed minutes at the autumn time change", () => {
    const entry = overtime({
      date: "2026-10-25",
      startTime: "01:00",
      endTime: "04:00",
      overtimeMinutes: 240,
    });
    expect(run(entry).positions[0].basis.minutes).toBe(240);
    expect(run(entry).totalCents).toBe(9254); // 4 h × 17.37 plus 4 h × 19.22 × 30%.
  });
});
