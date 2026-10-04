import {
  CARITAS_OVERTIME_COLUMNS,
  mapCaritasOvertimeRow,
  requireCaritasOvertimeParents,
  type CaritasOvertimeRow,
} from "./caritas-overtime-repository";
import {
  CARITAS_MONTH_FACTS_COLUMNS,
  mapCaritasMonthFactsRow,
  requireCaritasMonthFactsParent,
  type CaritasMonthFactsRow,
} from "./caritas-month-facts-repository";
import {
  CARITAS_WORK_DAY_COLUMNS,
  mapCaritasWorkDayRow,
  requireCaritasWorkDayParent,
  type CaritasWorkDayRow,
} from "./caritas-work-day-repository";
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
  readonly caritasWorkDays: readonly CaritasWorkDayRow[];
  readonly caritasMonthFacts: readonly CaritasMonthFactsRow[];
  readonly caritasOvertime: readonly CaritasOvertimeRow[];
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
  includesCaritasWorkDays = false,
  includesCaritasMonthFacts = false,
  includesCaritasOvertime = false,
): DevRemunerationBackup {
  const data = exact(value, [
    "allowanceDecision",
    "overtimeAllocations",
    ...(includesPaidAbsences ? ["paidAbsences"] : []),
    ...(includesTvlShiftWork ? ["tvlShiftWork"] : []),
    ...(includesCaritasWorkDays ? ["caritasWorkDays"] : []),
    ...(includesCaritasMonthFacts ? ["caritasMonthFacts"] : []),
    ...(includesCaritasOvertime ? ["caritasOvertime"] : []),
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
  const rawCaritas = includesCaritasWorkDays ? data.caritasWorkDays : [];
  if (!Array.isArray(rawCaritas))
    throw new Error("Caritas-Dienstbestätigungen fehlen im Testlabor-Backup.");
  const caritasIds = new Set<string>();
  const caritasWorkDays = rawCaritas.map((value) => {
    const row = exact(value, CARITAS_WORK_DAY_COLUMNS) as unknown as CaritasWorkDayRow;
    const parsed = mapCaritasWorkDayRow(row);
    const shift = byId.get(parsed.shiftId);
    const key = JSON.stringify([parsed.shiftId, parsed.date]);
    if (!shift || caritasIds.has(key))
      throw new Error("Ungültige Caritas-Dienstzuordnung im Testlabor-Backup.");
    requireCaritasWorkDayParent(parsed, mapShift(shift as Parameters<typeof mapShift>[0]));
    caritasIds.add(key);
    return Object.freeze({ ...row });
  });
  const rawMonthFacts = includesCaritasMonthFacts ? data.caritasMonthFacts : [];
  if (!Array.isArray(rawMonthFacts))
    throw new Error("Caritas-Monatsbestätigungen fehlen im Testlabor-Backup.");
  if (rawMonthFacts.length > 1)
    throw new Error("Doppelte Caritas-Monatsbestätigung im Testlabor-Backup.");
  const caritasMonthFacts = rawMonthFacts.map((value) => {
    const row = exact(value, CARITAS_MONTH_FACTS_COLUMNS) as unknown as CaritasMonthFactsRow;
    if (mapCaritasMonthFactsRow(row).month !== month)
      throw new Error("Falscher Caritas-Monat im Testlabor-Backup.");
    return Object.freeze({ ...row });
  });
  const rawOvertime = includesCaritasOvertime ? data.caritasOvertime : [];
  if (!Array.isArray(rawOvertime))
    throw new Error("Caritas-Überstundenbestätigungen fehlen im Testlabor-Backup.");
  const caritasOvertimeIds = new Set<string>();
  const allocationById = new Map(
    overtimeAllocations.map((row) => {
      const parsed = mapOvertimeAllocationRow(row);
      return [parsed.shiftId, parsed] as const;
    }),
  );
  const caritasOvertime = rawOvertime.map((value) => {
    const row = exact(value, CARITAS_OVERTIME_COLUMNS) as unknown as CaritasOvertimeRow;
    const parsed = mapCaritasOvertimeRow(row);
    const shift = byId.get(parsed.shiftId);
    const allocation = allocationById.get(parsed.shiftId);
    if (
      !shift ||
      !allocation ||
      parsed.shiftRevision > shift.revision ||
      parsed.allocationRevision > allocation.revision ||
      caritasOvertimeIds.has(parsed.shiftId)
    )
      throw new Error("Ungültige Caritas-Überstundenreferenz im Testlabor-Backup.");
    caritasOvertimeIds.add(parsed.shiftId);
    return Object.freeze({ ...row });
  });
  return Object.freeze({
    allowanceDecision,
    overtimeAllocations: Object.freeze(overtimeAllocations),
    paidAbsences: Object.freeze(paidAbsences),
    tvlShiftWork: Object.freeze(tvlShiftWork),
    caritasWorkDays: Object.freeze(caritasWorkDays),
    caritasMonthFacts: Object.freeze(caritasMonthFacts),
    caritasOvertime: Object.freeze(caritasOvertime),
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
  const caritasWorkDays = await db.getAllAsync<CaritasWorkDayRow>(
    `SELECT ${CARITAS_WORK_DAY_COLUMNS.map((key) => "c." + key).join(",")}
      FROM caritas_work_days c JOIN shift_entries s ON s.id=c.shift_id
      WHERE substr(s.date,1,7)=? ORDER BY c.shift_id,c.date`,
    month,
  );
  const caritasMonthFacts = await db.getAllAsync<CaritasMonthFactsRow>(
    `SELECT ${CARITAS_MONTH_FACTS_COLUMNS.join(",")} FROM caritas_month_facts WHERE month=?`,
    month,
  );
  const caritasOvertime = await db.getAllAsync<CaritasOvertimeRow>(
    `SELECT ${CARITAS_OVERTIME_COLUMNS.map((key) => "c." + key).join(",")}
      FROM caritas_overtime c JOIN shift_entries s ON s.id=c.shift_id
      WHERE substr(s.date,1,7)=? ORDER BY c.shift_id`,
    month,
  );
  return {
    allowanceDecision,
    overtimeAllocations,
    paidAbsences,
    tvlShiftWork,
    caritasWorkDays,
    caritasMonthFacts,
    caritasOvertime,
  };
}
export async function clearDevRemuneration(db: SQLiteDatabase, month: string): Promise<void> {
  await db.runAsync("DELETE FROM caritas_month_facts WHERE month=?", month);
  for (const table of [
    "caritas_work_days",
    "caritas_overtime",
    "tvl_shift_work",
    "paid_absences",
    "overtime_allocations",
  ])
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
  const profiles =
    data.tvlShiftWork.length || data.caritasMonthFacts.length || data.caritasOvertime.length
      ? await listRemunerationProfiles(db)
      : [];
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
  for (const row of data.caritasWorkDays) {
    const parent = await db.getFirstAsync<Parameters<typeof mapShift>[0]>(
      "SELECT * FROM shift_entries WHERE id=?",
      row.shift_id,
    );
    requireCaritasWorkDayParent(mapCaritasWorkDayRow(row), parent ? mapShift(parent) : undefined);
    await db.runAsync(
      "INSERT INTO caritas_work_days(shift_id,date,confirmation_json) VALUES(?,?,?)",
      ...CARITAS_WORK_DAY_COLUMNS.map((key) => row[key]),
    );
  }
  for (const row of data.caritasMonthFacts) {
    requireCaritasMonthFactsParent(mapCaritasMonthFactsRow(row), profiles);
    await db.runAsync(
      "INSERT INTO caritas_month_facts(month,facts_json) VALUES(?,?)",
      ...CARITAS_MONTH_FACTS_COLUMNS.map((key) => row[key]),
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
  for (const row of data.caritasOvertime) {
    const saved = mapCaritasOvertimeRow(row);
    const shiftRow = await db.getFirstAsync<Parameters<typeof mapShift>[0]>(
      "SELECT * FROM shift_entries WHERE id=?",
      saved.shiftId,
    );
    const allocationRow = await db.getFirstAsync<OvertimeAllocationRow>(
      `SELECT ${OVERTIME_ALLOCATION_COLUMNS.join(",")} FROM overtime_allocations WHERE shift_id=?`,
      saved.shiftId,
    );
    requireCaritasOvertimeParents(
      saved,
      shiftRow ? mapShift(shiftRow) : undefined,
      allocationRow ? mapOvertimeAllocationRow(allocationRow) : undefined,
      profiles,
    );
    await db.runAsync(
      "INSERT INTO caritas_overtime(shift_id,confirmation_json) VALUES(?,?)",
      ...CARITAS_OVERTIME_COLUMNS.map((key) => row[key]),
    );
  }
  for (const row of data.paidAbsences)
    await db.runAsync(
      "INSERT INTO paid_absences(" + PAID_ABSENCE_COLUMNS.join(",") + ") VALUES(?,?,?,?,?,?,?,?,?)",
      ...PAID_ABSENCE_COLUMNS.map((k) => row[k]),
    );
}
