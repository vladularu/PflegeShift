import { Temporal } from "@js-temporal/polyfill";
import type { DatedRemunerationProfile } from "./remuneration-profile";
import { requireRemunerationDate } from "./remuneration-profile";
import type { ShiftEntry } from "./types";
import { requireInstant } from "./validation";
import { validateTvlBurnCareIntervals, type TvlBurnCareInterval } from "./tvl-burn-care";

export interface SavedTvlShiftWork {
  /** Absent/null: unknown; []: explicitly no activity. Earlier drafts have no property. */
  readonly burnCareIntervals?: readonly TvlBurnCareInterval[] | null;
  readonly shiftId: string;
  readonly shiftRevision: number;
  readonly shiftDate: string;
  readonly shiftUpdatedAt: string;
  readonly timeZone: string;
  readonly profileEffectiveFrom: string;
  readonly profileRevision: number;
  readonly shiftWork: boolean | null;
  readonly revision: number;
  readonly confirmedAt: string;
  readonly updatedAt: string;
}

export interface SaveTvlShiftWorkInput {
  readonly burnCareIntervals?: readonly TvlBurnCareInterval[] | null;
  readonly shiftId: string;
  readonly expectedShiftRevision: number;
  readonly expectedShiftUpdatedAt: string;
  readonly timeZone: string;
  readonly profileEffectiveFrom: string;
  readonly expectedProfileRevision: number;
  readonly shiftWork: boolean | null;
  readonly expectedRevision: number;
}

export const TVL_SHIFT_WORK_KEYS = [
  "shiftId",
  "shiftRevision",
  "shiftDate",
  "shiftUpdatedAt",
  "timeZone",
  "profileEffectiveFrom",
  "profileRevision",
  "shiftWork",
  "revision",
  "confirmedAt",
  "updatedAt",
] as const;

export function validateTvlShiftWork(value: unknown): SavedTvlShiftWork {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Ungültige TV-L-Dienstbestätigung.");
  const row = value as Record<string, unknown>;
  const hasBurn = Object.hasOwn(row, "burnCareIntervals");
  if (
    Object.keys(row).length !== TVL_SHIFT_WORK_KEYS.length + Number(hasBurn) ||
    TVL_SHIFT_WORK_KEYS.some((key) => !Object.hasOwn(row, key))
  )
    throw new Error("Unbekanntes Format der TV-L-Dienstbestätigung.");
  if (typeof row.shiftId !== "string" || !row.shiftId.trim() || row.shiftId.length > 200)
    throw new Error("Ungültige Dienstzuordnung.");
  for (const value of [row.shiftRevision, row.profileRevision, row.revision])
    if (!Number.isSafeInteger(value) || (value as number) < 1)
      throw new Error("Ungültige Bestätigungsrevision.");
  if (row.shiftWork !== true && row.shiftWork !== false && row.shiftWork !== null)
    throw new Error("Bitte den Schichtarbeitsbezug ausdrücklich angeben.");
  if (typeof row.timeZone !== "string" || !row.timeZone || /^[+-]/u.test(row.timeZone))
    throw new Error("Ungültige Zeitzone.");
  Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(row.timeZone);
  const confirmedAt = requireInstant(row.confirmedAt, "Bestätigung");
  const updatedAt = requireInstant(row.updatedAt, "Aktualisierung");
  if (Date.parse(confirmedAt) > Date.parse(updatedAt))
    throw new Error("Ungültiger Bestätigungszeitpunkt.");
  return Object.freeze({
    ...(hasBurn ? { burnCareIntervals: validateTvlBurnCareIntervals(row.burnCareIntervals) } : {}),
    shiftId: row.shiftId,
    shiftRevision: row.shiftRevision as number,
    shiftDate: requireRemunerationDate(row.shiftDate),
    shiftUpdatedAt: requireInstant(row.shiftUpdatedAt, "Dienständerung"),
    timeZone: row.timeZone,
    profileEffectiveFrom: requireRemunerationDate(row.profileEffectiveFrom),
    profileRevision: row.profileRevision as number,
    shiftWork: row.shiftWork,
    revision: row.revision as number,
    confirmedAt,
    updatedAt,
  });
}

/** A profile correction, shift edit or timezone change requires explicit reconfirmation. */
export function isCurrentTvlShiftWork(
  value: SavedTvlShiftWork,
  shift: ShiftEntry,
  timeZone: string,
  profile: DatedRemunerationProfile,
): boolean {
  return value.shiftWork !== null && isCurrentTvlServiceFacts(value, shift, timeZone, profile);
}

/** Freshness is shared; the absence of a Saturday decision does not erase known activity times. */
export function isCurrentTvlServiceFacts(
  value: SavedTvlShiftWork,
  shift: ShiftEntry,
  timeZone: string,
  profile: DatedRemunerationProfile,
): boolean {
  return (
    value.shiftId === shift.id &&
    value.shiftRevision === shift.revision &&
    value.shiftDate === shift.date &&
    value.shiftUpdatedAt === shift.updatedAt &&
    shift.deletedAt === null &&
    !shift.allDay &&
    shift.startTime !== null &&
    shift.endTime !== null &&
    !["VACATION", "SICK", "FREE"].includes(shift.type) &&
    value.timeZone === timeZone &&
    value.profileEffectiveFrom === profile.effectiveFrom &&
    value.profileRevision === profile.revision &&
    profile.data.selection.kind === "tariff" &&
    ["tvl-kr-tdl", "tval-pflege-tdl"].includes(profile.data.selection.packageId)
  );
}
