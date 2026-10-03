import { describe, expect, it } from "vitest";
import { calculateTariffAnnualClaim as calculate } from "./tariff-annual-payment";
import {
  annualBasisMonth,
  confirmAnnualEmployment,
  tariffAnnualFixture,
} from "./tariff-annual-test-fixtures";

describe("tariff annual payment claim calculation", () => {
  it.each([
    ["BT_B", "2026-11-30", false],
    ["BT_B", "2026-12-01", true],
    ["BT_K", "2026-11-30", true],
  ] as const)("keeps the December boundary explicit for %s ending %s", (variant, end, eligible) => {
    const { pkg, claim } = tariffAnnualFixture();
    claim.selection.variant = variant;
    confirmAnnualEmployment(claim, "2026-01-01", end);
    claim.basis.months.push(annualBasisMonth("2026-11"));
    expect(calculate(pkg, claim)).toMatchObject({ eligible, payoutMonth: "2026-11" });
  });
  it("does not infer an annual claim for employment beginning after December 1", () => {
    const { pkg, claim } = tariffAnnualFixture();
    confirmAnnualEmployment(claim, "2026-12-02", null);
    expect(calculate(pkg, claim)).toMatchObject({ eligible: false, amountCents: 0 });
  });
  it("does not mistake unknown parental protection for a reduction", () => {
    const { pkg, claim } = tariffAnnualFixture();
    claim.entitlements[0].reason = "PARENTAL_BIRTH_YEAR";
    expect(calculate(pkg, claim)).toMatchObject({ status: "unavailable", amountCents: null });
    claim.exceptions.birthYear = 2025;
    claim.exceptions.payBeforeParentalLeave = true;
    expect(calculate(pkg, claim).amountCents).toBe(247_500);
  });
  it("checks partial-month paid days against the confirmed employment period", () => {
    const { pkg, claim } = tariffAnnualFixture();
    confirmAnnualEmployment(claim, "2026-07-15", null);
    expect(calculate(pkg, claim).missing).toContain("basis.2026-07.paidDaysConflict");
    claim.basis.months[0].paidCalendarDays = 17;
    claim.basis.months[0].baseCents = 170_000;
    // 7700 EUR / 78 days x 30.67 x 90% x 6/12 -> 1362.46 EUR.
    expect(calculate(pkg, claim)).toMatchObject({
      amountCents: 136_246,
      basisMethod: "PAID_CALENDAR_DAYS",
    });
  });
  it("rejects contradictory pay claims outside the employment period", () => {
    const { pkg, claim } = tariffAnnualFixture();
    confirmAnnualEmployment(claim, "2026-01-01", "2026-08-31");
    claim.entitlements[11].reason = "PAY";
    expect(calculate(pkg, claim).missing).toContain("entitlements.12.periodConflict");
  });
  it("uses integer arithmetic at the supported monetary boundary", () => {
    const { pkg, claim } = tariffAnnualFixture();
    claim.basis.months.forEach((row) => {
      row.baseCents = 1_000_000_000;
      row.fixedCents = 1_000_000_000;
      row.variableCents = 1_000_000_000;
      row.scheduledOvertimeCents = 1_000_000_000;
    });
    expect(calculate(pkg, claim).amountCents).toBe(3_600_000_000);
  });
  it("can establish a fully reduced claim without manufacturing a pay basis", () => {
    const { pkg, claim } = tariffAnnualFixture();
    claim.entitlements.forEach((row) => {
      row.reason = "NONE";
    });
    claim.basis.months = [];
    expect(calculate(pkg, claim)).toMatchObject({
      eligible: true,
      amountCents: 0,
      status: "estimated",
      basisCents: null,
    });
  });
  it.each([
    ["p5", 270_000],
    ["p6", 270_000],
    ["p8", 270_000],
    ["p9", 255_000],
    ["p16", 255_000],
  ] as const)("calculates %s from the declared rate and confirmed personal pay", (group, cents) => {
    const { pkg, claim } = tariffAnnualFixture();
    claim.selection.group = group;
    expect(calculate(pkg, claim)).toMatchObject({
      status: "estimated",
      amountCents: cents,
      eligible: true,
      basisCents: 300_000,
      basisMethod: "REFERENCE_AVERAGE",
      twelfths: { numerator: 12, denominator: 1 },
      missing: [],
    });
  });
  it.each(["BT_K", "BT_B"])(
    "supports both declared regions for %s without a second part-time factor",
    (variant) => {
      const { pkg, claim } = tariffAnnualFixture();
      claim.selection.variant = variant;
      claim.selection.region = "KAV_BW";
      claim.basis.months.forEach((row) => {
        row.baseCents = 150_000;
      });
      expect(calculate(pkg, claim).amountCents).toBe(135_000);
    },
  );
  it("includes only the separately confirmed eligible components", () => {
    const { pkg, claim } = tariffAnnualFixture();
    claim.basis.months.forEach((row) => {
      row.fixedCents = 10_000;
      row.variableCents = 5_000;
      row.scheduledOvertimeCents = 1_000;
    });
    expect(calculate(pkg, claim).amountCents).toBe(284_400); // 3160 EUR x 90%.
  });
  it("uses August–October for training and does not reuse employee groups", () => {
    const { pkg, claim } = tariffAnnualFixture(true);
    claim.basis.months.push(annualBasisMonth("2026-07", 999_999));
    expect(calculate(pkg, claim)).toMatchObject({
      amountCents: 135_000,
      basisMonths: ["2026-08", "2026-09", "2026-10"],
    });
    claim.selection.group = "p5";
    expect(calculate(pkg, claim)).toMatchObject({ status: "unavailable", amountCents: null });
  });
  it("uses the first full employment month after a late entry", () => {
    const { pkg, claim } = tariffAnnualFixture();
    confirmAnnualEmployment(claim, "2026-10-15", null);
    claim.basis.months = [annualBasisMonth("2026-11", 320_000)];
    expect(calculate(pkg, claim)).toMatchObject({
      amountCents: 72_000,
      basisMethod: "FIRST_FULL_MONTH",
      basisMonths: ["2026-11"],
    });
  });
  it("handles training entry after October separately", () => {
    const { pkg, claim } = tariffAnnualFixture(true);
    confirmAnnualEmployment(claim, "2026-11-15", null);
    claim.basis.months = [annualBasisMonth("2026-12", 160_000)];
    expect(calculate(pkg, claim)).toMatchObject({ amountCents: 24_000, basisMonths: ["2026-12"] });
  });
  it.each([
    ["2026-08-15", "2026-07"],
    ["2026-08-31", "2026-08"],
  ] as const)("uses only base and fixed allowance for hospital exit %s", (end, month) => {
    const { pkg, claim } = tariffAnnualFixture();
    confirmAnnualEmployment(claim, "2026-01-01", end);
    claim.basis.months = [
      {
        ...annualBasisMonth(month),
        fixedCents: 10_000,
        variableCents: 99_000,
        scheduledOvertimeCents: 55_000,
      },
    ];
    expect(calculate(pkg, claim)).toMatchObject({
      amountCents: 186_000,
      basisMethod: "BT_K_LAST_MONTH",
      basisMonths: [month],
    });
  });
  it("does not import the hospital early-exit exception into BT-B", () => {
    const { pkg, claim } = tariffAnnualFixture();
    claim.selection.variant = "BT_B";
    confirmAnnualEmployment(claim, "2026-01-01", "2026-08-31");
    expect(calculate(pkg, claim)).toMatchObject({ eligible: false, amountCents: 0, missing: [] });
  });
  it("needs a full employment month instead of inventing one for a short hospital contract", () => {
    const { pkg, claim } = tariffAnnualFixture();
    confirmAnnualEmployment(claim, "2026-08-05", "2026-08-15");
    expect(calculate(pkg, claim)).toMatchObject({
      status: "unavailable",
      amountCents: null,
      missing: ["basis.fullEmploymentMonth"],
    });
  });
  it("requires every direct-takeover condition and an explicit allocation/basis", () => {
    const { pkg, claim } = tariffAnnualFixture(true);
    confirmAnnualEmployment(claim, "2026-01-01", "2026-06-30");
    expect(calculate(pkg, claim).missing).toContain("employment.takeover");
    claim.employment.takeover = { immediate: true, sameEmployer: true, employedDecember1: true };
    expect(calculate(pkg, claim).missing).toContain("allocation");
    claim.allocation = { required: true, twelfthsNumerator: 6, twelfthsDenominator: 1 };
    expect(calculate(pkg, claim).missing).toContain("basis.takeoverMonthlyCents");
    claim.basis.takeoverMonthlyCents = 160_000;
    expect(calculate(pkg, claim)).toMatchObject({
      amountCents: 72_000,
      basisMethod: "TAKEOVER_CONFIRMED",
    });
    claim.employment.takeover.sameEmployer = false;
    expect(calculate(pkg, claim)).toMatchObject({ eligible: false, amountCents: 0 });
  });
  it("preserves exact confirmed fractional twelfths and rejects excess allocation", () => {
    const { pkg, claim } = tariffAnnualFixture(true);
    confirmAnnualEmployment(claim, "2026-01-01", "2026-06-15");
    claim.employment.takeover = { immediate: true, sameEmployer: true, employedDecember1: true };
    claim.allocation = { required: true, twelfthsNumerator: 11, twelfthsDenominator: 2 };
    claim.basis.takeoverMonthlyCents = 160_000;
    expect(calculate(pkg, claim).amountCents).toBe(66_000);
    claim.allocation.twelfthsNumerator = 13;
    expect(calculate(pkg, claim).missing).toContain("allocation.exceedsEntitlement");
  });
  it("normalizes a partial TVöD reference period by paid calendar days exactly once", () => {
    const { pkg, claim } = tariffAnnualFixture();
    claim.basis.months = [
      { ...annualBasisMonth("2026-07", 100_000), paidCalendarDays: 10 },
      annualBasisMonth("2026-08", 310_000),
      annualBasisMonth("2026-09", 300_000),
    ];
    // 7100 EUR / 71 days x 30.67 x 90% = 2760.30 EUR.
    expect(calculate(pkg, claim)).toMatchObject({
      amountCents: 276_030,
      basisMethod: "PAID_CALENDAR_DAYS",
    });
  });
  it("does not silently apply the TVöD day-normalization formula to TVAöD", () => {
    const { pkg, claim } = tariffAnnualFixture(true);
    claim.basis.months[0].baseCents = 50_000;
    claim.basis.months[0].paidCalendarDays = 10;
    expect(calculate(pkg, claim).amountCents).toBe(105_000); // (500 + 1500 + 1500) / 3 x 90%.
  });
  it("requires the confirmed last full pay month below 30 paid reference days", () => {
    const { pkg, claim } = tariffAnnualFixture();
    claim.basis.months.forEach((row) => {
      row.baseCents = 0;
      row.paidCalendarDays = 0;
    });
    expect(calculate(pkg, claim).missing).toContain("basis.lastFullPayMonth");
    claim.basis.lastFullPayMonth = "2026-06";
    claim.basis.months.push(annualBasisMonth("2026-06", 310_000));
    expect(calculate(pkg, claim)).toMatchObject({
      amountCents: 279_000,
      basisMethod: "LAST_FULL_PAY_MONTH",
    });
    claim.basis.months.at(-1)!.paidCalendarDays = 29;
    expect(calculate(pkg, claim).amountCents).toBeNull();
  });
  it("requires parental adjustment confirmation without repeating part-time reduction", () => {
    const { pkg, claim } = tariffAnnualFixture();
    claim.basis.parentalPartTime = true;
    claim.exceptions.birthYear = 2026;
    claim.exceptions.payBeforeParentalLeave = true;
    expect(calculate(pkg, claim).missing).toContain("basis.adjustedMonthlyCents");
    claim.basis.adjustedMonthlyCents = 300_000;
    claim.basis.months.forEach((row) => {
      row.baseCents = 150_000;
    });
    expect(calculate(pkg, claim)).toMatchObject({
      amountCents: 270_000,
      basisMethod: "PARENTAL_ADJUSTMENT",
    });
  });
  it.each(["MATERNITY", "SICK_PAY_SUPPLEMENT", "PARENTAL_BIRTH_YEAR", "MILITARY_RETURN"] as const)(
    "keeps protected employee months for %s only with applicable confirmations",
    (reason) => {
      const { pkg, claim } = tariffAnnualFixture();
      claim.entitlements[0].reason = reason;
      claim.exceptions = {
        birthYear: 2026,
        payBeforeParentalLeave: true,
        militaryReturnBeforeDecember1: true,
      };
      expect(calculate(pkg, claim).amountCents).toBe(270_000);
      claim.entitlements[0].reason = "NONE";
      expect(calculate(pkg, claim).amountCents).toBe(247_500);
    },
  );
  it("does not transfer employee-only exceptions to training", () => {
    const { pkg, claim } = tariffAnnualFixture(true);
    claim.entitlements[0].reason = "SICK_PAY_SUPPLEMENT";
    expect(calculate(pkg, claim).missing).toContain("entitlements.1.unsupportedException");
  });
  it("does not round the average before calculating the annual amount", () => {
    const { pkg, claim } = tariffAnnualFixture();
    claim.basis.months.forEach((row, i) => {
      row.baseCents = i === 0 ? 1 : 2;
    });
    // 5 cents / 3 x .9 = 1.5 cents -> 2 cents, regardless of the displayed basis.
    expect(calculate(pkg, claim).amountCents).toBe(2);
    pkg.rules.annualPaymentRules!.forEach((rule) => {
      rule.rateBasisPoints = 5000;
    });
    expect(calculate(pkg, claim).amountCents).toBe(1);
  });
  it("handles known zero separately from incomplete pay amounts", () => {
    const { pkg, claim } = tariffAnnualFixture();
    claim.basis.months.forEach((row) => {
      row.baseCents = 0;
    });
    expect(calculate(pkg, claim)).toMatchObject({ status: "estimated", amountCents: 0 });
    claim.basis.months[0].baseCents = null;
    expect(calculate(pkg, claim)).toMatchObject({ status: "unavailable", amountCents: null });
  });
  it.each(["selection", "period", "month", "confirmation", "parental", "allocation"] as const)(
    "does not invent missing %s",
    (field) => {
      const { pkg, claim } = tariffAnnualFixture();
      if (field === "selection") claim.selection.confirmed = false;
      if (field === "period") claim.employment.confirmed = false;
      if (field === "month") claim.entitlements[0].reason = "UNKNOWN";
      if (field === "confirmation") claim.basis.months[0].componentsConfirmed = false;
      if (field === "parental") claim.basis.parentalPartTime = null;
      if (field === "allocation") claim.allocation.required = null;
      expect(calculate(pkg, claim)).toMatchObject({ status: "unavailable", amountCents: null });
    },
  );
  it("rejects unknown rule years/regions and invalid packages without fallback", () => {
    const { pkg, claim } = tariffAnnualFixture();
    claim.year = 2027;
    expect(calculate(pkg, claim).missing).toEqual(["ruleSelection"]);
    claim.year = 2026;
    claim.selection.region = "UNKNOWN";
    expect(calculate(pkg, claim).missing).toEqual(["ruleSelection"]);
    claim.selection.region = "OTHER";
    pkg.engineContractVersion = 8;
    expect(calculate(pkg, claim).missing).toEqual(["rulePackage"]);
  });
  it("does not mutate supplied data and contains no input in validation failures", () => {
    const { pkg, claim } = tariffAnnualFixture();
    const before = JSON.stringify({ pkg, claim });
    calculate(pkg, claim);
    expect(JSON.stringify({ pkg, claim })).toBe(before);
    expect(calculate(pkg, { ...claim, privateData: "not-for-errors" })).toMatchObject({
      missing: ["claim.invalid"],
      amountCents: null,
    });
  });
});
