import { validateTrainingProfile, type TrainingProfileData } from "@/domain/training-data";
import {
  youthContextDraft,
  youthContextFromDraft,
  type YouthContextDraft,
} from "./youth-context-model";
import {
  parseRemunerationDateInput,
  formatRemunerationDate,
} from "@/features/settings/remuneration-editor-values";

export interface TrainingProfileDraft {
  readonly version: 1 | 2;
  readonly youth: YouthContextDraft | null;
  readonly effectiveFrom: string;
  readonly birthDate: string;
  readonly schooling: "unknown" | "yes" | "no";
  readonly status: TrainingProfileData["status"];
  readonly profession: string;
  readonly legalBasis: NonNullable<TrainingProfileData["training"]>["legalBasis"];
  readonly startedOn: string;
  readonly expectedEndOn: string;
  readonly year: string;
  readonly yearConfirmedFrom: string;
  readonly shorteningMonths: string;
}

export function emptyTrainingProfile(date: string): TrainingProfileData {
  return validateTrainingProfile({
    version: 1,
    effectiveFrom: date,
    birthDate: null,
    fullTimeCompulsorySchooling: null,
    status: "unknown",
    training: null,
  });
}

export function trainingProfileDraft(data: TrainingProfileData): TrainingProfileDraft {
  const t = data.training;
  return {
    version: data.version,
    youth: data.version === 2 && data.youth !== null ? youthContextDraft(data.youth) : null,
    effectiveFrom: formatRemunerationDate(data.effectiveFrom),
    birthDate: data.birthDate ? formatRemunerationDate(data.birthDate) : "",
    schooling:
      data.fullTimeCompulsorySchooling === null
        ? "unknown"
        : data.fullTimeCompulsorySchooling
          ? "yes"
          : "no",
    status: data.status,
    profession: t?.profession ?? "",
    legalBasis: t?.legalBasis ?? "UNKNOWN",
    startedOn: t ? formatRemunerationDate(t.startedOn) : "",
    expectedEndOn: t?.expectedEndOn ? formatRemunerationDate(t.expectedEndOn) : "",
    year: t?.year == null ? "" : String(t.year),
    yearConfirmedFrom: t?.yearConfirmedFrom ? formatRemunerationDate(t.yearConfirmedFrom) : "",
    shorteningMonths: t?.shorteningMonths == null ? "" : String(t.shorteningMonths),
  };
}

function date(value: string, label: string): string {
  try {
    return parseRemunerationDateInput(value);
  } catch {
    throw new Error(`${label}: Bitte ein gültiges Datum im Format TT.MM.JJJJ eingeben.`);
  }
}
function optionalInteger(value: string, label: string): number | null {
  if (!value.trim()) return null;
  if (!/^\d{1,2}$/u.test(value.trim()))
    throw new Error(`${label}: Bitte eine ganze Zahl eingeben.`);
  return Number(value.trim());
}

export function trainingProfileFromDraft(draft: TrainingProfileDraft): TrainingProfileData {
  const effectiveFrom = date(draft.effectiveFrom, "Gültig ab");
  const youth = draft.youth === null ? null : youthContextFromDraft(draft.youth);
  if (
    youth &&
    [...youth.shortenedWorkingDays, ...Object.keys(youth.holidayLostMinutes)].some(
      (day) => day < effectiveFrom,
    )
  )
    throw new Error("Eine Tagesangabe liegt vor dem Gültigkeitsbeginn dieses Profils.");
  return validateTrainingProfile({
    ...(draft.version === 2 || draft.youth !== null ? { version: 2, youth } : { version: 1 }),
    effectiveFrom,
    birthDate: draft.birthDate.trim() ? date(draft.birthDate, "Geburtsdatum") : null,
    fullTimeCompulsorySchooling: draft.schooling === "unknown" ? null : draft.schooling === "yes",
    status: draft.status,
    training:
      draft.status !== "training"
        ? null
        : {
            profession: draft.profession,
            legalBasis: draft.legalBasis,
            startedOn: date(draft.startedOn, "Ausbildungsbeginn"),
            expectedEndOn: draft.expectedEndOn.trim()
              ? date(draft.expectedEndOn, "Ausbildungsende")
              : null,
            year: optionalInteger(draft.year, "Ausbildungsjahr"),
            yearConfirmedFrom: draft.yearConfirmedFrom.trim()
              ? date(draft.yearConfirmedFrom, "Ausbildungsjahr gültig ab")
              : null,
            shorteningMonths: optionalInteger(draft.shorteningMonths, "Verkürzung"),
          },
  });
}
