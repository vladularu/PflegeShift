import type { SQLiteDatabase } from "expo-sqlite";

import type {
  Appointment,
  CalendarEntry,
  MonthlyTariffDecision,
  PayGroup,
  PayLevel,
  SaveMonthlyTariffDecisionInput,
  SaveAppointmentInput,
  SaveProfileInput,
  SaveShiftInput,
  SaveShiftTemplateInput,
  ShiftEntry,
  ShiftTemplate,
  TariffSector,
  UserProfile,
} from "@/domain/types";
import {
  createId,
  validateAppointment,
  validateProfile,
  validateShift,
  validateTemplate,
} from "@/domain/validation";

interface ProfileRow {
  federal_state: UserProfile["federalState"];
  weekly_minutes: number;
  time_zone: string;
  pay_group: PayGroup | null;
  pay_level: PayLevel | null;
  tariff_sector: TariffSector | null;
  full_time_weekly_minutes: number | null;
  created_at: string;
  updated_at: string;
}

interface TemplateRow {
  id: string;
  name: string;
  type: ShiftTemplate["type"];
  start_time: string;
  end_time: string;
  break_minutes: number;
  color: string;
  symbol: string;
  sort_order: number;
  revision: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface ShiftRow {
  id: string;
  date: string;
  template_id: string | null;
  title: string;
  type: ShiftEntry["type"];
  start_time: string | null;
  end_time: string | null;
  break_minutes: number;
  color: string;
  symbol: string;
  note: string | null;
  overtime_minutes: number;
  holiday_premium_mode: ShiftEntry["holidayPremiumMode"];
  revision: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface AppointmentRow {
  id: string;
  date: string;
  title: string;
  all_day: number;
  start_time: string | null;
  end_time: string | null;
  color: string;
  note: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function mapProfile(row: ProfileRow): UserProfile {
  const tariff =
    row.pay_group !== null &&
    row.pay_level !== null &&
    row.tariff_sector !== null &&
    row.full_time_weekly_minutes !== null
      ? {
          payGroup: row.pay_group as NonNullable<UserProfile["tariff"]>["payGroup"],
          payLevel: row.pay_level as NonNullable<UserProfile["tariff"]>["payLevel"],
          sector: row.tariff_sector as NonNullable<UserProfile["tariff"]>["sector"],
          fullTimeWeeklyMinutes: row.full_time_weekly_minutes,
        }
      : null;
  return Object.freeze({
    federalState: row.federal_state,
    weeklyMinutes: row.weekly_minutes,
    timeZone: row.time_zone,
    tariff,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapTemplate(row: TemplateRow): ShiftTemplate {
  return Object.freeze({
    id: row.id,
    name: row.name,
    type: row.type,
    startTime: row.start_time,
    endTime: row.end_time,
    breakMinutes: row.break_minutes,
    color: row.color,
    symbol: row.symbol,
    sortOrder: row.sort_order,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  });
}

function mapShift(row: ShiftRow): ShiftEntry {
  return Object.freeze({
    kind: "SHIFT",
    id: row.id,
    date: row.date,
    templateId: row.template_id,
    title: row.title,
    type: row.type,
    startTime: row.start_time,
    endTime: row.end_time,
    breakMinutes: row.break_minutes,
    color: row.color,
    symbol: row.symbol,
    note: row.note,
    overtimeMinutes: row.overtime_minutes,
    holidayPremiumMode: row.holiday_premium_mode,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  });
}

function mapAppointment(row: AppointmentRow): Appointment {
  return Object.freeze({
    kind: "APPOINTMENT",
    id: row.id,
    date: row.date,
    title: row.title,
    allDay: row.all_day === 1,
    startTime: row.start_time,
    endTime: row.end_time,
    color: row.color,
    note: row.note,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  });
}

async function requireChanged(changes: number): Promise<void> {
  if (changes !== 1) {
    throw new Error("Der Eintrag wurde zwischenzeitlich geändert. Bitte neu laden.");
  }
}

export async function loadProfile(db: SQLiteDatabase): Promise<UserProfile | null> {
  const row = await db.getFirstAsync<ProfileRow>(
    `SELECT federal_state,weekly_minutes,time_zone,pay_group,pay_level,
      tariff_sector,full_time_weekly_minutes,created_at,updated_at
     FROM user_profile WHERE id='singleton'`,
  );
  return row === null ? null : mapProfile(row);
}

export async function saveProfile(
  db: SQLiteDatabase,
  rawInput: SaveProfileInput,
): Promise<UserProfile> {
  const input = validateProfile(rawInput);
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO user_profile(
       id,federal_state,weekly_minutes,time_zone,pay_group,pay_level,
       tariff_sector,full_time_weekly_minutes,created_at,updated_at
     ) VALUES('singleton',?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       federal_state=excluded.federal_state,
       weekly_minutes=excluded.weekly_minutes,
       time_zone=excluded.time_zone,
       pay_group=excluded.pay_group,
       pay_level=excluded.pay_level,
       tariff_sector=excluded.tariff_sector,
       full_time_weekly_minutes=excluded.full_time_weekly_minutes,
       updated_at=excluded.updated_at`,
    input.federalState,
    input.weeklyMinutes,
    input.timeZone,
    input.tariff?.payGroup ?? null,
    input.tariff?.payLevel ?? null,
    input.tariff?.sector ?? null,
    input.tariff?.fullTimeWeeklyMinutes ?? null,
    now,
    now,
  );
  const profile = await loadProfile(db);
  if (profile === null) throw new Error("Profil konnte nicht gespeichert werden.");
  return profile;
}

export async function listTemplates(db: SQLiteDatabase): Promise<readonly ShiftTemplate[]> {
  const rows = await db.getAllAsync<TemplateRow>(
    `SELECT id,name,type,start_time,end_time,break_minutes,color,symbol,sort_order,
      revision,created_at,updated_at,deleted_at
     FROM shift_templates WHERE deleted_at IS NULL ORDER BY sort_order,name`,
  );
  return Object.freeze(rows.map(mapTemplate));
}

export async function saveTemplate(
  db: SQLiteDatabase,
  rawInput: SaveShiftTemplateInput,
): Promise<ShiftTemplate> {
  const input = validateTemplate(rawInput);
  const id = input.id ?? createId("template");
  const now = new Date().toISOString();

  if (input.id === undefined) {
    await db.runAsync(
      `INSERT INTO shift_templates(
        id,name,type,start_time,end_time,break_minutes,color,symbol,sort_order,
        revision,created_at,updated_at,deleted_at
      ) VALUES(?,?,?,?,?,?,?,?,?,1,?,?,NULL)`,
      id,
      input.name,
      input.type,
      input.startTime,
      input.endTime,
      input.breakMinutes,
      input.color,
      input.symbol,
      input.sortOrder,
      now,
      now,
    );
  } else {
    const result = await db.runAsync(
      `UPDATE shift_templates SET
        name=?,type=?,start_time=?,end_time=?,break_minutes=?,color=?,symbol=?,
        sort_order=?,revision=revision+1,updated_at=?
       WHERE id=? AND revision=? AND deleted_at IS NULL`,
      input.name,
      input.type,
      input.startTime,
      input.endTime,
      input.breakMinutes,
      input.color,
      input.symbol,
      input.sortOrder,
      now,
      id,
      input.expectedRevision ?? -1,
    );
    await requireChanged(result.changes);
  }

  const row = await db.getFirstAsync<TemplateRow>(
    `SELECT id,name,type,start_time,end_time,break_minutes,color,symbol,sort_order,
      revision,created_at,updated_at,deleted_at FROM shift_templates WHERE id=?`,
    id,
  );
  if (row === null) throw new Error("Vorlage konnte nicht gespeichert werden.");
  return mapTemplate(row);
}

export async function deleteTemplate(
  db: SQLiteDatabase,
  id: string,
  expectedRevision: number,
): Promise<void> {
  const result = await db.runAsync(
    `UPDATE shift_templates SET revision=revision+1,updated_at=?,deleted_at=?
     WHERE id=? AND revision=? AND deleted_at IS NULL`,
    new Date().toISOString(),
    new Date().toISOString(),
    id,
    expectedRevision,
  );
  await requireChanged(result.changes);
}

export async function listCalendarEntries(
  db: SQLiteDatabase,
  startDate = "1900-01-01",
  endDate = "4099-12-31",
): Promise<readonly CalendarEntry[]> {
  const shifts = await db.getAllAsync<ShiftRow>(
    `SELECT id,date,template_id,title,type,start_time,end_time,break_minutes,color,
      symbol,note,overtime_minutes,holiday_premium_mode,revision,created_at,updated_at,deleted_at
     FROM shift_entries WHERE deleted_at IS NULL AND date BETWEEN ? AND ?`,
    startDate,
    endDate,
  );
  const appointments = await db.getAllAsync<AppointmentRow>(
    `SELECT id,date,title,all_day,start_time,end_time,color,note,revision,
      created_at,updated_at,deleted_at
     FROM appointments WHERE deleted_at IS NULL AND date BETWEEN ? AND ?`,
    startDate,
    endDate,
  );
  return Object.freeze(
    [...shifts.map(mapShift), ...appointments.map(mapAppointment)].sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        (left.startTime ?? "").localeCompare(right.startTime ?? "") ||
        left.title.localeCompare(right.title),
    ),
  );
}

export async function saveShift(
  db: SQLiteDatabase,
  rawInput: SaveShiftInput,
): Promise<ShiftEntry> {
  const input = validateShift(rawInput);
  const id = input.id ?? createId("shift");
  const now = new Date().toISOString();

  if (input.id === undefined) {
    await db.runAsync(
      `INSERT INTO shift_entries(
        id,date,template_id,title,type,start_time,end_time,break_minutes,color,
        symbol,note,overtime_minutes,holiday_premium_mode,revision,created_at,updated_at,deleted_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,NULL)`,
      id,
      input.date,
      input.templateId ?? null,
      input.title,
      input.type,
      input.startTime ?? null,
      input.endTime ?? null,
      input.breakMinutes ?? 0,
      input.color,
      input.symbol,
      input.note ?? null,
      input.overtimeMinutes ?? 0,
      input.holidayPremiumMode ?? "WITH_TIME_OFF",
      now,
      now,
    );
  } else {
    const result = await db.runAsync(
      `UPDATE shift_entries SET
        date=?,template_id=?,title=?,type=?,start_time=?,end_time=?,break_minutes=?,
        color=?,symbol=?,note=?,overtime_minutes=?,holiday_premium_mode=?,
        revision=revision+1,updated_at=?
       WHERE id=? AND revision=? AND deleted_at IS NULL`,
      input.date,
      input.templateId ?? null,
      input.title,
      input.type,
      input.startTime ?? null,
      input.endTime ?? null,
      input.breakMinutes ?? 0,
      input.color,
      input.symbol,
      input.note ?? null,
      input.overtimeMinutes ?? 0,
      input.holidayPremiumMode ?? "WITH_TIME_OFF",
      now,
      id,
      input.expectedRevision ?? -1,
    );
    await requireChanged(result.changes);
  }

  const row = await db.getFirstAsync<ShiftRow>(
    `SELECT id,date,template_id,title,type,start_time,end_time,break_minutes,color,
      symbol,note,overtime_minutes,holiday_premium_mode,revision,created_at,updated_at,deleted_at
     FROM shift_entries WHERE id=?`,
    id,
  );
  if (row === null) throw new Error("Dienst konnte nicht gespeichert werden.");
  return mapShift(row);
}

export async function saveAppointment(
  db: SQLiteDatabase,
  rawInput: SaveAppointmentInput,
): Promise<Appointment> {
  const input = validateAppointment(rawInput);
  const id = input.id ?? createId("appointment");
  const now = new Date().toISOString();

  if (input.id === undefined) {
    await db.runAsync(
      `INSERT INTO appointments(
        id,date,title,all_day,start_time,end_time,color,note,revision,
        created_at,updated_at,deleted_at
      ) VALUES(?,?,?,?,?,?,?,?,1,?,?,NULL)`,
      id,
      input.date,
      input.title,
      input.allDay ? 1 : 0,
      input.startTime ?? null,
      input.endTime ?? null,
      input.color,
      input.note ?? null,
      now,
      now,
    );
  } else {
    const result = await db.runAsync(
      `UPDATE appointments SET
        date=?,title=?,all_day=?,start_time=?,end_time=?,color=?,note=?,
        revision=revision+1,updated_at=?
       WHERE id=? AND revision=? AND deleted_at IS NULL`,
      input.date,
      input.title,
      input.allDay ? 1 : 0,
      input.startTime ?? null,
      input.endTime ?? null,
      input.color,
      input.note ?? null,
      now,
      id,
      input.expectedRevision ?? -1,
    );
    await requireChanged(result.changes);
  }

  const row = await db.getFirstAsync<AppointmentRow>(
    `SELECT id,date,title,all_day,start_time,end_time,color,note,revision,
      created_at,updated_at,deleted_at FROM appointments WHERE id=?`,
    id,
  );
  if (row === null) throw new Error("Termin konnte nicht gespeichert werden.");
  return mapAppointment(row);
}

export async function deleteCalendarEntry(
  db: SQLiteDatabase,
  entry: Pick<CalendarEntry, "id" | "kind" | "revision">,
): Promise<void> {
  const table = entry.kind === "SHIFT" ? "shift_entries" : "appointments";
  const now = new Date().toISOString();
  const result = await db.runAsync(
    `UPDATE ${table} SET revision=revision+1,updated_at=?,deleted_at=?
     WHERE id=? AND revision=? AND deleted_at IS NULL`,
    now,
    now,
    entry.id,
    entry.revision,
  );
  await requireChanged(result.changes);
}

interface TariffDecisionRow {
  month: string;
  allowance_status: MonthlyTariffDecision["allowanceStatus"];
  revision: number;
  confirmed_at: string;
  updated_at: string;
}

function mapTariffDecision(row: TariffDecisionRow): MonthlyTariffDecision {
  return Object.freeze({
    month: row.month,
    allowanceStatus: row.allowance_status,
    revision: row.revision,
    confirmedAt: row.confirmed_at,
    updatedAt: row.updated_at,
  });
}

export async function listMonthlyTariffDecisions(
  db: SQLiteDatabase,
): Promise<readonly MonthlyTariffDecision[]> {
  const rows = await db.getAllAsync<TariffDecisionRow>(
    `SELECT month,allowance_status,revision,confirmed_at,updated_at
     FROM monthly_tariff_decisions ORDER BY month`,
  );
  return Object.freeze(rows.map(mapTariffDecision));
}

export async function saveMonthlyTariffDecision(
  db: SQLiteDatabase,
  input: SaveMonthlyTariffDecisionInput,
): Promise<MonthlyTariffDecision> {
  if (!/^\d{4}-\d{2}$/.test(input.month)) {
    throw new Error("Ungültiger Auswertungsmonat.");
  }
  const now = new Date().toISOString();
  const existing = await db.getFirstAsync<TariffDecisionRow>(
    `SELECT month,allowance_status,revision,confirmed_at,updated_at
     FROM monthly_tariff_decisions WHERE month=?`,
    input.month,
  );
  if (existing === null) {
    await db.runAsync(
      `INSERT INTO monthly_tariff_decisions(
        month,allowance_status,revision,confirmed_at,updated_at
      ) VALUES(?,?,1,?,?)`,
      input.month,
      input.allowanceStatus,
      now,
      now,
    );
  } else {
    const result = await db.runAsync(
      `UPDATE monthly_tariff_decisions SET allowance_status=?,
       revision=revision+1,confirmed_at=?,updated_at=?
       WHERE month=? AND revision=?`,
      input.allowanceStatus,
      now,
      now,
      input.month,
      input.expectedRevision ?? existing.revision,
    );
    await requireChanged(result.changes);
  }
  const saved = await db.getFirstAsync<TariffDecisionRow>(
    `SELECT month,allowance_status,revision,confirmed_at,updated_at
     FROM monthly_tariff_decisions WHERE month=?`,
    input.month,
  );
  if (saved === null) throw new Error("Tarifentscheidung konnte nicht gespeichert werden.");
  return mapTariffDecision(saved);
}
