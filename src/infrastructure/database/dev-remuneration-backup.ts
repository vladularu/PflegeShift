import {
  DRK_EMPLOYEE_MONTH_CONFIRMATION_COLUMNS,
  mapDrkEmployeeMonthConfirmationRow,
  requireDrkEmployeeMonthConfirmationParent,
  type DrkEmployeeMonthConfirmationRow,
} from "./drk-employee-month-confirmation-repository";
import {
  TVOED_ANNEX_A_PREMIUM_FACTS_COLUMNS,
  mapTvoedAnnexAPremiumFactsRow,
  requireTvoedAnnexAPremiumFactsParent,
  type TvoedAnnexAPremiumFactsRow,
} from "./tvoed-annex-a-premium-facts-repository";
import {
  TVOED_SUE_ALLOWANCE_CONFIRMATION_COLUMNS,
  mapTvoedSueAllowanceConfirmationRow,
  requireTvoedSueAllowanceConfirmationParent,
  type TvoedSueAllowanceConfirmationRow,
} from "./tvoed-sue-allowance-confirmation-repository";
import {
  TVOED_SUE_MONTH_CONFIRMATION_COLUMNS,
  mapTvoedSueMonthConfirmationRow,
  requireTvoedSueMonthConfirmationParent,
  type TvoedSueMonthConfirmationRow,
} from "./tvoed-sue-month-confirmation-repository";
import {
  TVOED_ANNEX_A_MONTH_CONFIRMATION_COLUMNS,
  mapTvoedAnnexAMonthConfirmationRow,
  requireTvoedAnnexAMonthConfirmationParent,
  type TvoedAnnexAMonthConfirmationRow,
} from "./tvoed-annex-a-month-confirmation-repository";
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
  readonly tvoedAnnexAMonthConfirmations: readonly TvoedAnnexAMonthConfirmationRow[];
  readonly tvoedSueMonthConfirmations: readonly TvoedSueMonthConfirmationRow[];
  readonly tvoedSueAllowanceConfirmations: readonly TvoedSueAllowanceConfirmationRow[];
  readonly tvoedAnnexAPremiumFacts: readonly TvoedAnnexAPremiumFactsRow[];
  readonly drkEmployeeMonthConfirmations: readonly DrkEmployeeMonthConfirmationRow[];
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
  includesTvoedAnnexAMonthConfirmations = false,
  includesTvoedSueMonthConfirmations = false,
  includesTvoedSueAllowanceConfirmations = false,
  includesTvoedAnnexAPremiumFacts = false,
  includesDrkEmployeeMonthConfirmations = false,
): DevRemunerationBackup {
  const data = exact(value, [
    "allowanceDecision",
    "overtimeAllocations",
    ...(includesPaidAbsences ? ["paidAbsences"] : []),
    ...(includesTvlShiftWork ? ["tvlShiftWork"] : []),
    ...(includesCaritasWorkDays ? ["caritasWorkDays"] : []),
    ...(includesCaritasMonthFacts ? ["caritasMonthFacts"] : []),
    ...(includesCaritasOvertime ? ["caritasOvertime"] : []),
    ...(includesTvoedAnnexAMonthConfirmations ? ["tvoedAnnexAMonthConfirmations"] : []),
    ...(includesTvoedSueMonthConfirmations ? ["tvoedSueMonthConfirmations"] : []),
    ...(includesTvoedSueAllowanceConfirmations ? ["tvoedSueAllowanceConfirmations"] : []),
    ...(includesTvoedAnnexAPremiumFacts ? ["tvoedAnnexAPremiumFacts"] : []),
    ...(includesDrkEmployeeMonthConfirmations ? ["drkEmployeeMonthConfirmations"] : []),
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
  const rawAnnexA = includesTvoedAnnexAMonthConfirmations ? data.tvoedAnnexAMonthConfirmations : [];
  if (!Array.isArray(rawAnnexA))
    throw new Error("TVöD-Monatsbestätigungen fehlen im Testlabor-Backup.");
  if (rawAnnexA.length > 1) throw new Error("Doppelte TVöD-Monatsbestätigung im Testlabor-Backup.");
  const tvoedAnnexAMonthConfirmations = rawAnnexA.map((value) => {
    const row = exact(
      value,
      TVOED_ANNEX_A_MONTH_CONFIRMATION_COLUMNS,
    ) as unknown as TvoedAnnexAMonthConfirmationRow;
    if (mapTvoedAnnexAMonthConfirmationRow(row).month !== month)
      throw new Error("Falscher TVöD-Monat im Testlabor-Backup.");
    return Object.freeze({ ...row });
  });
  const rawSue = includesTvoedSueMonthConfirmations ? data.tvoedSueMonthConfirmations : [];
  if (!Array.isArray(rawSue))
    throw new Error("SuE-Monatsbestätigungen fehlen im Testlabor-Backup.");
  if (rawSue.length > 1) throw new Error("Doppelte SuE-Monatsbestätigung im Testlabor-Backup.");
  const tvoedSueMonthConfirmations = rawSue.map((value) => {
    const row = exact(
      value,
      TVOED_SUE_MONTH_CONFIRMATION_COLUMNS,
    ) as unknown as TvoedSueMonthConfirmationRow;
    if (mapTvoedSueMonthConfirmationRow(row).month !== month)
      throw new Error("Falscher SuE-Monat im Testlabor-Backup.");
    return Object.freeze({ ...row });
  });
  const rawSueAllowance = includesTvoedSueAllowanceConfirmations
    ? data.tvoedSueAllowanceConfirmations
    : [];
  if (!Array.isArray(rawSueAllowance))
    throw new Error("SuE-Zulagenbestätigungen fehlen im Testlabor-Backup.");
  if (rawSueAllowance.length > 1)
    throw new Error("Doppelte SuE-Zulagenbestätigung im Testlabor-Backup.");
  const tvoedSueAllowanceConfirmations = rawSueAllowance.map((value) => {
    const row = exact(
      value,
      TVOED_SUE_ALLOWANCE_CONFIRMATION_COLUMNS,
    ) as unknown as TvoedSueAllowanceConfirmationRow;
    if (mapTvoedSueAllowanceConfirmationRow(row).month !== month)
      throw new Error("Falscher SuE-Zulagenmonat im Testlabor-Backup.");
    return Object.freeze({ ...row });
  });
  const rawAnnexAPremium = includesTvoedAnnexAPremiumFacts ? data.tvoedAnnexAPremiumFacts : [];
  if (!Array.isArray(rawAnnexAPremium))
    throw new Error("TVöD-Zuschlagsdaten fehlen im Testlabor-Backup.");
  if (rawAnnexAPremium.length > 1)
    throw new Error("Doppelte TVöD-Zuschlagsdaten im Testlabor-Backup.");
  const tvoedAnnexAPremiumFacts = rawAnnexAPremium.map((value) => {
    const row = exact(
      value,
      TVOED_ANNEX_A_PREMIUM_FACTS_COLUMNS,
    ) as unknown as TvoedAnnexAPremiumFactsRow;
    const parsed = mapTvoedAnnexAPremiumFactsRow(row);
    if (parsed.month !== month)
      throw new Error("Falscher TVöD-Zuschlagsmonat im Testlabor-Backup.");
    for (const decision of parsed.dayDecisions) {
      const shift = byId.get(decision.shiftId);
      const binding = JSON.parse(decision.shiftBinding) as readonly unknown[];
      // A month-opening work slice may belong to a shift that started the day before.
      // That parent is outside the test-month snapshot and is checked during restore.
      if (
        (binding[3] as string).startsWith(`${month}-`) &&
        (!shift || (binding[1] as number) > shift.revision)
      )
        throw new Error("Ungültige TVöD-Dienstzuordnung im Testlabor-Backup.");
    }
    return Object.freeze({ ...row });
  });
  const rawDrk = includesDrkEmployeeMonthConfirmations ? data.drkEmployeeMonthConfirmations : [];
  if (!Array.isArray(rawDrk))
    throw new Error("DRK-Monatsbestätigungen fehlen im Testlabor-Backup.");
  if (rawDrk.length > 1) throw new Error("Doppelte DRK-Monatsbestätigung im Testlabor-Backup.");
  const drkEmployeeMonthConfirmations = rawDrk.map((value) => {
    const row = exact(
      value,
      DRK_EMPLOYEE_MONTH_CONFIRMATION_COLUMNS,
    ) as unknown as DrkEmployeeMonthConfirmationRow;
    if (mapDrkEmployeeMonthConfirmationRow(row).month !== month)
      throw new Error("Falscher DRK-Monat im Testlabor-Backup.");
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
    tvoedAnnexAMonthConfirmations: Object.freeze(tvoedAnnexAMonthConfirmations),
    tvoedSueMonthConfirmations: Object.freeze(tvoedSueMonthConfirmations),
    tvoedSueAllowanceConfirmations: Object.freeze(tvoedSueAllowanceConfirmations),
    tvoedAnnexAPremiumFacts: Object.freeze(tvoedAnnexAPremiumFacts),
    drkEmployeeMonthConfirmations: Object.freeze(drkEmployeeMonthConfirmations),
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
  const tvoedAnnexAMonthConfirmations = await db.getAllAsync<TvoedAnnexAMonthConfirmationRow>(
    `SELECT ${TVOED_ANNEX_A_MONTH_CONFIRMATION_COLUMNS.join(",")} FROM tvoed_annex_a_month_confirmations WHERE month=?`,
    month,
  );
  const tvoedSueMonthConfirmations = await db.getAllAsync<TvoedSueMonthConfirmationRow>(
    `SELECT ${TVOED_SUE_MONTH_CONFIRMATION_COLUMNS.join(",")} FROM tvoed_sue_month_confirmations WHERE month=?`,
    month,
  );
  const tvoedSueAllowanceConfirmations = await db.getAllAsync<TvoedSueAllowanceConfirmationRow>(
    `SELECT ${TVOED_SUE_ALLOWANCE_CONFIRMATION_COLUMNS.join(",")} FROM tvoed_sue_allowance_confirmations WHERE month=?`,
    month,
  );
  const tvoedAnnexAPremiumFacts = await db.getAllAsync<TvoedAnnexAPremiumFactsRow>(
    `SELECT ${TVOED_ANNEX_A_PREMIUM_FACTS_COLUMNS.join(",")} FROM tvoed_annex_a_premium_facts WHERE month=?`,
    month,
  );
  const drkEmployeeMonthConfirmations = await db.getAllAsync<DrkEmployeeMonthConfirmationRow>(
    `SELECT ${DRK_EMPLOYEE_MONTH_CONFIRMATION_COLUMNS.join(",")} FROM drk_employee_month_confirmations WHERE month=?`,
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
    tvoedAnnexAMonthConfirmations,
    tvoedSueMonthConfirmations,
    tvoedSueAllowanceConfirmations,
    tvoedAnnexAPremiumFacts,
    drkEmployeeMonthConfirmations,
  };
}
export async function clearDevRemuneration(db: SQLiteDatabase, month: string): Promise<void> {
  await db.runAsync("DELETE FROM drk_employee_month_confirmations WHERE month=?", month);
  await db.runAsync("DELETE FROM tvoed_annex_a_premium_facts WHERE month=?", month);
  await db.runAsync("DELETE FROM tvoed_sue_allowance_confirmations WHERE month=?", month);
  await db.runAsync("DELETE FROM tvoed_sue_month_confirmations WHERE month=?", month);
  await db.runAsync("DELETE FROM tvoed_annex_a_month_confirmations WHERE month=?", month);
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
    data.tvlShiftWork.length ||
    data.caritasMonthFacts.length ||
    data.caritasOvertime.length ||
    data.tvoedAnnexAMonthConfirmations.length ||
    data.tvoedSueMonthConfirmations.length ||
    data.tvoedSueAllowanceConfirmations.length ||
    data.tvoedAnnexAPremiumFacts.length ||
    data.drkEmployeeMonthConfirmations.length
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
  for (const row of data.tvoedAnnexAMonthConfirmations) {
    requireTvoedAnnexAMonthConfirmationParent(mapTvoedAnnexAMonthConfirmationRow(row), profiles);
    await db.runAsync(
      "INSERT INTO tvoed_annex_a_month_confirmations(month,confirmation_json) VALUES(?,?)",
      ...TVOED_ANNEX_A_MONTH_CONFIRMATION_COLUMNS.map((key) => row[key]),
    );
  }
  for (const row of data.tvoedSueMonthConfirmations) {
    requireTvoedSueMonthConfirmationParent(mapTvoedSueMonthConfirmationRow(row), profiles);
    await db.runAsync(
      "INSERT INTO tvoed_sue_month_confirmations(month,confirmation_json) VALUES(?,?)",
      ...TVOED_SUE_MONTH_CONFIRMATION_COLUMNS.map((key) => row[key]),
    );
  }
  for (const row of data.tvoedSueAllowanceConfirmations) {
    requireTvoedSueAllowanceConfirmationParent(mapTvoedSueAllowanceConfirmationRow(row), profiles);
    await db.runAsync(
      "INSERT INTO tvoed_sue_allowance_confirmations(month,confirmation_json) VALUES(?,?)",
      ...TVOED_SUE_ALLOWANCE_CONFIRMATION_COLUMNS.map((key) => row[key]),
    );
  }
  for (const row of data.tvoedAnnexAPremiumFacts) {
    const parsed = mapTvoedAnnexAPremiumFactsRow(row);
    requireTvoedAnnexAPremiumFactsParent(parsed, profiles);
    for (const decision of parsed.dayDecisions) {
      const parent = await db.getFirstAsync<{ revision: number }>(
        "SELECT revision FROM shift_entries WHERE id=?",
        decision.shiftId,
      );
      if (!parent || (JSON.parse(decision.shiftBinding)[1] as number) > parent.revision)
        throw new Error("Ungültige TVöD-Dienstreferenz im Testlabor-Backup.");
    }
    await db.runAsync(
      "INSERT INTO tvoed_annex_a_premium_facts(month,facts_json) VALUES(?,?)",
      ...TVOED_ANNEX_A_PREMIUM_FACTS_COLUMNS.map((key) => row[key]),
    );
  }
  for (const row of data.drkEmployeeMonthConfirmations) {
    requireDrkEmployeeMonthConfirmationParent(mapDrkEmployeeMonthConfirmationRow(row), profiles);
    await db.runAsync(
      "INSERT INTO drk_employee_month_confirmations(month,confirmation_json) VALUES(?,?)",
      ...DRK_EMPLOYEE_MONTH_CONFIRMATION_COLUMNS.map((key) => row[key]),
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
