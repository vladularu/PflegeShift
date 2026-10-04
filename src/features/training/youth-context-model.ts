import {
  UNKNOWN_YOUTH_CONTEXT,
  validateYouthContext,
  type YouthContext,
} from "@/domain/youth-context";
import { parseRemunerationDateInput } from "@/features/settings/remuneration-editor-values";

export interface YouthContextDraft {
  readonly context: YouthContext;
  readonly dailyMinutes: string;
  readonly weeklyMinutes: string;
  readonly dayKind: "shortened" | "holiday";
  readonly dayDate: string;
  readonly holidayMinutes: string;
}
export function youthContextDraft(
  context: YouthContext = UNKNOWN_YOUTH_CONTEXT,
): YouthContextDraft {
  return {
    context,
    dailyMinutes:
      context.averageDailyTrainingMinutes == null
        ? ""
        : String(context.averageDailyTrainingMinutes),
    weeklyMinutes:
      context.averageWeeklyTrainingMinutes == null
        ? ""
        : String(context.averageWeeklyTrainingMinutes),
    dayKind: "shortened",
    dayDate: "",
    holidayMinutes: "",
  };
}

function dayDate(input: string, profileFrom: string): string {
  let date: string;
  try {
    date = parseRemunerationDateInput(input);
  } catch {
    throw new Error("Tagesangabe: Bitte ein gültiges Datum im Format TT.MM.JJJJ eingeben.");
  }
  if (date < parseRemunerationDateInput(profileFrom))
    throw new Error("Die Tagesangabe liegt vor dem Gültigkeitsbeginn dieses Profils.");
  return date;
}

export function addYouthDayFact(draft: YouthContextDraft, profileFrom: string): YouthContextDraft {
  const date = dayDate(draft.dayDate, profileFrom);
  let context: YouthContext;
  if (draft.dayKind === "shortened") {
    if (draft.holidayMinutes.trim())
      throw new Error("Feiertagsminuten bitte vor einem verkürzten Arbeitstag leeren.");
    context = validateYouthContext({
      ...draft.context,
      shortenedWorkingDays: [...new Set([...draft.context.shortenedWorkingDays, date])].sort(),
    });
  } else {
    const minutes = draft.holidayMinutes.trim();
    if (!/^\d{1,4}$/u.test(minutes) || Number(minutes) > 1440)
      throw new Error("Feiertagsausfall bitte als 0 bis 1440 Minuten bestätigen.");
    context = validateYouthContext({
      ...draft.context,
      holidayLostMinutes: { ...draft.context.holidayLostMinutes, [date]: Number(minutes) },
    });
  }
  return { ...draft, context, dayDate: "", holidayMinutes: "" };
}

export function removeYouthDayFact(
  draft: YouthContextDraft,
  kind: YouthContextDraft["dayKind"],
  date: string,
): YouthContextDraft {
  if (kind === "shortened")
    return {
      ...draft,
      context: validateYouthContext({
        ...draft.context,
        shortenedWorkingDays: draft.context.shortenedWorkingDays.filter((day) => day !== date),
      }),
    };
  const holidayLostMinutes = { ...draft.context.holidayLostMinutes };
  delete holidayLostMinutes[date];
  return {
    ...draft,
    context: validateYouthContext({ ...draft.context, holidayLostMinutes }),
  };
}

export function setYouthBlockActivity(
  draft: YouthContextDraft,
  binding: string,
  confirmed: boolean,
): YouthContextDraft {
  if (!binding.startsWith('["youth-block-v1",'))
    throw new Error("Diese Ausbildungszuordnung gehört nicht zum aktuellen Dienststand.");
  return {
    ...draft,
    context: validateYouthContext({
      ...draft.context,
      blockTrainingShiftIds: confirmed
        ? [...new Set([...draft.context.blockTrainingShiftIds, binding])]
        : draft.context.blockTrainingShiftIds.filter((item) => item !== binding),
    }),
  };
}

export function youthContextFromDraft(draft: YouthContextDraft): YouthContext {
  if (draft.dayDate.trim() || draft.holidayMinutes.trim())
    throw new Error("Tagesangabe bitte erst hinzufügen oder die Eingabe leeren.");
  function amount(text: string): number | null {
    if (!text.trim()) return null;
    if (!/^\d{1,5}$/u.test(text.trim()))
      throw new Error("Ausbildungszeit bitte als ganze Minuten angeben.");
    return Number(text.trim());
  }
  return validateYouthContext({
    ...draft.context,
    averageDailyTrainingMinutes: amount(draft.dailyMinutes),
    averageWeeklyTrainingMinutes: amount(draft.weeklyMinutes),
  });
}
