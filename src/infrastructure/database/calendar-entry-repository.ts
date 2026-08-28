import type { SQLiteDatabase } from "expo-sqlite";

import type {
  Appointment,
  CalendarEntry,
  EntryLocation,
  EntryNotification,
  RecurrenceFrequency,
  SaveAppointmentInput,
  SaveShiftInput,
  ShiftEntry,
} from "@/domain/types";
import { createId, ValidationError, validateAppointment, validateShift } from "@/domain/validation";
import { sortCalendarEntries } from "@/engine/calendar-entry-order";
import {
  parseJson,
  requireChanged,
  serializeJson,
} from "@/infrastructure/database/repository-shared";

interface ShiftRow {
  id: string;
  date: string;
  template_id: string | null;
  title: string;
  type: ShiftEntry["type"];
  all_day: number;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number;
  color: string;
  symbol: string;
  note: string | null;
  notification_json: string | null;
  alarm_enabled: number;
  location_json: string | null;
  overtime_minutes: number;
  tariff_overtime_confirmed: number;
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
  recurrence_frequency: RecurrenceFrequency | null;
  recurrence_interval: number | null;
  notification_json: string | null;
  location_json: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
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
    allDay: row.all_day === 1 || row.start_time === null,
    startTime: row.start_time,
    endTime: row.end_time,
    breakMinutes: row.break_minutes,
    color: row.color,
    symbol: row.symbol,
    note: row.note,
    notification: parseJson<EntryNotification>(row.notification_json, "Benachrichtigung"),
    alarmEnabled: row.alarm_enabled === 1,
    location: parseJson<EntryLocation>(row.location_json, "Ort"),
    overtimeMinutes: row.overtime_minutes,
    tariffOvertimeConfirmed: row.tariff_overtime_confirmed === 1,
    holidayPremiumMode: row.holiday_premium_mode,
  });
  return Object.freeze({
    kind: "SHIFT",
    id: row.id,
    date: validated.date,
    templateId: validated.templateId ?? null,
    title: validated.title,
    type: validated.type,
    allDay: validated.allDay ?? false,
    startTime: validated.startTime ?? null,
    endTime: validated.endTime ?? null,
    breakMinutes: validated.breakMinutes ?? 0,
    color: validated.color,
    symbol: validated.symbol,
    note: validated.note ?? null,
    notification: validated.notification ?? null,
    alarmEnabled: validated.alarmEnabled ?? false,
    location: validated.location ?? null,
    overtimeMinutes: validated.overtimeMinutes ?? 0,
    tariffOvertimeConfirmed: validated.tariffOvertimeConfirmed ?? false,
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
    recurrence:
      row.recurrence_frequency !== null && row.recurrence_interval !== null
        ? { frequency: row.recurrence_frequency, interval: row.recurrence_interval }
        : null,
    notification: parseJson<EntryNotification>(row.notification_json, "Benachrichtigung"),
    location: parseJson<EntryLocation>(row.location_json, "Ort"),
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
    recurrence: validated.recurrence ?? null,
    notification: validated.notification ?? null,
    location: validated.location ?? null,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  });
}

export async function listCalendarEntries(
  db: SQLiteDatabase,
  startDate = "1900-01-01",
  endDate = "4099-12-31",
): Promise<readonly CalendarEntry[]> {
  const shifts = await db.getAllAsync<ShiftRow>(
    `SELECT entries.id,entries.date,entries.template_id,
      COALESCE(templates.name,entries.title) AS title,entries.type,entries.all_day,
      entries.start_time,entries.end_time,entries.break_minutes,
      COALESCE(templates.color,entries.color) AS color,
      COALESCE(templates.symbol,entries.symbol) AS symbol,
      entries.note,entries.notification_json,entries.alarm_enabled,entries.location_json,
      entries.overtime_minutes,entries.tariff_overtime_confirmed,entries.holiday_premium_mode,
      entries.revision,entries.created_at,entries.updated_at,entries.deleted_at
     FROM shift_entries entries
     LEFT JOIN shift_templates templates ON templates.id=entries.template_id
     WHERE entries.deleted_at IS NULL AND entries.date BETWEEN ? AND ?`,
    startDate,
    endDate,
  );
  const appointments = await db.getAllAsync<AppointmentRow>(
    `SELECT id,date,title,all_day,start_time,end_time,color,note,
      recurrence_frequency,recurrence_interval,notification_json,location_json,revision,
      created_at,updated_at,deleted_at
     FROM appointments
     WHERE deleted_at IS NULL AND date <= ?
       AND (recurrence_frequency IS NOT NULL OR date >= ?)`,
    endDate,
    startDate,
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
        id,date,template_id,title,type,all_day,start_time,end_time,break_minutes,color,
        symbol,note,notification_json,alarm_enabled,location_json,overtime_minutes,
        tariff_overtime_confirmed,holiday_premium_mode,
        revision,created_at,updated_at,deleted_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,NULL)`,
      id,
      input.date,
      input.templateId ?? null,
      input.title,
      input.type,
      input.allDay ? 1 : 0,
      input.startTime ?? null,
      input.endTime ?? null,
      input.breakMinutes ?? 0,
      input.color,
      input.symbol,
      input.note ?? null,
      serializeJson(input.notification),
      input.alarmEnabled ? 1 : 0,
      serializeJson(input.location),
      input.overtimeMinutes ?? 0,
      input.tariffOvertimeConfirmed ? 1 : 0,
      input.holidayPremiumMode ?? "WITH_TIME_OFF",
      now,
      now,
    );
  } else {
    const result = await db.runAsync(
      `UPDATE shift_entries SET
        date=?,template_id=?,title=?,type=?,all_day=?,start_time=?,end_time=?,break_minutes=?,
        color=?,symbol=?,note=?,notification_json=?,alarm_enabled=?,location_json=?,
        overtime_minutes=?,tariff_overtime_confirmed=?,holiday_premium_mode=?,
        revision=revision+1,updated_at=?
       WHERE id=? AND revision=? AND deleted_at IS NULL`,
      input.date,
      input.templateId ?? null,
      input.title,
      input.type,
      input.allDay ? 1 : 0,
      input.startTime ?? null,
      input.endTime ?? null,
      input.breakMinutes ?? 0,
      input.color,
      input.symbol,
      input.note ?? null,
      serializeJson(input.notification),
      input.alarmEnabled ? 1 : 0,
      serializeJson(input.location),
      input.overtimeMinutes ?? 0,
      input.tariffOvertimeConfirmed ? 1 : 0,
      input.holidayPremiumMode ?? "WITH_TIME_OFF",
      now,
      id,
      input.expectedRevision ?? -1,
    );
    await requireChanged(result.changes);
  }

  const row = await db.getFirstAsync<ShiftRow>(
    `SELECT id,date,template_id,title,type,all_day,start_time,end_time,break_minutes,color,
      symbol,note,notification_json,alarm_enabled,location_json,overtime_minutes,
      tariff_overtime_confirmed,holiday_premium_mode,
      revision,created_at,updated_at,deleted_at
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
        id,date,title,all_day,start_time,end_time,color,note,
        recurrence_frequency,recurrence_interval,notification_json,location_json,revision,
        created_at,updated_at,deleted_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,NULL)`,
      id,
      input.date,
      input.title,
      input.allDay ? 1 : 0,
      input.startTime ?? null,
      input.endTime ?? null,
      input.color,
      input.note ?? null,
      input.recurrence?.frequency ?? null,
      input.recurrence?.interval ?? null,
      serializeJson(input.notification),
      serializeJson(input.location),
      now,
      now,
    );
  } else {
    const result = await db.runAsync(
      `UPDATE appointments SET
        date=?,title=?,all_day=?,start_time=?,end_time=?,color=?,note=?,
        recurrence_frequency=?,recurrence_interval=?,notification_json=?,location_json=?,
        revision=revision+1,updated_at=?
       WHERE id=? AND revision=? AND deleted_at IS NULL`,
      input.date,
      input.title,
      input.allDay ? 1 : 0,
      input.startTime ?? null,
      input.endTime ?? null,
      input.color,
      input.note ?? null,
      input.recurrence?.frequency ?? null,
      input.recurrence?.interval ?? null,
      serializeJson(input.notification),
      serializeJson(input.location),
      now,
      id,
      input.expectedRevision ?? -1,
    );
    await requireChanged(result.changes);
  }

  const row = await db.getFirstAsync<AppointmentRow>(
    `SELECT id,date,title,all_day,start_time,end_time,color,note,
      recurrence_frequency,recurrence_interval,notification_json,location_json,revision,
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
