import type { RuleTariffPackage } from "../rules/contracts.generated";
import type { CaritasAnnualPaymentRuleLookup } from "./caritas-annual-payment-rule";

type AnnualRule = Extract<CaritasAnnualPaymentRuleLookup, { kind: "source-annual-payment-rule" }>;
interface Basis {
  readonly meanMonthlyBasis: { readonly numeratorCents: number; readonly denominator: number };
  readonly annualRule: Pick<AnnualRule, "rateBasisPoints" | "sourceIds">;
}

export type CaritasAnnualPaymentRoundedAmount =
  | {
      readonly kind: "rounded-annual-payment-amount";
      readonly amountCents: number;
      readonly exactAmountCents: { readonly numerator: string; readonly denominator: string };
      readonly rateBasisPoints: 7600 | 8600;
      readonly roundingEvidence: {
        readonly policy: "AVR_ANLAGE_1_X_E_HALF_UP_FINAL_CENT";
        readonly sourceId: string;
        readonly sourceSection: "Anlage 1 Abschnitt X Absatz e";
        readonly sourceSha256: string;
      };
    }
  | {
      readonly kind: "unavailable";
      readonly reason: "ROUNDING_SOURCE_MISSING" | "AMOUNT_OVERFLOW";
    };

// Original AVR snapshots read and hashed for these DRAFT component calculations.
const avrDocuments: Readonly<
  Record<string, { readonly url: string; readonly documentDate: string }>
> = {
  a4f8dea02fb84ba4f203a753bd362d82dec8ad8953f3befed99ac65e65ec2637: {
    url: "https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR-PDF_Version_2025.pdf",
    documentDate: "2025-07-01",
  },
  cb6fc32981eb120d5c05e68d6563725436001409e9bc728bc47d52d08d705aa7: {
    url: "https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR_Online-PDF_2026_final.pdf",
    documentDate: "2026-03-19",
  },
};

/** Internal final-cent arithmetic; callers establish basis identity and personal eligibility. */
export function roundCaritasAnnualPaymentAmount(
  pkg: RuleTariffPackage,
  entitlementYear: number,
  basis: Basis,
  reductionFactor: { readonly numerator: number; readonly denominator: 12 },
): CaritasAnnualPaymentRoundedAmount {
  const sourceId = `caritas-avr-jsz-${entitlementYear}`;
  const source = pkg.sources.find((item) => item.id === sourceId);
  if (
    !basis.annualRule.sourceIds.includes(sourceId) ||
    !source ||
    !avrDocuments[source.sha256] ||
    source.url !== avrDocuments[source.sha256].url ||
    source.documentDate !== avrDocuments[source.sha256].documentDate ||
    (entitlementYear === 2026 && source.documentDate !== "2026-03-19")
  )
    return { kind: "unavailable", reason: "ROUNDING_SOURCE_MISSING" };
  const { numeratorCents, denominator: basisDenominator } = basis.meanMonthlyBasis;
  if (
    !Number.isSafeInteger(numeratorCents) ||
    numeratorCents < 0 ||
    !Number.isSafeInteger(basisDenominator) ||
    basisDenominator <= 0 ||
    !Number.isSafeInteger(reductionFactor.numerator) ||
    reductionFactor.numerator < 0 ||
    reductionFactor.numerator > 12 ||
    reductionFactor.denominator !== 12
  )
    return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };
  const numerator =
    BigInt(numeratorCents) *
    BigInt(basis.annualRule.rateBasisPoints) *
    BigInt(reductionFactor.numerator);
  const denominator = BigInt(basisDenominator) * 10000n * 12n;
  const rounded = (numerator * 2n + denominator) / (denominator * 2n);
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER))
    return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };
  return {
    kind: "rounded-annual-payment-amount",
    amountCents: Number(rounded),
    exactAmountCents: { numerator: numerator.toString(), denominator: denominator.toString() },
    rateBasisPoints: basis.annualRule.rateBasisPoints,
    roundingEvidence: {
      policy: "AVR_ANLAGE_1_X_E_HALF_UP_FINAL_CENT",
      sourceId: source.id,
      sourceSection: "Anlage 1 Abschnitt X Absatz e",
      sourceSha256: source.sha256,
    },
  };
}
