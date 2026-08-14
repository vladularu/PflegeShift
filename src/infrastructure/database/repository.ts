import type { SQLiteDatabase } from "expo-sqlite";

import type {
  Appointment,
  CalendarEntry,
  PayGroup,
  PayLevel,
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
  ValidationError,
  validateAppointment,
  validateProfile,
  validateShift,
  validateTemplate,
} from "@/domain/validation";
import { ConcurrencyError } from "@/domain/errors";
import { sortCalendarEntries } from "@/engine/calendar-entry-order";
import { withImmediateTransaction } from "@/infrastructure/database/transaction";

export {
  DEFAULT_CALENDAR_PREFERENCES,
  loadCalendarPreferences,
  loadTvoedWorkPatternSettings,
  saveCalendarPreferences,
  saveTvoedWorkPatternSettings,
} from "@/infrastructure/database/preferences-repository";
export {
  listMonthlyTariffDecisions,
  saveMonthlyTariffDecision,
} from "@/infrastructure/database/tariff-decisions-repository";
export {
  restoreCalendarEntry,
  restoreTemplate,
} from "@/infrastructure/database/repository-restore";

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
  start_time: string | null;
  end_time: string | null;
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
  const validated = validateProfile({
    federalState: row.federal_state,
    weeklyMinutes: row.weekly_minutes,
    timeZone: row.time_zone,
    tariff,
  });
  return Object.freeze({
    federalState: validated.federalState,
    weeklyMinutes: validated.weeklyMinutes,
    timeZone: validated.timeZone,
    tariff: validated.tariff ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapTemplate(row: TemplateRow): ShiftTemplate {
  if (!Number.isInteger(row.sort_order) || !Number.isInteger(row.revision)) {
    throw new ValidationError("Gespeicherte Vorlagendaten sind ungültig.");
  }
  const validated = validateTemplate({
    id: row.id,
    name: row.name,
    type: row.type,
    startTime: row.start_time,
    endTime: row.end_time,
    breakMinutes: row.break_minutes,
    color: row.color,
    symbol: row.symbol,
    sortOrder: row.sort_order,
  });
  return Object.freeze({
    id: row.id,
    name: validated.name,
    type: validated.type,
    startTime: validated.startTime ?? null,
    endTime: validated.endTime ?? null,
    breakMinutes: validated.breakMinutes,
    color: validated.color,
    symbol: validated.symbol,
    sortOrder: validated.sortOrder,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  });
}

function mapShift(row: ShiftRow): ShiftEntry {
  if (!Number.isInteger(row.revision)) {
    throw new ValidationError("Gespeicherte Dienstdaten sind ungültig.");
  }
  const validated = validateShift({
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
  });
  return Object.freeze({
    kind: "SHIFT",
    id: row.id,
    date: validated.date,
    templateId: validated.templateId ?? null,
    title: validated.title,
    type: validated.type,
    startTime: validated.startTime ?? null,
    endTime: validated.endTime ?? null,
    breakMinutes: validated.breakMinutes ?? 0,
    color: validated.color,
    symbol: validated.symbol,
    note: validated.note ?? null,
    overtimeMinutes: validated.overtimeMinutes ?? 0,
    holidayPremiumMode: validated.holidayPremiumMode ?? "WITH_TIME_OFF",
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  });
}

function mapAppointment(row: AppointmentRow): Appointment {
  if ((row.all_day !== 0 && row.all_day !== 1) || !Number.isInteger(row.revision)) {
    throw new ValidationError("Gespeicherte Termindaten sind ungültig.");
  }
  const validated = validateAppointment({
    id: row.id,
    date: row.date,
    title: row.title,
    allDay: row.all_day === 1,
    startTime: row.start_time,
    endTime: row.end_time,
    color: row.color,
    note: row.note,
  });
  return Object.freeze({
    kind: "APPOINTMENT",
    id: row.id,
    date: validated.date,
    title: validated.title,
    allDay: validated.allDay,
    startTime: validated.startTime ?? null,
    endTime: validated.endTime ?? null,
    color: validated.color,
    note: validated.note ?? null,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  });
}

async function requireChanged(changes: number): Promise<void> {
  if (changes !== 1) {
    throw new ConcurrencyError();
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

export async function swapTemplateSortOrder(
  db: SQLiteDatabase,
  first: ShiftTemplate,
  second: ShiftTemplate,
): Promise<readonly [ShiftTemplate, ShiftTemplate]> {
  let swapped: readonly [ShiftTemplate, ShiftTemplate] | null = null;

  await withImmediateTransaction(db, async (transaction) => {
    const now = new Date().toISOString();
    const firstResult = await transaction.runAsync(
      `UPDATE shift_templates SET sort_order=?,revision=revision+1,updated_at=?
       WHERE id=? AND revision=? AND deleted_at IS NULL`,
      second.sortOrder,
      now,
      first.id,
      first.revision,
    );
    await requireChanged(firstResult.changes);

    const secondResult = await transaction.runAsync(
      `UPDATE shift_templates SET sort_order=?,revision=revision+1,updated_at=?
       WHERE id=? AND revision=? AND deleted_at IS NULL`,
      first.sortOrder,
      now,
      second.id,
      second.revision,
    );
    await requireChanged(secondResult.changes);

    const rows = await transaction.getAllAsync<TemplateRow>(
      `SELECT id,name,type,start_time,end_time,break_minutes,color,symbol,sort_order,
        revision,created_at,updated_at,deleted_at
       FROM shift_templates WHERE id IN (?,?)`,
      first.id,
      second.id,
    );
    if (rows.length !== 2) throw new ConcurrencyError();
    const mapped = rows.map(mapTemplate);
    const savedFirst = mapped.find((template) => template.id === first.id);
    const savedSecond = mapped.find((template) => template.id === second.id);
    if (!savedFirst || !savedSecond) throw new ConcurrencyError();
    swapped = Object.freeze([savedFirst, savedSecond]);
  });

  if (swapped === null) throw new ConcurrencyError();
  return swapped;
}

export async function listCalendarEntries(
  db: SQLiteDatabase,
  startDate = "1900-01-01",
  endDate = "4099-12-31",
): Promise<readonly CalendarEntry[]> {
  const shifts = await db.getAllAsync<ShiftRow>(
    `SELECT entries.id,entries.date,entries.template_id,
      COALESCE(templates.name,entries.title) AS title,entries.type,
      entries.start_time,entries.end_time,entries.break_minutes,
      COALESCE(templates.color,entries.color) AS color,
      COALESCE(templates.symbol,entries.symbol) AS symbol,
      entries.note,entries.overtime_minutes,entries.holiday_premium_mode,
      entries.revision,entries.created_at,entries.updated_at,entries.deleted_at
     FROM shift_entries entries
     LEFT JOIN shift_templates templates ON templates.id=entries.template_id
     WHERE entries.deleted_at IS NULL AND entries.date BETWEEN ? AND ?`,
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
  return sortCalendarEntries([...shifts.map(mapShift), ...appointments.map(mapAppointment)]);
}

export async function saveShift(db: SQLiteDatabase, rawInput: SaveShiftInput): Promise<ShiftEntry> {
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
