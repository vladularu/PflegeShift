import { validateActualOwnAnnualPayments, type ActualOwnAnnualPayment } from "./annual-payment";
import { UserFacingError } from "./errors";
import { requireInstant } from "./validation";

export const ACTUAL_ANNUAL_PAYMENT_TEST_LOCK =
  "Bitte zuerst alle Testlabor-Versuche beenden. Persönliche Sonderzahlungen bleiben währenddessen unverändert.";

/** Revocation keeps its revision so stale forms cannot recreate a withdrawn confirmation. */
export interface SavedActualOwnAnnualPayment {
  readonly payment: ActualOwnAnnualPayment;
  readonly revoked: boolean;
  readonly updatedAt: string;
}
export interface SaveActualOwnAnnualPaymentInput {
  readonly payment: Omit<ActualOwnAnnualPayment, "version" | "revision">;
  readonly expected: SavedActualOwnAnnualPayment | null;
}

export function validateSavedActualOwnAnnualPayment(value: unknown): SavedActualOwnAnnualPayment {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== 3 ||
    !Object.hasOwn(value, "payment") ||
    !Object.hasOwn(value, "revoked") ||
    !Object.hasOwn(value, "updatedAt")
  )
    throw new UserFacingError("Die gespeicherte Sonderzahlungsbestätigung ist ungültig.");
  const raw = value as Record<string, unknown>;
  if (typeof raw.revoked !== "boolean") throw new UserFacingError("Ungültiger Bestätigungsstatus.");
  return Object.freeze({
    payment: validateActualOwnAnnualPayments([raw.payment])[0],
    revoked: raw.revoked,
    updatedAt: requireInstant(raw.updatedAt, "Sonderzahlungsbestätigung"),
  });
}

export function validateSavedActualOwnAnnualPayments(
  value: unknown,
): readonly SavedActualOwnAnnualPayment[] {
  if (!Array.isArray(value) || value.length > 4096)
    throw new UserFacingError("Ungültige Sonderzahlungsbestätigungen.");
  const records = value.map(validateSavedActualOwnAnnualPayment);
  validateActualOwnAnnualPayments(records.map((record) => record.payment));
  return Object.freeze(records);
}

export function activeActualOwnAnnualPayments(
  records: readonly SavedActualOwnAnnualPayment[],
): readonly ActualOwnAnnualPayment[] {
  return Object.freeze(
    validateSavedActualOwnAnnualPayments(records)
      .filter((record) => !record.revoked)
      .map((record) => record.payment),
  );
}
