import { UserFacingError } from "./errors";
import type { RemunerationSource, RemunerationStatus } from "./remuneration-result";

/** Personal gross payment, not a tariff override. One record per payment ID/entitlement year.
 * payoutMonth may be in another year; the actual replaces that entitlement year's estimate.
 */
export interface ActualOwnAnnualPayment {
  readonly version: 1;
  readonly paymentId: string;
  readonly entitlementYear: number;
  readonly payoutMonth: string;
  readonly title: string;
  readonly grossCents: number;
  readonly revision: number;
}

export function validateActualOwnAnnualPayments(value: unknown): readonly ActualOwnAnnualPayment[] {
  const fail = (): never => {
    throw new UserFacingError(
      "Die bestätigten Jahressonderzahlungen sind ungültig oder mehrfach vorhanden.",
    );
  };
  if (!Array.isArray(value) || value.length > 4096) return fail();
  const seen = new Set<string>();
  return Object.freeze(
    value.map((entry) => {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return fail();
      const keys = [
        "version",
        "paymentId",
        "entitlementYear",
        "payoutMonth",
        "title",
        "grossCents",
        "revision",
      ];
      if (
        Object.keys(entry).length !== keys.length ||
        keys.some((key) => !Object.hasOwn(entry, key))
      )
        return fail();
      const raw = entry as Record<string, unknown>;
      if (
        raw.version !== 1 ||
        typeof raw.paymentId !== "string" ||
        !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/u.test(raw.paymentId) ||
        typeof raw.entitlementYear !== "number" ||
        !Number.isInteger(raw.entitlementYear) ||
        raw.entitlementYear < 1900 ||
        raw.entitlementYear > 4099 ||
        typeof raw.payoutMonth !== "string" ||
        !/^\d{4}-(0[1-9]|1[0-2])$/u.test(raw.payoutMonth) ||
        raw.payoutMonth < "1900-01" ||
        raw.payoutMonth > "4099-12" ||
        typeof raw.title !== "string" ||
        raw.title.trim() !== raw.title ||
        !raw.title ||
        raw.title.length > 100 ||
        /[\u0000-\u001f\u007f]/u.test(raw.title) ||
        typeof raw.grossCents !== "number" ||
        !Number.isSafeInteger(raw.grossCents) ||
        raw.grossCents < 0 ||
        raw.grossCents > 1_000_000_000 ||
        typeof raw.revision !== "number" ||
        !Number.isSafeInteger(raw.revision) ||
        raw.revision < 1
      )
        return fail();
      const key = `${raw.entitlementYear}:${raw.paymentId}`;
      if (seen.has(key)) return fail();
      seen.add(key);
      return Object.freeze({
        version: 1 as const,
        paymentId: raw.paymentId,
        entitlementYear: raw.entitlementYear,
        payoutMonth: raw.payoutMonth,
        title: raw.title,
        grossCents: raw.grossCents,
        revision: raw.revision,
      });
    }),
  );
}

export interface AnnualPaymentPosition {
  readonly id: string;
  readonly kind: "annual-payment";
  readonly label: string;
  readonly from: string;
  readonly through: string;
  readonly amountCents: number | null;
  readonly status: RemunerationStatus;
  readonly source: RemunerationSource;
  readonly basis: {
    readonly paymentId: string;
    readonly entitlementYear: number;
    readonly method: "fixed" | "percent" | "actual";
    readonly fullAmountCents: number | null;
    readonly confirmedBasisCents: number | null;
    readonly percentageBasisPoints: number | null;
    readonly entitlementMonths: number | null;
    readonly actualRevision: number | null;
    readonly tariff?: {
      /** null marks a missing personal claim, not an invented revision. */
      readonly claimRevision: number | null;
      readonly ruleId: string | null;
      readonly versions: readonly string[];
      readonly basisMethod: string | null;
      readonly basisMonths: readonly string[];
      readonly twelfths: { readonly numerator: number; readonly denominator: number } | null;
      readonly missing: readonly string[];
    };
  };
  readonly issue: {
    readonly code:
      | "ANNUAL_INPUT_MISSING"
      | "ANNUAL_TERMS_AMBIGUOUS"
      | "ANNUAL_RULE_MISSING"
      | "ANNUAL_RULE_AMBIGUOUS"
      | "ANNUAL_RULE_INVALID"
      | "ANNUAL_ALLOCATION_UNCONFIRMED";
    readonly message: string;
  } | null;
}
export interface AnnualPaymentResult {
  readonly positions: readonly AnnualPaymentPosition[];
  readonly complete: boolean;
  readonly status: RemunerationStatus;
  readonly knownSubtotalCents: number;
  readonly totalCents: number | null;
}
