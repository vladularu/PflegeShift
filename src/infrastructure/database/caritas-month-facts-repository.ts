import { Temporal } from "@js-temporal/polyfill";
import type { SQLiteDatabase } from "expo-sqlite";
import { ConcurrencyError } from "@/domain/errors";
import {
  requireCaritasMonth,
  validateSavedCaritasMonthFacts,
  type SavedCaritasMonthFacts,
  type SaveCaritasMonthFactsInput,
} from "@/domain/saved-caritas-month-facts";
import {
  resolveRemunerationProfile,
  type DatedRemunerationProfile,
} from "@/domain/remuneration-profile";
import { listRemunerationProfiles } from "./remuneration-profile-repository";
import { withImmediateTransaction } from "./transaction";

export const CARITAS_MONTH_FACTS_COLUMNS = ["month", "facts_json"] as const;
export interface CaritasMonthFactsRow {
  readonly month: string;
  readonly facts_json: string;
}

export function mapCaritasMonthFactsRow(value: unknown): SavedCaritasMonthFacts {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Ungültige Caritas-Monatsbestätigung.");
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).length !== CARITAS_MONTH_FACTS_COLUMNS.length ||
    CARITAS_MONTH_FACTS_COLUMNS.some((key) => !Object.hasOwn(row, key)) ||
    typeof row.facts_json !== "string"
  )
    throw new Error("Ungültige Caritas-Monatsbestätigung.");
  const parsed = validateSavedCaritasMonthFacts(JSON.parse(row.facts_json));
  if (row.month !== parsed.month) throw new Error("Widersprüchlicher Caritas-Abrechnungsmonat.");
  return parsed;
}

export async function listCaritasMonthFacts(
  db: SQLiteDatabase,
): Promise<readonly SavedCaritasMonthFacts[]> {
  const rows = await db.getAllAsync<CaritasMonthFactsRow>(
    "SELECT month,facts_json FROM caritas_month_facts ORDER BY month",
  );
  return Object.freeze(rows.map(mapCaritasMonthFactsRow));
}

export async function loadCaritasMonthFacts(
  db: SQLiteDatabase,
  month: string,
): Promise<SavedCaritasMonthFacts | null> {
  const row = await db.getFirstAsync<CaritasMonthFactsRow>(
    "SELECT month,facts_json FROM caritas_month_facts WHERE month=?",
    requireCaritasMonth(month),
  );
  return row === null ? null : mapCaritasMonthFactsRow(row);
}

/** Historical rows remain valid after a later correction, but cannot point to future revisions. */
export function requireCaritasMonthFactsParent(
  value: SavedCaritasMonthFacts,
  profiles: readonly DatedRemunerationProfile[],
): void {
  const profile = profiles.find((item) => item.effectiveFrom === value.profileEffectiveFrom);
  if (!profile || value.profileRevision > profile.revision)
    throw new Error("Ungültige Vergütungsprofilreferenz der Caritas-Monatsbestätigung.");
  if (value.profileRevision !== profile.revision) return;
  const selection = profile.data.selection;
  if (
    selection.kind !== "tariff" ||
    selection.packageId !== value.packageId ||
    selection.variant !== value.variantId ||
    selection.region !== value.regionId
  )
    throw new Error("Widersprüchliche Caritas-Tarifzuordnung.");
}

export async function saveCaritasMonthFacts(
  db: SQLiteDatabase,
  input: SaveCaritasMonthFactsInput,
): Promise<SavedCaritasMonthFacts> {
  const month = requireCaritasMonth(input.month);
  for (const revision of [input.expectedRevision, input.expectedProfileRevision])
    if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER)
      throw new Error("Ungültige Bestätigungsrevision.");
  const first = `${month}-01`;
  const last = `${month}-${String(Temporal.PlainYearMonth.from(month).daysInMonth).padStart(2, "0")}`;
  return withImmediateTransaction(db, async (tx) => {
    const profiles = await listRemunerationProfiles(tx);
    const profile = profiles.find((item) => item.effectiveFrom === input.profileEffectiveFrom);
    if (
      !profile ||
      profile.revision !== input.expectedProfileRevision ||
      resolveRemunerationProfile(profiles, first).profile !== profile ||
      resolveRemunerationProfile(profiles, last).profile !== profile
    )
      throw new ConcurrencyError("Der Vergütungsstand wurde geändert. Bitte neu laden.");
    const selection = profile.data.selection;
    if (selection.kind !== "tariff" || !selection.packageId.startsWith("avr-caritas-p-"))
      throw new Error("Für diesen Monat ist kein Caritas-Pflegeprofil ausgewählt.");
    const prior = await loadCaritasMonthFacts(tx, month);
    if ((prior?.revision ?? 0) !== input.expectedRevision)
      throw new ConcurrencyError(
        "Die Monatsbestätigung wurde inzwischen geändert. Bitte neu laden.",
      );
    const stamp = new Date(
      Math.max(Date.now(), prior ? Date.parse(prior.updatedAt) : 0),
    ).toISOString();
    const saved = validateSavedCaritasMonthFacts({
      month,
      profileEffectiveFrom: input.profileEffectiveFrom,
      profileRevision: profile.revision,
      packageId: selection.packageId,
      ruleVersionId: input.ruleVersionId,
      variantId: selection.variant,
      regionId: selection.region,
      fullMonthEmploymentConfirmed: input.fullMonthEmploymentConfirmed,
      fullMonthlyBaseEntitlementConfirmed: input.fullMonthlyBaseEntitlementConfirmed,
      fixedAllowanceClaim: input.fixedAllowanceClaim,
      careAllowanceClaim: input.careAllowanceClaim,
      localAgreement: input.localAgreement,
      revision: input.expectedRevision + 1,
      confirmedAt: stamp,
      updatedAt: stamp,
    });
    await tx.runAsync(
      `INSERT INTO caritas_month_facts(month,facts_json) VALUES(?,?)
      ON CONFLICT(month) DO UPDATE SET facts_json=excluded.facts_json`,
      month,
      JSON.stringify(saved),
    );
    return saved;
  });
}
