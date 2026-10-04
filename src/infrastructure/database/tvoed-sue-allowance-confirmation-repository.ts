import { Temporal } from "@js-temporal/polyfill";
import type { SQLiteDatabase } from "expo-sqlite";
import { ConcurrencyError } from "@/domain/errors";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import { resolveRemunerationProfile } from "@/domain/remuneration-profile";
import {
  isCurrentTvoedSueAllowanceConfirmation,
  validateSavedTvoedSueAllowanceConfirmation,
  type SavedTvoedSueAllowanceConfirmation,
  type SaveTvoedSueAllowanceConfirmationInput,
} from "@/domain/saved-tvoed-sue-allowance-confirmation";
import { requireLocalMonth } from "@/domain/validation";
import { listRemunerationProfiles } from "./remuneration-profile-repository";
import { withImmediateTransaction } from "./transaction";

export const TVOED_SUE_ALLOWANCE_CONFIRMATION_COLUMNS = ["month", "confirmation_json"] as const;
export interface TvoedSueAllowanceConfirmationRow {
  readonly month: string;
  readonly confirmation_json: string;
}

export function mapTvoedSueAllowanceConfirmationRow(
  value: unknown,
): SavedTvoedSueAllowanceConfirmation {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Ungültige SuE-Zulagenbestätigung.");
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).length !== TVOED_SUE_ALLOWANCE_CONFIRMATION_COLUMNS.length ||
    TVOED_SUE_ALLOWANCE_CONFIRMATION_COLUMNS.some((key) => !Object.hasOwn(row, key)) ||
    typeof row.confirmation_json !== "string"
  )
    throw new Error("Ungültige SuE-Zulagenbestätigung.");
  const parsed = validateSavedTvoedSueAllowanceConfirmation(JSON.parse(row.confirmation_json));
  if (row.month !== parsed.month) throw new Error("Widersprüchlicher SuE-Abrechnungsmonat.");
  return parsed;
}

export async function listTvoedSueAllowanceConfirmations(
  db: SQLiteDatabase,
): Promise<readonly SavedTvoedSueAllowanceConfirmation[]> {
  const rows = await db.getAllAsync<TvoedSueAllowanceConfirmationRow>(
    "SELECT month,confirmation_json FROM tvoed_sue_allowance_confirmations ORDER BY month",
  );
  return Object.freeze(rows.map(mapTvoedSueAllowanceConfirmationRow));
}

export async function loadTvoedSueAllowanceConfirmation(
  db: SQLiteDatabase,
  month: string,
): Promise<SavedTvoedSueAllowanceConfirmation | null> {
  const row = await db.getFirstAsync<TvoedSueAllowanceConfirmationRow>(
    "SELECT month,confirmation_json FROM tvoed_sue_allowance_confirmations WHERE month=?",
    requireLocalMonth(month),
  );
  return row === null ? null : mapTvoedSueAllowanceConfirmationRow(row);
}

/** Keep stale historical answers, but reject forged future or mismatched parents. */
export function requireTvoedSueAllowanceConfirmationParent(
  value: SavedTvoedSueAllowanceConfirmation,
  profiles: readonly DatedRemunerationProfile[],
): void {
  const profile = profiles.find((item) => item.effectiveFrom === value.profileEffectiveFrom);
  if (!profile || value.profileRevision > profile.revision)
    throw new Error("Ungültige Vergütungsprofilreferenz der SuE-Zulagenbestätigung.");
  if (value.profileRevision !== profile.revision) return;
  if (!isCurrentTvoedSueAllowanceConfirmation(value, profile, value.ruleVersionId))
    throw new Error("Widersprüchliche SuE-Tarifzuordnung.");
}

export async function saveTvoedSueAllowanceConfirmation(
  db: SQLiteDatabase,
  input: SaveTvoedSueAllowanceConfirmationInput,
): Promise<SavedTvoedSueAllowanceConfirmation> {
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
      selection.packageId !== "tvoed-vka-sue-bt-b" ||
      selection.variant !== "BT_B" ||
      selection.region !== "VKA"
    )
      throw new Error("Für diesen Monat ist kein TVöD-SuE-Profil ausgewählt.");
    const prior = await loadTvoedSueAllowanceConfirmation(tx, month);
    if ((prior?.revision ?? 0) !== input.expectedRevision)
      throw new ConcurrencyError(
        "Die Zulagenbestätigung wurde inzwischen geändert. Bitte neu laden.",
      );
    const stamp = new Date(
      Math.max(Date.now(), prior ? Date.parse(prior.updatedAt) : 0),
    ).toISOString();
    const saved = validateSavedTvoedSueAllowanceConfirmation({
      month,
      profileEffectiveFrom: input.profileEffectiveFrom,
      profileRevision: profile.revision,
      packageId: "tvoed-vka-sue-bt-b",
      ruleVersionId: input.ruleVersionId,
      variantId: "BT_B",
      regionId: "VKA",
      groupId: selection.group.toLowerCase(),
      stepId: `s${selection.level}`,
      contractedWeeklyMinutes: profile.data.weeklyMinutes,
      standardFullTimeWeeklyMinutes: selection.fullTimeWeeklyMinutes,
      sectionXxivClassificationConfirmed: input.sectionXxivClassificationConfirmed,
      fullMonthAllowanceEntitlementConfirmed: input.fullMonthAllowanceEntitlementConfirmed,
      caseGroup: input.caseGroup,
      conversionDays: input.conversionDays,
      revision: input.expectedRevision + 1,
      confirmedAt: stamp,
      updatedAt: stamp,
    });
    await tx.runAsync(
      `INSERT INTO tvoed_sue_allowance_confirmations(month,confirmation_json) VALUES(?,?)
       ON CONFLICT(month) DO UPDATE SET confirmation_json=excluded.confirmation_json`,
      month,
      JSON.stringify(saved),
    );
    return saved;
  });
}
