import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  validateSavedTariffAnnualClaim,
  type ActualTariffAnnualPayment,
} from "@/domain/saved-tariff-annual-claim";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { resolver } from "./remuneration-test-fixtures";
import { annualBasisMonth, tariffAnnualFixture } from "./tariff-annual-test-fixtures";
import { calculateCaritasAnnualPayoutMonth } from "./caritas-annual-payout-month";

const pkg = JSON.parse(
  readFileSync(
    new URL(
      "../../rules/packages/reviewed/avr-caritas-p-bw/2026-02-01-draft1.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as RuleTariffPackage;

function saved(actualPayment: ActualTariffAnnualPayment | null = null, groupConfirmed = true) {
  const { claim } = tariffAnnualFixture();
  claim.version = 3;
  claim.year = 2026;
  claim.selection.packageId = pkg.packageId;
  claim.selection.variant = "ANLAGE_31";
  claim.selection.region = "BW";
  claim.selection.group = "p7";
  claim.selection.groupAtSeptember1Confirmed = groupConfirmed;
  claim.basis.months = [7, 8, 9].map((m) => annualBasisMonth(`2026-${String(m).padStart(2, "0")}`));
  return validateSavedTariffAnnualClaim({
    claim,
    actualPayment,
    revoked: false,
    revision: 1,
    updatedAt: "2026-09-01T00:00:00Z",
  });
}

const calculate = (month: string, claims = [saved()]) =>
  calculateCaritasAnnualPayoutMonth({ month, claims, resolver: resolver([pkg]) });

describe("Caritas draft annual cash attribution", () => {
  it("attributes a sourced estimate once to the policy payout month", () => {
    expect(calculate("2026-11")).toMatchObject({
      kind: "draft-known-payments",
      knownSubtotalCents: 258_000,
      complete: false,
      positions: [{ payoutMonth: "2026-11", amountCents: 258_000, origin: "estimated" }],
    });
    const year = Array.from({ length: 12 }, (_, index) =>
      calculate(`2026-${String(index + 1).padStart(2, "0")}`),
    );
    expect(
      year.flatMap((result) => (result.kind === "draft-known-payments" ? result.positions : [])),
    ).toHaveLength(1);
  });

  it("uses an actual payment instead of the estimate, including a later payout year", () => {
    const claim = saved({ grossCents: 270_000, payoutMonth: "2027-01" });
    expect(calculate("2026-11", [claim])).toMatchObject({
      kind: "draft-known-payments",
      knownSubtotalCents: 0,
      positions: [],
    });
    expect(calculate("2027-01", [claim])).toMatchObject({
      kind: "draft-known-payments",
      knownSubtotalCents: 270_000,
      positions: [{ amountCents: 270_000, origin: "actual", entitlementYear: 2026 }],
    });
    expect(calculate("2027-01", [saved({ grossCents: 0, payoutMonth: "2027-01" })])).toMatchObject({
      kind: "draft-known-payments",
      positions: [{ amountCents: 0, origin: "actual" }],
    });
  });

  it("keeps incomplete, revoked and unrelated claims distinct", () => {
    const incomplete = saved(null, false);
    expect(calculate("2026-11", [incomplete])).toMatchObject({
      kind: "draft-known-payments",
      complete: false,
      positions: [],
      unresolvedClaimIds: [incomplete.claim.id],
    });
    expect(calculate("2026-11", [{ ...saved(), revoked: true }])).toMatchObject({
      kind: "draft-known-payments",
      positions: [],
    });
    const unrelated = validateSavedTariffAnnualClaim({
      claim: tariffAnnualFixture().claim,
      actualPayment: null,
      revoked: false,
      revision: 1,
      updatedAt: "2026-09-01T00:00:00Z",
    });
    expect(calculate("2026-11", [unrelated])).toMatchObject({
      kind: "draft-known-payments",
      positions: [],
    });
  });

  it("fails closed on invalid months and duplicate saved claims", () => {
    expect(calculate("2026-13")).toEqual({ kind: "unavailable", reason: "INVALID_MONTH" });
    expect(calculate("2026-11", [saved(), saved()])).toEqual({
      kind: "unavailable",
      reason: "INVALID_CLAIMS",
    });
  });
});
