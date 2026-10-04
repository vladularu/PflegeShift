import { describe, expect, it } from "vitest";
import a from "../../rules/packages/reviewed/tvl-kr-tdl/2025-11.json";
import b from "../../rules/packages/reviewed/tvl-kr-tdl/2026-04.json";
import c from "../../rules/packages/reviewed/tvl-kr-tdl/2027-03.json";
import d from "../../rules/packages/reviewed/tvl-kr-tdl/2028-01.json";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type { SavedTariffAnnualClaim } from "@/domain/saved-tariff-annual-claim";
import { validateRulePackage } from "@/rules/validation";
import { selectAnnualTariff } from "@/rules/tariff-annual-selection";
import {
  createAnnualAvailableReportCache,
  buildAnnualAvailableReportSteps,
} from "@/features/analysis/annual-core-report";
import { annualBasisMonth, tariffAnnualFixture } from "./tariff-annual-test-fixtures";
import { history, resolver, work } from "./remuneration-test-fixtures";
import { calculateTariffAnnualClaim } from "./tariff-annual-payment";
import { calculateDatedMonthlyRemuneration } from "./remuneration-month";

const packages = [a, b, c, d] as RuleTariffPackage[];
const rules = resolver(packages);
const profile: DatedRemunerationProfile = {
  ...history("2025-11-01"),
  data: {
    version: 1,
    weeklyMinutes: 2310,
    selection: {
      kind: "tariff",
      packageId: "tvl-kr-tdl",
      variant: "SECTION_43",
      region: "WEST_38_5",
      group: "KR9",
      level: "2",
      fullTimeWeeklyMinutes: 2310,
    },
  },
};
function saved(year = 2026): SavedTariffAnnualClaim {
  const { claim } = tariffAnnualFixture();
  claim.version = 2;
  claim.year = year;
  claim.selection = {
    packageId: "tvl-kr-tdl",
    variant: "SECTION_43",
    region: "WEST_38_5",
    group: "kr9",
    confirmed: true,
  };
  claim.exceptions.tvlLegacyRetirementExit = null;
  claim.basis.months = [7, 8, 9].map((m) => annualBasisMonth(year + "-0" + m));
  return { claim, actualPayment: null, revoked: false, revision: 1, updatedAt: work.updatedAt };
}
const monthly = (month: string, claims: readonly SavedTariffAnnualClaim[]) =>
  calculateDatedMonthlyRemuneration({
    month,
    history: [profile],
    workProfile: work,
    shifts: [],
    allowanceEntitlements: [],
    tariffAnnualClaims: claims,
    resolver: rules,
  });

function annual(
  year: number,
  rows: readonly SavedTariffAnnualClaim[],
  cache = createAnnualAvailableReportCache(),
) {
  const steps = buildAnnualAvailableReportSteps(
    year,
    [],
    work,
    [],
    { workplaceCoverage: "AROUND_THE_CLOCK", assignment: "PERMANENT", updatedAt: work.updatedAt },
    year + "-12-31",
    rules,
    {
      cache,
      remuneration: {
        status: "ready",
        profiles: [profile],
        shifts: [],
        paidAbsences: [],
        overtimeAllocations: [],
        allowanceDecisions: [],
        tariffAnnualClaims: rows,
      },
    },
  );
  for (;;) {
    const next = steps.next();
    if (next.done) return next.value.remuneration!;
  }
}

describe("concrete TV-L annual packages through monthly and annual analysis", () => {
  it.each(packages)("$versionId declares all KR annual rates with official attribution", (pkg) => {
    expect(validateRulePackage(pkg)).toMatchObject({ ok: true });
    for (const group of Array.from({ length: 13 }, (_, i) => i + 5)) {
      const row = saved(Number(pkg.validFrom.slice(0, 4)));
      const claim = { ...row.claim, selection: { ...row.claim.selection, group: "kr" + group } };
      const expected = group <= 6 ? 262290 : group <= 8 ? 264420 : group <= 15 ? 223050 : 139410;
      const result = calculateTariffAnnualClaim(pkg, claim);
      expect(result.amountCents).toBe(expected);
      expect(result.sourceIds).toEqual(["tdl-tvl-annual-2026"]);
      const source = pkg.sources.find((s) => s.id === result.sourceIds[0])!;
      expect(source.url).toContain("https://www.tdl-online.de/");
      expect(source.section).toContain("§20");
      expect(source.sha256).toBe(
        "05de64ee356df189690875a491e5d52d8ac8171328b43f7fd401d8b0c04f94f9",
      );
    }
    expect(pkg.status).toBe("DRAFT");
    expect(pkg.review.reviewedBy).toBeNull();
  });
  it("keeps the future entitlement range bounded and agrees across table changes", () => {
    for (const year of [2025, 2026, 2027, 2028])
      expect(selectAnnualTariff(saved(year).claim, rules).ok).toBe(true);
    expect(selectAnnualTariff(saved(2029).claim, rules)).toMatchObject({
      ok: false,
      code: "ANNUAL_RULE_MISSING",
    });
  });
  it("requires personal inputs in November, with uppercase KR profiles and known base pay intact", () => {
    const result = monthly("2026-11", []);
    expect(result.base.totalCents).toBe(396865);
    expect(result.annualPayments.totalCents).toBeNull();
    expect(result.annualPayments.positions[0].issue?.code).toBe("ANNUAL_INPUT_MISSING");
    expect(monthly("2026-10", []).annualPayments.positions).toEqual([]);
    expect(result.estimatedGrossCents).toBeNull();
  });
  it("puts the sourced estimate in November exactly once", () => {
    const months = Array.from({ length: 12 }, (_, i) =>
      monthly("2026-" + String(i + 1).padStart(2, "0"), [saved()]),
    );
    expect(months.flatMap((m) => m.annualPayments.positions)).toHaveLength(1);
    expect(months.reduce((n, m) => n + m.annualPayments.knownSubtotalCents, 0)).toBe(223050);
    const position = months[10].annualPayments.positions[0];
    expect(position.source.references.every((s) => s.section?.includes("§20"))).toBe(true);
    expect(position.source.references.length).toBeGreaterThan(0);
    expect(months[10].estimatedGrossCents).toBeNull(); // Unfinished other KR components stay visible.
  });
  it("recalculates the real annual cache after same-revision restoration and replaces estimates", () => {
    const cache = createAnnualAvailableReportCache();
    const row = saved();
    expect(annual(2026, [row], cache).annualPayments.totalCents).toBe(223050);
    const actual = { ...row, actualPayment: { grossCents: 222222, payoutMonth: "2027-01" } };
    expect(annual(2026, [actual], cache).annualPayments.totalCents).toBe(0);
  });
  it("counts a following-year payment while retaining that year's unconfirmed claim", () => {
    const actual = { ...saved(), actualPayment: { grossCents: 222222, payoutMonth: "2027-01" } };
    const following = annual(2027, [actual]);
    expect(following.annualPayments.knownSubtotalCents).toBe(222222);
    expect(following.annualPayments.totalCents).toBeNull(); // 2027 claim not yet confirmed.
  });
  it.each(["zero", "revoked"])(
    "refreshes a cached year after %s without losing the distinction",
    (kind) => {
      const cache = createAnnualAvailableReportCache();
      const row = saved();
      expect(annual(2026, [row], cache).annualPayments.totalCents).toBe(223050);
      const next =
        kind === "zero"
          ? { ...row, actualPayment: { grossCents: 0, payoutMonth: "2026-11" } }
          : { ...row, revoked: true };
      expect(annual(2026, [next], cache).annualPayments.totalCents).toBe(
        kind === "zero" ? 0 : null,
      );
    },
  );
});
