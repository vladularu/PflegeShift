import { Temporal } from "@js-temporal/polyfill";

import {
  ALLOWANCE_STATUSES,
  FEDERAL_STATES,
  PAY_GROUPS,
  PAY_LEVELS,
  SHIFT_TYPES,
  type AllowanceStatus,
  type FederalState,
  type MonthlyTariffDecision,
  type SaveAppointmentInput,
  type SaveShiftInput,
  type SaveProfileInput,
  type SaveShiftTemplateInput,
} from "@/domain/types";
import { UserFacingError } from "@/domain/errors";

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
  const tariff = input.tariff;
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
    requireWeeklyMinutes(tariff.fullTimeWeeklyMinutes);
  }
  return {
    federalState: requireFederalState(input.federalState),
    weeklyMinutes: requireWeeklyMinutes(input.weeklyMinutes),
    timeZone: requireTimeZone(input.timeZone.trim() || "Europe/Berlin"),
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

export function validateTemplate(input: SaveShiftTemplateInput): SaveShiftTemplateInput {
  if (!SHIFT_TYPES.includes(input.type)) {
    throw new ValidationError("Unbekannte Dienstart.");
  }
  const base = {
    ...input,
    name: requireNonEmpty(input.name, "Name"),
    color: requireColor(input.color),
    symbol: requireNonEmpty(input.symbol, "Symbol").slice(0, 4),
  };
  if (input.type === "VACATION" || input.type === "SICK" || input.type === "FREE") {
    return { ...base, startTime: null, endTime: null, breakMinutes: 0 };
  }
  const startTime = requireLocalTime(input.startTime ?? "");
  const endTime = requireLocalTime(input.endTime ?? "");
  requireTimedRange(startTime, endTime);

  return {
    ...base,
    startTime,
    endTime,
    breakMinutes: requireBreakMinutes(input.breakMinutes),
  };
}

export function validateShift(input: SaveShiftInput): SaveShiftInput {
  if (!SHIFT_TYPES.includes(input.type)) {
    throw new ValidationError("Unbekannte Dienstart.");
  }

  const base = {
    ...input,
    date: requireLocalDate(input.date),
    title: requireNonEmpty(input.title, "Bezeichnung"),
    color: requireColor(input.color),
    symbol: requireNonEmpty(input.symbol, "Symbol").slice(0, 4),
    note: input.note?.trim() || null,
    overtimeMinutes: input.overtimeMinutes ?? 0,
    holidayPremiumMode: input.holidayPremiumMode ?? "WITH_TIME_OFF",
  };
  if (
    !Number.isInteger(base.overtimeMinutes) ||
    base.overtimeMinutes < 0 ||
    base.overtimeMinutes > 24 * 60
  ) {
    throw new ValidationError("Überstunden müssen zwischen 0 und 1.440 Minuten liegen.");
  }
  if (!["WITH_TIME_OFF", "WITHOUT_TIME_OFF"].includes(base.holidayPremiumMode)) {
    throw new ValidationError("Ungültige Feiertagsoption.");
  }

  if (input.type === "VACATION" || input.type === "SICK" || input.type === "FREE") {
    return { ...base, startTime: null, endTime: null, breakMinutes: 0, overtimeMinutes: 0 };
  }

  const startTime = requireLocalTime(input.startTime ?? "");
  const endTime = requireLocalTime(input.endTime ?? "");
  requireTimedRange(startTime, endTime);
  return {
    ...base,
    startTime,
    endTime,
    breakMinutes: requireBreakMinutes(input.breakMinutes ?? 0),
  };
}

export function validateAppointment(input: SaveAppointmentInput): SaveAppointmentInput {
  const base = {
    ...input,
    date: requireLocalDate(input.date),
    title: requireNonEmpty(input.title, "Titel"),
    color: requireColor(input.color),
    note: input.note?.trim() || null,
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
