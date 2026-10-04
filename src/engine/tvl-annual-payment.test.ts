import { describe, expect, it } from "vitest";
import raw from "../../rules/packages/reviewed/tvl-kr-tdl/2026-04.json";
import type { RuleAnnualPaymentRule, RuleTariffPackage } from "@/rules/contracts.generated";
import { validateRulePackage } from "@/rules/validation";
import { selectAnnualTariff } from "@/rules/tariff-annual-selection";
import { resolver } from "./remuneration-test-fixtures";
import {
  annualBasisMonth,
  confirmAnnualEmployment,
  tariffAnnualFixture,
} from "./tariff-annual-test-fixtures";
import { calculateTariffAnnualClaim } from "./tariff-annual-payment";

// Independent reference bands: TV-L §20(2), KR mapping §43 Nr.9.
const bands = [
  { groups: ["kr5", "kr6"], rate: 8743, expected: 262290 },
  { groups: ["kr7", "kr8"], rate: 8814, expected: 264420 },
  { groups: ["kr9", "kr10", "kr11", "kr12", "kr13", "kr14", "kr15"], rate: 7435, expected: 223050 },
  { groups: ["kr16", "kr17"], rate: 4647, expected: 139410 },
];
function fixture() {
  const pkg = structuredClone(raw) as RuleTariffPackage;
  pkg.rules.selection!.capabilities.annualPayment = "SUPPORTED";
  pkg.rules.annualPaymentRules = bands.map((band, index): RuleAnnualPaymentRule => ({
    id: "tvl-annual-" + index,
    variantId: "SECTION_43",
    regionIds: ["WEST_38_5", "EAST", "EAST_UNIVERSITY_HOSPITAL"],
    payGroups: band.groups as [string, ...string[]],
    firstEntitlementYear: 2026,
    lastEntitlementYear: 2027,
    rateBasisPoints: band.rate,
    referenceMonths: [7, 8, 9],
    lateEntryAfterMonth: 8,
    basisPolicy: "TVL_20",
    eligibilityPolicy: "TVL_DECEMBER_1_OR_LEGACY_ATZ",
    reductionPolicy: "TVL_20",
    earlyExitBasis: "LAST_THREE_MONTHS_TVL",
    payoutMonth: 11,
    sourceIds: ["tdl-tv-l-2026"],
  })) as [RuleAnnualPaymentRule, ...RuleAnnualPaymentRule[]];
  const { claim } = tariffAnnualFixture();
  claim.version = 2;
  claim.selection = {
    packageId: pkg.packageId,
    variant: "SECTION_43",
    region: "WEST_38_5",
    group: "kr9",
    confirmed: true,
  };
  claim.exceptions.tvlLegacyRetirementExit = null;
  return { pkg, claim };
}
describe("TV-L annual payment contract and §20 reference cases", () => {
  it.each(bands.flatMap((b) => b.groups.map((group) => [group, b.expected] as const)))(
    "uses the distinct annual band for %s",
    (group, expected) => {
      const { pkg, claim } = fixture();
      expect(validateRulePackage(pkg)).toMatchObject({ ok: true });
      claim.selection.group = group;
      expect(calculateTariffAnnualClaim(pkg, claim)).toMatchObject({
        status: "estimated",
        amountCents: expected,
        payoutMonth: "2026-11",
        basisCents: 300000,
        basisMethod: "REFERENCE_AVERAGE",
        sourceIds: ["tdl-tv-l-2026"],
        twelfths: { numerator: 12, denominator: 1 },
      });
    },
  );
  it.each(["WEST_38_5", "EAST", "EAST_UNIVERSITY_HOSPITAL"])(
    "uses the same verified rate in %s",
    (region) => {
      const { pkg, claim } = fixture();
      claim.selection.region = region;
      expect(calculateTariffAnnualClaim(pkg, claim).amountCents).toBe(223050);
    },
  );
  it.each([
    ["2026-09-01", "2026-09", 4],
    ["2026-09-15", "2026-10", 4],
    ["2026-11-01", "2026-11", 2],
  ])("uses first full month after late entry %s", (start, month, twelfths) => {
    const { pkg, claim } = fixture();
    confirmAnnualEmployment(claim, String(start), null);
    claim.basis.months = [annualBasisMonth(String(month), 240000)];
    expect(calculateTariffAnnualClaim(pkg, claim)).toMatchObject({
      amountCents: (240000 * 0.7435 * Number(twelfths)) / 12,
      basisMethod: "FIRST_FULL_MONTH",
      basisMonths: [month],
    });
  });
  it("does not apply the late-entry exception on August 31", () => {
    const { pkg, claim } = fixture();
    confirmAnnualEmployment(claim, "2026-08-31", null);
    claim.basis.months = [annualBasisMonth("2026-08", 10000), annualBasisMonth("2026-09", 300000)];
    claim.basis.months[0].paidCalendarDays = 1;
    expect(calculateTariffAnnualClaim(pkg, claim)).toMatchObject({
      basisMethod: "PAID_CALENDAR_DAYS",
      basisCents: 306700,
      amountCents: 95013,
      twelfths: { numerator: 5, denominator: 1 },
    });
  });
  it.each([29, 30])("applies the 30 eligible paid-day boundary (%s)", (days) => {
    const { pkg, claim } = fixture();
    claim.basis.months = [
      annualBasisMonth("2026-07", 150000),
      annualBasisMonth("2026-08", 0),
      annualBasisMonth("2026-09", 0),
    ];
    claim.basis.months[0].paidCalendarDays = days;
    claim.basis.months[1].paidCalendarDays = 0;
    claim.basis.months[2].paidCalendarDays = 0;
    claim.basis.lastFullPayMonth = "2026-06";
    claim.basis.months.push(annualBasisMonth("2026-06", 300000));
    expect(calculateTariffAnnualClaim(pkg, claim)).toMatchObject(
      days === 29
        ? { basisMethod: "LAST_FULL_PAY_MONTH", amountCents: 223050 }
        : { basisMethod: "PAID_CALENDAR_DAYS", amountCents: 114016 },
    );
  });
  it("does not turn unknown early-exit facts into a zero claim, including old personal profiles", () => {
    const { pkg, claim } = fixture();
    confirmAnnualEmployment(claim, "2025-01-01", "2026-06-30");
    expect(calculateTariffAnnualClaim(pkg, claim)).toMatchObject({
      status: "unavailable",
      eligible: null,
      amountCents: null,
      missing: ["exceptions.tvlLegacyRetirementExit"],
    });
    claim.version = 1;
    delete claim.exceptions.tvlLegacyRetirementExit;
    expect(calculateTariffAnnualClaim(pkg, claim).status).toBe("unavailable");
  });
  it("requires the actual TV-L retirement exception, never ordinary BT-K early-exit eligibility", () => {
    const { pkg, claim } = fixture();
    confirmAnnualEmployment(claim, "2025-01-01", "2026-06-30");
    claim.exceptions.tvlLegacyRetirementExit = false;
    expect(calculateTariffAnnualClaim(pkg, claim)).toMatchObject({
      eligible: false,
      amountCents: 0,
    });
    claim.exceptions.tvlLegacyRetirementExit = true;
    claim.basis.months = ["2026-04", "2026-05", "2026-06"].map((m) => annualBasisMonth(m));
    expect(calculateTariffAnnualClaim(pkg, claim)).toMatchObject({
      eligible: true,
      amountCents: 111525,
      basisMonths: ["2026-04", "2026-05", "2026-06"],
      twelfths: { numerator: 6, denominator: 1 },
    });
  });
  it("uses complete preceding months for a mid-month retirement and crosses year boundaries", () => {
    const { pkg, claim } = fixture();
    confirmAnnualEmployment(claim, "2000-01-01", "2026-02-15");
    claim.exceptions.tvlLegacyRetirementExit = true;
    claim.basis.months = ["2025-11", "2025-12", "2026-01"].map((m) => annualBasisMonth(m));
    expect(calculateTariffAnnualClaim(pkg, claim)).toMatchObject({
      amountCents: 37175,
      basisMonths: ["2025-11", "2025-12", "2026-01"],
    });
  });
  it.each(["2026-12-01", "2026-12-02"])("honours the December employment boundary %s", (start) => {
    const { pkg, claim } = fixture();
    confirmAnnualEmployment(claim, start, null);
    claim.basis.months = [annualBasisMonth("2026-12")];
    expect(calculateTariffAnnualClaim(pkg, claim).amountCents).toBe(
      start.endsWith("01") ? 18588 : 0,
    );
  });
  it("preserves sick-pay and military exceptions but requires their confirmations", () => {
    const { pkg, claim } = fixture();
    claim.entitlements[0].reason = "SICK_PAY_SUPPLEMENT";
    claim.entitlements[1].reason = "MILITARY_RETURN";
    expect(calculateTariffAnnualClaim(pkg, claim).missing).toContain("exceptions.militaryReturn");
    claim.exceptions.militaryReturnBeforeDecember1 = true;
    expect(calculateTariffAnnualClaim(pkg, claim).amountCents).toBe(223050);
    claim.exceptions.militaryReturnBeforeDecember1 = false;
    expect(calculateTariffAnnualClaim(pkg, claim).amountCents).toBe(204463);
  });
  it("uses an explicitly confirmed parental part-time basis, without a second part-time reduction", () => {
    const { pkg, claim } = fixture();
    claim.basis.parentalPartTime = true;
    expect(calculateTariffAnnualClaim(pkg, claim).status).toBe("unavailable");
    claim.exceptions.birthYear = 2026;
    claim.basis.adjustedMonthlyCents = 180000;
    expect(calculateTariffAnnualClaim(pkg, claim)).toMatchObject({
      basisMethod: "PARENTAL_ADJUSTMENT",
      amountCents: 133830,
    });
  });
  it("requires confirmed paid days and eligible components", () => {
    const { pkg, claim } = fixture();
    claim.basis.months[0].paidCalendarDays = null;
    expect(calculateTariffAnnualClaim(pkg, claim).missing).toContain(
      "basis.2026-07.paidCalendarDays",
    );
    claim.basis.months[0].componentsConfirmed = false;
    expect(calculateTariffAnnualClaim(pkg, claim).amountCents).toBeNull();
  });
  it("uses the supplied catalog rate rather than a hidden TVöD or TV-L constant", () => {
    const { pkg, claim } = fixture();
    pkg.rules.annualPaymentRules![2].rateBasisPoints = 7000;
    expect(calculateTariffAnnualClaim(pkg, claim).amountCents).toBe(210000);
  });
  it.each(["months", "cutoff", "payout", "policy", "exit", "source", "coverage", "capability"])(
    "rejects invalid TV-L annual %s",
    (kind) => {
      const { pkg } = fixture();
      const r = pkg.rules.annualPaymentRules![0];
      if (kind === "months") r.referenceMonths = [8, 9, 10];
      if (kind === "cutoff") r.lateEntryAfterMonth = 9;
      if (kind === "payout") r.payoutMonth = 12;
      if (kind === "policy") r.basisPolicy = "TVOED_VKA_20";
      if (kind === "exit") r.eligibilityPolicy = "BT_K_EARLY_EXIT";
      if (kind === "source") r.sourceIds = ["unknown"];
      if (kind === "coverage") r.payGroups = ["kr5"];
      if (kind === "capability") pkg.rules.selection!.capabilities.annualPayment = "UNSUPPORTED";
      expect(validateRulePackage(pkg).ok).toBe(false);
    },
  );
  it("accepts old contract-12 packages without annual support, never estimates from absent rules", () => {
    const { pkg, claim } = fixture();
    delete pkg.rules.annualPaymentRules;
    pkg.rules.selection!.capabilities.annualPayment = "UNSUPPORTED";
    expect(validateRulePackage(pkg).ok).toBe(true);
    expect(calculateTariffAnnualClaim(pkg, claim).status).toBe("unavailable");
    expect(selectAnnualTariff(claim, resolver([pkg]))).toMatchObject({
      ok: false,
      code: "ANNUAL_RULE_MISSING",
    });
  });
  it("selects TV-L through the same resolver and rejects conflicting annual versions", () => {
    const { pkg, claim } = fixture();
    expect(selectAnnualTariff(claim, resolver([pkg]))).toMatchObject({ ok: true });
    const next = structuredClone(pkg);
    next.versionId += "-next";
    next.rules.annualPaymentRules![2].rateBasisPoints = 7000;
    expect(selectAnnualTariff(claim, resolver([pkg, next]))).toMatchObject({
      ok: false,
      code: "ANNUAL_RULE_AMBIGUOUS",
    });
  });
});
