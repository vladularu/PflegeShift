import type { AnnualPaymentPosition, AnnualPaymentResult } from "@/domain/annual-payment";
import {
  validateSavedTariffAnnualClaims,
  type SavedTariffAnnualClaim,
} from "@/domain/saved-tariff-annual-claim";
import type { RemunerationSource } from "@/domain/remuneration-result";
import type { RuleResolver } from "@/rules/rule-resolver";
import { selectAnnualTariff, type AnnualTariffSelection } from "@/rules/tariff-annual-selection";
import { calculateTariffAnnualClaim } from "./tariff-annual-payment";
import { remunerationMonthStart } from "./remuneration-context";

/** Multiple personal claims must explicitly allocate one annual entitlement, including training takeovers. */
function allocationIssues(records: readonly SavedTariffAnnualClaim[]): ReadonlySet<number> {
  const blocked = new Set<number>();
  for (const year of new Set(records.map((r) => r.claim.year))) {
    const rows = records.filter((r) => r.claim.year === year);
    if (rows.length < 2) continue;
    let numerator = 0n,
      denominator = 1n;
    const seen = new Set<string>();
    for (const { claim } of rows) {
      const a = claim.allocation;
      const key = JSON.stringify([
        claim.selection.packageId,
        claim.selection.variant,
        claim.selection.region,
        claim.selection.group,
        claim.employment.start,
        claim.employment.end,
      ]);
      if (
        seen.has(key) ||
        a.required !== true ||
        a.twelfthsNumerator === null ||
        a.twelfthsDenominator === null
      ) {
        blocked.add(year);
        break;
      }
      seen.add(key);
      numerator =
        numerator * BigInt(a.twelfthsDenominator) + BigInt(a.twelfthsNumerator) * denominator;
      denominator *= BigInt(a.twelfthsDenominator);
      if (numerator > 12n * denominator) {
        blocked.add(year);
        break;
      }
      // Reduce the fraction to keep arithmetic bounded with many saved claims.
      let x = numerator,
        y = denominator;
      while (y !== 0n) {
        const next = x % y;
        x = y;
        y = next;
      }
      numerator /= x;
      denominator /= x;
    }
  }
  return blocked;
}
function sourceFor(
  row: SavedTariffAnnualClaim,
  selected: AnnualTariffSelection,
  actual: boolean,
): RemunerationSource {
  return {
    kind: actual ? "profile" : "tariff",
    profileEffectiveFrom: null,
    profileRevision: null,
    requestedPackageId: actual ? null : row.claim.selection.packageId,
    packageId: !actual && selected.ok ? selected.package.packageId : null,
    versionId: !actual && selected.ok ? selected.package.versionId : null,
    packageValidFrom: !actual && selected.ok ? selected.package.validFrom : null,
    packageValidTo: !actual && selected.ok ? selected.package.validTo : null,
    references:
      !actual && selected.ok
        ? selected.versions.flatMap((pkg) => {
            const ids = new Set(
              pkg.rules
                .annualPaymentRules!.filter(
                  (r) =>
                    r.variantId === row.claim.selection.variant &&
                    r.regionIds.includes(row.claim.selection.region) &&
                    r.payGroups.includes(row.claim.selection.group) &&
                    r.firstEntitlementYear <= row.claim.year &&
                    r.lastEntitlementYear >= row.claim.year,
                )
                .flatMap((r) => r.sourceIds),
            );
            return pkg.sources
              .filter((s) => ids.has(s.id))
              .map((s) => ({
                id: `${pkg.versionId}:${s.id}`,
                title: s.title,
                url: s.url,
                section: s.section,
              }));
          })
        : [],
  };
}
export function combineAnnualPayments(
  ...parts: readonly AnnualPaymentResult[]
): AnnualPaymentResult {
  const positions = parts.flatMap((part) => part.positions);
  const complete = positions.every((p) => p.amountCents !== null);
  const knownSubtotalCents = positions.reduce((sum, p) => sum + (p.amountCents ?? 0), 0);
  return {
    positions,
    complete,
    knownSubtotalCents,
    totalCents: complete ? knownSubtotalCents : null,
    status: !complete
      ? "unavailable"
      : positions.some((p) => p.status === "estimated")
        ? "estimated"
        : "calculated",
  };
}

/** Cash-month aggregation. A confirmed actual replaces, rather than supplements, its claim estimate. */
export function calculateTariffAnnualPayments(
  month: string,
  saved: readonly SavedTariffAnnualClaim[],
  resolver: RuleResolver,
): AnnualPaymentResult {
  const first = remunerationMonthStart(month);
  // Contract-14 Caritas rules are still DRAFT. A saved personal draft without an
  // actual payment must not create a misleading position in every cash month.
  const active = validateSavedTariffAnnualClaims(saved).filter(
    (r) => !r.revoked && (r.claim.version !== 3 || r.actualPayment !== null),
  );
  const blocked = allocationIssues(active);
  const positions: AnnualPaymentPosition[] = [];
  for (const row of active) {
    const { claim, actualPayment } = row;
    if (actualPayment ? actualPayment.payoutMonth !== month : claim.year !== first.year) continue;
    const selected: AnnualTariffSelection = actualPayment
      ? { ok: false, code: "ANNUAL_RULE_MISSING" }
      : selectAnnualTariff(claim, resolver);
    const estimate =
      !actualPayment && selected.ok ? calculateTariffAnnualClaim(selected.package, claim) : null;
    const expectedPayout = selected.ok
      ? `${claim.year}-${String(selected.rule.payoutMonth).padStart(2, "0")}`
      : null;
    if (!actualPayment && expectedPayout !== null && expectedPayout !== month) continue;
    const splitMissing = blocked.has(claim.year);
    const amount = splitMissing
      ? null
      : actualPayment
        ? actualPayment.grossCents
        : (estimate?.amountCents ?? null);
    const code = splitMissing
      ? "ANNUAL_ALLOCATION_UNCONFIRMED"
      : actualPayment
        ? null
        : !selected.ok
          ? selected.code
          : amount === null
            ? "ANNUAL_INPUT_MISSING"
            : null;
    positions.push({
      id: `tariff-annual:${claim.year}:${claim.id}`,
      kind: "annual-payment",
      label: `Tarifliche Jahressonderzahlung ${claim.year}`,
      from: first.toString(),
      through: first.with({ day: first.daysInMonth }).toString(),
      amountCents: amount,
      status: amount === null ? "unavailable" : actualPayment ? "calculated" : "estimated",
      source: sourceFor(row, selected, actualPayment !== null),
      basis: {
        paymentId: claim.id,
        entitlementYear: claim.year,
        method: actualPayment ? "actual" : "percent",
        fullAmountCents: null,
        confirmedBasisCents: estimate?.basisCents ?? null,
        percentageBasisPoints: estimate?.rateBasisPoints ?? null,
        entitlementMonths: estimate?.twelfths
          ? estimate.twelfths.numerator / estimate.twelfths.denominator
          : null,
        actualRevision: actualPayment ? row.revision : null,
        tariff: {
          claimRevision: row.revision,
          ruleId: estimate?.ruleId ?? null,
          versions: selected.ok ? selected.versions.map((pkg) => pkg.versionId) : [],
          basisMethod: estimate?.basisMethod ?? null,
          basisMonths: estimate?.basisMonths ?? [],
          twelfths: estimate?.twelfths ?? null,
          missing: splitMissing
            ? ["allocation.multipleClaims"]
            : actualPayment
              ? []
              : !selected.ok
                ? [selected.code]
                : (estimate?.missing ?? []),
        },
      },
      issue:
        code === null
          ? null
          : {
              code,
              message:
                code === "ANNUAL_ALLOCATION_UNCONFIRMED"
                  ? "Mehrere Jahresansprüche sind nicht eindeutig aufgeteilt oder überschreiten zusammen zwölf Zwölftel. Bitte Zuordnung prüfen."
                  : code === "ANNUAL_INPUT_MISSING"
                    ? "Für die tarifliche Jahressonderzahlung fehlen bestätigte Anspruchs- oder Bemessungsangaben."
                    : "Für diesen Jahresanspruch fehlt eine eindeutige, gültige Tarifregel. Betrag und gegebenenfalls Auszahlungsmonat bleiben offen.",
            },
    });
  }
  return combineAnnualPayments({
    positions,
    complete: true,
    status: "calculated",
    knownSubtotalCents: 0,
    totalCents: 0,
  });
}
