import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  annualBasisMonth,
  confirmAnnualEmployment,
  tariffAnnualFixture,
} from "./tariff-annual-test-fixtures";
import { calculateCaritasAnnualDraftClaim as calculate } from "./caritas-annual-draft";

function regional(year: 2025 | 2026, region: "bw" | "ost" = "bw") {
  const version = region === "ost" ? `${year}-01` : year === 2025 ? "2025-07-01" : "2026-02-01";
  const pkg = JSON.parse(
    readFileSync(
      new URL(
        `../../rules/packages/reviewed/avr-caritas-p-${region}/${version}-draft1.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  ) as RuleTariffPackage;
  const { claim } = tariffAnnualFixture();
  claim.version = 3;
  claim.year = year;
  claim.selection.packageId = pkg.packageId;
  claim.selection.variant = "ANLAGE_31";
  claim.selection.region = region === "bw" ? "BW" : "OST_TARIF_WEST_BERLIN";
  claim.selection.group = "p7";
  claim.selection.groupAtSeptember1Confirmed = true;
  claim.basis.months = [7, 8, 9].map((m) =>
    annualBasisMonth(`${year}-${String(m).padStart(2, "0")}`),
  );
  return { pkg, claim };
}

describe("Caritas annual-payment candidate using shared eligibility and basis mechanics", () => {
  it.each([
    ["p4", 258_000],
    ["p7", 258_000],
    ["p8", 258_000],
    ["p9", 228_000],
    ["p16", 228_000],
  ] as const)("uses the sourced rate band for %s", (group, cents) => {
    const { pkg, claim } = regional(2026);
    claim.selection.group = group;
    expect(calculate(pkg, claim)).toMatchObject({
      draftOnly: true,
      status: "estimated",
      amountCents: cents,
      eligible: true,
      basisCents: 300_000,
      basisMethod: "REFERENCE_AVERAGE",
      twelfths: { numerator: 12, denominator: 1 },
      sourceIds: ["caritas-avr-text-2026-03"],
    });
  });

  it("applies Anlage 31 early exit to the last full month with fixed amounts only", () => {
    const { pkg, claim } = regional(2026);
    confirmAnnualEmployment(claim, "2026-01-01", "2026-11-30");
    const november = annualBasisMonth("2026-11", 200_000);
    november.fixedCents = 10_000;
    november.variableCents = 90_000;
    claim.basis.months.push(november);
    expect(calculate(pkg, claim)).toMatchObject({
      status: "estimated",
      amountCents: 165_550,
      basisCents: 210_000,
      basisMethod: "CARITAS_LAST_MONTH",
      payoutMonth: null,
      twelfths: { numerator: 11, denominator: 1 },
    });
    claim.selection.variant = "ANLAGE_32";
    expect(calculate(pkg, claim)).toMatchObject({
      status: "estimated",
      amountCents: 0,
      eligible: false,
    });
  });

  it("uses confirmed paid-calendar-day normalization and reports missing components", () => {
    const { pkg, claim } = regional(2026);
    claim.basis.months[0].paidCalendarDays = 15;
    claim.basis.months[0].baseCents = 150_000;
    const amount = calculate(pkg, claim);
    expect(amount).toMatchObject({
      basisMethod: "PAID_CALENDAR_DAYS",
      amountCents: Math.round((750_000 * 30.67 * 0.86) / 76),
    });
    claim.basis.months[1].componentsConfirmed = false;
    expect(calculate(pkg, claim)).toMatchObject({
      status: "unavailable",
      amountCents: null,
    });
  });

  it("requires the rate-date confirmation, complete entitlement facts and a matching claim year", () => {
    const { pkg, claim } = regional(2026);
    claim.selection.groupAtSeptember1Confirmed = false;
    expect(calculate(pkg, claim).missing).toContain("selection.groupAtSeptember1");
    claim.selection.groupAtSeptember1Confirmed = true;
    confirmAnnualEmployment(claim, "2026-10-01", null);
    expect(calculate(pkg, claim).missing).toContain("selection.groupAtSeptember1");
    confirmAnnualEmployment(claim, "2025-01-01", null);
    claim.entitlements[3].reason = "UNKNOWN";
    expect(calculate(pkg, claim).missing).toContain("entitlements.4");
    claim.entitlements[3].reason = "PAY";
    claim.year = 2025;
    expect(calculate(pkg, claim).missing).toContain("rulePeriod");
  });

  it("does not quietly use the East pay table for the 2025 West-table exception", () => {
    const { pkg, claim } = regional(2025, "ost");
    expect(calculate(pkg, claim).status).toBe("estimated");
    claim.selection.region = "OST_TARIF_OST";
    expect(calculate(pkg, claim)).toMatchObject({
      status: "unavailable",
      missing: ["basis.ostWestTable"],
    });
  });

  it("keeps an invalid or altered package unavailable", () => {
    const { pkg, claim } = regional(2026);
    expect(calculate(pkg, {}).missing).toEqual(["claim.invalid"]);
    pkg.rules.caritasAnnualPaymentPolicy!.rateBands[0].rateBasisPoints = 7600;
    expect(calculate(pkg, claim).missing).toEqual(["rulePackage"]);
  });
});
