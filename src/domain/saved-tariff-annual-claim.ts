import { UserFacingError } from "./errors";
import { requireInstant, requireLocalMonth, requirePositiveRevision } from "./validation";
import { validateTariffAnnualClaim, type TariffAnnualClaim } from "./tariff-annual-claim";

export interface ActualTariffAnnualPayment {
  readonly grossCents: number;
  readonly payoutMonth: string;
}
export interface SavedTariffAnnualClaim {
  readonly claim: TariffAnnualClaim;
  readonly actualPayment: ActualTariffAnnualPayment | null;
  readonly revoked: boolean;
  readonly revision: number;
  readonly updatedAt: string;
}
export interface SaveTariffAnnualClaimInput {
  readonly claim: TariffAnnualClaim;
  readonly actualPayment: ActualTariffAnnualPayment | null;
  readonly expected: SavedTariffAnnualClaim | null;
}
export const TARIFF_ANNUAL_CLAIM_LIMIT = 4096;
export const TARIFF_ANNUAL_CLAIM_TEST_LOCK =
  "Bitte zuerst alle Testlabor-Versuche beenden. Persönliche Sonderzahlungsangaben bleiben währenddessen unverändert.";

export function validateActualTariffAnnualPayment(
  value: unknown,
): ActualTariffAnnualPayment | null {
  if (value === null) return null;
  if (
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== 2 ||
    !Object.hasOwn(value, "grossCents") ||
    !Object.hasOwn(value, "payoutMonth")
  )
    throw new UserFacingError("Ungültige tarifliche Zahlungsbestätigung.");
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.grossCents !== "number" ||
    !Number.isSafeInteger(raw.grossCents) ||
    raw.grossCents < 0 ||
    raw.grossCents > 1_000_000_000
  )
    throw new UserFacingError("Ungültiger Sonderzahlungsbetrag.");
  const payoutMonth = requireLocalMonth(raw.payoutMonth);
  if (payoutMonth < "1900-01" || payoutMonth > "4099-12")
    throw new UserFacingError("Ungültiger Auszahlungsmonat.");
  return Object.freeze({ grossCents: raw.grossCents, payoutMonth });
}
export function validateSavedTariffAnnualClaim(value: unknown): SavedTariffAnnualClaim {
  const keys = ["claim", "actualPayment", "revoked", "revision", "updatedAt"];
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    throw new UserFacingError("Ungültiger gespeicherter Tarif-Jahresanspruch.");
  const raw = value as Record<string, unknown>;
  if (typeof raw.revoked !== "boolean") throw new UserFacingError("Ungültiger Widerrufsstatus.");
  if (!Number.isSafeInteger(raw.revision))
    throw new UserFacingError("Ungültige Revision des Tarif-Jahresanspruchs.");
  return Object.freeze({
    claim: validateTariffAnnualClaim(raw.claim),
    actualPayment: validateActualTariffAnnualPayment(raw.actualPayment),
    revoked: raw.revoked,
    revision: requirePositiveRevision(raw.revision),
    updatedAt: requireInstant(raw.updatedAt, "Tarif-Jahresanspruch"),
  });
}
export function validateSavedTariffAnnualClaims(value: unknown): readonly SavedTariffAnnualClaim[] {
  if (!Array.isArray(value) || value.length > TARIFF_ANNUAL_CLAIM_LIMIT)
    throw new UserFacingError("Ungültige Tarif-Jahresansprüche.");
  const seen = new Set<string>();
  return Object.freeze(
    value.map((item) => {
      const row = validateSavedTariffAnnualClaim(item);
      const key = row.claim.year + ":" + row.claim.id;
      if (seen.has(key)) throw new UserFacingError("Doppelte Tarif-Jahresansprüche.");
      seen.add(key);
      return row;
    }),
  );
}
