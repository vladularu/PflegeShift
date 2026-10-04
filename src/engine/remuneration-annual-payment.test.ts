import { describe, expect, it } from "vitest";
import {
  validateActualOwnAnnualPayments,
  type ActualOwnAnnualPayment,
} from "@/domain/annual-payment";
import type { OwnSpecialPayment } from "@/domain/own-remuneration";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import { ownRemunerationFixture } from "@/domain/own-remuneration-test-fixtures";
import { remunerationBasis } from "@/features/salary/remuneration-presentation";
import {
  buildAnnualAvailableReportSteps,
  createAnnualAvailableReportCache,
} from "@/features/analysis/annual-core-report";
import { calculateOwnAnnualPayments } from "./remuneration-annual-payment";
import { calculateAssessedMonthlyRemuneration } from "./remuneration-month";
import { history, resolver, work } from "./remuneration-test-fixtures";

const payment: OwnSpecialPayment = {
  id: "annual",
  title: "Weihnachtsgeld",
  payoutMonth: 11,
  entitlementMonths: 6,
  amount: { kind: "percent", basisPoints: 7500, confirmedBasisCents: 200000 },
  validFrom: "2026-01-01",
  validTo: null,
};
function profile(
  payments: readonly OwnSpecialPayment[] = [payment],
  date = "2026-01-01",
): DatedRemunerationProfile {
  return {
    ...history(date),
    data: {
      version: 2,
      weeklyMinutes: 1155,
      selection: {
        kind: "own-configured",
        configuration: {
          ...ownRemunerationFixture(),
          base: { kind: "monthly", personalCents: 200000, partialMonth: "calendar-days" },
          timePremiums: null,
          overtime: null,
          fixedAllowances: [],
          specialPayments: payments,
        },
      },
    },
  };
}
const actual: ActualOwnAnnualPayment = {
  version: 1,
  paymentId: "annual",
  entitlementYear: 2026,
  payoutMonth: "2026-12",
  title: "Weihnachtsgeld tatsächlich",
  grossCents: 87654,
  revision: 1,
};
const rules = resolver([]);
const run = (
  month = "2026-11",
  profiles = [profile()],
  actuals: readonly ActualOwnAnnualPayment[] = [],
) => calculateOwnAnnualPayments(month, profiles, actuals, rules);

describe("own annual payment contract and calculation", () => {
  it("calculates 2000 EUR × 75% × 6/12 without a second part-time factor", () => {
    const result = run();
    expect(result).toMatchObject({ complete: true, status: "estimated", totalCents: 75000 });
    expect(result.positions).toHaveLength(1);
    expect(remunerationBasis(result.positions[0])).toEqual(
      expect.arrayContaining([
        "Anspruch: 6 von 12 Monaten",
        "Anteil: 75 %",
        "Bestätigte Grundlage: 2.000,00 €",
      ]),
    );
    expect(run("2026-10").positions).toEqual([]);
  });
  it.each([0, 1, 6, 12])(
    "prorates a personal fixed annual amount for %i confirmed months",
    (months) => {
      expect(
        run("2026-11", [
          profile([
            { ...payment, amount: { kind: "fixed", cents: 120001 }, entitlementMonths: months },
          ]),
        ]).totalCents,
      ).toBe(Math.round((120001 * months) / 12));
    },
  );
  it("rounds once after percentage and entitlement instead of twice", () => {
    const p: OwnSpecialPayment = {
      ...payment,
      entitlementMonths: 6,
      amount: { kind: "percent", basisPoints: 5000, confirmedBasisCents: 1 },
    };
    expect(run("2026-11", [profile([p])]).totalCents).toBe(0);
  });
  it.each([
    { ...payment, entitlementMonths: null },
    {
      ...payment,
      amount: { kind: "percent" as const, basisPoints: 7500, confirmedBasisCents: null },
    },
  ])("keeps missing confirmation unavailable", (p) => {
    expect(run("2026-11", [profile([p])])).toMatchObject({
      complete: false,
      totalCents: null,
      positions: [{ amountCents: null, issue: { code: "ANNUAL_INPUT_MISSING" } }],
    });
  });
  it("respects validity, future start and unknown historical effective dates", () => {
    expect(run("2026-11", [profile([{ ...payment, validTo: "2026-10-31" }])]).positions).toEqual(
      [],
    );
    expect(run("2026-11", [profile([{ ...payment, validFrom: "2026-12-01" }])]).positions).toEqual(
      [],
    );
    expect(run("2026-11", [{ ...profile(), effectiveFrom: null }]).positions).toEqual([]);
  });
  it("does not duplicate a payment across an unrelated mid-month profile change", () => {
    const changed = profile([payment], "2026-11-16");
    const result = run("2026-11", [
      profile(),
      { ...changed, data: { ...changed.data, weeklyMinutes: 2310 } },
    ]);
    expect(result.totalCents).toBe(75000);
    expect(result.positions).toHaveLength(1);
  });
  it("does not select or prorate conflicting payment terms silently", () => {
    const result = run("2026-11", [
      profile(),
      profile([{ ...payment, entitlementMonths: 12 }], "2026-11-16"),
    ]);
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0]).toMatchObject({
      amountCents: null,
      issue: { code: "ANNUAL_TERMS_AMBIGUOUS" },
    });
  });
  it("does not pay the same annual ID twice after a payout-month change", () => {
    const profiles = [profile(), profile([{ ...payment, payoutMonth: 12 }], "2026-12-01")];
    expect(run("2026-11", profiles).totalCents).toBeNull();
    expect(run("2026-12", profiles).positions).toEqual([]);
  });
  it("replaces an estimate with a confirmed actual amount in another month", () => {
    expect(run("2026-11", [profile()], [actual]).positions).toEqual([]);
    const result = run("2026-12", [profile()], [actual]);
    expect(result).toMatchObject({ status: "calculated", totalCents: 87654 });
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0].basis).toMatchObject({ method: "actual", actualRevision: 1 });
    expect(remunerationBasis(result.positions[0]).join(" ")).toContain("ersetzt die Schätzung");
  });
  it("lets an explicit zero replace an unknown estimate", () => {
    const profiles = [profile([{ ...payment, entitlementMonths: null }])];
    expect(
      run("2026-11", profiles, [{ ...actual, grossCents: 0, payoutMonth: "2026-11" }]),
    ).toMatchObject({
      complete: true,
      totalCents: 0,
      positions: [{ status: "calculated", amountCents: 0 }],
    });
  });
  it("counts late actual payment in the payout year, not twice in the entitlement year", () => {
    const delayed = { ...actual, payoutMonth: "2027-01" };
    expect(run("2026-11", [profile()], [delayed]).totalCents).toBe(0);
    expect(run("2027-01", [profile()], [delayed]).totalCents).toBe(87654);
    expect(run("2027-11", [profile()], [delayed]).totalCents).toBe(75000);
  });
  it("preserves actual payments even when the current profile no longer contains the payment", () => {
    expect(run("2026-12", [profile([])], [actual]).totalCents).toBe(87654);
  });
  it("combines independent configured payments without mixing them into allowances", () => {
    const result = calculateAssessedMonthlyRemuneration({
      month: "2026-11",
      shifts: [],
      workProfile: work,
      history: [
        profile([
          payment,
          {
            ...payment,
            id: "bonus",
            amount: { kind: "fixed", cents: 12000 },
            entitlementMonths: 12,
          },
        ]),
      ],
      resolver: rules,
      settings: { workplaceCoverage: "UNKNOWN", assignment: "UNKNOWN", updatedAt: null },
    });
    expect(result.annualPayments.totalCents).toBe(87000);
    expect(result.allowances.totalCents).toBe(0);
    expect(result.estimatedGrossCents).toBe(287000);
  });
  it.each([
    { ...actual, version: 2 },
    { ...actual, grossCents: -1 },
    { ...actual, grossCents: 1.5 },
    { ...actual, grossCents: NaN },
    { ...actual, grossCents: 1_000_000_001 },
    { ...actual, payoutMonth: "2026-13" },
    { ...actual, payoutMonth: "2026-1" },
    { ...actual, entitlementYear: 1899 },
    { ...actual, entitlementYear: 4100 },
    { ...actual, revision: 0 },
    { ...actual, title: " " },
    { ...actual, title: "bad\ntext" },
    { ...actual, paymentId: "../bad" },
    { ...actual, netCents: 9000 },
  ])("rejects malformed actual-payment input", (bad) => {
    expect(() => validateActualOwnAnnualPayments([bad])).toThrow();
  });
  it("rejects duplicate IDs for the same year even with different months/revisions", () => {
    expect(() =>
      run("2026-12", [profile()], [actual, { ...actual, payoutMonth: "2026-11", revision: 2 }]),
    ).toThrow();
    expect(
      validateActualOwnAnnualPayments([actual, { ...actual, entitlementYear: 2025 }]),
    ).toHaveLength(2);
    expect(Object.isFrozen(validateActualOwnAnnualPayments([actual])[0])).toBe(true);
  });
  it("feeds the real annual report and invalidates cached amounts even at the same revision", () => {
    const cache = createAnnualAvailableReportCache();
    const annual = (actualAnnualPayments: readonly ActualOwnAnnualPayment[]) => {
      const steps = buildAnnualAvailableReportSteps(
        2026,
        [],
        work,
        [],
        { workplaceCoverage: "UNKNOWN", assignment: "UNKNOWN", updatedAt: null },
        "2026-12-31",
        rules,
        {
          cache,
          remuneration: {
            status: "ready",
            profiles: [profile()],
            shifts: [],
            allowanceDecisions: [],
            overtimeAllocations: [],
            paidAbsences: [],
            actualAnnualPayments,
          },
        },
      );
      for (;;) {
        const next = steps.next();
        if (next.done) return next.value.remuneration!;
      }
    };
    expect(annual([]).estimatedGrossCents).toBe(2475000);
    const paid = annual([actual]);
    expect(paid.annualPayments.totalCents).toBe(87654);
    expect(paid.estimatedGrossCents).toBe(2487654);
    expect(paid.months[10].result!.annualPayments.positions).toEqual([]);
    expect(paid.months[11].result!.annualPayments.positions).toHaveLength(1);
    expect(annual([{ ...actual, grossCents: 90000 }]).estimatedGrossCents).toBe(2490000);
    expect(annual([]).estimatedGrossCents).toBe(2475000);
  });
});
