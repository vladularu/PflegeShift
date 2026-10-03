import type { AnnualPaymentPosition, AnnualPaymentResult } from "@/domain/annual-payment";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import {
  validateSavedTariffAnnualClaims,
  type SavedTariffAnnualClaim,
} from "@/domain/saved-tariff-annual-claim";
import type { TariffAnnualClaim } from "@/domain/tariff-annual-claim";
import type { RuleResolver } from "@/rules/rule-resolver";
import { selectAnnualTariff } from "@/rules/tariff-annual-selection";
import { remunerationMonthStart } from "./remuneration-context";

const family = (s: Pick<TariffAnnualClaim["selection"], "packageId" | "variant" | "region">) =>
  JSON.stringify([s.packageId, s.variant, s.region]);

/** Missing personal inputs are not a zero entitlement. This only discovers gaps;
 * it never creates a claim or infers employment dates from a pay-profile change.
 */
export function missingTariffAnnualClaims(
  month: string,
  history: readonly DatedRemunerationProfile[],
  saved: readonly SavedTariffAnnualClaim[],
  resolver: RuleResolver,
): AnnualPaymentResult {
  const first = remunerationMonthStart(month);
  const year = first.year;
  const covered = new Set(
    validateSavedTariffAnnualClaims(saved)
      .filter((row) => !row.revoked && row.claim.year === year)
      .map((row) => family(row.claim.selection)),
  );
  const sorted = [...history].sort((a, b) =>
    (a.effectiveFrom ?? "").localeCompare(b.effectiveFrom ?? ""),
  );
  const groups = new Map<string, DatedRemunerationProfile[]>();
  for (const [index, profile] of sorted.entries()) {
    const s = profile.data.selection;
    const next = sorted[index + 1]?.effectiveFrom;
    if (
      s.kind !== "tariff" ||
      (profile.effectiveFrom !== null && profile.effectiveFrom > `${year}-12-31`) ||
      (next && next <= `${year}-01-01`) ||
      covered.has(family(s))
    )
      continue;
    const key = family(s);
    groups.set(key, [...(groups.get(key) ?? []), profile]);
  }
  const positions: AnnualPaymentPosition[] = [];
  for (const [key, profiles] of groups) {
    const profile = profiles[profiles.length - 1];
    const s = profile.data.selection;
    if (s.kind !== "tariff") continue;
    const candidates = resolver.annualTariffCandidates?.(s.packageId, year) ?? [];
    if (
      !candidates.some(
        (pkg) =>
          pkg.engineContractVersion === 11 ||
          ([12, 13].includes(pkg.engineContractVersion) &&
            pkg.rules.annualPaymentRules !== undefined),
      )
    )
      continue;
    const selections = profiles.map((p) => {
      const tariff = p.data.selection;
      if (tariff.kind !== "tariff") throw new Error("Expected tariff profile");
      return selectAnnualTariff(
        {
          year,
          selection: {
            packageId: tariff.packageId,
            variant: tariff.variant,
            region: tariff.region,
            group: /^(P|KR)\d+$/.test(tariff.group) ? tariff.group.toLowerCase() : tariff.group,
            confirmed: false,
          },
        },
        resolver,
      );
    });
    const payouts = new Set(selections.flatMap((x) => (x.ok ? [x.rule.payoutMonth] : [])));
    const failure = selections.find((x) => !x.ok);
    const selected = selections[selections.length - 1];
    const payoutKnown = !failure && payouts.size === 1;
    if (payoutKnown && !payouts.has(first.month)) continue;
    const code =
      failure && !failure.ok
        ? failure.code
        : payouts.size > 1
          ? "ANNUAL_RULE_AMBIGUOUS"
          : "ANNUAL_INPUT_MISSING";
    const pkg = selected.ok ? selected.package : null;
    const versions = selections.flatMap((x) => (x.ok ? x.versions : []));
    const references = new Map(
      versions.flatMap((v) =>
        v.sources.map(
          (source) =>
            [
              `${v.versionId}:${source.id}`,
              {
                id: `${v.versionId}:${source.id}`,
                title: source.title,
                url: source.url,
                section: source.section,
              },
            ] as const,
        ),
      ),
    );
    positions.push({
      id: `tariff-annual-missing:${year}:${key}`,
      kind: "annual-payment",
      label: `Tarifliche Jahressonderzahlung ${year} · Angaben fehlen`,
      from: first.toString(),
      through: first.with({ day: first.daysInMonth }).toString(),
      amountCents: null,
      status: "unavailable",
      source: {
        kind: "tariff",
        profileEffectiveFrom: profile.effectiveFrom,
        profileRevision: profile.revision,
        requestedPackageId: s.packageId,
        packageId: pkg?.packageId ?? null,
        versionId: pkg?.versionId ?? null,
        packageValidFrom: pkg?.validFrom ?? null,
        packageValidTo: pkg?.validTo ?? null,
        references: [...references.values()],
      },
      basis: {
        paymentId: `missing:${key}`,
        entitlementYear: year,
        method: "percent",
        fullAmountCents: null,
        confirmedBasisCents: null,
        percentageBasisPoints: null,
        entitlementMonths: null,
        actualRevision: null,
        tariff: {
          claimRevision: null,
          ruleId: null,
          versions: [...new Set(versions.map((v) => v.versionId))],
          basisMethod: null,
          basisMonths: [],
          twelfths: null,
          missing: ["claim", ...(code === "ANNUAL_INPUT_MISSING" ? [] : [code])],
        },
      },
      issue: {
        code,
        message: payoutKnown
          ? "Persönliche Angaben zur tariflichen Jahressonderzahlung fehlen. Unter Jahressonderzahlungen bearbeiten Anspruch und Bemessung ergänzen; ein fehlender Eintrag bedeutet nicht 0 € Anspruch."
          : "Persönliche Jahresangaben und eine eindeutige Tarifgrundlage fehlen. Betrag und Auszahlungsmonat bleiben offen.",
      },
    });
  }
  return {
    positions,
    complete: positions.length === 0,
    status: positions.length ? "unavailable" : "calculated",
    totalCents: positions.length ? null : 0,
    knownSubtotalCents: 0,
  };
}
