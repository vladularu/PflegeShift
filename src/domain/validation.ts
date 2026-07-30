import { Temporal } from "@js-temporal/polyfill";

import {
  FEDERAL_STATES,
  SHIFT_TYPES,
  type FederalState,
  type SaveAppointmentInput,
  type SaveShiftInput,
  type SaveShiftTemplateInput,
  type TimedShiftType,
} from "@/domain/types";

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const COLOR_PATTERN = /^#[0-9A-F]{6}$/i;

export class ValidationError extends Error {
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
  const startTime = requireLocalTime(input.startTime);
  const endTime = requireLocalTime(input.endTime);
  requireTimedRange(startTime, endTime);

  return {
    ...input,
    name: requireNonEmpty(input.name, "Name"),
    type: input.type as TimedShiftType,
    startTime,
    endTime,
    breakMinutes: requireBreakMinutes(input.breakMinutes),
    color: requireColor(input.color),
    symbol: requireNonEmpty(input.symbol, "Symbol").slice(0, 4),
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
    breakMinutes: requireBreakMinutes(input.breakMinutes ?? 0),
  };
}

export function validateAppointment(
  input: SaveAppointmentInput,
): SaveAppointmentInput {
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
