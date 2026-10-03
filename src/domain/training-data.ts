import { Temporal } from "@js-temporal/polyfill";
import { requireRemunerationDate } from "./remuneration-profile";
import { requireInstant } from "./validation";
import type { ShiftEntry } from "./types";
import { validateYouthContext, type YouthContext } from "./youth-context";

interface TrainingProfileFields {
  readonly effectiveFrom: string;
  readonly birthDate: string | null;
  readonly fullTimeCompulsorySchooling: boolean | null;
  readonly status: "unknown" | "employment" | "training";
  readonly training: {
    readonly profession: string;
    readonly legalBasis: "PFLBG" | "BBIG" | "OTHER" | "UNKNOWN";
    readonly startedOn: string;
    readonly expectedEndOn: string | null;
    readonly year: number | null;
    readonly yearConfirmedFrom: string | null;
    readonly shorteningMonths: number | null;
  } | null;
}

export type TrainingProfileData = TrainingProfileFields &
  ({ readonly version: 1 } | { readonly version: 2; readonly youth: YouthContext | null });

export interface SavedTrainingProfile {
  readonly data: TrainingProfileData;
  readonly revision: number;
  readonly updatedAt: string;
}

export interface SaveTrainingProfileInput {
  readonly data: TrainingProfileData;
  readonly expectedRevision: number;
}

export interface SaveShiftTrainingInput {
  readonly shiftId: string;
  readonly expectedShiftRevision: number;
  readonly expectedShiftDate: string;
  readonly expectedShiftUpdatedAt: string;
  readonly timeZone: string;
  readonly expectedRevision: number;
  readonly data: ShiftTrainingData;
  /** Explicit user consent to replace the service's pause total atomically. */
  readonly synchronizeBreakMinutes?: boolean;
}

export interface TrainingSnapshot {
  readonly profiles: readonly SavedTrainingProfile[];
  readonly shifts: readonly SavedShiftTraining[];
}

/** Actual instants, not ambiguous wall-clock times during a DST transition. */
export interface TrainingInterval {
  readonly start: string;
  readonly end: string;
}

export interface ShiftTrainingData {
  readonly version: 1 | 2 | 3;
  /** null = unknown, [] = explicitly confirmed no pauses. */
  readonly pauses: readonly TrainingInterval[] | null;
  /** null = not explicitly classified as school. A title is never classification. */
  readonly school: {
    readonly lessons: readonly TrainingInterval[];
    /** Necessary travel between school and training site; zero must be explicit. */
    readonly travelToWorkMinutes: number | null;
    readonly travelFromWorkMinutes: number | null;
    /** V3 only: confirmed instants; null leaves a positive duration unlocated. */
    readonly travelToWorkInterval?: TrainingInterval | null;
    readonly travelFromWorkInterval?: TrainingInterval | null;
    readonly block: { readonly startDate: string; readonly endDate: string } | null;
  } | null;
  /** V2/V3: a confirmed classification, never inferred from the calendar title. */
  readonly exam?: {
    readonly kind: "EXAM" | "EXTERNAL_TRAINING";
    readonly requiredByRuleOrContract: boolean | null;
    readonly finalWritten: boolean | null;
    /** Explicit preceding working day, not necessarily the previous calendar day. */
    readonly precedingWorkDate: string | null;
    readonly participation: readonly TrainingInterval[];
    readonly travelToWorkMinutes: number | null;
    readonly travelFromWorkMinutes: number | null;
    /** V3 only: actual necessary travel between participation site and workplace. */
    readonly travelToWorkInterval?: TrainingInterval | null;
    readonly travelFromWorkInterval?: TrainingInterval | null;
  } | null;
}

export interface SavedShiftTraining {
  readonly shiftId: string;
  readonly shiftRevision: number;
  readonly shiftDate: string;
  readonly shiftUpdatedAt: string;
  readonly timeZone: string;
  readonly data: ShiftTrainingData;
  readonly revision: number;
  readonly updatedAt: string;
}

export function exactTrainingRecord(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Ungültige Ausbildungsdaten.");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || keys.some((key) => !Object.hasOwn(record, key)))
    throw new Error("Unbekanntes Format der Ausbildungsdaten.");
  return record;
}

function integer(value: unknown, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max)
    throw new Error("Ungültige Zahl in den Ausbildungsdaten.");
  return value as number;
}

export function trainingRevision(value: unknown): number {
  return integer(value, 1, Number.MAX_SAFE_INTEGER);
}

export function validateTrainingProfile(value: unknown): TrainingProfileData {
  const version = value && typeof value === "object" && "version" in value ? value.version : null;
  const raw = exactTrainingRecord(value, [
    "version",
    "effectiveFrom",
    "birthDate",
    "fullTimeCompulsorySchooling",
    "status",
    "training",
    ...(version === 2 ? ["youth"] : []),
  ]);
  if (
    ![1, 2].includes(raw.version as number) ||
    !["unknown", "employment", "training"].includes(raw.status as string)
  )
    throw new Error("Unbekanntes Ausbildungsprofil.");
  if (
    raw.fullTimeCompulsorySchooling !== null &&
    typeof raw.fullTimeCompulsorySchooling !== "boolean"
  )
    throw new Error("Vollzeitschulpflicht bitte ausdrücklich angeben.");
  const effectiveFrom = requireRemunerationDate(raw.effectiveFrom);
  const birthDate = raw.birthDate === null ? null : requireRemunerationDate(raw.birthDate);
  if (birthDate !== null && birthDate > effectiveFrom)
    throw new Error("Geburtsdatum liegt nach dem Profilbeginn.");
  let training: TrainingProfileData["training"] = null;
  if (raw.training !== null) {
    const t = exactTrainingRecord(raw.training, [
      "profession",
      "legalBasis",
      "startedOn",
      "expectedEndOn",
      "year",
      "yearConfirmedFrom",
      "shorteningMonths",
    ]);
    if (
      raw.status !== "training" ||
      typeof t.profession !== "string" ||
      !t.profession.trim() ||
      t.profession.length > 200
    )
      throw new Error("Ausbildungsberuf fehlt oder passt nicht zum Status.");
    if (!["PFLBG", "BBIG", "OTHER", "UNKNOWN"].includes(t.legalBasis as string))
      throw new Error("Unbekannte Ausbildungsgrundlage.");
    const startedOn = requireRemunerationDate(t.startedOn);
    const expectedEndOn =
      t.expectedEndOn === null ? null : requireRemunerationDate(t.expectedEndOn);
    const year = t.year === null ? null : integer(t.year, 1, 6);
    const yearConfirmedFrom =
      t.yearConfirmedFrom === null ? null : requireRemunerationDate(t.yearConfirmedFrom);
    if (
      (year === null) !== (yearConfirmedFrom === null) ||
      (yearConfirmedFrom !== null && yearConfirmedFrom < startedOn)
    )
      throw new Error("Ausbildungsjahr benötigt einen gültigen Bestätigungsbeginn.");
    if (
      (birthDate !== null && startedOn < birthDate) ||
      (expectedEndOn !== null && expectedEndOn < startedOn)
    )
      throw new Error("Ungültiger Ausbildungszeitraum.");
    if (expectedEndOn !== null && yearConfirmedFrom !== null && yearConfirmedFrom > expectedEndOn)
      throw new Error("Bestätigtes Ausbildungsjahr liegt nach dem Ausbildungsende.");
    training = Object.freeze({
      profession: t.profession.trim(),
      legalBasis: t.legalBasis as NonNullable<TrainingProfileData["training"]>["legalBasis"],
      startedOn,
      expectedEndOn,
      year,
      yearConfirmedFrom,
      shorteningMonths: t.shorteningMonths === null ? null : integer(t.shorteningMonths, 0, 72),
    });
  } else if (raw.status === "training") {
    throw new Error("Ausbildungsangaben fehlen.");
  }
  return Object.freeze({
    ...(raw.version === 2
      ? { version: 2 as const, youth: raw.youth === null ? null : validateYouthContext(raw.youth) }
      : { version: 1 as const }),
    effectiveFrom,
    birthDate,
    fullTimeCompulsorySchooling: raw.fullTimeCompulsorySchooling as boolean | null,
    status: raw.status as TrainingProfileData["status"],
    training,
  });
}

/** No backdating and no automatic year advancement. */
export function trainingProfileForDate(
  profiles: readonly SavedTrainingProfile[],
  date: string,
): SavedTrainingProfile | null {
  requireRemunerationDate(date);
  const seen = new Set<string>();
  let latest: SavedTrainingProfile | null = null;
  for (const profile of profiles) {
    const raw = exactTrainingRecord(profile, ["data", "revision", "updatedAt"]);
    const candidate: SavedTrainingProfile = Object.freeze({
      data: validateTrainingProfile(raw.data),
      revision: trainingRevision(raw.revision),
      updatedAt: requireInstant(raw.updatedAt, "Ausbildungsprofil"),
    });
    if (seen.has(candidate.data.effectiveFrom))
      throw new Error("Ausbildungsprofile benötigen eindeutige Gültigkeitsbeginne.");
    seen.add(candidate.data.effectiveFrom);
    if (
      candidate.data.effectiveFrom <= date &&
      (latest === null || candidate.data.effectiveFrom > latest.data.effectiveFrom)
    )
      latest = candidate;
  }
  return latest;
}

function intervals(value: unknown, allowEmpty: boolean): readonly TrainingInterval[] {
  if (!Array.isArray(value) || value.length > 96 || (!allowEmpty && value.length === 0))
    throw new Error("Zeitintervalle fehlen oder sind ungültig.");
  let previousEnd = -Infinity;
  return Object.freeze(
    value.map((v) => {
      const raw = exactTrainingRecord(v, ["start", "end"]);
      const start = requireInstant(raw.start, "Beginn");
      const end = requireInstant(raw.end, "Ende");
      const from = Date.parse(start),
        until = Date.parse(end);
      if (
        from % 60000 !== 0 ||
        until % 60000 !== 0 ||
        until <= from ||
        from < previousEnd ||
        until - from > 25 * 60 * 60000
      )
        throw new Error(
          "Zeitintervalle müssen minutengenau, geordnet und überschneidungsfrei sein.",
        );
      previousEnd = until;
      return Object.freeze({ start, end });
    }),
  );
}

function locatedTravelInterval(value: unknown, minutes: number | null): TrainingInterval | null {
  if (value === null) return null;
  const interval = intervals([value], false)[0];
  if (
    minutes === null ||
    (Date.parse(interval.end) - Date.parse(interval.start)) / 60000 !== minutes
  )
    throw new Error("Verorteter Weg und bestätigte Wegezeit stimmen nicht überein.");
  return interval;
}

function overlaps(a: TrainingInterval, b: TrainingInterval): boolean {
  return Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end);
}

export function validateShiftTrainingData(value: unknown): ShiftTrainingData {
  const version =
    value && typeof value === "object" && !Array.isArray(value) && "version" in value
      ? value.version
      : null;
  if (version !== 1 && version !== 2 && version !== 3)
    throw new Error("Unbekannte Schul-/Pausenversion.");
  const raw = exactTrainingRecord(
    value,
    version === 1 ? ["version", "pauses", "school"] : ["version", "pauses", "school", "exam"],
  );
  const pauses = raw.pauses === null ? null : intervals(raw.pauses, true);
  let school: ShiftTrainingData["school"] = null;
  if (raw.school !== null) {
    const s = exactTrainingRecord(raw.school, [
      "lessons",
      "travelToWorkMinutes",
      "travelFromWorkMinutes",
      "block",
      ...(version === 3 ? ["travelToWorkInterval", "travelFromWorkInterval"] : []),
    ]);
    const lessons = intervals(s.lessons, false);
    const travelToWorkMinutes =
      s.travelToWorkMinutes === null ? null : integer(s.travelToWorkMinutes, 0, 720);
    const travelFromWorkMinutes =
      s.travelFromWorkMinutes === null ? null : integer(s.travelFromWorkMinutes, 0, 720);
    const travelToWorkInterval =
      version === 3 ? locatedTravelInterval(s.travelToWorkInterval, travelToWorkMinutes) : null;
    const travelFromWorkInterval =
      version === 3 ? locatedTravelInterval(s.travelFromWorkInterval, travelFromWorkMinutes) : null;
    let block: NonNullable<ShiftTrainingData["school"]>["block"] = null;
    if (s.block !== null) {
      const b = exactTrainingRecord(s.block, ["startDate", "endDate"]);
      const startDate = requireRemunerationDate(b.startDate),
        endDate = requireRemunerationDate(b.endDate);
      if (endDate < startDate) throw new Error("Ungültiger Schulblock.");
      block = Object.freeze({ startDate, endDate });
    }
    for (const lesson of lessons)
      for (const pause of pauses ?? [])
        if (overlaps(lesson, pause))
          throw new Error("Unterricht und Pause dürfen sich nicht überschneiden.");
    const travel = [travelFromWorkInterval, travelToWorkInterval].filter(
      (interval): interval is TrainingInterval => interval !== null,
    );
    for (const interval of travel)
      if ([...lessons, ...(pauses ?? [])].some((other) => overlaps(interval, other)))
        throw new Error("Schulweg darf sich nicht mit Unterricht oder Pause überschneiden.");
    if (
      travelFromWorkInterval &&
      travelToWorkInterval &&
      overlaps(travelFromWorkInterval, travelToWorkInterval)
    )
      throw new Error("Schulwege dürfen sich nicht überschneiden.");
    if (
      (travelFromWorkInterval &&
        Date.parse(travelFromWorkInterval.end) > Date.parse(lessons[0].start)) ||
      (travelToWorkInterval &&
        Date.parse(travelToWorkInterval.start) < Date.parse(lessons[lessons.length - 1].end))
    )
      throw new Error("Schulwege müssen vor oder nach dem Unterricht liegen.");
    school = Object.freeze({
      lessons,
      block,
      travelToWorkMinutes,
      travelFromWorkMinutes,
      ...(version === 3 ? { travelToWorkInterval, travelFromWorkInterval } : {}),
    });
  }
  if (version === 1) return Object.freeze({ version: 1, pauses, school });
  let exam: ShiftTrainingData["exam"] = null;
  if (raw.exam !== null) {
    const e = exactTrainingRecord(raw.exam, [
      "kind",
      "requiredByRuleOrContract",
      "finalWritten",
      "precedingWorkDate",
      "participation",
      "travelToWorkMinutes",
      "travelFromWorkMinutes",
      ...(version === 3 ? ["travelToWorkInterval", "travelFromWorkInterval"] : []),
    ]);
    if (e.kind !== "EXAM" && e.kind !== "EXTERNAL_TRAINING")
      throw new Error("Unbekannte Prüfungsart.");
    if (
      (e.requiredByRuleOrContract !== null && typeof e.requiredByRuleOrContract !== "boolean") ||
      (e.finalWritten !== null && typeof e.finalWritten !== "boolean") ||
      (e.kind === "EXTERNAL_TRAINING" && e.finalWritten !== null) ||
      (e.finalWritten !== true && e.precedingWorkDate !== null) ||
      school !== null
    )
      throw new Error("Prüfung und Berufsschule müssen getrennt erfasst werden.");
    const participation = intervals(e.participation, false);
    const travelToWorkMinutes =
      e.travelToWorkMinutes === null ? null : integer(e.travelToWorkMinutes, 0, 720);
    const travelFromWorkMinutes =
      e.travelFromWorkMinutes === null ? null : integer(e.travelFromWorkMinutes, 0, 720);
    const travelToWorkInterval =
      version === 3 ? locatedTravelInterval(e.travelToWorkInterval, travelToWorkMinutes) : null;
    const travelFromWorkInterval =
      version === 3 ? locatedTravelInterval(e.travelFromWorkInterval, travelFromWorkMinutes) : null;
    for (const segment of participation)
      for (const pause of pauses ?? [])
        if (overlaps(segment, pause))
          throw new Error("Prüfungsteilnahme und Pause dürfen sich nicht überschneiden.");
    const travel = [travelFromWorkInterval, travelToWorkInterval].filter(
      (interval): interval is TrainingInterval => interval !== null,
    );
    for (const interval of travel)
      if ([...participation, ...(pauses ?? [])].some((other) => overlaps(interval, other)))
        throw new Error("Prüfungsweg darf sich nicht mit Teilnahme oder Pause überschneiden.");
    if (
      travelFromWorkInterval &&
      travelToWorkInterval &&
      overlaps(travelFromWorkInterval, travelToWorkInterval)
    )
      throw new Error("Prüfungswege dürfen sich nicht überschneiden.");
    if (
      (travelFromWorkInterval &&
        Date.parse(travelFromWorkInterval.end) > Date.parse(participation[0].start)) ||
      (travelToWorkInterval &&
        Date.parse(travelToWorkInterval.start) <
          Date.parse(participation[participation.length - 1].end))
    )
      throw new Error("Prüfungswege müssen vor oder nach der Teilnahme liegen.");
    exam = Object.freeze({
      kind: e.kind,
      requiredByRuleOrContract: e.requiredByRuleOrContract as boolean | null,
      finalWritten: e.finalWritten as boolean | null,
      precedingWorkDate:
        e.precedingWorkDate === null ? null : requireRemunerationDate(e.precedingWorkDate),
      participation,
      travelToWorkMinutes,
      travelFromWorkMinutes,
      ...(version === 3 ? { travelToWorkInterval, travelFromWorkInterval } : {}),
    });
  }
  return Object.freeze({ version, pauses, school, exam });
}

export function validateSavedShiftTraining(value: unknown): SavedShiftTraining {
  const raw = exactTrainingRecord(value, [
    "shiftId",
    "shiftRevision",
    "shiftDate",
    "shiftUpdatedAt",
    "timeZone",
    "data",
    "revision",
    "updatedAt",
  ]);
  if (typeof raw.shiftId !== "string" || !raw.shiftId.trim() || raw.shiftId.length > 200)
    throw new Error("Ungültige Dienstzuordnung.");
  if (typeof raw.timeZone !== "string" || !raw.timeZone || /^[+-]/u.test(raw.timeZone))
    throw new Error("Ungültige Zeitzone.");
  Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(raw.timeZone);
  const shiftUpdatedAt = requireInstant(raw.shiftUpdatedAt, "Dienstaktualisierung");
  const updatedAt = requireInstant(raw.updatedAt, "Aktualisierung");
  if (Date.parse(updatedAt) < Date.parse(shiftUpdatedAt))
    throw new Error("Ungültiger Bestätigungszeitpunkt.");
  return Object.freeze({
    shiftId: raw.shiftId,
    shiftRevision: trainingRevision(raw.shiftRevision),
    shiftDate: requireRemunerationDate(raw.shiftDate),
    shiftUpdatedAt,
    timeZone: raw.timeZone,
    data: validateShiftTrainingData(raw.data),
    revision: trainingRevision(raw.revision),
    updatedAt,
  });
}

export function isCurrentShiftTraining(
  value: SavedShiftTraining,
  shift: ShiftEntry,
  timeZone: string,
): boolean {
  return (
    value.shiftId === shift.id &&
    value.shiftRevision === shift.revision &&
    value.shiftDate === shift.date &&
    value.shiftUpdatedAt === shift.updatedAt &&
    value.timeZone === timeZone &&
    shift.deletedAt === null
  );
}

/** Validation checks factual consistency, not legality: even a short pause can be recorded. */
export function requireShiftTrainingParent(value: SavedShiftTraining, shift: ShiftEntry): void {
  if (
    value.shiftId !== shift.id ||
    value.shiftRevision > shift.revision ||
    Date.parse(value.shiftUpdatedAt) > Date.parse(shift.updatedAt)
  )
    throw new Error("Ungültige Dienstzuordnung der Schul-/Pausendaten.");
  // Keep stale historical records for backup, but never use them for assessment.
  if (
    value.shiftRevision !== shift.revision ||
    value.shiftDate !== shift.date ||
    value.shiftUpdatedAt !== shift.updatedAt
  )
    return;
  const { pauses, school } = value.data;
  const exam = value.data.exam ?? null;
  if (pauses === null && school === null && exam === null) return;
  if (shift.allDay || shift.startTime === null || shift.endTime === null)
    throw new Error("Schulzeiten und Pausen benötigen einen Dienst mit Uhrzeiten.");
  if (school !== null && shift.type !== "TRAINING")
    throw new Error("Berufsschule muss ausdrücklich als Ausbildungseintrag erfasst werden.");
  if (exam !== null && shift.type !== "TRAINING")
    throw new Error("Prüfung muss ausdrücklich als Ausbildungseintrag erfasst werden.");
  if (
    exam?.precedingWorkDate !== null &&
    exam?.precedingWorkDate !== undefined &&
    exam.precedingWorkDate >= shift.date
  )
    throw new Error("Der vorausgehende Arbeitstag muss vor der Prüfung liegen.");
  const date = Temporal.PlainDate.from(shift.date);
  const endDate = shift.endTime <= shift.startTime ? date.add({ days: 1 }) : date;
  // Ambiguous parent boundaries must be resolved, never guessed for a legal check.
  const from = date
    .toPlainDateTime(shift.startTime)
    .toZonedDateTime(value.timeZone, { disambiguation: "reject" }).epochMilliseconds;
  const until = endDate
    .toPlainDateTime(shift.endTime)
    .toZonedDateTime(value.timeZone, { disambiguation: "reject" }).epochMilliseconds;
  for (const interval of [
    ...(pauses ?? []),
    ...(school?.lessons ?? []),
    ...(exam?.participation ?? []),
  ])
    if (Date.parse(interval.start) < from || Date.parse(interval.end) > until)
      throw new Error("Zeitintervall liegt außerhalb des Eintrags.");
  for (const travel of [
    school?.travelFromWorkInterval,
    school?.travelToWorkInterval,
    exam?.travelFromWorkInterval,
    exam?.travelToWorkInterval,
  ])
    if (
      travel &&
      (Date.parse(travel.start) < from - 24 * 60 * 60 * 1000 ||
        Date.parse(travel.end) > until + 24 * 60 * 60 * 1000)
    )
      throw new Error("Weg liegt nicht beim zugeordneten Ausbildungs-/Prüfungstag.");
  if (
    pauses !== null &&
    pauses.reduce((sum, p) => sum + (Date.parse(p.end) - Date.parse(p.start)) / 60000, 0) !==
      shift.breakMinutes
  )
    throw new Error("Pausenintervalle und gespeicherte Pausendauer stimmen nicht überein.");
  if (school?.block && (shift.date < school.block.startDate || shift.date > school.block.endDate))
    throw new Error("Schultag liegt außerhalb des Schulblocks.");
}
