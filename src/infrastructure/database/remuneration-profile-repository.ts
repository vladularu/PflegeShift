import type { SQLiteDatabase } from "expo-sqlite";
import { ConcurrencyError } from "@/domain/errors";
import {
  type DatedRemunerationProfile,
  type SaveDatedRemunerationProfileInput,
  remunerationDataFromLegacy,
  RemunerationProfileError,
  requireRemunerationDate,
  validateRemunerationProfileData,
} from "@/domain/remuneration-profile";
import { requireInstant, requirePositiveRevision } from "@/domain/validation";
import { loadProfile } from "@/infrastructure/database/profile-repository";
import { withImmediateTransaction } from "@/infrastructure/database/transaction";

export const REMUNERATION_PROFILE_COLUMNS = [
  "id",
  "effective_from",
  "data_json",
  "revision",
  "created_at",
  "updated_at",
] as const;

export interface RemunerationProfileRow {
  readonly id: string;
  readonly effective_from: string | null;
  readonly data_json: string;
  readonly revision: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export function mapRemunerationProfileRow(row: RemunerationProfileRow): DatedRemunerationProfile {
  if (!Number.isSafeInteger(row.revision)) throw new RemunerationProfileError();
  const effectiveFrom =
    row.effective_from === null ? null : requireRemunerationDate(row.effective_from);
  if (row.id !== (effectiveFrom === null ? "legacy" : `from:${effectiveFrom}`)) {
    throw new RemunerationProfileError();
  }
  const createdAt = requireInstant(row.created_at, "Erstellt");
  const updatedAt = requireInstant(row.updated_at, "Geändert");
  if (Date.parse(updatedAt) < Date.parse(createdAt)) throw new RemunerationProfileError();
  return Object.freeze({
    effectiveFrom,
    data: validateRemunerationProfileData(JSON.parse(row.data_json) as unknown),
    revision: requirePositiveRevision(row.revision),
    createdAt,
    updatedAt,
  });
}

export async function listRemunerationProfiles(
  db: SQLiteDatabase,
): Promise<readonly DatedRemunerationProfile[]> {
  const rows = await db.getAllAsync<RemunerationProfileRow>(
    `SELECT ${REMUNERATION_PROFILE_COLUMNS.join(",")} FROM remuneration_profiles ORDER BY effective_from`,
  );
  return Object.freeze(rows.map(mapRemunerationProfileRow));
}

/** Used only inside the caller's transaction, e.g. when restoring a v1 backup. */
export async function initializeLegacyRemunerationProfile(db: SQLiteDatabase): Promise<void> {
  const existing = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM remuneration_profiles LIMIT 1",
  );
  if (existing !== null) return;
  const profile = await loadProfile(db);
  if (profile === null) return;
  await db.runAsync(
    `INSERT INTO remuneration_profiles(id,effective_from,data_json,revision,created_at,updated_at)
     VALUES('legacy',NULL,?,1,?,?)`,
    JSON.stringify(remunerationDataFromLegacy(profile)),
    profile.createdAt,
    profile.updatedAt,
  );
}

export class RemunerationProfileConflictError extends ConcurrencyError {
  constructor() {
    super("Das Vergütungsprofil wurde inzwischen geändert. Bitte neu laden.");
    this.name = "RemunerationProfileConflictError";
  }
}

export async function saveDatedRemunerationProfile(
  db: SQLiteDatabase,
  input: SaveDatedRemunerationProfileInput,
): Promise<DatedRemunerationProfile> {
  const date = requireRemunerationDate(input.effectiveFrom);
  const data = validateRemunerationProfileData(input.data);
  if (
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0 ||
    input.expectedRevision >= Number.MAX_SAFE_INTEGER
  ) {
    throw new RemunerationProfileError();
  }
  return withImmediateTransaction(db, async (transaction) => {
    const profile = await loadProfile(transaction);
    if (profile === null)
      throw new RemunerationProfileError("Bitte zuerst ein Arbeitsprofil anlegen.");
    await initializeLegacyRemunerationProfile(transaction);
    const id = `from:${date}`;
    const previous = await transaction.getFirstAsync<RemunerationProfileRow>(
      `SELECT ${REMUNERATION_PROFILE_COLUMNS.join(",")} FROM remuneration_profiles WHERE id=?`,
      id,
    );
    if ((previous?.revision ?? 0) !== input.expectedRevision)
      throw new RemunerationProfileConflictError();
    const now = new Date().toISOString();
    if (previous === null) {
      await transaction.runAsync(
        `INSERT INTO remuneration_profiles(id,effective_from,data_json,revision,created_at,updated_at)
         VALUES(?,?,?,1,?,?)`,
        id,
        date,
        JSON.stringify(data),
        now,
        now,
      );
    } else {
      // Do not overwrite an unreadable future-format row through an old editor.
      mapRemunerationProfileRow(previous);
      await transaction.runAsync(
        "UPDATE remuneration_profiles SET data_json=?,revision=revision+1,updated_at=? WHERE id=?",
        JSON.stringify(data),
        new Date(Math.max(Date.now(), Date.parse(previous.updated_at))).toISOString(),
        id,
      );
    }
    const saved = await transaction.getFirstAsync<RemunerationProfileRow>(
      `SELECT ${REMUNERATION_PROFILE_COLUMNS.join(",")} FROM remuneration_profiles WHERE id=?`,
      id,
    );
    if (saved === null) throw new RemunerationProfileError();
    return mapRemunerationProfileRow(saved);
  });
}
