import {
  assessCaritasAnnualPaymentEntitlement,
  type CaritasAnnualPaymentEntitlementInput,
  type CaritasAnnualPaymentEntitlementResult,
} from "./caritas-annual-payment-entitlement";
import {
  calculateCaritasAnnualPaymentRegularBasis,
  type CaritasAnnualPaymentRegularBasisInput,
  type CaritasAnnualPaymentRegularBasisResult,
} from "./caritas-annual-payment-regular-basis";

export interface CaritasAnnualPaymentRegularAmountInput
  extends CaritasAnnualPaymentRegularBasisInput, CaritasAnnualPaymentEntitlementInput {
  /** Externally confirmed applicability of section 16(2), sentence 4, to the reference period. */
  readonly parentalLeavePartTimeBasis: "NOT_APPLICABLE" | "APPLICABLE" | "UNKNOWN";
}

type Basis = Extract<
  CaritasAnnualPaymentRegularBasisResult,
  { kind: "personal-annual-payment-regular-basis" }
>;
type Entitlement = Extract<
  CaritasAnnualPaymentEntitlementResult,
  { kind: "personal-annual-payment-entitlement" }
>;
type BasisFailure = Extract<CaritasAnnualPaymentRegularBasisResult, { kind: "unavailable" }>;
type EntitlementFailure = Extract<CaritasAnnualPaymentEntitlementResult, { kind: "unavailable" }>;

export type CaritasAnnualPaymentRegularAmountResult =
  | {
      readonly kind: "personal-annual-payment-regular-amount";
      readonly draft: true;
      readonly completeGross: false;
      readonly entitlementYear: number;
      readonly amountCents: number;
      readonly exactAmountCents: { readonly numerator: string; readonly denominator: string };
      readonly rateBasisPoints: 7600 | 8600;
      readonly basis: Basis;
      readonly entitlement: Entitlement;
      readonly parentalLeavePartTimeBasis: "NOT_APPLICABLE";
      readonly roundingEvidence: {
        readonly policy: "AVR_ANLAGE_1_X_E_HALF_UP_FINAL_CENT";
        readonly sourceId: string;
        readonly sourceSection: "Anlage 1 Abschnitt X Absatz e";
        readonly sourceSha256: string;
      };
    }
  | BasisFailure
  | EntitlementFailure
  | {
      readonly kind: "unavailable";
      readonly reason:
        | "UNSUPPORTED_SPECIAL_BASIS"
        | "UNSUPPORTED_EMPLOYMENT_PERIOD"
        | "REFERENCE_MONTH_FACTS_MISMATCH"
        | "ROUNDING_SOURCE_MISSING"
        | "AMOUNT_OVERFLOW";
    };

// Fixed original AVR snapshots read and hashed for this DRAFT calculation contract.
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

/** One confirmed ordinary annual component, with no UI or complete-gross claim. */
export function calculateCaritasAnnualPaymentRegularAmount(
  input: CaritasAnnualPaymentRegularAmountInput,
): CaritasAnnualPaymentRegularAmountResult {
  if (input.parentalLeavePartTimeBasis !== "NOT_APPLICABLE")
    return { kind: "unavailable", reason: "UNSUPPORTED_SPECIAL_BASIS" };
  const basis = calculateCaritasAnnualPaymentRegularBasis(input);
  if (basis.kind === "unavailable") return basis;
  const entitlement = assessCaritasAnnualPaymentEntitlement(input);
  if (entitlement.kind === "unavailable") return entitlement;
  if (
    entitlement.employmentStartDate > `${input.entitlementYear}-07-01` ||
    !entitlement.eligibility.eligible ||
    entitlement.eligibility.reason !== "EMPLOYED_ON_DECEMBER_1"
  )
    return { kind: "unavailable", reason: "UNSUPPORTED_EMPLOYMENT_PERIOD" };

  for (const [index, month] of basis.paidMonths.entries()) {
    const facts = entitlement.months.find((item) => item.month === month.month);
    if (
      facts?.entgeltOrContinuationDays !== [31, 31, 30][index] ||
      facts.reductionException.kind !== "NONE"
    )
      return { kind: "unavailable", reason: "REFERENCE_MONTH_FACTS_MISMATCH" };
  }
  const roundingSourceId = `caritas-avr-jsz-${input.entitlementYear}`;
  const roundingSource = input.pkg.sources.find((source) => source.id === roundingSourceId);
  if (
    !basis.annualRule.sourceIds.includes(roundingSourceId) ||
    !roundingSource ||
    !avrDocuments[roundingSource.sha256] ||
    roundingSource.url !== avrDocuments[roundingSource.sha256].url ||
    roundingSource.documentDate !== avrDocuments[roundingSource.sha256].documentDate ||
    (input.entitlementYear === 2026 && roundingSource.documentDate !== "2026-03-19")
  )
    return { kind: "unavailable", reason: "ROUNDING_SOURCE_MISSING" };

  const numerator =
    BigInt(basis.meanMonthlyBasis.numeratorCents) *
    BigInt(basis.annualRule.rateBasisPoints) *
    BigInt(entitlement.reductionFactor.numerator);
  const denominator =
    BigInt(basis.meanMonthlyBasis.denominator) *
    10000n *
    BigInt(entitlement.reductionFactor.denominator);
  const rounded = (numerator * 2n + denominator) / (denominator * 2n);
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER))
    return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };
  return {
    kind: "personal-annual-payment-regular-amount",
    draft: true,
    completeGross: false,
    entitlementYear: input.entitlementYear,
    amountCents: Number(rounded),
    exactAmountCents: { numerator: numerator.toString(), denominator: denominator.toString() },
    rateBasisPoints: basis.annualRule.rateBasisPoints,
    basis,
    entitlement,
    parentalLeavePartTimeBasis: "NOT_APPLICABLE",
    roundingEvidence: {
      policy: "AVR_ANLAGE_1_X_E_HALF_UP_FINAL_CENT",
      sourceId: roundingSource.id,
      sourceSection: "Anlage 1 Abschnitt X Absatz e",
      sourceSha256: roundingSource.sha256,
    },
  };
}
