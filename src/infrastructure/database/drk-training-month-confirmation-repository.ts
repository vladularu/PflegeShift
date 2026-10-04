import { Temporal } from "@js-temporal/polyfill";
import type { SQLiteDatabase } from "expo-sqlite";
import { ConcurrencyError } from "@/domain/errors";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import { resolveRemunerationProfile } from "@/domain/remuneration-profile";
import {
  isCurrentDrkTrainingMonthConfirmation,
  validateSavedDrkTrainingMonthConfirmation,
  type SavedDrkTrainingMonthConfirmation,
  type SaveDrkTrainingMonthConfirmationInput,
} from "@/domain/saved-drk-training-month-confirmation";
import { trainingProfileForDate, type SavedTrainingProfile } from "@/domain/training-data";
import { requireLocalMonth } from "@/domain/validation";
import { listRemunerationProfiles } from "./remuneration-profile-repository";
import { listTrainingProfiles } from "./training-repository";
import { withImmediateTransaction } from "./transaction";

export const DRK_TRAINING_MONTH_CONFIRMATION_COLUMNS = ["month", "confirmation_json"] as const;
export interface DrkTrainingMonthConfirmationRow {
  readonly month: string;
  readonly confirmation_json: string;
}

export function mapDrkTrainingMonthConfirmationRow(
  value: unknown,
): SavedDrkTrainingMonthConfirmation {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Ungültige DRK-Ausbildungsbestätigung.");
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).length !== DRK_TRAINING_MONTH_CONFIRMATION_COLUMNS.length ||
    DRK_TRAINING_MONTH_CONFIRMATION_COLUMNS.some((key) => !Object.hasOwn(row, key)) ||
    typeof row.confirmation_json !== "string"
  )
    throw new Error("Ungültige DRK-Ausbildungsbestätigung.");
  const parsed = validateSavedDrkTrainingMonthConfirmation(JSON.parse(row.confirmation_json));
  if (row.month !== parsed.month) throw new Error("Widersprüchlicher DRK-Ausbildungsmonat.");
  return parsed;
}

export async function listDrkTrainingMonthConfirmations(
  db: SQLiteDatabase,
): Promise<readonly SavedDrkTrainingMonthConfirmation[]> {
  const rows = await db.getAllAsync<DrkTrainingMonthConfirmationRow>(
    "SELECT month,confirmation_json FROM drk_training_month_confirmations ORDER BY month",
  );
  return Object.freeze(rows.map(mapDrkTrainingMonthConfirmationRow));
}

export async function loadDrkTrainingMonthConfirmation(
  db: SQLiteDatabase,
  month: string,
): Promise<SavedDrkTrainingMonthConfirmation | null> {
  const row = await db.getFirstAsync<DrkTrainingMonthConfirmationRow>(
    "SELECT month,confirmation_json FROM drk_training_month_confirmations WHERE month=?",
    requireLocalMonth(month),
  );
  return row === null ? null : mapDrkTrainingMonthConfirmationRow(row);
}

/** Historical revisions may remain, but both parent profiles must still exist. */
export function requireDrkTrainingMonthConfirmationParents(
  value: SavedDrkTrainingMonthConfirmation,
  remunerationProfiles: readonly DatedRemunerationProfile[],
  trainingProfiles: readonly SavedTrainingProfile[],
): void {
  const remuneration = remunerationProfiles.find(
    (item) => item.effectiveFrom === value.remunerationProfileEffectiveFrom,
  );
  const training = trainingProfiles.find(
    (item) => item.data.effectiveFrom === value.trainingProfileEffectiveFrom,
  );
  if (
    !remuneration ||
    !training ||
    value.remunerationProfileRevision > remuneration.revision ||
    value.trainingProfileRevision > training.revision
  )
    throw new Error("Ungültige Profilreferenz der DRK-Ausbildungsbestätigung.");
  if (
    value.remunerationProfileRevision === remuneration.revision &&
    value.trainingProfileRevision === training.revision &&
    !isCurrentDrkTrainingMonthConfirmation(value, remuneration, training, value.ruleVersionId)
  )
    throw new Error("Widersprüchliche DRK-Ausbildungstarifzuordnung.");
}

export async function saveDrkTrainingMonthConfirmation(
  db: SQLiteDatabase,
  input: SaveDrkTrainingMonthConfirmationInput,
): Promise<SavedDrkTrainingMonthConfirmation> {
  const month = requireLocalMonth(input.month);
  for (const revision of [
    input.expectedRevision,
    input.expectedRemunerationProfileRevision,
    input.expectedTrainingProfileRevision,
  ])
    if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER)
      throw new Error("Ungültige DRK-Ausbildungsrevision.");
  const first = `${month}-01`;
  const last = `${month}-${String(Temporal.PlainYearMonth.from(month).daysInMonth).padStart(2, "0")}`;
  return withImmediateTransaction(db, async (tx) => {
    const remunerationProfiles = await listRemunerationProfiles(tx);
    const trainingProfiles = await listTrainingProfiles(tx);
    const remuneration = remunerationProfiles.find(
      (item) => item.effectiveFrom === input.remunerationProfileEffectiveFrom,
    );
    const training = trainingProfiles.find(
      (item) => item.data.effectiveFrom === input.trainingProfileEffectiveFrom,
    );
    if (
      !remuneration ||
      !training ||
      remuneration.revision !== input.expectedRemunerationProfileRevision ||
      training.revision !== input.expectedTrainingProfileRevision ||
      resolveRemunerationProfile(remunerationProfiles, first).profile !== remuneration ||
      resolveRemunerationProfile(remunerationProfiles, last).profile !== remuneration ||
      trainingProfileForDate(trainingProfiles, first) !== training ||
      trainingProfileForDate(trainingProfiles, last) !== training
    )
      throw new ConcurrencyError("Der Profilstand wurde geändert. Bitte neu laden.");
    const selection = remuneration.data.selection;
    const details = training.data.training;
    if (
      selection.kind !== "tariff" ||
      selection.packageId !== "drk-rtv-training" ||
      selection.region !== "BTG" ||
      training.data.status !== "training" ||
      details === null ||
      details.legalBasis === "UNKNOWN" ||
      details.year === null ||
      details.yearConfirmedFrom === null ||
      details.yearConfirmedFrom > first ||
      details.startedOn > first ||
      (details.expectedEndOn !== null && details.expectedEndOn < last) ||
      selection.level !== String(details.year) ||
      remuneration.data.weeklyMinutes !== selection.fullTimeWeeklyMinutes ||
      (selection.variant === "ANLAGE_3" && details.legalBasis === "PFLBG")
    )
      throw new Error("Für diesen Monat liegt kein vollständiges DRK-Ausbildungsprofil vor.");
    const prior = await loadDrkTrainingMonthConfirmation(tx, month);
    if ((prior?.revision ?? 0) !== input.expectedRevision)
      throw new ConcurrencyError("Die DRK-Ausbildungsbestätigung wurde geändert. Bitte neu laden.");
    const stamp = new Date(
      Math.max(Date.now(), prior ? Date.parse(prior.updatedAt) : 0),
    ).toISOString();
    const saved = validateSavedDrkTrainingMonthConfirmation({
      month,
      remunerationProfileEffectiveFrom: remuneration.effectiveFrom,
      remunerationProfileRevision: remuneration.revision,
      trainingProfileEffectiveFrom: training.data.effectiveFrom,
      trainingProfileRevision: training.revision,
      packageId: "drk-rtv-training",
      ruleVersionId: input.ruleVersionId,
      variantId: selection.variant,
      regionId: "BTG",
      groupId: selection.group.toLowerCase(),
      trainingYear: details.year,
      weeklyMinutes: remuneration.data.weeklyMinutes,
      fullTimeWeeklyMinutes: selection.fullTimeWeeklyMinutes,
      trainingProfession: details.profession,
      trainingLegalBasis: details.legalBasis,
      trainingStartedOn: details.startedOn,
      trainingExpectedEndOn: details.expectedEndOn,
      trainingYearConfirmedFrom: details.yearConfirmedFrom,
      drkApplicabilityConfirmed: input.drkApplicabilityConfirmed,
      trainingCategoryConfirmed: input.trainingCategoryConfirmed,
      trainingYearConfirmed: input.trainingYearConfirmed,
      fullMonthBaseEntitlementConfirmed: input.fullMonthBaseEntitlementConfirmed,
      fullTimeTrainingConfirmed: input.fullTimeTrainingConfirmed,
      revision: input.expectedRevision + 1,
      confirmedAt:
        prior !== null &&
        isCurrentDrkTrainingMonthConfirmation(prior, remuneration, training, input.ruleVersionId)
          ? prior.confirmedAt
          : stamp,
      updatedAt: stamp,
    });
    await tx.runAsync(
      `INSERT INTO drk_training_month_confirmations(month,confirmation_json) VALUES(?,?)
       ON CONFLICT(month) DO UPDATE SET confirmation_json=excluded.confirmation_json`,
      month,
      JSON.stringify(saved),
    );
    return saved;
  });
}
