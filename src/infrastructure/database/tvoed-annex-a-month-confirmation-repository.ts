import { Temporal } from "@js-temporal/polyfill";
import type { SQLiteDatabase } from "expo-sqlite";
import { ConcurrencyError } from "@/domain/errors";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import { resolveRemunerationProfile } from "@/domain/remuneration-profile";
import {
  isCurrentTvoedAnnexAMonthConfirmation,
  validateSavedTvoedAnnexAMonthConfirmation,
  type SavedTvoedAnnexAMonthConfirmation,
  type SaveTvoedAnnexAMonthConfirmationInput,
} from "@/domain/saved-tvoed-annex-a-month-confirmation";
import { requireLocalMonth } from "@/domain/validation";
import { listRemunerationProfiles } from "./remuneration-profile-repository";
import { withImmediateTransaction } from "./transaction";

export const TVOED_ANNEX_A_MONTH_CONFIRMATION_COLUMNS = ["month", "confirmation_json"] as const;
export interface TvoedAnnexAMonthConfirmationRow {
  readonly month: string;
  readonly confirmation_json: string;
}

export function mapTvoedAnnexAMonthConfirmationRow(
  value: unknown,
): SavedTvoedAnnexAMonthConfirmation {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Ungültige TVöD-Monatsbestätigung.");
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).length !== TVOED_ANNEX_A_MONTH_CONFIRMATION_COLUMNS.length ||
    TVOED_ANNEX_A_MONTH_CONFIRMATION_COLUMNS.some((key) => !Object.hasOwn(row, key)) ||
    typeof row.confirmation_json !== "string"
  )
    throw new Error("Ungültige TVöD-Monatsbestätigung.");
  const parsed = validateSavedTvoedAnnexAMonthConfirmation(JSON.parse(row.confirmation_json));
  if (row.month !== parsed.month) throw new Error("Widersprüchlicher TVöD-Abrechnungsmonat.");
  return parsed;
}

export async function listTvoedAnnexAMonthConfirmations(
  db: SQLiteDatabase,
): Promise<readonly SavedTvoedAnnexAMonthConfirmation[]> {
  const rows = await db.getAllAsync<TvoedAnnexAMonthConfirmationRow>(
    "SELECT month,confirmation_json FROM tvoed_annex_a_month_confirmations ORDER BY month",
  );
  return Object.freeze(rows.map(mapTvoedAnnexAMonthConfirmationRow));
}

export async function loadTvoedAnnexAMonthConfirmation(
  db: SQLiteDatabase,
  month: string,
): Promise<SavedTvoedAnnexAMonthConfirmation | null> {
  const row = await db.getFirstAsync<TvoedAnnexAMonthConfirmationRow>(
    "SELECT month,confirmation_json FROM tvoed_annex_a_month_confirmations WHERE month=?",
    requireLocalMonth(month),
  );
  return row === null ? null : mapTvoedAnnexAMonthConfirmationRow(row);
}

/** Historical rows survive corrections, but cannot point to a future or unrelated profile. */
export function requireTvoedAnnexAMonthConfirmationParent(
  value: SavedTvoedAnnexAMonthConfirmation,
  profiles: readonly DatedRemunerationProfile[],
): void {
  const profile = profiles.find((item) => item.effectiveFrom === value.profileEffectiveFrom);
  if (!profile || value.profileRevision > profile.revision)
    throw new Error("Ungültige Vergütungsprofilreferenz der TVöD-Monatsbestätigung.");
  if (value.profileRevision !== profile.revision) return;
  if (!isCurrentTvoedAnnexAMonthConfirmation(value, profile, value.ruleVersionId))
    throw new Error("Widersprüchliche TVöD-Tarifzuordnung.");
}

export async function saveTvoedAnnexAMonthConfirmation(
  db: SQLiteDatabase,
  input: SaveTvoedAnnexAMonthConfirmationInput,
): Promise<SavedTvoedAnnexAMonthConfirmation> {
  const month = requireLocalMonth(input.month);
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
    if (
      selection.kind !== "tariff" ||
      selection.packageId !== "tvoed-vka-anlage-a" ||
      !["BT_K", "BT_B"].includes(selection.variant) ||
      selection.region !== "VKA"
    )
      throw new Error("Für diesen Monat ist kein TVöD-Anlage-A-Profil ausgewählt.");
    const prior = await loadTvoedAnnexAMonthConfirmation(tx, month);
    if ((prior?.revision ?? 0) !== input.expectedRevision)
      throw new ConcurrencyError(
        "Die Monatsbestätigung wurde inzwischen geändert. Bitte neu laden.",
      );
    const stamp = new Date(
      Math.max(Date.now(), prior ? Date.parse(prior.updatedAt) : 0),
    ).toISOString();
    const saved = validateSavedTvoedAnnexAMonthConfirmation({
      month,
      profileEffectiveFrom: input.profileEffectiveFrom,
      profileRevision: profile.revision,
      packageId: "tvoed-vka-anlage-a",
      ruleVersionId: input.ruleVersionId,
      variantId: selection.variant,
      regionId: "VKA",
      groupId: selection.group.toLowerCase(),
      stepId: `s${selection.level}`,
      contractedWeeklyMinutes: profile.data.weeklyMinutes,
      comparableFullTimeWeeklyMinutes: selection.fullTimeWeeklyMinutes,
      applicabilityConfirmed: input.applicabilityConfirmed,
      comparableFullTimeConfirmed: input.comparableFullTimeConfirmed,
      fullMonthBaseEntitlementConfirmed: input.fullMonthBaseEntitlementConfirmed,
      fullMonthSameContractConfirmed: input.fullMonthSameContractConfirmed,
      revision: input.expectedRevision + 1,
      confirmedAt: stamp,
      updatedAt: stamp,
    });
    await tx.runAsync(
      `INSERT INTO tvoed_annex_a_month_confirmations(month,confirmation_json) VALUES(?,?)
       ON CONFLICT(month) DO UPDATE SET confirmation_json=excluded.confirmation_json`,
      month,
      JSON.stringify(saved),
    );
    return saved;
  });
}
