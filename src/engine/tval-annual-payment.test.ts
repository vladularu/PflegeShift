import { describe, expect, it } from "vitest";
import value from "../../rules/packages/reviewed/tval-pflege-tdl/2026-04.json";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { validateRulePackage } from "@/rules/validation";
import { selectAnnualTariff } from "@/rules/tariff-annual-selection";
import {
  annualBasisMonth,
  confirmAnnualEmployment,
  tariffAnnualFixture,
} from "./tariff-annual-test-fixtures";
import { calculateTariffAnnualClaim } from "./tariff-annual-payment";
import { resolver } from "./remuneration-test-fixtures";

function fixture() {
  const pkg = structuredClone(value) as RuleTariffPackage;
  pkg.rules.selection!.capabilities.annualPayment = "SUPPORTED";
  pkg.rules.annualPaymentRules = [
    {
      id: "tval-pflege-annual",
      variantId: "CARE",
      regionIds: ["WEST_38_5", "EAST", "EAST_UNIVERSITY_HOSPITAL"],
      payGroups: ["regular"],
      firstEntitlementYear: 2026,
      lastEntitlementYear: 2026,
      rateBasisPoints: 9500,
      referenceMonths: [11],
      lateEntryAfterMonth: 11,
      basisPolicy: "TVAL_PFLEGE_16",
      reductionPolicy: "TVAL_PFLEGE_16",
      eligibilityPolicy: "TVAL_TRAINING_OR_DIRECT_TAKEOVER_DECEMBER_1",
      earlyExitBasis: "NONE",
      payoutMonth: 11,
      sourceIds: ["tdl-tval-pflege-2026"],
    },
  ];
  const { claim } = tariffAnnualFixture(true);
  claim.selection = {
    packageId: pkg.packageId,
    variant: "CARE",
    region: "WEST_38_5",
    group: "regular",
    confirmed: true,
  };
  claim.basis.months = [annualBasisMonth("2026-11", 144070)];
  return { pkg, claim };
}

describe("TVA-L Pflege §16 annual payment", () => {
  it("uses 95% of November training pay, not a VKA reference average", () => {
    const { pkg, claim } = fixture();
    expect(validateRulePackage(pkg)).toEqual({ ok: true, value: pkg });
    expect(selectAnnualTariff(claim, resolver([pkg])).ok).toBe(true);
    claim.basis.months.push(annualBasisMonth("2026-08", 900000));
    expect(calculateTariffAnnualClaim(pkg, claim)).toMatchObject({
      status: "estimated",
      amountCents: 136867,
      basisCents: 144070,
      basisMethod: "NOVEMBER_TRAINING_PAY",
      basisMonths: ["2026-11"],
      payoutMonth: "2026-11",
      twelfths: { numerator: 12, denominator: 1 },
    });
  });
  it.each(["fixedCents", "variableCents", "scheduledOvertimeCents"] as const)(
    "does not include %s in the §8(1) base",
    (key) => {
      const { pkg, claim } = fixture();
      claim.basis.months[0]![key] = 1000;
      expect(calculateTariffAnnualClaim(pkg, claim)).toMatchObject({
        amountCents: null,
        missing: ["basis.novemberTrainingPay.excludedComponents"],
      });
    },
  );
  it.each(["amount", "confirmation", "month"])("leaves a missing %s unavailable", (key) => {
    const { pkg, claim } = fixture();
    if (key === "amount") claim.basis.months[0]!.baseCents = null;
    if (key === "confirmation") claim.basis.months[0]!.componentsConfirmed = false;
    if (key === "month") claim.basis.months = [];
    expect(calculateTariffAnnualClaim(pkg, claim).amountCents).toBeNull();
  });
  it("uses explicitly confirmed entitled November pay even for a partial start month", () => {
    const { pkg, claim } = fixture();
    confirmAnnualEmployment(claim, "2026-11-16", null);
    claim.basis.months[0]!.baseCents = 72035;
    claim.basis.months[0]!.paidCalendarDays = 15;
    expect(calculateTariffAnnualClaim(pkg, claim)).toMatchObject({
      amountCents: 11406,
      twelfths: { numerator: 2, denominator: 1 },
    });
  });
  it("requires December eligibility or an explicitly confirmed direct takeover", () => {
    const { pkg, claim } = fixture();
    confirmAnnualEmployment(claim, "2025-01-01", "2026-11-30");
    expect(calculateTariffAnnualClaim(pkg, claim)).toMatchObject({
      amountCents: null,
      missing: ["employment.takeover"],
    });
    claim.employment.takeover.immediate = false;
    expect(calculateTariffAnnualClaim(pkg, claim)).toMatchObject({
      amountCents: 0,
      eligible: false,
    });
  });
  it.each([
    ["2026-05-31", 5, 59375],
    ["2026-06-15", 5, 59375],
    ["2026-06-30", 6, 71250],
  ])(
    "assigns takeover after %s without counting the employment transition month twice",
    (end, months, cents) => {
      const { pkg, claim } = fixture();
      confirmAnnualEmployment(claim, "2025-01-01", String(end));
      claim.employment.takeover = { immediate: true, sameEmployer: true, employedDecember1: true };
      claim.allocation = {
        required: true,
        twelfthsNumerator: Number(months),
        twelfthsDenominator: 1,
      };
      claim.basis.takeoverMonthlyCents = 150000;
      expect(calculateTariffAnnualClaim(pkg, claim)).toMatchObject({
        amountCents: cents,
        basisMethod: "TAKEOVER_CONFIRMED",
        twelfths: { numerator: months, denominator: 1 },
      });
      if (end === "2026-06-15") {
        claim.allocation.twelfthsNumerator = 6;
        expect(calculateTariffAnnualClaim(pkg, claim).missing).toContain(
          "allocation.exceedsEntitlement",
        );
      }
    },
  );
  it("requires a confirmed takeover basis instead of inventing a November trainee month", () => {
    const { pkg, claim } = fixture();
    confirmAnnualEmployment(claim, "2025-01-01", "2026-06-30");
    claim.employment.takeover = { immediate: true, sameEmployer: true, employedDecember1: true };
    claim.allocation = { required: true, twelfthsNumerator: 6, twelfthsDenominator: 1 };
    expect(calculateTariffAnnualClaim(pkg, claim).missing).toContain("basis.takeoverMonthlyCents");
  });
  it("counts confirmed §13 sick-pay subsidy but not a foreign military exception", () => {
    const { pkg, claim } = fixture();
    claim.entitlements[2]!.reason = "SICK_PAY_SUPPLEMENT";
    expect(calculateTariffAnnualClaim(pkg, claim).amountCents).toBe(136867);
    claim.entitlements[2]!.reason = "MILITARY_RETURN";
    expect(calculateTariffAnnualClaim(pkg, claim).amountCents).toBeNull();
  });
  it("checks parental exceptions and reduces unpaid months", () => {
    const { pkg, claim } = fixture();
    claim.entitlements[0]!.reason = "NONE";
    claim.entitlements[1]!.reason = "PARENTAL_BIRTH_YEAR";
    expect(calculateTariffAnnualClaim(pkg, claim).amountCents).toBeNull();
    claim.exceptions.birthYear = 2026;
    claim.exceptions.payBeforeParentalLeave = true;
    expect(calculateTariffAnnualClaim(pkg, claim).twelfths).toEqual({
      numerator: 11,
      denominator: 1,
    });
  });
  it("rejects VKA month policy, wrong percentage and unimplemented eligibility policy", () => {
    for (const change of [
      { referenceMonths: [8, 9, 10] },
      { rateBasisPoints: 9000 },
      { basisPolicy: "TVAOED_PFLEGE_14" },
      { eligibilityPolicy: "TRAINING_OR_DIRECT_TAKEOVER_DECEMBER_1" },
    ]) {
      const { pkg } = fixture();
      Object.assign(pkg.rules.annualPaymentRules![0]!, change);
      expect(validateRulePackage(pkg).ok).toBe(false);
    }
  });
  it("still rejects a single reference month for old VKA contracts", () => {
    const { pkg } = tariffAnnualFixture(true);
    pkg.rules.annualPaymentRules![0]!.referenceMonths = [11];
    expect(validateRulePackage(pkg).ok).toBe(false);
  });
});
