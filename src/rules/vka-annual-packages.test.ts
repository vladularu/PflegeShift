import { describe, expect, it } from "vitest";
import employeeOriginal from "../testing/fixtures/tvoed-vka-bt-k-2026-05-before-annual.json";
import employeeValue from "../testing/fixtures/tvoed-vka-bt-k-2026-05-original-annual-draft.json";
import trainingOldOriginal from "../../rules/packages/reviewed/tvaoed-pflege-vka/2025-04.json";
import trainingOldValue from "../../rules/packages/reviewed/tvaoed-pflege-vka/2025-04-r1.json";
import trainingOriginal from "../../rules/packages/reviewed/tvaoed-pflege-vka/2026-05.json";
import trainingValue from "../../rules/packages/reviewed/tvaoed-pflege-vka/2026-05-r1.json";
import type { RuleTariffPackage } from "./contracts.generated";
import type { SavedTariffAnnualClaim } from "@/domain/saved-tariff-annual-claim";
import { validateRulePackage } from "./validation";
import { selectAnnualTariff } from "./tariff-annual-selection";
import { calculateTariffAnnualClaim } from "@/engine/tariff-annual-payment";
import { calculateTariffAnnualPayments } from "@/engine/remuneration-tariff-annual";
import {
  annualBasisMonth,
  confirmAnnualEmployment,
  tariffAnnualFixture,
} from "@/engine/tariff-annual-test-fixtures";
import { resolver, work } from "@/engine/remuneration-test-fixtures";

const employee = employeeValue as RuleTariffPackage;
const oldTraining = trainingOldValue as RuleTariffPackage;
const training = trainingValue as RuleTariffPackage;
const candidates = [employee, oldTraining, training];
const variants = ["BT_K", "BT_B"] as const;
const regions = ["OTHER", "KAV_BW"] as const;
const months = (year: number) =>
  Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);

function claimFor(pkg: RuleTariffPackage, year = 2026) {
  const apprentice = pkg.rules.selection!.employmentKind === "APPRENTICE";
  const { claim } = tariffAnnualFixture(apprentice);
  claim.year = year;
  claim.id = "annual-" + year;
  claim.selection.packageId = pkg.packageId;
  claim.basis.months = (apprentice ? [8, 9, 10] : [7, 8, 9]).map((m) =>
    annualBasisMonth(`${year}-${String(m).padStart(2, "0")}`, apprentice ? 150000 : 300000),
  );
  return claim;
}
function saved(claim: SavedTariffAnnualClaim["claim"]): SavedTariffAnnualClaim {
  return { claim, actualPayment: null, revoked: false, revision: 1, updatedAt: work.updatedAt };
}

describe("concrete VKA annual-payment candidate packages", () => {
  it.each(candidates)("validates $packageId/$versionId without manufacturing review", (pkg) => {
    expect(validateRulePackage(pkg)).toMatchObject({ ok: true });
    expect(pkg.engineContractVersion).toBe(11);
    expect(pkg.status).toBe("DRAFT");
    expect(pkg.review).toEqual({
      status: "DRAFT",
      reviewedBy: null,
      reviewedAt: null,
      gitCommit: null,
    });
    for (const rule of pkg.rules.annualPaymentRules!) {
      expect(rule.sourceIds).toHaveLength(1);
      const source = pkg.sources.find((s) => s.id === rule.sourceIds[0])!;
      expect(source.url).toMatch(/^https:\/\/vka\.de\//);
      expect(source.section).toMatch(/§ 14|§ 54|§ 52a/);
      expect(source.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(source.id).not.toContain("assessment");
    }
  });
  it.each([
    [employee, employeeOriginal],
    [oldTraining, trainingOldOriginal],
    [training, trainingOriginal],
  ])("preserves all existing non-annual rules and table boundaries", (pkg, original) => {
    const rules = structuredClone(pkg.rules);
    delete rules.annualPaymentRules;
    rules.selection!.capabilities.annualPayment = "UNSUPPORTED";
    expect(rules).toEqual(original.rules);
    expect(pkg.validFrom).toBe(original.validFrom);
    expect(pkg.validTo).toBe(original.validTo);
    expect(pkg.sources.slice(0, original.sources.length)).toEqual(original.sources);
    expect(pkg.versionId).not.toBe(original.versionId);
  });

  // Independent reference: confirmed EUR 3,000 average x 90% or 85%, no reduction.
  const referenceGroups = [
    ["p5", 270000],
    ["p6", 270000],
    ["p7", 270000],
    ["p8", 270000],
    ["p9", 255000],
    ["p10", 255000],
    ["p11", 255000],
    ["p12", 255000],
    ["p13", 255000],
    ["p14", 255000],
    ["p15", 255000],
    ["p16", 255000],
  ] as const;
  it.each(
    variants.flatMap((variant) =>
      regions.flatMap((region) =>
        referenceGroups.map(([group, cents]) => ({ variant, region, group, cents })),
      ),
    ),
  )(
    "TVöD $variant/$region/$group uses the 2026 reference amount",
    ({ variant, region, group, cents }) => {
      const claim = claimFor(employee);
      Object.assign(claim.selection, { variant, region, group });
      expect(calculateTariffAnnualClaim(employee, claim)).toMatchObject({
        status: "estimated",
        eligible: true,
        amountCents: cents,
        basisCents: 300000,
        payoutMonth: "2026-11",
        missing: [],
      });
    },
  );
  it.each(
    variants.flatMap((variant) =>
      regions.flatMap((region) =>
        ["b", "c"].flatMap((group) =>
          [2025, 2026].map((year) => ({ variant, region, group, year })),
        ),
      ),
    ),
  )(
    "TVAöD $variant/$region/$group in $year uses its own reference months",
    ({ variant, region, group, year }) => {
      const pkg = year === 2025 ? oldTraining : training;
      const claim = claimFor(pkg, year);
      Object.assign(claim.selection, { variant, region, group });
      // EUR 1,500 confirmed average x 90% = EUR 1,350.
      expect(calculateTariffAnnualClaim(pkg, claim)).toMatchObject({
        amountCents: 135000,
        basisCents: 150000,
        basisMonths: [`${year}-08`, `${year}-09`, `${year}-10`],
        payoutMonth: `${year}-11`,
        missing: [],
      });
    },
  );
  it.each(candidates)("does not extend annual coverage silently beyond declared years", (pkg) => {
    expect(selectAnnualTariff({ ...claimFor(pkg), year: 2027 }, resolver([pkg]))).toEqual({
      ok: false,
      code: "ANNUAL_RULE_MISSING",
    });
  });
  it("does not backdate the TVöD 2026 rates to 2025", () => {
    expect(selectAnnualTariff(claimFor(employee, 2025), resolver([employee]))).toEqual({
      ok: false,
      code: "ANNUAL_RULE_MISSING",
    });
  });
  it("resolves identical training annual terms across the May table change with both sources", () => {
    const claim = claimFor(training);
    const selected = selectAnnualTariff(claim, resolver([oldTraining, training]));
    expect(selected.ok).toBe(true);
    if (!selected.ok) throw new Error(selected.code);
    expect(selected.versions.map((p) => p.versionId)).toEqual(["2026-05-r1", "2025-04-r1"]);
    const result = calculateTariffAnnualPayments(
      "2026-11",
      [saved(claim)],
      resolver([oldTraining, training]),
    );
    expect(result.totalCents).toBe(135000);
    expect(result.positions[0].source.references.map((s) => s.id).sort()).toEqual([
      "2025-04-r1:vka-tvaoed-annual-2025",
      "2026-05-r1:vka-tvaoed-annual-2025",
    ]);
  });
  it.each([employee, training])("uses personal part-time pay only once", (pkg) => {
    const claim = claimFor(pkg);
    claim.basis.months.forEach((m) => {
      m.baseCents = 100000;
    });
    expect(calculateTariffAnnualClaim(pkg, claim).amountCents).toBe(90000);
  });
  it.each([
    [employee, "BT_K", 247500],
    [employee, "BT_B", 0],
    [training, "BT_K", 0],
    [training, "BT_B", 0],
  ] as const)(
    "keeps the early-exit exception confined to hospital employees",
    (pkg, variant, cents) => {
      const claim = claimFor(pkg);
      claim.selection.variant = variant;
      confirmAnnualEmployment(claim, "2026-01-01", "2026-11-30");
      claim.basis.months.push(annualBasisMonth("2026-11"));
      Object.assign(claim.employment.takeover, {
        immediate: false,
        sameEmployer: false,
        employedDecember1: false,
      });
      expect(calculateTariffAnnualClaim(pkg, claim).amountCents).toBe(cents);
    },
  );
  it.each([employee, training])("uses confirmed first-full-month pay for late entry", (pkg) => {
    const claim = claimFor(pkg);
    confirmAnnualEmployment(claim, "2026-11-01", null);
    claim.basis.months = [annualBasisMonth("2026-11", 180000)];
    // EUR 1,800 x 90% x 2/12 = EUR 270, not a fabricated three-month average.
    expect(calculateTariffAnnualClaim(pkg, claim).amountCents).toBe(27000);
  });
  it("supports confirmed training takeover and explicit fractional entitlement", () => {
    const claim = claimFor(training);
    confirmAnnualEmployment(claim, "2026-01-01", "2026-08-31");
    Object.assign(claim.employment.takeover, {
      immediate: true,
      sameEmployer: true,
      employedDecember1: true,
    });
    claim.allocation = { required: true, twelfthsNumerator: 8, twelfthsDenominator: 1 };
    claim.basis.takeoverMonthlyCents = 150000;
    claim.basis.months = [];
    expect(calculateTariffAnnualClaim(training, claim).amountCents).toBe(90000);
  });
  it.each([employee, training])("keeps unknown confirmed-pay inputs unavailable", (pkg) => {
    const claim = claimFor(pkg);
    claim.basis.months[0].componentsConfirmed = false;
    expect(calculateTariffAnnualClaim(pkg, claim)).toMatchObject({
      status: "unavailable",
      amountCents: null,
    });
  });
  it.each([employee, training])(
    "replaces estimates once, even when actual payout moves to next year",
    (pkg) => {
      const row = saved(claimFor(pkg));
      const rules = resolver([pkg]);
      const estimates = months(2026).map((m) => calculateTariffAnnualPayments(m, [row], rules));
      expect(estimates.flatMap((r) => r.positions)).toHaveLength(1);
      const actual = { ...row, actualPayment: { grossCents: 123456, payoutMonth: "2027-01" } };
      const results = [...months(2026), ...months(2027)].map((m) =>
        calculateTariffAnnualPayments(m, [actual], rules),
      );
      expect(results.flatMap((r) => r.positions)).toHaveLength(1);
      expect(results.reduce((sum, r) => sum + r.knownSubtotalCents, 0)).toBe(123456);
    },
  );
});
