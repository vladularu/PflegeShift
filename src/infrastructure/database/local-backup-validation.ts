import canonicalize from "canonicalize";
import type { SQLiteDatabase } from "expo-sqlite";
import { APPEARANCE_KEYS, isAppearanceMode, isThemeId } from "@/domain/appearance";
import { ANALYSIS_VIEW_KEY, parseAnalysisView } from "@/domain/analysis-view";

import type {
  EntryLocation,
  EntryNotification,
  HolidayRegion,
  Industry,
  PayGroup,
  PayLevel,
  RecurrenceFrequency,
  ShiftType,
  TariffRegion,
  TariffSector,
} from "@/domain/types";
import { TARIFF_REGIONS } from "@/domain/types";
import {
  requireInstant,
  requireNonEmpty,
  requirePositiveRevision,
  validateAppointment,
  validateMonthlyTariffDecision,
  validateProfile,
  validateShift,
  validateTemplate,
} from "@/domain/validation";
import {
  LOCAL_BACKUP_FORMAT,
  LOCAL_BACKUP_VERSION,
  type LocalBackupDocument,
} from "@/infrastructure/database/local-backup";
import { USER_DATA_PREFERENCE_KEYS } from "@/infrastructure/database/preferences-repository";

export const MAX_LOCAL_BACKUP_CHARACTERS = 10 * 1024 * 1024;

export type BackupRow = LocalBackupDocument["data"]["templates"][number];
type JsonRecord = Readonly<Record<string, unknown>>;

const PROFILE_IDENTITY_COLUMNS = ["display_name", "employer_name"] as const;
const LEGACY_PROFILE_COLUMNS = [
  "id",
  "federal_state",
  "weekly_minutes",
  "time_zone",
  "pay_group",
  "pay_level",
  "tariff_sector",
  "full_time_weekly_minutes",
  "holiday_region",
  "tariff_region",
  "regular_rotating_night_work",
  "sunday_holiday_work_eligible",
  "all_employment_work_recorded",
  "industry",
  "manual_monthly_gross_cents",
  "created_at",
  "updated_at",
] as const;

export const PROFILE_COLUMNS = [...LEGACY_PROFILE_COLUMNS, ...PROFILE_IDENTITY_COLUMNS] as const;

export const TEMPLATE_COLUMNS = [
  "id",
  "name",
  "type",
  "start_time",
  "end_time",
  "break_minutes",
  "color",
  "symbol",
  "sort_order",
  "all_day",
  "notification_json",
  "location_json",
  "revision",
  "created_at",
  "updated_at",
  "deleted_at",
] as const;

export const SHIFT_COLUMNS = [
  "id",
  "date",
  "template_id",
  "title",
  "type",
  "all_day",
  "start_time",
  "end_time",
  "break_minutes",
  "color",
  "symbol",
  "note",
  "notification_json",
  "alarm_enabled",
  "location_json",
  "overtime_minutes",
  "tariff_overtime_confirmed",
  "holiday_premium_mode",
  "revision",
  "created_at",
  "updated_at",
  "deleted_at",
] as const;

export const APPOINTMENT_COLUMNS = [
  "id",
  "date",
  "title",
  "all_day",
  "start_time",
  "end_time",
  "color",
  "note",
  "recurrence_frequency",
  "recurrence_interval",
  "notification_json",
  "location_json",
  "revision",
  "created_at",
  "updated_at",
  "deleted_at",
] as const;

export const TARIFF_DECISION_COLUMNS = [
  "month",
  "allowance_status",
  "revision",
  "confirmed_at",
  "updated_at",
] as const;

export const PREFERENCE_COLUMNS = ["key", "value", "updated_at"] as const;

const DATA_KEYS = [
  "profile",
  "templates",
  "shifts",
  "appointments",
  "monthlyTariffDecisions",
  "preferences",
] as const;

const TOP_LEVEL_KEYS = [
  "format",
  "version",
  "createdAt",
  "appVersion",
  "databaseSchemaVersion",
  "data",
  "integrity",
] as const;

const INTEGRITY_KEYS = ["algorithm", "canonicalization", "scope", "value"] as const;

const REQUIRED_DEFAULT_TEMPLATE_IDS = [
  "default-early",
  "default-late",
  "default-night",
  "default-day",
  "default-vacation",
  "default-sick",
  "default-free",
] as const;

const VALIDATED_BACKUP = Symbol("validated-local-backup");

export interface LocalBackupPreview {
  readonly createdAt: string;
  readonly appVersion: string | null;
  readonly databaseSchemaVersion: number;
  readonly profileIncluded: boolean;
  readonly templateCount: number;
  readonly shiftCount: number;
  readonly appointmentCount: number;
  readonly monthlyTariffDecisionCount: number;
  readonly preferenceCount: number;
  readonly deletedRecordCount: number;
  readonly firstEntryDate: string | null;
  readonly lastEntryDate: string | null;
}

export interface ValidatedLocalBackup {
  readonly document: LocalBackupDocument;
  readonly preview: LocalBackupPreview;
  readonly [VALIDATED_BACKUP]: true;
}

export class LocalBackupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalBackupValidationError";
  }
}

function invalid(message = "Die Datei ist kein gültiges LUNA-Shift-Backup."): never {
  throw new LocalBackupValidationError(message);
}

function asRecord(value: unknown): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return invalid();
  return value as JsonRecord;
}

function exactRecord(value: unknown, keys: readonly string[]): JsonRecord {
  const record = asRecord(value);
  const actualKeys = Object.keys(record);
  if (actualKeys.length !== keys.length || actualKeys.some((key) => !keys.includes(key))) {
    return invalid();
  }
  return record;
}

function allowedRecord(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
): JsonRecord {
  const record = asRecord(value);
  const allowedKeys = [...requiredKeys, ...optionalKeys];
  const actualKeys = Object.keys(record);
  if (
    requiredKeys.some((key) => !Object.hasOwn(record, key)) ||
    actualKeys.some((key) => !allowedKeys.includes(key))
  ) {
    return invalid();
  }
  return record;
}

function stringValue(record: JsonRecord, key: string): string {
  const value = record[key];
  if (typeof value !== "string") return invalid();
  return value;
}

function nullableStringValue(record: JsonRecord, key: string): string | null {
  const value = record[key];
  if (value !== null && typeof value !== "string") return invalid();
  return value;
}

function integerValue(record: JsonRecord, key: string): number {
  const value = record[key];
  if (!Number.isSafeInteger(value)) return invalid();
  return value as number;
}

function nullableIntegerValue(record: JsonRecord, key: string): number | null {
  const value = record[key];
  if (value !== null && !Number.isSafeInteger(value)) return invalid();
  return value as number | null;
}

function binaryValue(record: JsonRecord, key: string): 0 | 1 {
  const value = integerValue(record, key);
  if (value !== 0 && value !== 1) return invalid();
  return value;
}

function nullableBinaryValue(record: JsonRecord, key: string): 0 | 1 | null {
  const value = nullableIntegerValue(record, key);
  if (value !== null && value !== 0 && value !== 1) return invalid();
  return value;
}

function instantValue(record: JsonRecord, key: string): string {
  return requireInstant(stringValue(record, key), key);
}

function nullableInstantValue(record: JsonRecord, key: string): string | null {
  const value = nullableStringValue(record, key);
  return value === null ? null : requireInstant(value, key);
}

function parseNullableJson(record: JsonRecord, key: string): unknown | null {
  const value = nullableStringValue(record, key);
  if (value === null) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return invalid();
  }
}

function notificationValue(record: JsonRecord, key: string): EntryNotification | null {
  const parsed = parseNullableJson(record, key);
  if (parsed === null) return null;
  const notification = exactRecord(parsed, ["amount", "unit", "direction", "reference"]);
  return {
    amount: integerValue(notification, "amount"),
    unit: stringValue(notification, "unit") as EntryNotification["unit"],
    direction: stringValue(notification, "direction") as EntryNotification["direction"],
    reference: stringValue(notification, "reference") as EntryNotification["reference"],
  };
}

function locationValue(record: JsonRecord, key: string): EntryLocation | null {
  const parsed = parseNullableJson(record, key);
  if (parsed === null) return null;
  const location = allowedRecord(parsed, ["name"], ["address", "latitude", "longitude"]);
  const name = stringValue(location, "name");
  if (requireNonEmpty(name, "Ort") !== name) return invalid();
  const addressValue = location.address;
  if (addressValue !== undefined && typeof addressValue !== "string") return invalid();
  if (
    typeof addressValue === "string" &&
    (addressValue.length === 0 || addressValue.trim() !== addressValue)
  ) {
    return invalid();
  }
  const hasLatitude = Object.hasOwn(location, "latitude");
  const hasLongitude = Object.hasOwn(location, "longitude");
  if (hasLatitude !== hasLongitude) return invalid();
  const latitude = location.latitude;
  const longitude = location.longitude;
  if (
    (hasLatitude && (typeof latitude !== "number" || !Number.isFinite(latitude))) ||
    (hasLongitude && (typeof longitude !== "number" || !Number.isFinite(longitude)))
  ) {
    return invalid();
  }
  return {
    name,
    ...(typeof addressValue === "string" && addressValue.length > 0
      ? { address: addressValue }
      : {}),
    ...(hasLatitude && hasLongitude
      ? { latitude: latitude as number, longitude: longitude as number }
      : {}),
  };
}

function asArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) return invalid();
  return value;
}

function frozenBackupRow(record: JsonRecord): BackupRow {
  return Object.freeze({ ...record }) as BackupRow;
}

function validateProfileRow(value: unknown): BackupRow {
  // Keep absent legacy fields absent until after the original document's integrity check.
  const row = allowedRecord(value, LEGACY_PROFILE_COLUMNS, PROFILE_IDENTITY_COLUMNS);
  const displayName =
    row.display_name === undefined ? null : nullableStringValue(row, "display_name");
  const employerName =
    row.employer_name === undefined ? null : nullableStringValue(row, "employer_name");
  if (stringValue(row, "id") !== "singleton") return invalid();
  const payGroup = nullableStringValue(row, "pay_group");
  const payLevel = nullableIntegerValue(row, "pay_level");
  const tariffSector = nullableStringValue(row, "tariff_sector");
  const fullTimeWeeklyMinutes = nullableIntegerValue(row, "full_time_weekly_minutes");
  const tariffRegion = stringValue(row, "tariff_region");
  if (!TARIFF_REGIONS.includes(tariffRegion as TariffRegion)) return invalid();
  const tariffValues = [payGroup, payLevel, tariffSector, fullTimeWeeklyMinutes];
  const tariffComplete = tariffValues.every((item) => item !== null);
  if (!tariffComplete && tariffValues.some((item) => item !== null)) return invalid();
  const regularRotatingNightWork = nullableBinaryValue(row, "regular_rotating_night_work");
  const sundayHolidayWorkEligible = nullableBinaryValue(row, "sunday_holiday_work_eligible");
  const allEmploymentWorkRecorded = nullableBinaryValue(row, "all_employment_work_recorded");
  const manualMonthlyGrossCents = nullableIntegerValue(row, "manual_monthly_gross_cents");

  const validated = validateProfile({
    displayName,
    employerName,
    federalState: stringValue(row, "federal_state") as never,
    weeklyMinutes: integerValue(row, "weekly_minutes"),
    timeZone: stringValue(row, "time_zone"),
    holidayRegion: stringValue(row, "holiday_region") as HolidayRegion,
    industry: nullableStringValue(row, "industry") as Industry | null,
    manualMonthlyGrossCents,
    regularRotatingNightWork:
      regularRotatingNightWork === null ? null : regularRotatingNightWork === 1,
    sundayHolidayWorkEligible:
      sundayHolidayWorkEligible === null ? null : sundayHolidayWorkEligible === 1,
    allEmploymentWorkRecorded:
      allEmploymentWorkRecorded === null ? null : allEmploymentWorkRecorded === 1,
    tariff: tariffComplete
      ? {
          payGroup: payGroup as PayGroup,
          payLevel: payLevel as PayLevel,
          sector: tariffSector as TariffSector,
          tariffRegion: tariffRegion as TariffRegion,
          fullTimeWeeklyMinutes: fullTimeWeeklyMinutes as number,
        }
      : null,
  });
  if (
    validated.displayName !== displayName ||
    validated.employerName !== employerName ||
    validated.timeZone !== stringValue(row, "time_zone") ||
    validated.weeklyMinutes !== integerValue(row, "weekly_minutes") ||
    validated.industry !== (nullableStringValue(row, "industry") as Industry | null) ||
    validated.manualMonthlyGrossCents !== manualMonthlyGrossCents
  ) {
    return invalid();
  }
  instantValue(row, "created_at");
  instantValue(row, "updated_at");
  return frozenBackupRow(row);
}

function validateTemplateRow(value: unknown): BackupRow {
  const row = exactRecord(value, TEMPLATE_COLUMNS);
  const id = stringValue(row, "id");
  if (requireNonEmpty(id, "ID") !== id) return invalid();
  const allDay = binaryValue(row, "all_day") === 1;
  const name = stringValue(row, "name");
  const type = stringValue(row, "type") as ShiftType;
  const startTime = nullableStringValue(row, "start_time");
  const endTime = nullableStringValue(row, "end_time");
  const breakMinutes = integerValue(row, "break_minutes");
  const color = stringValue(row, "color");
  const symbol = stringValue(row, "symbol");
  const sortOrder = integerValue(row, "sort_order");
  const validated = validateTemplate({
    id,
    name,
    type,
    allDay,
    startTime,
    endTime,
    breakMinutes,
    color,
    symbol,
    sortOrder,
    notification: notificationValue(row, "notification_json"),
    location: locationValue(row, "location_json"),
  });
  if (
    validated.name !== name ||
    validated.type !== type ||
    validated.startTime !== startTime ||
    validated.endTime !== endTime ||
    validated.breakMinutes !== breakMinutes ||
    validated.color !== color ||
    validated.symbol !== symbol ||
    validated.sortOrder !== sortOrder
  ) {
    return invalid();
  }
  requirePositiveRevision(integerValue(row, "revision"));
  instantValue(row, "created_at");
  instantValue(row, "updated_at");
  nullableInstantValue(row, "deleted_at");
  return frozenBackupRow(row);
}

function validateShiftRow(value: unknown): BackupRow {
  const row = exactRecord(value, SHIFT_COLUMNS);
  const id = stringValue(row, "id");
  if (requireNonEmpty(id, "ID") !== id) return invalid();
  const allDay = binaryValue(row, "all_day") === 1;
  const alarmEnabled = binaryValue(row, "alarm_enabled") === 1;
  const tariffOvertimeConfirmed = binaryValue(row, "tariff_overtime_confirmed") === 1;
  const date = stringValue(row, "date");
  const templateId = nullableStringValue(row, "template_id");
  const title = stringValue(row, "title");
  const type = stringValue(row, "type") as ShiftType;
  const startTime = nullableStringValue(row, "start_time");
  const endTime = nullableStringValue(row, "end_time");
  const breakMinutes = integerValue(row, "break_minutes");
  const color = stringValue(row, "color");
  const symbol = stringValue(row, "symbol");
  const note = nullableStringValue(row, "note");
  const overtimeMinutes = integerValue(row, "overtime_minutes");
  const holidayPremiumMode = stringValue(row, "holiday_premium_mode");
  const validated = validateShift({
    id,
    date,
    templateId,
    title,
    type,
    allDay,
    startTime,
    endTime,
    breakMinutes,
    color,
    symbol,
    note,
    notification: notificationValue(row, "notification_json"),
    alarmEnabled,
    location: locationValue(row, "location_json"),
    overtimeMinutes,
    tariffOvertimeConfirmed,
    holidayPremiumMode: holidayPremiumMode as never,
  });
  if (
    validated.date !== date ||
    validated.templateId !== templateId ||
    validated.title !== title ||
    validated.type !== type ||
    validated.startTime !== startTime ||
    validated.endTime !== endTime ||
    validated.breakMinutes !== breakMinutes ||
    validated.color !== color ||
    validated.symbol !== symbol ||
    (validated.note ?? null) !== note ||
    validated.alarmEnabled !== alarmEnabled ||
    validated.overtimeMinutes !== overtimeMinutes ||
    validated.tariffOvertimeConfirmed !== tariffOvertimeConfirmed ||
    validated.holidayPremiumMode !== holidayPremiumMode
  ) {
    return invalid();
  }
  requirePositiveRevision(integerValue(row, "revision"));
  instantValue(row, "created_at");
  instantValue(row, "updated_at");
  nullableInstantValue(row, "deleted_at");
  return frozenBackupRow(row);
}

function validateAppointmentRow(value: unknown): BackupRow {
  const row = exactRecord(value, APPOINTMENT_COLUMNS);
  const id = stringValue(row, "id");
  if (requireNonEmpty(id, "ID") !== id) return invalid();
  const allDay = binaryValue(row, "all_day") === 1;
  const recurrenceFrequency = nullableStringValue(row, "recurrence_frequency");
  const recurrenceInterval = nullableIntegerValue(row, "recurrence_interval");
  if ((recurrenceFrequency === null) !== (recurrenceInterval === null)) return invalid();
  const date = stringValue(row, "date");
  const title = stringValue(row, "title");
  const startTime = nullableStringValue(row, "start_time");
  const endTime = nullableStringValue(row, "end_time");
  const color = stringValue(row, "color");
  const note = nullableStringValue(row, "note");
  const validated = validateAppointment({
    id,
    date,
    title,
    allDay,
    startTime,
    endTime,
    color,
    note,
    recurrence:
      recurrenceFrequency === null
        ? null
        : {
            frequency: recurrenceFrequency as RecurrenceFrequency,
            interval: recurrenceInterval as number,
          },
    notification: notificationValue(row, "notification_json"),
    location: locationValue(row, "location_json"),
  });
  if (
    validated.date !== date ||
    validated.title !== title ||
    validated.allDay !== allDay ||
    validated.startTime !== startTime ||
    validated.endTime !== endTime ||
    validated.color !== color ||
    (validated.note ?? null) !== note ||
    (validated.recurrence?.frequency ?? null) !== recurrenceFrequency ||
    (validated.recurrence?.interval ?? null) !== recurrenceInterval
  ) {
    return invalid();
  }
  requirePositiveRevision(integerValue(row, "revision"));
  instantValue(row, "created_at");
  instantValue(row, "updated_at");
  nullableInstantValue(row, "deleted_at");
  return frozenBackupRow(row);
}

function validateTariffDecisionRow(value: unknown): BackupRow {
  const row = exactRecord(value, TARIFF_DECISION_COLUMNS);
  validateMonthlyTariffDecision({
    month: stringValue(row, "month"),
    allowanceStatus: stringValue(row, "allowance_status"),
    revision: integerValue(row, "revision"),
    confirmedAt: stringValue(row, "confirmed_at"),
    updatedAt: stringValue(row, "updated_at"),
  });
  return frozenBackupRow(row);
}

function validatePreferenceValue(key: string, value: string): void {
  if (key === ANALYSIS_VIEW_KEY) {
    try {
      parseAnalysisView(value);
    } catch {
      return invalid();
    }
  }
  if (key === APPEARANCE_KEYS.themeId && !isThemeId(value)) return invalid();
  if (key === APPEARANCE_KEYS.mode && !isAppearanceMode(value)) return invalid();
  const booleans = [
    "check_show_planning_hints",
    "calendar_show_shifts",
    "calendar_show_appointments",
    "calendar_show_holidays",
    "calendar_show_shift_times",
    "calendar_show_shift_duration",
  ];
  if (booleans.includes(key) && value !== "true" && value !== "false") return invalid();
  if (key === "calendar_view_mode" && value !== "MONTH" && value !== "YEAR") return invalid();
  if (key === "calendar_label_mode" && !["FULL", "SHORT", "SYMBOL"].includes(value)) {
    return invalid();
  }
  if (
    key === "tvoed_workplace_coverage" &&
    !["UNKNOWN", "AROUND_THE_CLOCK", "NOT_AROUND_THE_CLOCK"].includes(value)
  ) {
    return invalid();
  }
  if (key === "tvoed_assignment" && !["UNKNOWN", "PERMANENT", "TEMPORARY"].includes(value)) {
    return invalid();
  }
}

function validatePreferenceRow(value: unknown): BackupRow {
  const row = exactRecord(value, PREFERENCE_COLUMNS);
  const key = stringValue(row, "key");
  if (!(USER_DATA_PREFERENCE_KEYS as readonly string[]).includes(key)) return invalid();
  validatePreferenceValue(key, stringValue(row, "value"));
  instantValue(row, "updated_at");
  return frozenBackupRow(row);
}

function uniqueValues(rows: readonly BackupRow[], field: string): void {
  const values = new Set<string>();
  for (const row of rows) {
    const value = row[field];
    if (typeof value !== "string" || values.has(value)) return invalid();
    values.add(value);
  }
}

function buildPreview(document: LocalBackupDocument): LocalBackupPreview {
  const activeTemplates = document.data.templates.filter((row) => row.deleted_at === null);
  const activeShifts = document.data.shifts.filter((row) => row.deleted_at === null);
  const activeAppointments = document.data.appointments.filter((row) => row.deleted_at === null);
  const entryDates = [...activeShifts, ...activeAppointments]
    .map((row) => row.date)
    .filter((value): value is string => typeof value === "string")
    .sort();
  const deletedRecordCount =
    document.data.templates.length -
    activeTemplates.length +
    document.data.shifts.length -
    activeShifts.length +
    document.data.appointments.length -
    activeAppointments.length;

  return Object.freeze({
    createdAt: document.createdAt,
    appVersion: document.appVersion,
    databaseSchemaVersion: document.databaseSchemaVersion,
    profileIncluded: document.data.profile !== null,
    templateCount: activeTemplates.length,
    shiftCount: activeShifts.length,
    appointmentCount: activeAppointments.length,
    monthlyTariffDecisionCount: document.data.monthlyTariffDecisions.length,
    preferenceCount: document.data.preferences.length,
    deletedRecordCount,
    firstEntryDate: entryDates[0] ?? null,
    lastEntryDate: entryDates.at(-1) ?? null,
  });
}

export async function loadCurrentDatabaseSchemaVersion(db: SQLiteDatabase): Promise<number> {
  const schema = await db.getFirstAsync<{ readonly version: number }>(
    "SELECT MAX(version) AS version FROM schema_migrations",
  );
  if (schema === null || !Number.isInteger(schema.version) || schema.version < 1) {
    throw new Error("Die lokale Datenbankversion konnte nicht bestimmt werden.");
  }
  return schema.version;
}

export async function validateLocalBackup(
  serialized: string,
  input: {
    readonly maxDatabaseSchemaVersion: number;
    readonly sha256: (value: string) => Promise<string>;
  },
): Promise<ValidatedLocalBackup> {
  if (serialized.length === 0 || serialized.length > MAX_LOCAL_BACKUP_CHARACTERS) {
    return invalid("Die Backup-Datei ist leer oder zu groß.");
  }
  if (!Number.isSafeInteger(input.maxDatabaseSchemaVersion) || input.maxDatabaseSchemaVersion < 1) {
    return invalid();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    return invalid();
  }

  try {
    const root = exactRecord(parsed, TOP_LEVEL_KEYS);
    if (root.format !== LOCAL_BACKUP_FORMAT) return invalid();
    if (root.version !== LOCAL_BACKUP_VERSION) {
      return invalid("Diese Backup-Version wird von LUNA Shift nicht unterstützt.");
    }
    const createdAt = requireInstant(root.createdAt, "Backup-Zeitpunkt");
    const appVersion = root.appVersion;
    if (appVersion !== null && typeof appVersion !== "string") return invalid();
    const databaseSchemaVersion = root.databaseSchemaVersion;
    if (!Number.isSafeInteger(databaseSchemaVersion) || (databaseSchemaVersion as number) < 1) {
      return invalid();
    }
    if ((databaseSchemaVersion as number) > input.maxDatabaseSchemaVersion) {
      return invalid("Das Backup stammt aus einer neueren LUNA-Shift-Version.");
    }

    const data = exactRecord(root.data, DATA_KEYS);
    const rawProfile = data.profile;
    const profile = rawProfile === null ? null : validateProfileRow(rawProfile);
    const templates = Object.freeze(asArray(data.templates).map(validateTemplateRow));
    const shifts = Object.freeze(asArray(data.shifts).map(validateShiftRow));
    const appointments = Object.freeze(asArray(data.appointments).map(validateAppointmentRow));
    const monthlyTariffDecisions = Object.freeze(
      asArray(data.monthlyTariffDecisions).map(validateTariffDecisionRow),
    );
    const preferences = Object.freeze(asArray(data.preferences).map(validatePreferenceRow));

    uniqueValues(templates, "id");
    uniqueValues(shifts, "id");
    uniqueValues(appointments, "id");
    uniqueValues(monthlyTariffDecisions, "month");
    uniqueValues(preferences, "key");
    const templateIds = new Set(templates.map((row) => row.id));
    if (REQUIRED_DEFAULT_TEMPLATE_IDS.some((id) => !templateIds.has(id))) return invalid();
    for (const shift of shifts) {
      if (shift.template_id !== null && !templateIds.has(shift.template_id)) return invalid();
    }

    const integrity = exactRecord(root.integrity, INTEGRITY_KEYS);
    if (
      integrity.algorithm !== "SHA-256" ||
      integrity.canonicalization !== "RFC8785" ||
      integrity.scope !== "document-without-integrity" ||
      typeof integrity.value !== "string" ||
      !/^[a-f\d]{64}$/u.test(integrity.value)
    ) {
      return invalid();
    }

    const document: LocalBackupDocument = Object.freeze({
      format: LOCAL_BACKUP_FORMAT,
      version: LOCAL_BACKUP_VERSION,
      createdAt,
      appVersion: appVersion as string | null,
      databaseSchemaVersion: databaseSchemaVersion as number,
      data: Object.freeze({
        profile,
        templates,
        shifts,
        appointments,
        monthlyTariffDecisions,
        preferences,
      }),
      integrity: Object.freeze({
        algorithm: "SHA-256",
        canonicalization: "RFC8785",
        scope: "document-without-integrity",
        value: integrity.value,
      }),
    });
    const canonical = canonicalize({
      format: document.format,
      version: document.version,
      createdAt: document.createdAt,
      appVersion: document.appVersion,
      databaseSchemaVersion: document.databaseSchemaVersion,
      data: document.data,
    });
    if (canonical === undefined) return invalid();
    const calculated = await input.sha256(canonical);
    if (!/^[a-f\d]{64}$/iu.test(calculated) || calculated.toLowerCase() !== integrity.value) {
      return invalid(
        "Der Prüfwert des Backups stimmt nicht. Die Datei wurde verändert oder beschädigt.",
      );
    }

    return Object.freeze({
      [VALIDATED_BACKUP]: true as const,
      document,
      preview: buildPreview(document),
    });
  } catch (error) {
    if (error instanceof LocalBackupValidationError) throw error;
    return invalid();
  }
}

export function requireValidatedLocalBackupDocument(
  backup: ValidatedLocalBackup,
): LocalBackupDocument {
  if (backup[VALIDATED_BACKUP] !== true) return invalid();
  return backup.document;
}
