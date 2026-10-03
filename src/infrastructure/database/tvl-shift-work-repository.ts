import type { SQLiteDatabase } from "expo-sqlite";
import { ConcurrencyError } from "@/domain/errors";
import {
  validateTvlShiftWork,
  isCurrentTvlServiceFacts,
  type SavedTvlShiftWork,
  type SaveTvlShiftWorkInput,
} from "@/domain/saved-tvl-shift-work";
import {
  resolveRemunerationProfile,
  type DatedRemunerationProfile,
} from "@/domain/remuneration-profile";
import type { ShiftEntry } from "@/domain/types";
import { remunerationShiftDays } from "@/engine/remuneration-shift-days";
import { validateTvlBurnCareIntervals } from "@/domain/tvl-burn-care";
import { requireTvlBurnCareIntervalParents } from "@/engine/tvl-burn-care-intervals";
import { isPayWorkShift } from "@/engine/tvoed-pattern";
import { withImmediateTransaction } from "./transaction";
import { mapShift } from "./calendar-entry-repository";
import { listRemunerationProfiles } from "./remuneration-profile-repository";
import { loadProfile } from "./profile-repository";

export const TVL_SHIFT_WORK_COLUMNS = [
  "shift_id",
  "profile_effective_from",
  "confirmation_json",
] as const;
export interface TvlShiftWorkRow {
  readonly shift_id: string;
  readonly profile_effective_from: string;
  readonly confirmation_json: string;
}
export function mapTvlShiftWorkRow(value: unknown): SavedTvlShiftWork {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Ungültige TV-L-Bestätigung.");
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).length !== TVL_SHIFT_WORK_COLUMNS.length ||
    TVL_SHIFT_WORK_COLUMNS.some((key) => !Object.hasOwn(row, key)) ||
    typeof row.confirmation_json !== "string"
  )
    throw new Error("Ungültige TV-L-Bestätigung.");
  const parsed = validateTvlShiftWork(JSON.parse(row.confirmation_json));
  if (row.shift_id !== parsed.shiftId || row.profile_effective_from !== parsed.profileEffectiveFrom)
    throw new Error("Widersprüchliche Dienst-/Profilzuordnung.");
  return parsed;
}
export async function listTvlShiftWork(db: SQLiteDatabase): Promise<readonly SavedTvlShiftWork[]> {
  const rows = await db.getAllAsync<TvlShiftWorkRow>(
    "SELECT shift_id,profile_effective_from,confirmation_json FROM tvl_shift_work ORDER BY shift_id,profile_effective_from",
  );
  return Object.freeze(rows.map(mapTvlShiftWorkRow));
}

/** Backup imports preserve stale rows, but not absent parents or future revisions. */
export function requireTvlShiftWorkParents(
  value: SavedTvlShiftWork,
  shift: ShiftEntry | undefined,
  profiles: readonly DatedRemunerationProfile[],
): void {
  const profile = profiles.find((item) => item.effectiveFrom === value.profileEffectiveFrom);
  if (
    !shift ||
    shift.id !== value.shiftId ||
    value.shiftRevision > shift.revision ||
    !profile ||
    value.profileRevision > profile.revision
  )
    throw new Error("Ungültige Dienst-/Profilreferenz der TV-L-Bestätigung.");
  if (
    (value.shiftWork === null && value.burnCareIntervals == null) ||
    value.shiftRevision !== shift.revision ||
    value.shiftDate !== shift.date ||
    value.shiftUpdatedAt !== shift.updatedAt ||
    value.profileRevision !== profile.revision
  )
    return;
  if (shift.deletedAt !== null) return; // Tombstones keep previously valid history.
  if (
    !isPayWorkShift(shift) ||
    profile.data.selection.kind !== "tariff" ||
    !["tvl-kr-tdl", "tval-pflege-tdl"].includes(profile.data.selection.packageId) ||
    !remunerationShiftDays(shift, value.timeZone).some(
      (day) => resolveRemunerationProfile(profiles, day.date).profile === profile,
    )
  )
    throw new Error("Diese TV-L-Bestätigung gehört nicht zu diesem Dienstzeitraum.");
  if (value.burnCareIntervals !== undefined && value.burnCareIntervals !== null)
    requireTvlBurnCareIntervalParents(
      value.burnCareIntervals,
      shift,
      value.timeZone,
      profile,
      profiles,
    );
}

export async function saveTvlShiftWork(
  db: SQLiteDatabase,
  input: SaveTvlShiftWorkInput,
): Promise<SavedTvlShiftWork> {
  const owned = {
    ...input,
    ...(Object.hasOwn(input, "burnCareIntervals")
      ? { burnCareIntervals: validateTvlBurnCareIntervals(input.burnCareIntervals) }
      : {}),
  };
  for (const revision of [
    owned.expectedRevision,
    owned.expectedShiftRevision,
    owned.expectedProfileRevision,
  ])
    if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER)
      throw new Error("Ungültige Bestätigungsrevision.");
  return withImmediateTransaction(db, async (tx) => {
    const row = await tx.getFirstAsync<Parameters<typeof mapShift>[0]>(
      "SELECT * FROM shift_entries WHERE id=? AND deleted_at IS NULL",
      owned.shiftId,
    );
    if (!row) throw new ConcurrencyError("Der Dienst ist nicht mehr verfügbar.");
    const shift = mapShift(row);
    const work = await loadProfile(tx);
    if (
      !isPayWorkShift(shift) ||
      shift.revision !== owned.expectedShiftRevision ||
      shift.updatedAt !== owned.expectedShiftUpdatedAt ||
      work?.timeZone !== owned.timeZone
    )
      throw new ConcurrencyError("Dienst oder Zeitzone wurden geändert. Bitte neu laden.");
    const profiles = await listRemunerationProfiles(tx);
    const profile = profiles.find((item) => item.effectiveFrom === owned.profileEffectiveFrom);
    if (
      !profile ||
      profile.revision !== owned.expectedProfileRevision ||
      profile.data.selection.kind !== "tariff" ||
      !["tvl-kr-tdl", "tval-pflege-tdl"].includes(profile.data.selection.packageId) ||
      !remunerationShiftDays(shift, owned.timeZone).some(
        (day) => resolveRemunerationProfile(profiles, day.date).profile === profile,
      )
    )
      throw new ConcurrencyError("Der Vergütungsstand wurde geändert. Bitte neu laden.");
    const priorRow = await tx.getFirstAsync<TvlShiftWorkRow>(
      "SELECT shift_id,profile_effective_from,confirmation_json FROM tvl_shift_work WHERE shift_id=? AND profile_effective_from=?",
      owned.shiftId,
      owned.profileEffectiveFrom,
    );
    const prior = priorRow === null ? null : mapTvlShiftWorkRow(priorRow);
    if ((prior?.revision ?? 0) !== owned.expectedRevision)
      throw new ConcurrencyError(
        "Die Dienstbestätigung wurde inzwischen geändert. Bitte neu laden.",
      );
    const stamp = new Date(
      Math.max(Date.now(), prior ? Date.parse(prior.updatedAt) : 0),
    ).toISOString();
    const saved = validateTvlShiftWork({
      ...(Object.hasOwn(owned, "burnCareIntervals")
        ? { burnCareIntervals: owned.burnCareIntervals }
        : prior && Object.hasOwn(prior, "burnCareIntervals")
          ? {
              burnCareIntervals: isCurrentTvlServiceFacts(prior, shift, owned.timeZone, profile)
                ? prior.burnCareIntervals
                : null,
            }
          : {}),
      shiftId: shift.id,
      shiftRevision: shift.revision,
      shiftDate: shift.date,
      shiftUpdatedAt: shift.updatedAt,
      timeZone: owned.timeZone,
      profileEffectiveFrom: owned.profileEffectiveFrom,
      profileRevision: owned.expectedProfileRevision,
      shiftWork: owned.shiftWork,
      revision: owned.expectedRevision + 1,
      confirmedAt: stamp,
      updatedAt: stamp,
    });
    requireTvlShiftWorkParents(saved, shift, profiles);
    const otherRows = await tx.getAllAsync<TvlShiftWorkRow>(
      "SELECT shift_id,profile_effective_from,confirmation_json FROM tvl_shift_work WHERE shift_id=?",
      saved.shiftId,
    );
    requireTvlBurnCareCollection(
      [
        ...otherRows
          .map(mapTvlShiftWorkRow)
          .filter((item) => item.profileEffectiveFrom !== saved.profileEffectiveFrom),
        saved,
      ],
      shift,
      profiles,
    );
    await tx.runAsync(
      `INSERT INTO tvl_shift_work(shift_id,profile_effective_from,confirmation_json) VALUES(?,?,?)
      ON CONFLICT(shift_id,profile_effective_from) DO UPDATE SET confirmation_json=excluded.confirmation_json`,
      saved.shiftId,
      saved.profileEffectiveFrom,
      JSON.stringify(saved),
    );
    return saved;
  });
}

/** Multiple dated profiles must never allocate more activity than the one real service contains. */
export function requireTvlBurnCareCollection(
  values: readonly SavedTvlShiftWork[],
  shift: ShiftEntry,
  profiles: readonly DatedRemunerationProfile[],
): void {
  const current = values.filter((value) => {
    const profile = profiles.find((p) => p.effectiveFrom === value.profileEffectiveFrom);
    return (
      profile &&
      value.burnCareIntervals != null &&
      isCurrentTvlServiceFacts(value, shift, value.timeZone, profile)
    );
  });
  if (!current.length) return;
  // Other timezones are preserved as stale history, not mixed into the current allocation.
  for (const zone of new Set(current.map((value) => value.timeZone))) {
    const total = current
      .filter((value) => value.timeZone === zone)
      .flatMap((value) => value.burnCareIntervals ?? [])
      .reduce((sum, interval) => sum + interval.until - interval.from, 0);
    const net = remunerationShiftDays(shift, zone).reduce((sum, day) => sum + day.netMinutes, 0);
    if (total > net)
      throw new Error("Schwerbrandpflegezeiten überschreiten zusammen die Dienstzeit ohne Pause.");
  }
}
