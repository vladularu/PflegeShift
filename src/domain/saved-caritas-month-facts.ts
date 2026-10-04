import { Temporal } from "@js-temporal/polyfill";
import type { DatedRemunerationProfile } from "./remuneration-profile";
import { requireRemunerationDate } from "./remuneration-profile";
import { requireInstant } from "./validation";

export type CaritasClaim = "ENTITLED" | "NOT_ENTITLED" | "UNKNOWN";
export type CaritasLocalAgreement = "NONE_CONFIRMED" | "UNKNOWN" | "DIFFERENT";

/** Confirmations are scoped to one profile revision and one reviewed rule version. */
export interface SavedCaritasMonthFacts {
  readonly month: string;
  readonly profileEffectiveFrom: string;
  readonly profileRevision: number;
  readonly packageId: string;
  readonly ruleVersionId: string;
  readonly variantId: string;
  readonly regionId: string;
  readonly fullMonthEmploymentConfirmed: boolean | null;
  readonly fullMonthlyBaseEntitlementConfirmed: boolean | null;
  readonly fixedAllowanceClaim: CaritasClaim;
  readonly careAllowanceClaim: CaritasClaim;
  readonly localAgreement: CaritasLocalAgreement;
  readonly revision: number;
  readonly confirmedAt: string;
  readonly updatedAt: string;
}

export interface SaveCaritasMonthFactsInput {
  readonly month: string;
  readonly profileEffectiveFrom: string;
  readonly expectedProfileRevision: number;
  readonly ruleVersionId: string;
  readonly fullMonthEmploymentConfirmed: boolean | null;
  readonly fullMonthlyBaseEntitlementConfirmed: boolean | null;
  readonly fixedAllowanceClaim: CaritasClaim;
  readonly careAllowanceClaim: CaritasClaim;
  readonly localAgreement: CaritasLocalAgreement;
  readonly expectedRevision: number;
}

const KEYS = [
  "month",
  "profileEffectiveFrom",
  "profileRevision",
  "packageId",
  "ruleVersionId",
  "variantId",
  "regionId",
  "fullMonthEmploymentConfirmed",
  "fullMonthlyBaseEntitlementConfirmed",
  "fixedAllowanceClaim",
  "careAllowanceClaim",
  "localAgreement",
  "revision",
  "confirmedAt",
  "updatedAt",
] as const;

export function requireCaritasMonth(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/u.test(value))
    throw new Error("Ungültiger Caritas-Abrechnungsmonat.");
  const month = Temporal.PlainYearMonth.from(value);
  if (month.toString() !== value) throw new Error("Ungültiger Caritas-Abrechnungsmonat.");
  return value;
}

function identifier(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9._-]{0,100}$/iu.test(value))
    throw new Error("Ungültige Caritas-Tarifzuordnung.");
  return value;
}

export function validateSavedCaritasMonthFacts(value: unknown): SavedCaritasMonthFacts {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Ungültige Caritas-Monatsbestätigung.");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== KEYS.length || KEYS.some((key) => !Object.hasOwn(row, key)))
    throw new Error("Unbekanntes Format der Caritas-Monatsbestätigung.");
  for (const revision of [row.profileRevision, row.revision])
    if (!Number.isSafeInteger(revision) || (revision as number) < 1)
      throw new Error("Ungültige Bestätigungsrevision.");
  for (const fact of [row.fullMonthEmploymentConfirmed, row.fullMonthlyBaseEntitlementConfirmed])
    if (fact !== true && fact !== false && fact !== null)
      throw new Error("Ungültige Caritas-Anspruchsbestätigung.");
  if (
    !["ENTITLED", "NOT_ENTITLED", "UNKNOWN"].includes(row.fixedAllowanceClaim as string) ||
    !["ENTITLED", "NOT_ENTITLED", "UNKNOWN"].includes(row.careAllowanceClaim as string) ||
    !["NONE_CONFIRMED", "UNKNOWN", "DIFFERENT"].includes(row.localAgreement as string)
  )
    throw new Error("Ungültige Caritas-Anspruchsbestätigung.");
  const confirmedAt = requireInstant(row.confirmedAt, "Bestätigung");
  const updatedAt = requireInstant(row.updatedAt, "Aktualisierung");
  if (Date.parse(confirmedAt) > Date.parse(updatedAt))
    throw new Error("Ungültiger Bestätigungszeitpunkt.");
  return Object.freeze({
    month: requireCaritasMonth(row.month),
    profileEffectiveFrom: requireRemunerationDate(row.profileEffectiveFrom),
    profileRevision: row.profileRevision as number,
    packageId: identifier(row.packageId),
    ruleVersionId: identifier(row.ruleVersionId),
    variantId: identifier(row.variantId),
    regionId: identifier(row.regionId),
    fullMonthEmploymentConfirmed: row.fullMonthEmploymentConfirmed as boolean | null,
    fullMonthlyBaseEntitlementConfirmed: row.fullMonthlyBaseEntitlementConfirmed as boolean | null,
    fixedAllowanceClaim: row.fixedAllowanceClaim as CaritasClaim,
    careAllowanceClaim: row.careAllowanceClaim as CaritasClaim,
    localAgreement: row.localAgreement as CaritasLocalAgreement,
    revision: row.revision as number,
    confirmedAt,
    updatedAt,
  });
}

export function isCurrentCaritasMonthFacts(
  value: SavedCaritasMonthFacts,
  profile: DatedRemunerationProfile,
  packageId: string,
  ruleVersionId: string,
): boolean {
  const selection = profile.data.selection;
  return (
    profile.effectiveFrom === value.profileEffectiveFrom &&
    profile.revision === value.profileRevision &&
    selection.kind === "tariff" &&
    selection.packageId === value.packageId &&
    selection.variant === value.variantId &&
    selection.region === value.regionId &&
    value.packageId === packageId &&
    value.ruleVersionId === ruleVersionId
  );
}
