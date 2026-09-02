import { Temporal } from "@js-temporal/polyfill";

import {
  ALLOWANCE_STATUSES,
  FEDERAL_STATES,
  INDUSTRIES,
  PAY_GROUPS,
  PAY_LEVELS,
  NOTIFICATION_UNITS,
  RECURRENCE_FREQUENCIES,
  SHIFT_TYPES,
  type AllowanceStatus,
  type FederalState,
  type Industry,
  type EntryLocation,
  type EntryNotification,
  type MonthlyTariffDecision,
  type SaveAppointmentInput,
  type SaveShiftInput,
  type SaveProfileInput,
  type SaveShiftTemplateInput,
  type RecurrenceRule,
} from "@/domain/types";
import { UserFacingError } from "@/domain/errors";
import {
  defaultHolidayRegion,
  isHolidayRegionCompatible,
  tariffFullTimeWeeklyMinutes,
} from "@/domain/employment-profile";

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const COLOR_PATTERN = /^#[0-9A-F]{6}$/i;

export class ValidationError extends UserFacingError {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function requireLocalDate(value: string): string {
  try {
    return Temporal.PlainDate.from(value).toString();
  } catch {
    throw new ValidationError("Bitte ein gültiges Datum angeben.");
  }
}

export function requireLocalMonth(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new ValidationError("Bitte einen gültigen Auswertungsmonat angeben.");
  }
  try {
    return Temporal.PlainYearMonth.from(value).toString();
  } catch {
    throw new ValidationError("Bitte einen gültigen Auswertungsmonat angeben.");
  }
}

export function requireAllowanceStatus(value: unknown): AllowanceStatus {
  if (typeof value !== "string" || !ALLOWANCE_STATUSES.includes(value as AllowanceStatus)) {
    throw new ValidationError("Unbekannter Zulagenstatus.");
  }
  return value as AllowanceStatus;
}

export function requirePositiveRevision(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new ValidationError("Ungültige Datensatzrevision.");
  }
  return value;
}

export function requireInstant(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new ValidationError(`${field} enthält keinen gültigen Zeitstempel.`);
  }
  try {
    Temporal.Instant.from(value);
    return value;
  } catch {
    throw new ValidationError(`${field} enthält keinen gültigen Zeitstempel.`);
  }
}

export function validateMonthlyTariffDecision(input: {
  readonly month: unknown;
  readonly allowanceStatus: unknown;
  readonly revision: unknown;
  readonly confirmedAt: unknown;
  readonly updatedAt: unknown;
}): MonthlyTariffDecision {
  return Object.freeze({
    month: requireLocalMonth(input.month),
    allowanceStatus: requireAllowanceStatus(input.allowanceStatus),
    revision: requirePositiveRevision(input.revision),
    confirmedAt: requireInstant(input.confirmedAt, "Bestätigung"),
    updatedAt: requireInstant(input.updatedAt, "Aktualisierung"),
  });
}

export function requireLocalTime(value: string): string {
  const trimmed = value.trim();
  if (!TIME_PATTERN.test(trimmed)) {
    throw new ValidationError("Uhrzeiten müssen im Format HH:MM angegeben werden.");
  }
  return trimmed;
}

export function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`${field} darf nicht leer sein.`);
  }
  return trimmed;
}

export function requireColor(value: string): string {
  if (!COLOR_PATTERN.test(value)) {
    throw new ValidationError("Bitte eine gültige Farbe wählen.");
  }
  return value.toUpperCase();
}

export function requireFederalState(value: string): FederalState {
  if (!FEDERAL_STATES.includes(value as FederalState)) {
    throw new ValidationError("Bitte ein gültiges Bundesland wählen.");
  }
  return value as FederalState;
}

export function requireWeeklyMinutes(value: number): number {
  if (!Number.isInteger(value) || value < 60 || value > 80 * 60) {
    throw new ValidationError("Die Wochenarbeitszeit muss zwischen 1 und 80 Stunden liegen.");
  }
  return value;
}

export function requireIndustry(value: string | null | undefined): Industry | null {
  if (value === null || value === undefined) return null;
  if (!INDUSTRIES.includes(value as Industry)) {
    throw new ValidationError("Bitte einen gültigen Berufsbereich wählen.");
  }
  return value as Industry;
}

export function requireManualMonthlyGrossCents(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || value < 1 || value > 10_000_000) {
    throw new ValidationError("Bitte ein gültiges monatliches Brutto angeben.");
  }
  return value;
}

export function requireTimeZone(value: string): string {
  const trimmed = value.trim();
  try {
    new Intl.DateTimeFormat("de-DE", { timeZone: trimmed }).format(0);
    return trimmed;
  } catch {
    throw new ValidationError("Bitte eine gültige Zeitzone wählen.");
  }
}

export function validateProfile(input: SaveProfileInput): SaveProfileInput {
  const federalState = requireFederalState(input.federalState);
  const industry = requireIndustry(input.industry);
  const manualMonthlyGrossCents = requireManualMonthlyGrossCents(input.manualMonthlyGrossCents);
  const holidayRegion = input.holidayRegion ?? defaultHolidayRegion(federalState);
  if (!isHolidayRegionCompatible(federalState, holidayRegion)) {
    throw new ValidationError("Die regionale Feiertagsregel passt nicht zum Bundesland.");
  }
  const tariff = input.tariff;
  for (const evidence of [
    input.regularRotatingNightWork,
    input.sundayHolidayWorkEligible,
    input.allEmploymentWorkRecorded,
  ]) {
    if (evidence !== undefined && evidence !== null && typeof evidence !== "boolean") {
      throw new ValidationError("Eine Angabe zur Arbeitszeitprüfung ist ungültig.");
    }
  }
  if (tariff !== null && tariff !== undefined) {
    if (!PAY_GROUPS.includes(tariff.payGroup)) {
      throw new ValidationError("Bitte eine gültige TVöD-P-Gruppe wählen.");
    }
    if (!PAY_LEVELS.includes(tariff.payLevel)) {
      throw new ValidationError("Bitte eine gültige TVöD-P-Stufe wählen.");
    }
    if (tariff.sector !== "BT_K" && tariff.sector !== "BT_B") {
      throw new ValidationError("Bitte einen gültigen TVöD-Bereich wählen.");
    }
    const expectedFullTimeMinutes = tariffFullTimeWeeklyMinutes(tariff.sector, tariff.tariffRegion);
    if (tariff.fullTimeWeeklyMinutes !== expectedFullTimeMinutes) {
      throw new ValidationError(
        "Die tarifliche Vollzeit passt nicht zum gewählten Tarifbereich und Tarifgebiet.",
      );
    }
  }
  if (tariff !== null && tariff !== undefined && manualMonthlyGrossCents !== null) {
    throw new ValidationError("Bitte entweder manuelles Gehalt oder TVöD-P wählen.");
  }
  return {
    federalState,
    holidayRegion,
    weeklyMinutes: requireWeeklyMinutes(input.weeklyMinutes),
    timeZone: requireTimeZone(input.timeZone.trim() || "Europe/Berlin"),
    industry,
    manualMonthlyGrossCents,
    regularRotatingNightWork: input.regularRotatingNightWork ?? null,
    sundayHolidayWorkEligible: input.sundayHolidayWorkEligible ?? null,
    allEmploymentWorkRecorded: input.allEmploymentWorkRecorded ?? null,
    tariff: tariff ?? null,
  };
}

function requireBreakMinutes(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 24 * 60) {
    throw new ValidationError("Die Pause muss zwischen 0 und 1.440 Minuten liegen.");
  }
  return value;
}

function requireTimedRange(startTime: string, endTime: string): void {
  if (startTime === endTime) {
    throw new ValidationError("Beginn und Ende dürfen nicht identisch sein.");
  }
}

function validateLocation(value: EntryLocation | null | undefined): EntryLocation | null {
  if (value === null || value === undefined) return null;
  const name = requireNonEmpty(value.name, "Ort");
  const address = value.address?.trim() || undefined;
  const hasLatitude = value.latitude !== null && value.latitude !== undefined;
  const hasLongitude = value.longitude !== null && value.longitude !== undefined;
  if (hasLatitude !== hasLongitude) {
    throw new ValidationError("Der ausgewählte Ort enthält unvollständige Koordinaten.");
  }
  if (!hasLatitude || !hasLongitude) {
    return Object.freeze({ name, ...(address ? { address } : {}) });
  }
  if (
    !Number.isFinite(value.latitude) ||
    value.latitude < -90 ||
    value.latitude > 90 ||
    !Number.isFinite(value.longitude) ||
    value.longitude < -180 ||
    value.longitude > 180
  ) {
    throw new ValidationError("Der ausgewählte Ort enthält ungültige Koordinaten.");
  }
  return Object.freeze({
    name,
    ...(address ? { address } : {}),
    latitude: value.latitude,
    longitude: value.longitude,
  });
}

function validateNotification(
  value: EntryNotification | null | undefined,
): EntryNotification | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value.amount) || value.amount < 0 || value.amount > 365) {
    throw new ValidationError("Der Benachrichtigungsabstand ist ungültig.");
  }
  if (!NOTIFICATION_UNITS.includes(value.unit)) {
    throw new ValidationError("Die Benachrichtigungseinheit ist ungültig.");
  }
  if (value.direction !== "BEFORE" && value.direction !== "AFTER") {
    throw new ValidationError("Die Benachrichtigungsrichtung ist ungültig.");
  }
  if (value.reference !== "START" && value.reference !== "END") {
    throw new ValidationError("Der Benachrichtigungszeitpunkt ist ungültig.");
  }
  return Object.freeze({ ...value });
}

function validateRecurrence(value: RecurrenceRule | null | undefined): RecurrenceRule | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value.interval) || value.interval < 1 || value.interval > 99) {
    throw new ValidationError("Das Wiederholungsintervall muss zwischen 1 und 99 liegen.");
  }
  if (!RECURRENCE_FREQUENCIES.includes(value.frequency)) {
    throw new ValidationError("Die Wiederholung ist ungültig.");
  }
  return Object.freeze({ ...value });
}

export function validateTemplate(input: SaveShiftTemplateInput): SaveShiftTemplateInput {
  if (!SHIFT_TYPES.includes(input.type)) {
    throw new ValidationError("Unbekannte Dienstart.");
  }
  const base = {
    ...input,
    allDay: input.allDay ?? false,
    name: requireNonEmpty(input.name, "Name"),
    color: requireColor(input.color),
    symbol: requireNonEmpty(input.symbol, "Symbol").slice(0, 4),
    notification: validateNotification(input.notification),
    location: validateLocation(input.location),
  };
  if (input.type === "VACATION" || input.type === "SICK" || input.type === "FREE") {
    return { ...base, allDay: true, startTime: null, endTime: null, breakMinutes: 0 };
  }
  const startTime = requireLocalTime(input.startTime ?? "");
  const endTime = requireLocalTime(input.endTime ?? "");
  requireTimedRange(startTime, endTime);

  return {
    ...base,
    startTime,
    endTime,
    breakMinutes: base.allDay ? 0 : requireBreakMinutes(input.breakMinutes),
  };
}

export function validateShift(input: SaveShiftInput): SaveShiftInput {
  if (!SHIFT_TYPES.includes(input.type)) {
    throw new ValidationError("Unbekannte Dienstart.");
  }

  const base = {
    ...input,
    allDay: input.allDay ?? false,
    date: requireLocalDate(input.date),
    title: requireNonEmpty(input.title, "Bezeichnung"),
    color: requireColor(input.color),
    symbol: requireNonEmpty(input.symbol, "Symbol").slice(0, 4),
    note: input.note?.trim() || null,
    notification: validateNotification(input.notification),
    alarmEnabled: input.alarmEnabled ?? false,
    location: validateLocation(input.location),
    overtimeMinutes: input.overtimeMinutes ?? 0,
    tariffOvertimeConfirmed: input.tariffOvertimeConfirmed ?? false,
    holidayPremiumMode: input.holidayPremiumMode ?? "WITH_TIME_OFF",
  };
  if (
    !Number.isInteger(base.overtimeMinutes) ||
    base.overtimeMinutes < 0 ||
    base.overtimeMinutes > 24 * 60
  ) {
    throw new ValidationError("Überstunden müssen zwischen 0 und 1.440 Minuten liegen.");
  }
  if (typeof base.alarmEnabled !== "boolean") {
    throw new ValidationError("Die Weckereinstellung ist ungültig.");
  }
  if (typeof base.tariffOvertimeConfirmed !== "boolean") {
    throw new ValidationError("Die Bestätigung der Tarifüberstunden ist ungültig.");
  }
  if (!["WITH_TIME_OFF", "WITHOUT_TIME_OFF"].includes(base.holidayPremiumMode)) {
    throw new ValidationError("Ungültige Feiertagsoption.");
  }

  if (input.type === "VACATION" || input.type === "SICK" || input.type === "FREE") {
    return {
      ...base,
      allDay: true,
      startTime: null,
      endTime: null,
      breakMinutes: 0,
      overtimeMinutes: 0,
      tariffOvertimeConfirmed: false,
    };
  }

  const startTime = requireLocalTime(input.startTime ?? "");
  const endTime = requireLocalTime(input.endTime ?? "");
  requireTimedRange(startTime, endTime);
  return {
    ...base,
    startTime,
    endTime,
    breakMinutes: base.allDay ? 0 : requireBreakMinutes(input.breakMinutes ?? 0),
  };
}

export function validateAppointment(input: SaveAppointmentInput): SaveAppointmentInput {
  const base = {
    ...input,
    date: requireLocalDate(input.date),
    title: requireNonEmpty(input.title, "Titel"),
    color: requireColor(input.color),
    note: input.note?.trim() || null,
    recurrence: validateRecurrence(input.recurrence),
    notification: validateNotification(input.notification),
    location: validateLocation(input.location),
  };

  if (input.allDay) {
    return { ...base, startTime: null, endTime: null };
  }

  const startTime = requireLocalTime(input.startTime ?? "");
  const endTime = requireLocalTime(input.endTime ?? "");
  if (endTime <= startTime) {
    throw new ValidationError("Ein Termin muss am selben Tag nach seinem Beginn enden.");
  }
  return { ...base, startTime, endTime };
}

export function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
