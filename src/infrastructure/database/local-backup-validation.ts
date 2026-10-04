import {
  mapTvoedAnnexAPremiumFactsRow,
  requireTvoedAnnexAPremiumFactsParent,
} from "./tvoed-annex-a-premium-facts-repository";
import {
  mapTvoedSueAllowanceConfirmationRow,
  requireTvoedSueAllowanceConfirmationParent,
} from "./tvoed-sue-allowance-confirmation-repository";
import {
  mapTvoedSueMonthConfirmationRow,
  requireTvoedSueMonthConfirmationParent,
} from "./tvoed-sue-month-confirmation-repository";
import {
  mapTvoedAnnexAMonthConfirmationRow,
  requireTvoedAnnexAMonthConfirmationParent,
} from "./tvoed-annex-a-month-confirmation-repository";
import {
  mapCaritasOvertimeRow,
  requireCaritasOvertimeParents,
} from "./caritas-overtime-repository";
import {
  mapCaritasMonthFactsRow,
  requireCaritasMonthFactsParent,
} from "./caritas-month-facts-repository";
import { mapCaritasWorkDayRow, requireCaritasWorkDayParent } from "./caritas-work-day-repository";
import {
  mapTvlShiftWorkRow,
  requireTvlShiftWorkParents,
  requireTvlBurnCareCollection,
} from "./tvl-shift-work-repository";
import { mapTariffAnnualClaimRow } from "./tariff-annual-claim-repository";
import { validateSavedTariffAnnualClaims } from "@/domain/saved-tariff-annual-claim";
import { mapAnnualPaymentRow } from "./annual-payment-repository";
import { validateSavedActualOwnAnnualPayments } from "@/domain/saved-annual-payment";
import { mapTrainingProfileRow, mapShiftTrainingRow } from "./training-repository";
import { requireShiftTrainingParent } from "@/domain/training-data";
import {
  PAID_ABSENCE_COLUMNS,
  mapPaidAbsenceRow,
  requirePaidAbsenceParent,
} from "./paid-absence-repository";
import {
  ALLOWANCE_DECISION_COLUMNS,
  mapAllowanceDecisionRow,
} from "./allowance-decision-repository";
import {
  OVERTIME_ALLOCATION_COLUMNS,
  mapOvertimeAllocationRow,
  requireOvertimeAllocationMatchesShift,
} from "./overtime-allocation-repository";
import { mapShift } from "./calendar-entry-repository";
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
import {
  mapRemunerationProfileRow,
  REMUNERATION_PROFILE_COLUMNS,
} from "./remuneration-profile-repository";

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

function validateRemunerationProfileRow(value: unknown): BackupRow {
  const row = exactRecord(value, REMUNERATION_PROFILE_COLUMNS);
  mapRemunerationProfileRow({
    id: stringValue(row, "id"),
    effective_from: nullableStringValue(row, "effective_from"),
    data_json: stringValue(row, "data_json"),
    revision: integerValue(row, "revision"),
    created_at: instantValue(row, "created_at"),
    updated_at: instantValue(row, "updated_at"),
  });
  // Keep original JSON bytes in the checksum, not a re-serialized payload.
  return frozenBackupRow(row);
}

function validateAllowanceDecisionRow(value: unknown): BackupRow {
  const row = exactRecord(value, ALLOWANCE_DECISION_COLUMNS);
  mapAllowanceDecisionRow({
    month: stringValue(row, "month"),
    decisions_json: stringValue(row, "decisions_json"),
    revision: integerValue(row, "revision"),
    updated_at: instantValue(row, "updated_at"),
  });
  // Do not normalize JSON bytes before validating the original checksum.
  return frozenBackupRow(row);
}

function validateOvertimeAllocationRow(value: unknown): BackupRow {
  const row = exactRecord(value, OVERTIME_ALLOCATION_COLUMNS);
  mapOvertimeAllocationRow({
    shift_id: stringValue(row, "shift_id"),
    shift_revision: integerValue(row, "shift_revision"),
    time_zone: stringValue(row, "time_zone"),
    allocations_json: stringValue(row, "allocations_json"),
    revision: integerValue(row, "revision"),
    confirmed_at: stringValue(row, "confirmed_at"),
    updated_at: stringValue(row, "updated_at"),
  });
  return frozenBackupRow(row);
}

function validatePaidAbsenceRow(value: unknown): BackupRow {
  const row = exactRecord(value, PAID_ABSENCE_COLUMNS);
  mapPaidAbsenceRow({
    shift_id: stringValue(row, "shift_id"),
    shift_revision: integerValue(row, "shift_revision"),
    shift_date: stringValue(row, "shift_date"),
    shift_updated_at: stringValue(row, "shift_updated_at"),
    time_zone: stringValue(row, "time_zone"),
    paid_minutes: nullableIntegerValue(row, "paid_minutes"),
    revision: integerValue(row, "revision"),
    confirmed_at: stringValue(row, "confirmed_at"),
    updated_at: stringValue(row, "updated_at"),
  });
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
    if (
      root.version !== 1 &&
      root.version !== 2 &&
      root.version !== 3 &&
      root.version !== 4 &&
      root.version !== 5 &&
      root.version !== 6 &&
      root.version !== 7 &&
      root.version !== 8 &&
      root.version !== 9 &&
      root.version !== 10 &&
      root.version !== 11 &&
      root.version !== 12 &&
      root.version !== 13 &&
      root.version !== 14 &&
      root.version !== 15 &&
      root.version !== 16 &&
      root.version !== LOCAL_BACKUP_VERSION
    ) {
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

    if (root.version >= 2 && (databaseSchemaVersion as number) < 14) return invalid();
    const data = exactRecord(root.data, [
      ...DATA_KEYS,
      ...(root.version >= 2 ? ["remunerationProfiles"] : []),
      ...(root.version >= 3 ? ["allowanceDecisions"] : []),
      ...(root.version >= 4 ? ["overtimeAllocations"] : []),
      ...(root.version >= 5 ? ["paidAbsences"] : []),
      ...(root.version >= 6 ? ["trainingProfiles", "shiftTrainingDetails"] : []),
      ...(root.version >= 7 ? ["actualAnnualPayments"] : []),
      ...(root.version >= 8 ? ["tariffAnnualClaims"] : []),
      ...(root.version >= 9 ? ["tvlShiftWork"] : []),
      ...(root.version >= 10 ? ["caritasWorkDays"] : []),
      ...(root.version >= 11 ? ["caritasMonthFacts"] : []),
      ...(root.version >= 13 ? ["caritasOvertime"] : []),
      ...(root.version >= 14 ? ["tvoedAnnexAMonthConfirmations"] : []),
      ...(root.version >= 15 ? ["tvoedSueMonthConfirmations"] : []),
      ...(root.version >= 16 ? ["tvoedSueAllowanceConfirmations"] : []),
      ...(root.version >= 17 ? ["tvoedAnnexAPremiumFacts"] : []),
    ]);
    const rawProfile = data.profile;
    const profile = rawProfile === null ? null : validateProfileRow(rawProfile);
    const remunerationProfiles =
      root.version === 1
        ? Object.freeze([])
        : Object.freeze(asArray(data.remunerationProfiles).map(validateRemunerationProfileRow));
    if (profile === null && remunerationProfiles.length > 0) return invalid();
    uniqueValues(remunerationProfiles, "id");
    uniqueValues(
      remunerationProfiles.filter((row) => row.effective_from !== null),
      "effective_from",
    );
    const templates = Object.freeze(asArray(data.templates).map(validateTemplateRow));
    const shifts = Object.freeze(asArray(data.shifts).map(validateShiftRow));
    const appointments = Object.freeze(asArray(data.appointments).map(validateAppointmentRow));
    const monthlyTariffDecisions = Object.freeze(
      asArray(data.monthlyTariffDecisions).map(validateTariffDecisionRow),
    );
    const preferences = Object.freeze(asArray(data.preferences).map(validatePreferenceRow));

    const allowanceDecisions =
      root.version >= 3
        ? Object.freeze(asArray(data.allowanceDecisions).map(validateAllowanceDecisionRow))
        : Object.freeze([]);
    if (root.version >= 3) {
      if (
        (databaseSchemaVersion as number) < 16 ||
        (profile === null && allowanceDecisions.length > 0)
      )
        return invalid();
      uniqueValues(allowanceDecisions, "month");
    }

    const overtimeAllocations =
      root.version >= 4
        ? Object.freeze(asArray(data.overtimeAllocations).map(validateOvertimeAllocationRow))
        : Object.freeze([]);
    if (root.version >= 4) {
      if (
        (databaseSchemaVersion as number) < 17 ||
        (profile === null && overtimeAllocations.length > 0)
      )
        return invalid();
      uniqueValues(overtimeAllocations, "shift_id");
      const shiftById = new Map(shifts.map((row) => [row.id, row]));
      for (const row of overtimeAllocations) {
        const shift = shiftById.get(row.shift_id);
        if (!shift || (row.shift_revision as number) > (shift.revision as number)) return invalid();
        if (row.shift_revision === shift.revision && row.time_zone === profile?.time_zone) {
          requireOvertimeAllocationMatchesShift(
            mapOvertimeAllocationRow(
              row as unknown as Parameters<typeof mapOvertimeAllocationRow>[0],
            ),
            mapShift(shift as unknown as Parameters<typeof mapShift>[0]),
          );
        }
      }
    }

    const paidAbsences =
      root.version >= 5
        ? Object.freeze(asArray(data.paidAbsences).map(validatePaidAbsenceRow))
        : Object.freeze([]);
    if (root.version >= 5) {
      if ((databaseSchemaVersion as number) < 18 || (profile === null && paidAbsences.length > 0))
        return invalid();
      uniqueValues(paidAbsences, "shift_id");
      const shiftById = new Map(shifts.map((row) => [row.id, row]));
      for (const row of paidAbsences) {
        const shift = shiftById.get(row.shift_id);
        if (!shift) return invalid();
        requirePaidAbsenceParent(
          mapPaidAbsenceRow(row as unknown as Parameters<typeof mapPaidAbsenceRow>[0]),
          mapShift(shift as unknown as Parameters<typeof mapShift>[0]),
        );
      }
    }

    const trainingProfiles =
      root.version >= 6
        ? Object.freeze(
            asArray(data.trainingProfiles).map((value) => {
              mapTrainingProfileRow(value);
              return frozenBackupRow(asRecord(value));
            }),
          )
        : Object.freeze([]);
    const shiftTrainingDetails =
      root.version >= 6
        ? Object.freeze(
            asArray(data.shiftTrainingDetails).map((value) => {
              mapShiftTrainingRow(value);
              return frozenBackupRow(asRecord(value));
            }),
          )
        : Object.freeze([]);
    if (root.version >= 6) {
      if (
        (databaseSchemaVersion as number) < 19 ||
        (profile === null && (trainingProfiles.length > 0 || shiftTrainingDetails.length > 0))
      )
        return invalid();
      uniqueValues(trainingProfiles, "effective_from");
      uniqueValues(shiftTrainingDetails, "shift_id");
      const shiftById = new Map(shifts.map((row) => [row.id, row]));
      for (const row of shiftTrainingDetails) {
        const shift = shiftById.get(row.shift_id);
        if (!shift) return invalid();
        requireShiftTrainingParent(
          mapShiftTrainingRow(row),
          mapShift(shift as unknown as Parameters<typeof mapShift>[0]),
        );
      }
    }

    const actualAnnualPayments =
      root.version >= 7
        ? Object.freeze(
            asArray(data.actualAnnualPayments).map((value) => {
              mapAnnualPaymentRow(value);
              return frozenBackupRow(asRecord(value));
            }),
          )
        : Object.freeze([]);
    if (root.version >= 7) {
      if (
        (databaseSchemaVersion as number) < 20 ||
        (profile === null && actualAnnualPayments.length > 0)
      )
        return invalid();
      validateSavedActualOwnAnnualPayments(actualAnnualPayments.map(mapAnnualPaymentRow));
    }

    const tariffAnnualClaims =
      root.version >= 8
        ? Object.freeze(
            asArray(data.tariffAnnualClaims).map((value) => {
              mapTariffAnnualClaimRow(value);
              return frozenBackupRow(asRecord(value));
            }),
          )
        : Object.freeze([]);
    if (root.version >= 8) {
      if (
        (databaseSchemaVersion as number) < 21 ||
        (profile === null && tariffAnnualClaims.length > 0)
      )
        return invalid();
      const claims = validateSavedTariffAnnualClaims(
        tariffAnnualClaims.map(mapTariffAnnualClaimRow),
      );
      if (root.version < 12 && claims.some((row) => row.claim.version === 3)) return invalid();
    }

    const tvlShiftWork =
      root.version >= 9
        ? Object.freeze(
            asArray(data.tvlShiftWork).map((value) => {
              mapTvlShiftWorkRow(value);
              return frozenBackupRow(asRecord(value));
            }),
          )
        : Object.freeze([]);
    if (root.version >= 9) {
      if ((databaseSchemaVersion as number) < 22 || (profile === null && tvlShiftWork.length > 0))
        return invalid();
      const seen = new Set<string>();
      const shiftById = new Map(
        shifts.map((row) => [row.id, mapShift(row as unknown as Parameters<typeof mapShift>[0])]),
      );
      const profiles = (remunerationProfiles ?? []).map((row) =>
        mapRemunerationProfileRow(
          row as unknown as Parameters<typeof mapRemunerationProfileRow>[0],
        ),
      );
      const tvlByShift = new Map<string, ReturnType<typeof mapTvlShiftWorkRow>[]>();
      for (const row of tvlShiftWork) {
        const parsed = mapTvlShiftWorkRow(row);
        const key = JSON.stringify([parsed.shiftId, parsed.profileEffectiveFrom]);
        if (seen.has(key)) return invalid();
        seen.add(key);
        requireTvlShiftWorkParents(parsed, shiftById.get(parsed.shiftId), profiles);
        const siblings = tvlByShift.get(parsed.shiftId) ?? [];
        siblings.push(parsed);
        tvlByShift.set(parsed.shiftId, siblings);
      }
      for (const [id, values] of tvlByShift)
        requireTvlBurnCareCollection(values, shiftById.get(id)!, profiles);
    }

    const caritasWorkDays =
      root.version >= 10
        ? Object.freeze(
            asArray(data.caritasWorkDays).map((value) => {
              mapCaritasWorkDayRow(value);
              return frozenBackupRow(asRecord(value));
            }),
          )
        : Object.freeze([]);
    if (root.version >= 10) {
      if (
        (databaseSchemaVersion as number) < 23 ||
        (profile === null && caritasWorkDays.length > 0)
      )
        return invalid();
      const seen = new Set<string>();
      const shiftById = new Map(
        shifts.map((row) => [row.id, mapShift(row as unknown as Parameters<typeof mapShift>[0])]),
      );
      for (const row of caritasWorkDays) {
        const parsed = mapCaritasWorkDayRow(row);
        const key = JSON.stringify([parsed.shiftId, parsed.date]);
        if (seen.has(key)) return invalid();
        seen.add(key);
        requireCaritasWorkDayParent(parsed, shiftById.get(parsed.shiftId));
      }
    }

    const caritasMonthFacts =
      root.version >= 11
        ? Object.freeze(
            asArray(data.caritasMonthFacts).map((value) => {
              mapCaritasMonthFactsRow(value);
              return frozenBackupRow(asRecord(value));
            }),
          )
        : Object.freeze([]);
    if (root.version >= 11) {
      if (
        (databaseSchemaVersion as number) < 24 ||
        (profile === null && caritasMonthFacts.length > 0)
      )
        return invalid();
      uniqueValues(caritasMonthFacts, "month");
      const profiles = (remunerationProfiles ?? []).map((row) =>
        mapRemunerationProfileRow(
          row as unknown as Parameters<typeof mapRemunerationProfileRow>[0],
        ),
      );
      for (const row of caritasMonthFacts)
        requireCaritasMonthFactsParent(mapCaritasMonthFactsRow(row), profiles);
    }

    const caritasOvertime =
      root.version >= 13
        ? Object.freeze(
            asArray(data.caritasOvertime).map((value) => {
              mapCaritasOvertimeRow(value);
              return frozenBackupRow(asRecord(value));
            }),
          )
        : Object.freeze([]);
    if (root.version >= 13) {
      if (
        (databaseSchemaVersion as number) < 25 ||
        (profile === null && caritasOvertime.length > 0)
      )
        return invalid();
      uniqueValues(caritasOvertime, "shift_id");
      const shiftById = new Map(
        shifts.map((row) => [row.id, mapShift(row as unknown as Parameters<typeof mapShift>[0])]),
      );
      const allocationById = new Map(
        (overtimeAllocations ?? []).map((row) => {
          const parsed = mapOvertimeAllocationRow(
            row as unknown as Parameters<typeof mapOvertimeAllocationRow>[0],
          );
          return [parsed.shiftId, parsed] as const;
        }),
      );
      const profiles = (remunerationProfiles ?? []).map((row) =>
        mapRemunerationProfileRow(
          row as unknown as Parameters<typeof mapRemunerationProfileRow>[0],
        ),
      );
      for (const row of caritasOvertime) {
        const parsed = mapCaritasOvertimeRow(row);
        requireCaritasOvertimeParents(
          parsed,
          shiftById.get(parsed.shiftId),
          allocationById.get(parsed.shiftId),
          profiles,
        );
      }
    }

    const tvoedAnnexAMonthConfirmations =
      root.version >= 14
        ? Object.freeze(
            asArray(data.tvoedAnnexAMonthConfirmations).map((value) => {
              mapTvoedAnnexAMonthConfirmationRow(value);
              return frozenBackupRow(asRecord(value));
            }),
          )
        : Object.freeze([]);
    if (root.version >= 14) {
      if (
        (databaseSchemaVersion as number) < 26 ||
        (profile === null && tvoedAnnexAMonthConfirmations.length > 0)
      )
        return invalid();
      uniqueValues(tvoedAnnexAMonthConfirmations, "month");
      const profiles = (remunerationProfiles ?? []).map((row) =>
        mapRemunerationProfileRow(
          row as unknown as Parameters<typeof mapRemunerationProfileRow>[0],
        ),
      );
      for (const row of tvoedAnnexAMonthConfirmations)
        requireTvoedAnnexAMonthConfirmationParent(
          mapTvoedAnnexAMonthConfirmationRow(row),
          profiles,
        );
    }

    const tvoedSueMonthConfirmations =
      root.version >= 15
        ? Object.freeze(
            asArray(data.tvoedSueMonthConfirmations).map((value) => {
              mapTvoedSueMonthConfirmationRow(value);
              return frozenBackupRow(asRecord(value));
            }),
          )
        : Object.freeze([]);
    if (root.version >= 15) {
      if (
        (databaseSchemaVersion as number) < 27 ||
        (profile === null && tvoedSueMonthConfirmations.length > 0)
      )
        return invalid();
      uniqueValues(tvoedSueMonthConfirmations, "month");
      const profiles = (remunerationProfiles ?? []).map((row) =>
        mapRemunerationProfileRow(
          row as unknown as Parameters<typeof mapRemunerationProfileRow>[0],
        ),
      );
      for (const row of tvoedSueMonthConfirmations)
        requireTvoedSueMonthConfirmationParent(mapTvoedSueMonthConfirmationRow(row), profiles);
    }

    const tvoedSueAllowanceConfirmations =
      root.version >= 16
        ? Object.freeze(
            asArray(data.tvoedSueAllowanceConfirmations).map((value) => {
              mapTvoedSueAllowanceConfirmationRow(value);
              return frozenBackupRow(asRecord(value));
            }),
          )
        : Object.freeze([]);
    if (root.version >= 16) {
      if (
        (databaseSchemaVersion as number) < 28 ||
        (profile === null && tvoedSueAllowanceConfirmations.length > 0)
      )
        return invalid();
      uniqueValues(tvoedSueAllowanceConfirmations, "month");
      const profiles = (remunerationProfiles ?? []).map((row) =>
        mapRemunerationProfileRow(
          row as unknown as Parameters<typeof mapRemunerationProfileRow>[0],
        ),
      );
      for (const row of tvoedSueAllowanceConfirmations)
        requireTvoedSueAllowanceConfirmationParent(
          mapTvoedSueAllowanceConfirmationRow(row),
          profiles,
        );
    }

    const tvoedAnnexAPremiumFacts =
      root.version >= 17
        ? Object.freeze(
            asArray(data.tvoedAnnexAPremiumFacts).map((value) => {
              mapTvoedAnnexAPremiumFactsRow(value);
              return frozenBackupRow(asRecord(value));
            }),
          )
        : Object.freeze([]);
    if (root.version >= 17) {
      if (
        (databaseSchemaVersion as number) < 29 ||
        (profile === null && tvoedAnnexAPremiumFacts.length > 0)
      )
        return invalid();
      uniqueValues(tvoedAnnexAPremiumFacts, "month");
      const profiles = (remunerationProfiles ?? []).map((row) =>
        mapRemunerationProfileRow(
          row as unknown as Parameters<typeof mapRemunerationProfileRow>[0],
        ),
      );
      const shiftsById = new Map(
        shifts.map((row) => [row.id, mapShift(row as unknown as Parameters<typeof mapShift>[0])]),
      );
      for (const row of tvoedAnnexAPremiumFacts) {
        const parsed = mapTvoedAnnexAPremiumFactsRow(row);
        requireTvoedAnnexAPremiumFactsParent(parsed, profiles);
        for (const decision of parsed.dayDecisions) {
          const shift = shiftsById.get(decision.shiftId);
          const binding = JSON.parse(decision.shiftBinding) as readonly unknown[];
          if (!shift || (binding[1] as number) > shift.revision)
            return invalid("Ungültige Dienstreferenz in TVöD-Zuschlagsdaten.");
        }
      }
    }

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
      version: root.version,
      createdAt,
      appVersion: appVersion as string | null,
      databaseSchemaVersion: databaseSchemaVersion as number,
      data: Object.freeze({
        profile,
        remunerationProfiles,
        allowanceDecisions,
        overtimeAllocations,
        paidAbsences,
        trainingProfiles,
        shiftTrainingDetails,
        actualAnnualPayments,
        tariffAnnualClaims,
        tvlShiftWork,
        caritasWorkDays,
        caritasMonthFacts,
        caritasOvertime,
        tvoedAnnexAMonthConfirmations,
        tvoedSueMonthConfirmations,
        tvoedSueAllowanceConfirmations,
        tvoedAnnexAPremiumFacts,
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
      data: Object.fromEntries(
        Object.entries(document.data).filter(
          ([key]) =>
            !(document.version < 2 && key === "remunerationProfiles") &&
            !(document.version < 3 && key === "allowanceDecisions") &&
            !(document.version < 4 && key === "overtimeAllocations") &&
            !(document.version < 5 && key === "paidAbsences") &&
            !(
              document.version < 6 &&
              (key === "trainingProfiles" || key === "shiftTrainingDetails")
            ) &&
            !(document.version < 7 && key === "actualAnnualPayments") &&
            !(document.version < 8 && key === "tariffAnnualClaims") &&
            !(document.version < 9 && key === "tvlShiftWork") &&
            !(document.version < 10 && key === "caritasWorkDays") &&
            !(document.version < 11 && key === "caritasMonthFacts") &&
            !(document.version < 13 && key === "caritasOvertime") &&
            !(document.version < 14 && key === "tvoedAnnexAMonthConfirmations") &&
            !(document.version < 15 && key === "tvoedSueMonthConfirmations") &&
            !(document.version < 16 && key === "tvoedSueAllowanceConfirmations") &&
            !(document.version < 17 && key === "tvoedAnnexAPremiumFacts"),
        ),
      ),
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
