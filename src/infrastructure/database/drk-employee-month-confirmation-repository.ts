import { Temporal } from "@js-temporal/polyfill";
import type { SQLiteDatabase } from "expo-sqlite";
import { ConcurrencyError } from "@/domain/errors";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import { resolveRemunerationProfile } from "@/domain/remuneration-profile";
import {
  isCurrentDrkEmployeeMonthConfirmation,
  isDrkEmployeePackageId,
  validateSavedDrkEmployeeMonthConfirmation,
  type SavedDrkEmployeeMonthConfirmation,
  type SaveDrkEmployeeMonthConfirmationInput,
} from "@/domain/saved-drk-employee-month-confirmation";
import { requireLocalMonth } from "@/domain/validation";
import { listRemunerationProfiles } from "./remuneration-profile-repository";
import { withImmediateTransaction } from "./transaction";

export const DRK_EMPLOYEE_MONTH_CONFIRMATION_COLUMNS = ["month", "confirmation_json"] as const;
export interface DrkEmployeeMonthConfirmationRow {
  readonly month: string;
  readonly confirmation_json: string;
}

export function mapDrkEmployeeMonthConfirmationRow(
  value: unknown,
): SavedDrkEmployeeMonthConfirmation {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Ungültige DRK-Monatsbestätigung.");
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).length !== DRK_EMPLOYEE_MONTH_CONFIRMATION_COLUMNS.length ||
    DRK_EMPLOYEE_MONTH_CONFIRMATION_COLUMNS.some((key) => !Object.hasOwn(row, key)) ||
    typeof row.confirmation_json !== "string"
  )
    throw new Error("Ungültige DRK-Monatsbestätigung.");
  const parsed = validateSavedDrkEmployeeMonthConfirmation(JSON.parse(row.confirmation_json));
  if (row.month !== parsed.month) throw new Error("Widersprüchlicher DRK-Abrechnungsmonat.");
  return parsed;
}

export async function listDrkEmployeeMonthConfirmations(
  db: SQLiteDatabase,
): Promise<readonly SavedDrkEmployeeMonthConfirmation[]> {
  const rows = await db.getAllAsync<DrkEmployeeMonthConfirmationRow>(
    "SELECT month,confirmation_json FROM drk_employee_month_confirmations ORDER BY month",
  );
  return Object.freeze(rows.map(mapDrkEmployeeMonthConfirmationRow));
}

export async function loadDrkEmployeeMonthConfirmation(
  db: SQLiteDatabase,
  month: string,
): Promise<SavedDrkEmployeeMonthConfirmation | null> {
  const row = await db.getFirstAsync<DrkEmployeeMonthConfirmationRow>(
    "SELECT month,confirmation_json FROM drk_employee_month_confirmations WHERE month=?",
    requireLocalMonth(month),
  );
  return row === null ? null : mapDrkEmployeeMonthConfirmationRow(row);
}

/** Prior profile revisions remain historical, but cannot reference a missing/future profile. */
export function requireDrkEmployeeMonthConfirmationParent(
  value: SavedDrkEmployeeMonthConfirmation,
  profiles: readonly DatedRemunerationProfile[],
): void {
  const profile = profiles.find((item) => item.effectiveFrom === value.profileEffectiveFrom);
  if (!profile || value.profileRevision > profile.revision)
    throw new Error("Ungültige Vergütungsprofilreferenz der DRK-Monatsbestätigung.");
  if (value.profileRevision !== profile.revision) return;
  if (!isCurrentDrkEmployeeMonthConfirmation(value, profile, value.ruleVersionId))
    throw new Error("Widersprüchliche DRK-Tarifzuordnung.");
}

export async function saveDrkEmployeeMonthConfirmation(
  db: SQLiteDatabase,
  input: SaveDrkEmployeeMonthConfirmationInput,
): Promise<SavedDrkEmployeeMonthConfirmation> {
  const month = requireLocalMonth(input.month);
  for (const revision of [input.expectedRevision, input.expectedProfileRevision])
    if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER)
      throw new Error("Ungültige DRK-Bestätigungsrevision.");
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
      !isDrkEmployeePackageId(selection.packageId) ||
      selection.region !== "BTG"
    )
      throw new Error("Für diesen Monat ist kein DRK-Beschäftigtenprofil ausgewählt.");
    const prior = await loadDrkEmployeeMonthConfirmation(tx, month);
    if ((prior?.revision ?? 0) !== input.expectedRevision)
      throw new ConcurrencyError("Die DRK-Monatsbestätigung wurde geändert. Bitte neu laden.");
    const stamp = new Date(
      Math.max(Date.now(), prior ? Date.parse(prior.updatedAt) : 0),
    ).toISOString();
    const saved = validateSavedDrkEmployeeMonthConfirmation({
      month,
      profileEffectiveFrom: input.profileEffectiveFrom,
      profileRevision: profile.revision,
      packageId: selection.packageId,
      ruleVersionId: input.ruleVersionId,
      variantId: selection.variant,
      regionId: "BTG",
      groupId: selection.group.toLowerCase(),
      stepId: `s${selection.level}`,
      contractedWeeklyMinutes: profile.data.weeklyMinutes,
      fullTimeWeeklyMinutes: selection.fullTimeWeeklyMinutes,
      drkApplicabilityConfirmed: input.drkApplicabilityConfirmed,
      annexAssignmentConfirmed: input.annexAssignmentConfirmed,
      payGroupAndStepConfirmed: input.payGroupAndStepConfirmed,
      weeklyTimeBasisConfirmed: input.weeklyTimeBasisConfirmed,
      fullMonthBaseEntitlementConfirmed: input.fullMonthBaseEntitlementConfirmed,
      revision: input.expectedRevision + 1,
      confirmedAt:
        prior !== null && isCurrentDrkEmployeeMonthConfirmation(prior, profile, input.ruleVersionId)
          ? prior.confirmedAt
          : stamp,
      updatedAt: stamp,
    });
    await tx.runAsync(
      `INSERT INTO drk_employee_month_confirmations(month,confirmation_json) VALUES(?,?)
       ON CONFLICT(month) DO UPDATE SET confirmation_json=excluded.confirmation_json`,
      month,
      JSON.stringify(saved),
    );
    return saved;
  });
}
