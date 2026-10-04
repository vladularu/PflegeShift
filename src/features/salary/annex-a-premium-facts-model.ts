import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type {
  SavedTvoedAnnexAPremiumFacts,
  TvoedAnnexADraftDayDecision,
} from "@/domain/saved-tvoed-annex-a-premium-facts";
import { tvoedAnnexAShiftBinding } from "@/domain/saved-tvoed-annex-a-premium-facts";
import type { CalendarEntry, ShiftEntry } from "@/domain/types";
import { remunerationMonthShifts, remunerationShiftDays } from "@/engine/remuneration-shift-days";

export interface AnnexAPremiumDayChoice {
  readonly key: string;
  readonly date: string;
  readonly shift: ShiftEntry;
  readonly shiftBinding: string;
}

/** Only actual timed work candidates; a template is never an answer to a pay question. */
export function annexAPremiumDayChoices(
  month: string,
  entries: readonly CalendarEntry[],
  profile: DatedRemunerationProfile,
  timeZone: string,
): readonly AnnexAPremiumDayChoice[] {
  if (
    profile.effectiveFrom === null ||
    profile.data.selection.kind !== "tariff" ||
    profile.data.selection.packageId !== "tvoed-vka-anlage-a" ||
    timeZone !== "Europe/Berlin"
  )
    return [];
  const choices: AnnexAPremiumDayChoice[] = [];
  for (const shift of remunerationMonthShifts(
    month,
    entries.filter((entry): entry is ShiftEntry => entry.kind === "SHIFT"),
  )) {
    for (const day of remunerationShiftDays(shift, timeZone)) {
      if (!day.date.startsWith(`${month}-`) || day.until <= day.from) continue;
      choices.push({
        key: `${shift.id}:${day.date}`,
        date: day.date,
        shift,
        shiftBinding: tvoedAnnexAShiftBinding(shift, timeZone),
      });
    }
  }
  return choices.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}

/** Changed or deleted shifts cannot inherit previously confirmed day decisions. */
export function currentAnnexAPremiumDayDecision(
  choice: AnnexAPremiumDayChoice,
  saved: SavedTvoedAnnexAPremiumFacts | null,
): TvoedAnnexADraftDayDecision | null {
  return (
    saved?.dayDecisions.find(
      (decision) =>
        decision.shiftId === choice.shift.id &&
        decision.date === choice.date &&
        decision.shiftBinding === choice.shiftBinding,
    ) ?? null
  );
}
