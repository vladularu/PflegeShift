export interface RawShiftRow {
  id: string;
  date: string;
  template_id: string | null;
  title: string;
  type: string;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number;
  color: string;
  symbol: string;
  note: string | null;
  overtime_minutes: number;
  holiday_premium_mode: string;
  revision: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  test_run_id: string | null;
}

export interface RawAppointmentRow {
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
  test_run_id: string | null;
}

export interface RawDecisionRow {
  month: string;
  allowance_status: string;
  revision: number;
  confirmed_at: string;
  updated_at: string;
}

export interface BackupPayload {
  version: 1;
  month: string;
  counts: {
    appointments: number;
    decisions: 0 | 1;
    shifts: number;
  };
  shifts: RawShiftRow[];
  appointments: RawAppointmentRow[];
  decision: RawDecisionRow | null;
}

type UnknownRecord = Record<string, unknown>;

const SHIFT_TYPES = new Set([
  "EARLY",
  "LATE",
  "NIGHT",
  "DAY",
  "TRAINING",
  "VACATION",
  "SICK",
  "FREE",
  "CUSTOM",
]);
const PREMIUM_MODES = new Set(["WITH_TIME_OFF", "WITHOUT_TIME_OFF"]);
const ALLOWANCE_STATUSES = new Set([
  "NONE",
  "SHIFT_MONTHLY",
  "SHIFT_HOURLY",
  "ALTERNATING_MONTHLY",
  "ALTERNATING_HOURLY",
]);

function invalid(reason: string): never {
  throw new Error(`Das Testlabor-Backup ist ungültig: ${reason}.`);
}

function record(value: unknown, label: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalid(label);
  }
  return value as UnknownRecord;
}

function stringValue(row: UnknownRecord, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || value.length === 0) invalid(key);
  return value;
}

function nullableString(row: UnknownRecord, key: string): string | null {
  const value = row[key];
  if (value !== null && typeof value !== "string") invalid(key);
  return value;
}

function integerValue(row: UnknownRecord, key: string, minimum = 0): number {
  const value = row[key];
  if (!Number.isSafeInteger(value) || (value as number) < minimum) invalid(key);
  return value as number;
}

function assertDateInMonth(date: string, month: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])-([012]\d|3[01])$/.test(date) || !date.startsWith(`${month}-`)) {
    invalid("Monatszuordnung");
  }
}

function validateShift(value: unknown, month: string): RawShiftRow {
  const row = record(value, "Dienst");
  const date = stringValue(row, "date");
  assertDateInMonth(date, month);
  if (!SHIFT_TYPES.has(stringValue(row, "type"))) invalid("Diensttyp");
  if (!PREMIUM_MODES.has(stringValue(row, "holiday_premium_mode"))) {
    invalid("Feiertagsmodus");
  }
  stringValue(row, "id");
  nullableString(row, "template_id");
  stringValue(row, "title");
  nullableString(row, "start_time");
  nullableString(row, "end_time");
  integerValue(row, "break_minutes");
  stringValue(row, "color");
  stringValue(row, "symbol");
  nullableString(row, "note");
  integerValue(row, "overtime_minutes");
  integerValue(row, "revision", 1);
  stringValue(row, "created_at");
  stringValue(row, "updated_at");
  nullableString(row, "deleted_at");
  nullableString(row, "test_run_id");
  return row as unknown as RawShiftRow;
}

function validateAppointment(value: unknown, month: string): RawAppointmentRow {
  const row = record(value, "Termin");
  const date = stringValue(row, "date");
  assertDateInMonth(date, month);
  stringValue(row, "id");
  stringValue(row, "title");
  const allDay = integerValue(row, "all_day");
  if (allDay !== 0 && allDay !== 1) invalid("Ganztagsstatus");
  nullableString(row, "start_time");
  nullableString(row, "end_time");
  stringValue(row, "color");
  nullableString(row, "note");
  integerValue(row, "revision", 1);
  stringValue(row, "created_at");
  stringValue(row, "updated_at");
  nullableString(row, "deleted_at");
  nullableString(row, "test_run_id");
  return row as unknown as RawAppointmentRow;
}

function validateDecision(value: unknown, month: string): RawDecisionRow | null {
  if (value === null) return null;
  const row = record(value, "Tarifentscheidung");
  if (stringValue(row, "month") !== month) invalid("Tarifmonat");
  if (!ALLOWANCE_STATUSES.has(stringValue(row, "allowance_status"))) {
    invalid("Tarifstatus");
  }
  integerValue(row, "revision", 1);
  stringValue(row, "confirmed_at");
  stringValue(row, "updated_at");
  return row as unknown as RawDecisionRow;
}

function assertUniqueIds(rows: readonly { id: string }[], label: string): void {
  if (new Set(rows.map((row) => row.id)).size !== rows.length) invalid(label);
}

function normalizePayload(value: unknown, expectedMonth: string): BackupPayload {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(expectedMonth)) invalid("Monat");
  const payload = record(value, "Format");
  const sourceShifts = payload.shifts;
  const sourceAppointments = payload.appointments;
  if (!Array.isArray(sourceShifts) || !Array.isArray(sourceAppointments)) {
    invalid("Datensatzlisten");
  }
  const shifts = sourceShifts.map((row) => validateShift(row, expectedMonth));
  const appointments = sourceAppointments.map((row) => validateAppointment(row, expectedMonth));
  const decision = validateDecision(payload.decision, expectedMonth);
  assertUniqueIds(shifts, "doppelte Dienst-ID");
  assertUniqueIds(appointments, "doppelte Termin-ID");

  if (payload.version !== undefined) {
    if (payload.version !== 1 || payload.month !== expectedMonth) invalid("Version oder Monat");
    const counts = record(payload.counts, "Zeilenanzahlen");
    if (
      counts.shifts !== shifts.length ||
      counts.appointments !== appointments.length ||
      counts.decisions !== (decision === null ? 0 : 1)
    ) {
      invalid("Zeilenanzahlen");
    }
  }

  return {
    version: 1,
    month: expectedMonth,
    counts: {
      appointments: appointments.length,
      decisions: decision === null ? 0 : 1,
      shifts: shifts.length,
    },
    shifts,
    appointments,
    decision,
  };
}

export function createDevBackupPayload(
  month: string,
  data: Pick<BackupPayload, "appointments" | "decision" | "shifts">,
): BackupPayload {
  return normalizePayload(
    {
      ...data,
      counts: {
        appointments: data.appointments.length,
        decisions: data.decision === null ? 0 : 1,
        shifts: data.shifts.length,
      },
      month,
      version: 1,
    },
    month,
  );
}

export function parseDevBackupPayload(serialized: string, expectedMonth: string): BackupPayload {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    invalid("JSON");
  }
  return normalizePayload(value, expectedMonth);
}
