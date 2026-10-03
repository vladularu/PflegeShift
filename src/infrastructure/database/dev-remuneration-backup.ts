import {
  TVL_SHIFT_WORK_COLUMNS,
  mapTvlShiftWorkRow,
  requireTvlShiftWorkParents,
  requireTvlBurnCareCollection,
  type TvlShiftWorkRow,
} from "./tvl-shift-work-repository";
import { listRemunerationProfiles } from "./remuneration-profile-repository";
import type { SQLiteDatabase } from "expo-sqlite";
import { mapShift } from "./calendar-entry-repository";
import type { RawShiftRow } from "./dev-backup-payload";
import {
  ALLOWANCE_DECISION_COLUMNS,
  mapAllowanceDecisionRow,
  type AllowanceDecisionRow,
} from "./allowance-decision-repository";
import {
  OVERTIME_ALLOCATION_COLUMNS,
  mapOvertimeAllocationRow,
  requireOvertimeAllocationMatchesShift,
  type OvertimeAllocationRow,
} from "./overtime-allocation-repository";
import {
  PAID_ABSENCE_COLUMNS,
  mapPaidAbsenceRow,
  requirePaidAbsenceParent,
  type PaidAbsenceRow,
} from "./paid-absence-repository";
export interface DevRemunerationBackup {
  readonly allowanceDecision: AllowanceDecisionRow | null;
  readonly overtimeAllocations: readonly OvertimeAllocationRow[];
  readonly paidAbsences: readonly PaidAbsenceRow[];
  readonly tvlShiftWork: readonly TvlShiftWorkRow[];
}

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Ungültige Testlabor-Vergütungsdaten.");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || keys.some((key) => !Object.hasOwn(row, key)))
    throw new Error("Unbekannte Testlabor-Vergütungsdaten.");
  return row;
}

export function validateDevRemunerationBackup(
  value: unknown,
  shifts: readonly RawShiftRow[],
  month: string,
  includesPaidAbsences = true,
  includesTvlShiftWork = false,
): DevRemunerationBackup {
  const data = exact(value, [
    "allowanceDecision",
    "overtimeAllocations",
    ...(includesPaidAbsences ? ["paidAbsences"] : []),
    ...(includesTvlShiftWork ? ["tvlShiftWork"] : []),
  ]);
  let allowanceDecision: AllowanceDecisionRow | null = null;
  if (data.allowanceDecision !== null) {
    const row = exact(data.allowanceDecision, ALLOWANCE_DECISION_COLUMNS);
    if (typeof row.decisions_json !== "string") throw new Error("Ungültige Zulagenbestätigung.");
    allowanceDecision = row as unknown as AllowanceDecisionRow;
    if (mapAllowanceDecisionRow(allowanceDecision).month !== month)
      throw new Error("Falscher Zulagenmonat im Testlabor-Backup.");
    allowanceDecision = Object.freeze({ ...allowanceDecision });
  }
  if (!Array.isArray(data.overtimeAllocations))
    throw new Error("Überstundenaufteilungen fehlen im Testlabor-Backup.");
  const byId = new Map(shifts.map((shift) => [shift.id, shift]));
  const seen = new Set<string>();
  const overtimeAllocations = data.overtimeAllocations.map((value) => {
    const row = exact(value, OVERTIME_ALLOCATION_COLUMNS);
    if (typeof row.allocations_json !== "string")
      throw new Error("Ungültige Überstundenaufteilung.");
    const typed = row as unknown as OvertimeAllocationRow;
    const parsed = mapOvertimeAllocationRow(typed);
    const shift = byId.get(parsed.shiftId);
    if (!shift || parsed.shiftRevision > shift.revision || seen.has(parsed.shiftId))
      throw new Error("Ungültige Dienstzuordnung im Testlabor-Backup.");
    seen.add(parsed.shiftId);
    if (parsed.shiftRevision === shift.revision && parsed.allocations !== null)
      requireOvertimeAllocationMatchesShift(
        parsed,
        mapShift(shift as Parameters<typeof mapShift>[0]),
      );
    return Object.freeze({ ...typed });
  });
  const rawPaidAbsences = includesPaidAbsences ? data.paidAbsences : [];
  if (!Array.isArray(rawPaidAbsences))
    throw new Error("Abwesenheitsbestätigungen fehlen im Testlabor-Backup.");
  const paidIds = new Set<string>();
  const paidAbsences = rawPaidAbsences.map((value) => {
    const row = exact(value, PAID_ABSENCE_COLUMNS) as unknown as PaidAbsenceRow;
    const parsed = mapPaidAbsenceRow(row);
    const shift = byId.get(parsed.shiftId);
    if (!shift || paidIds.has(parsed.shiftId))
      throw new Error("Ungültige Abwesenheitszuordnung im Testlabor-Backup.");
    requirePaidAbsenceParent(parsed, mapShift(shift as Parameters<typeof mapShift>[0]));
    paidIds.add(parsed.shiftId);
    return Object.freeze({ ...row });
  });
  const rawTvl = includesTvlShiftWork ? data.tvlShiftWork : [];
  if (!Array.isArray(rawTvl))
    throw new Error("TV-L-Dienstbestätigungen fehlen im Testlabor-Backup.");
  const tvlIds = new Set<string>();
  const tvlShiftWork = rawTvl.map((value) => {
    const row = exact(value, TVL_SHIFT_WORK_COLUMNS) as unknown as TvlShiftWorkRow;
    const parsed = mapTvlShiftWorkRow(row);
    const shift = byId.get(parsed.shiftId);
    const key = JSON.stringify([parsed.shiftId, parsed.profileEffectiveFrom]);
    if (!shift || parsed.shiftRevision > shift.revision || tvlIds.has(key))
      throw new Error("Ungültige TV-L-Dienstzuordnung im Testlabor-Backup.");
    tvlIds.add(key);
    return Object.freeze({ ...row });
  });
  return Object.freeze({
    allowanceDecision,
    overtimeAllocations: Object.freeze(overtimeAllocations),
    paidAbsences: Object.freeze(paidAbsences),
    tvlShiftWork: Object.freeze(tvlShiftWork),
  });
}
export async function snapshotDevRemuneration(
  db: SQLiteDatabase,
  month: string,
): Promise<DevRemunerationBackup> {
  const allowanceDecision = await db.getFirstAsync<AllowanceDecisionRow>(
    `SELECT ${ALLOWANCE_DECISION_COLUMNS.join(",")} FROM scoped_allowance_decisions WHERE month=?`,
    month,
  );
  const overtimeAllocations = await db.getAllAsync<OvertimeAllocationRow>(
    `SELECT ${OVERTIME_ALLOCATION_COLUMNS.map((key) => "o." + key).join(",")}
    FROM overtime_allocations o JOIN shift_entries s ON s.id=o.shift_id WHERE substr(s.date,1,7)=? ORDER BY o.shift_id`,
    month,
  );
  const paidAbsences = await db.getAllAsync<PaidAbsenceRow>(
    `SELECT ${PAID_ABSENCE_COLUMNS.map((key) => "p." + key).join(",")}
    FROM paid_absences p JOIN shift_entries s ON s.id=p.shift_id WHERE substr(s.date,1,7)=? ORDER BY p.shift_id`,
    month,
  );
  const tvlShiftWork = await db.getAllAsync<TvlShiftWorkRow>(
    `SELECT ${TVL_SHIFT_WORK_COLUMNS.map((key) => "t." + key).join(",")}
      FROM tvl_shift_work t JOIN shift_entries s ON s.id=t.shift_id
      WHERE substr(s.date,1,7)=? ORDER BY t.shift_id,t.profile_effective_from`,
    month,
  );
  return { allowanceDecision, overtimeAllocations, paidAbsences, tvlShiftWork };
}
export async function clearDevRemuneration(db: SQLiteDatabase, month: string): Promise<void> {
  for (const table of ["tvl_shift_work", "paid_absences", "overtime_allocations"])
    await db.runAsync(
      "DELETE FROM " +
        table +
        " WHERE shift_id IN (SELECT id FROM shift_entries WHERE substr(date,1,7)=?)",
      month,
    );
  await db.runAsync("DELETE FROM scoped_allowance_decisions WHERE month=?", month);
}
export async function restoreDevRemuneration(
  db: SQLiteDatabase,
  data: DevRemunerationBackup,
): Promise<void> {
  const profiles = data.tvlShiftWork.length ? await listRemunerationProfiles(db) : [];
  const tvlByShift = new Map<string, ReturnType<typeof mapTvlShiftWorkRow>[]>();
  for (const row of data.tvlShiftWork) {
    const parsed = mapTvlShiftWorkRow(row);
    const siblings = tvlByShift.get(parsed.shiftId) ?? [];
    siblings.push(parsed);
    tvlByShift.set(parsed.shiftId, siblings);
  }
  for (const row of data.tvlShiftWork) {
    const parent = await db.getFirstAsync<Parameters<typeof mapShift>[0]>(
      "SELECT * FROM shift_entries WHERE id=?",
      row.shift_id,
    );
    requireTvlShiftWorkParents(
      mapTvlShiftWorkRow(row),
      parent ? mapShift(parent) : undefined,
      profiles,
    );
    if (parent && tvlByShift.has(row.shift_id)) {
      requireTvlBurnCareCollection(tvlByShift.get(row.shift_id)!, mapShift(parent), profiles);
      tvlByShift.delete(row.shift_id);
    }
    await db.runAsync(
      "INSERT INTO tvl_shift_work(shift_id,profile_effective_from,confirmation_json) VALUES(?,?,?)",
      ...TVL_SHIFT_WORK_COLUMNS.map((key) => row[key]),
    );
  }
  if (data.allowanceDecision !== null)
    await db.runAsync(
      "INSERT INTO scoped_allowance_decisions(" +
        ALLOWANCE_DECISION_COLUMNS.join(",") +
        ") VALUES(?,?,?,?)",
      ...ALLOWANCE_DECISION_COLUMNS.map((k) => data.allowanceDecision![k]),
    );
  for (const row of data.overtimeAllocations)
    await db.runAsync(
      "INSERT INTO overtime_allocations(" +
        OVERTIME_ALLOCATION_COLUMNS.join(",") +
        ") VALUES(?,?,?,?,?,?,?)",
      ...OVERTIME_ALLOCATION_COLUMNS.map((k) => row[k]),
    );
  for (const row of data.paidAbsences)
    await db.runAsync(
      "INSERT INTO paid_absences(" + PAID_ABSENCE_COLUMNS.join(",") + ") VALUES(?,?,?,?,?,?,?,?,?)",
      ...PAID_ABSENCE_COLUMNS.map((k) => row[k]),
    );
}
