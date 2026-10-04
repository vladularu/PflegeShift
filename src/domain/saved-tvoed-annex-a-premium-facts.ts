import { Temporal } from "@js-temporal/polyfill";
import type { DatedRemunerationProfile } from "./remuneration-profile";
import { requireRemunerationDate } from "./remuneration-profile";
import type { ShiftEntry } from "./types";
import { requireInstant, requireLocalDate, requireLocalMonth } from "./validation";

/** A shift template is not evidence of the actual work or the agreed payment. */
export interface TvoedAnnexADraftDayDecision {
  readonly shiftId: string;
  readonly date: string;
  readonly origin: "confirmed";
  readonly shiftBinding: string;
  readonly workKind: "REGULAR_ACTIVE" | "SPECIAL" | null;
  readonly holidayTimeOff: boolean | null;
  readonly shiftWork: boolean | null;
  readonly legacyAngestellteClass: boolean | null;
}

/** Includes content as well as revision: a restored shift can reuse revision and timestamp. */
export function tvoedAnnexAShiftBinding(shift: ShiftEntry, timeZone: string): string {
  return JSON.stringify([
    shift.id,
    shift.revision,
    shift.updatedAt,
    shift.date,
    shift.type,
    shift.allDay,
    shift.startTime,
    shift.endTime,
    shift.breakMinutes,
    shift.deletedAt,
    timeZone,
  ]);
}

export interface SavedTvoedAnnexAPremiumFacts {
  readonly month: string;
  readonly profileEffectiveFrom: string;
  readonly profileRevision: number;
  readonly packageId: "tvoed-vka-anlage-a";
  readonly ruleVersionId: string;
  readonly variantId: "BT_K" | "BT_B";
  readonly regionId: "VKA";
  readonly groupId: string;
  readonly stepId: string;
  readonly contractedWeeklyMinutes: number;
  readonly comparableFullTimeWeeklyMinutes: number;
  readonly timeZoneId: "Europe/Berlin";
  readonly cashPaymentConfirmed: boolean | null;
  readonly localAgreement: "UNKNOWN" | "NONE_CONFIRMED" | "DIFFERENT";
  readonly dayDecisions: readonly TvoedAnnexADraftDayDecision[];
  readonly revision: number;
  readonly confirmedAt: string;
  readonly updatedAt: string;
}

export interface SaveTvoedAnnexAPremiumFactsInput {
  readonly month: string;
  readonly profileEffectiveFrom: string;
  readonly expectedProfileRevision: number;
  readonly ruleVersionId: string;
  readonly cashPaymentConfirmed: boolean | null;
  readonly localAgreement: SavedTvoedAnnexAPremiumFacts["localAgreement"];
  readonly dayDecisions: readonly TvoedAnnexADraftDayDecision[];
  readonly expectedRevision: number;
}

const KEYS = [
  "month",
  "profileEffectiveFrom",
  "profileRevision",
  "packageId",
  "ruleVersionId",
  "variantId",
  "regionId",
  "groupId",
  "stepId",
  "contractedWeeklyMinutes",
  "comparableFullTimeWeeklyMinutes",
  "timeZoneId",
  "cashPaymentConfirmed",
  "localAgreement",
  "dayDecisions",
  "revision",
  "confirmedAt",
  "updatedAt",
] as const;
const DAY_KEYS = [
  "shiftId",
  "date",
  "origin",
  "shiftBinding",
  "workKind",
  "holidayTimeOff",
  "shiftWork",
  "legacyAngestellteClass",
] as const;

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error(`Ungültige ${label}.`);
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || keys.some((key) => !Object.hasOwn(row, key)))
    throw new Error(`Unbekanntes Format der ${label}.`);
  return row;
}

function triState(value: unknown): value is boolean | null {
  return value === true || value === false || value === null;
}

function validatedDecision(value: unknown, month: string): TvoedAnnexADraftDayDecision {
  const row = exactRecord(value, DAY_KEYS, "TVöD-Tagesentscheidung");
  const date = typeof row.date === "string" ? requireLocalDate(row.date) : "";
  if (
    date !== row.date ||
    !date.startsWith(`${month}-`) ||
    typeof row.shiftId !== "string" ||
    row.shiftId.length < 1 ||
    row.shiftId.length > 128 ||
    row.origin !== "confirmed" ||
    (row.workKind !== "REGULAR_ACTIVE" && row.workKind !== "SPECIAL" && row.workKind !== null) ||
    !triState(row.holidayTimeOff) ||
    !triState(row.shiftWork) ||
    !triState(row.legacyAngestellteClass) ||
    typeof row.shiftBinding !== "string" ||
    row.shiftBinding.length > 2048
  )
    throw new Error("Ungültige TVöD-Tagesentscheidung.");
  let binding: unknown;
  try {
    binding = JSON.parse(row.shiftBinding);
  } catch {
    /* rejected below */
  }
  let shiftStartDate: string | null = null;
  try {
    if (Array.isArray(binding) && typeof binding[3] === "string")
      shiftStartDate = requireLocalDate(binding[3]);
  } catch {
    /* rejected below */
  }
  const crossesMidnight =
    Array.isArray(binding) &&
    binding[5] !== true &&
    typeof binding[6] === "string" &&
    typeof binding[7] === "string" &&
    binding[7] <= binding[6] &&
    binding[7] !== "00:00";
  const validWorkDate =
    shiftStartDate !== null &&
    (date === shiftStartDate ||
      (crossesMidnight &&
        date === Temporal.PlainDate.from(shiftStartDate).add({ days: 1 }).toString()));
  if (
    !Array.isArray(binding) ||
    binding.length !== 11 ||
    binding[0] !== row.shiftId ||
    !validWorkDate ||
    !Number.isSafeInteger(binding[1]) ||
    binding[1] < 1 ||
    typeof binding[2] !== "string" ||
    typeof binding[4] !== "string" ||
    (binding[5] !== null && typeof binding[5] !== "boolean") ||
    (binding[6] !== null && typeof binding[6] !== "string") ||
    (binding[7] !== null && typeof binding[7] !== "string") ||
    !Number.isSafeInteger(binding[8]) ||
    binding[8] < 0 ||
    (binding[9] !== null && typeof binding[9] !== "string") ||
    binding[10] !== "Europe/Berlin" ||
    JSON.stringify(binding) !== row.shiftBinding
  )
    throw new Error("Ungültige TVöD-Dienstbindung.");
  return Object.freeze({
    shiftId: row.shiftId,
    date,
    origin: "confirmed",
    shiftBinding: row.shiftBinding,
    workKind: row.workKind,
    holidayTimeOff: row.holidayTimeOff,
    shiftWork: row.shiftWork,
    legacyAngestellteClass: row.legacyAngestellteClass,
  } as TvoedAnnexADraftDayDecision);
}

export function validateSavedTvoedAnnexAPremiumFacts(value: unknown): SavedTvoedAnnexAPremiumFacts {
  const row = exactRecord(value, KEYS, "TVöD-Zuschlagsbestätigung");
  const month = requireLocalMonth(row.month);
  if (
    row.packageId !== "tvoed-vka-anlage-a" ||
    (row.variantId !== "BT_K" && row.variantId !== "BT_B") ||
    row.regionId !== "VKA" ||
    typeof row.ruleVersionId !== "string" ||
    !/^[a-z0-9][a-z0-9._-]{0,100}$/iu.test(row.ruleVersionId) ||
    typeof row.groupId !== "string" ||
    !/^eg(?:[1-9]|1[0-5])(?:[abc])?$/u.test(row.groupId) ||
    typeof row.stepId !== "string" ||
    !/^s[1-6]$/u.test(row.stepId) ||
    row.timeZoneId !== "Europe/Berlin" ||
    !triState(row.cashPaymentConfirmed) ||
    !["UNKNOWN", "NONE_CONFIRMED", "DIFFERENT"].includes(row.localAgreement as string)
  )
    throw new Error("Ungültige TVöD-Zuschlagszuordnung.");
  for (const revision of [row.profileRevision, row.revision])
    if (!Number.isSafeInteger(revision) || (revision as number) < 1)
      throw new Error("Ungültige TVöD-Zuschlagsrevision.");
  for (const minutes of [row.contractedWeeklyMinutes, row.comparableFullTimeWeeklyMinutes])
    if (!Number.isSafeInteger(minutes) || (minutes as number) < 1 || (minutes as number) > 2520)
      throw new Error("Ungültige TVöD-Wochenarbeitszeit.");
  if ((row.contractedWeeklyMinutes as number) > (row.comparableFullTimeWeeklyMinutes as number))
    throw new Error("Ungültige TVöD-Wochenarbeitszeit.");
  if (!Array.isArray(row.dayDecisions) || row.dayDecisions.length > 256)
    throw new Error("Ungültige TVöD-Tagesentscheidungen.");
  const dayDecisions = row.dayDecisions.map((item) => validatedDecision(item, month));
  if (
    new Set(dayDecisions.map((item) => `${item.shiftId}:${item.date}`)).size !== dayDecisions.length
  )
    throw new Error("Doppelte TVöD-Tagesentscheidung.");
  const confirmedAt = requireInstant(row.confirmedAt, "Bestätigung");
  const updatedAt = requireInstant(row.updatedAt, "Aktualisierung");
  if (Date.parse(confirmedAt) > Date.parse(updatedAt))
    throw new Error("Ungültiger Bestätigungszeitpunkt.");
  return Object.freeze({
    month,
    profileEffectiveFrom: requireRemunerationDate(row.profileEffectiveFrom),
    profileRevision: row.profileRevision as number,
    packageId: "tvoed-vka-anlage-a",
    ruleVersionId: row.ruleVersionId,
    variantId: row.variantId as "BT_K" | "BT_B",
    regionId: "VKA",
    groupId: row.groupId,
    stepId: row.stepId,
    contractedWeeklyMinutes: row.contractedWeeklyMinutes as number,
    comparableFullTimeWeeklyMinutes: row.comparableFullTimeWeeklyMinutes as number,
    timeZoneId: "Europe/Berlin",
    cashPaymentConfirmed: row.cashPaymentConfirmed as boolean | null,
    localAgreement: row.localAgreement as SavedTvoedAnnexAPremiumFacts["localAgreement"],
    dayDecisions: Object.freeze(dayDecisions),
    revision: row.revision as number,
    confirmedAt,
    updatedAt,
  } as SavedTvoedAnnexAPremiumFacts);
}

export function isCurrentTvoedAnnexAPremiumFacts(
  value: SavedTvoedAnnexAPremiumFacts,
  profile: DatedRemunerationProfile,
  ruleVersionId: string,
): boolean {
  const selection = profile.data.selection;
  return (
    value.profileEffectiveFrom === profile.effectiveFrom &&
    value.profileRevision === profile.revision &&
    value.ruleVersionId === ruleVersionId &&
    selection.kind === "tariff" &&
    selection.packageId === value.packageId &&
    selection.variant === value.variantId &&
    selection.region === value.regionId &&
    selection.group.toLowerCase() === value.groupId &&
    `s${selection.level}` === value.stepId &&
    selection.fullTimeWeeklyMinutes === value.comparableFullTimeWeeklyMinutes &&
    profile.data.weeklyMinutes === value.contractedWeeklyMinutes
  );
}
