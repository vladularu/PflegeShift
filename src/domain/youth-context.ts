import { requireRemunerationDate } from "./remuneration-profile";

/** Personal confirmations, not legal limits or inferred tariff privileges. */
export interface YouthContext {
  readonly careInstitution: boolean | null;
  readonly medicalEmergencyService: boolean | null;
  readonly multiShiftOperation: boolean | null;
  readonly otherExceptions: boolean | null;
  readonly allWorkAndSchoolRecorded: boolean | null;
  readonly pausesPredefined: boolean | null;
  readonly averageDailyTrainingMinutes: number | null;
  readonly averageWeeklyTrainingMinutes: number | null;
  readonly shortenedWorkingDays: readonly string[];
  readonly blockTrainingShiftIds: readonly string[];
  readonly holidayLostMinutes: Readonly<Record<string, number>>;
}
export const UNKNOWN_YOUTH_CONTEXT: YouthContext = Object.freeze({
  careInstitution: null,
  medicalEmergencyService: null,
  multiShiftOperation: null,
  otherExceptions: null,
  allWorkAndSchoolRecorded: null,
  pausesPredefined: null,
  averageDailyTrainingMinutes: null,
  averageWeeklyTrainingMinutes: null,
  shortenedWorkingDays: Object.freeze([]),
  blockTrainingShiftIds: Object.freeze([]),
  holidayLostMinutes: Object.freeze({}),
});
const booleanFields = [
  "careInstitution",
  "medicalEmergencyService",
  "multiShiftOperation",
  "otherExceptions",
  "allWorkAndSchoolRecorded",
  "pausesPredefined",
] as const;
function minutes(value: unknown, max: number, min = 1): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max)
    throw new Error("Ungültige Minutenangabe für die Jugendprüfung.");
  return value as number;
}
function uniqueStrings(value: unknown, maximum: number, maxLength = 200): string[] {
  if (
    !Array.isArray(value) ||
    value.length > maximum ||
    value.some((v) => typeof v !== "string" || !v.trim() || v.length > maxLength) ||
    new Set(value).size !== value.length
  )
    throw new Error("Ungültige oder doppelte Zuordnung für die Jugendprüfung.");
  return [...value];
}
export function validateYouthContext(value: unknown): YouthContext {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Angaben für die Jugendprüfung fehlen.");
  const r = value as Record<string, unknown>;
  const keys = Object.keys(UNKNOWN_YOUTH_CONTEXT);
  if (Object.keys(r).length !== keys.length || keys.some((key) => !Object.hasOwn(r, key)))
    throw new Error("Unbekanntes Format der Jugendangaben.");
  for (const key of booleanFields)
    if (r[key] !== null && typeof r[key] !== "boolean")
      throw new Error("Prüfungsvoraussetzung bitte ausdrücklich bestätigen.");
  const shortenedWorkingDays = uniqueStrings(r.shortenedWorkingDays, 3660).map(
    requireRemunerationDate,
  );
  // Legacy plain IDs remain readable, but the assessor accepts only current content bindings.
  const blockTrainingShiftIds = uniqueStrings(r.blockTrainingShiftIds, 10000, 2048);
  if (
    !r.holidayLostMinutes ||
    typeof r.holidayLostMinutes !== "object" ||
    Array.isArray(r.holidayLostMinutes) ||
    Object.keys(r.holidayLostMinutes).length > 3660
  )
    throw new Error("Ungültige Feiertagsangaben.");
  const holidayLostMinutes: Record<string, number> = {};
  for (const [date, value] of Object.entries(r.holidayLostMinutes)) {
    const validDate = requireRemunerationDate(date),
      amount = minutes(value, 1440, 0);
    if (amount === null) throw new Error("Feiertagsausfall bitte als Minuten bestätigen.");
    holidayLostMinutes[validDate] = amount;
  }
  return Object.freeze({
    careInstitution: r.careInstitution as boolean | null,
    medicalEmergencyService: r.medicalEmergencyService as boolean | null,
    multiShiftOperation: r.multiShiftOperation as boolean | null,
    otherExceptions: r.otherExceptions as boolean | null,
    allWorkAndSchoolRecorded: r.allWorkAndSchoolRecorded as boolean | null,
    pausesPredefined: r.pausesPredefined as boolean | null,
    averageDailyTrainingMinutes: minutes(r.averageDailyTrainingMinutes, 1440),
    averageWeeklyTrainingMinutes: minutes(r.averageWeeklyTrainingMinutes, 10080),
    shortenedWorkingDays: Object.freeze(shortenedWorkingDays),
    blockTrainingShiftIds: Object.freeze(blockTrainingShiftIds),
    holidayLostMinutes: Object.freeze(holidayLostMinutes),
  });
}
