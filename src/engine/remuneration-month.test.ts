import { describe, expect, it } from "vitest";
import {
  calculateDatedMonthlyRemuneration,
  type DatedMonthlyRemunerationInput,
} from "./remuneration-month";
import { calculateMonthlyPayEstimate } from "./pay";
import { bindRemunerationTariffResolver } from "./remuneration-tariff-adapter";
import { candidate, resolver, history, shift, work } from "./remuneration-test-fixtures";

const input = (): DatedMonthlyRemunerationInput => ({
  month: "2026-09",
  shifts: [shift({ overtimeMinutes: 60, tariffOvertimeConfirmed: true })],
  workProfile: work,
  history: [history()],
  allowanceEntitlements: [
    {
      from: "2026-09-01",
      through: "2026-09-30",
      status: "ALTERNATING_MONTHLY",
      origin: "confirmed",
      revision: 1,
    },
  ],
  resolver: resolver(),
});

describe("complete dated monthly remuneration integration", () => {
  it("combines each component exactly once and preserves the prior supported whole-month amount", () => {
    const data = input();
    const result = calculateDatedMonthlyRemuneration(data);
    expect(result).toMatchObject({
      complete: true,
      status: "calculated",
      estimatedGrossCents: 335483,
      base: { totalCents: 290718 },
      timePremiums: { totalCents: 769 },
      allowances: { totalCents: 41682 },
      overtime: { totalCents: 2314 },
    });
    expect(result.positions.reduce((sum, position) => sum + (position.amountCents ?? 0), 0)).toBe(
      result.estimatedGrossCents,
    );
    const old = calculateMonthlyPayEstimate(
      "2026-09",
      data.shifts,
      work,
      {
        month: "2026-09",
        allowanceStatus: "ALTERNATING_MONTHLY",
        revision: 1,
        confirmedAt: work.createdAt,
        updatedAt: work.updatedAt,
      },
      [],
      undefined,
      bindRemunerationTariffResolver(data.resolver!, candidate.packageId),
    );
    expect(result.estimatedGrossCents).toBe(Math.round(old.estimatedGrossAmount! * 100));
  });

  it("exposes a subtotal but no complete gross value when the allowance decision is missing", () => {
    const result = calculateDatedMonthlyRemuneration({ ...input(), allowanceEntitlements: [] });
    expect(result).toMatchObject({
      complete: false,
      status: "unavailable",
      estimatedGrossCents: null,
      knownSubtotalCents: 310483,
    });
    expect(
      result.positions.some((position) => position.issue?.code === "ALLOWANCE_DECISION_MISSING"),
    ).toBe(true);
  });

  it("propagates pause estimation and inferred entitlement without hiding it", () => {
    const data = input();
    const result = calculateDatedMonthlyRemuneration({
      ...data,
      shifts: [shift({ breakMinutes: 30 })],
      allowanceEntitlements: data.allowanceEntitlements.map((entry) => ({
        ...entry,
        origin: "estimated",
      })),
    });
    expect(result).toMatchObject({
      complete: true,
      status: "estimated",
      overtime: { totalCents: 0 },
    });
  });

  it("recalculates all components after a historical profile correction", () => {
    const data = input();
    const before = calculateDatedMonthlyRemuneration(data);
    const corrected = { ...history("2026-01-01", "P6"), revision: 2 };
    const after = calculateDatedMonthlyRemuneration({ ...data, history: [corrected] });
    expect(before.base.totalCents).toBe(290718);
    expect(after).toMatchObject({
      base: { totalCents: 301249 },
      timePremiums: { totalCents: 804 },
      overtime: { totalCents: 2403 },
      allowances: { totalCents: 41682 },
    });
    expect(after.positions.every((position) => position.source.profileRevision === 2)).toBe(true);
  });

  it("does not turn missing history or own-pay parameters into a full gross estimate", () => {
    expect(
      calculateDatedMonthlyRemuneration({ ...input(), history: [] }).estimatedGrossCents,
    ).toBeNull();
    const own = {
      ...history(),
      data: {
        version: 1 as const,
        weeklyMinutes: 2310,
        selection: { kind: "own-monthly" as const, monthlyGrossCents: 300000 },
      },
    };
    expect(calculateDatedMonthlyRemuneration({ ...input(), history: [own] })).toMatchObject({
      base: { totalCents: 300000 },
      estimatedGrossCents: null,
      complete: false,
    });
  });

  it("rejects a duplicated service before aggregating or paying it twice", () => {
    const data = input();
    expect(() =>
      calculateDatedMonthlyRemuneration({ ...data, shifts: [...data.shifts, ...data.shifts] }),
    ).toThrow("mehrfach");
  });
});
