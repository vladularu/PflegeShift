import {
  resolveRemunerationProfile,
  type DatedRemunerationProfile,
} from "@/domain/remuneration-profile";
import type { SavedTvlShiftWork } from "@/domain/saved-tvl-shift-work";
import type { CalendarEntry, ShiftEntry } from "@/domain/types";
import { remunerationMonthShifts, remunerationShiftDays } from "@/engine/remuneration-shift-days";

export interface TvlShiftWorkChoice {
  readonly key: string;
  readonly month: string;
  readonly shift: ShiftEntry;
  readonly profile: DatedRemunerationProfile;
  readonly timeZone: string;
  readonly dates: readonly string[];
}
export interface TvlShiftWorkSession extends TvlShiftWorkChoice {
  readonly saved: SavedTvlShiftWork | null;
}
/** No tariff inference from names; include carry-in and split profile periods. */
export function tvlShiftWorkChoices(
  month: string,
  entries: readonly CalendarEntry[],
  profiles: readonly DatedRemunerationProfile[],
  timeZone: string,
): readonly TvlShiftWorkChoice[] {
  const choices = new Map<string, TvlShiftWorkChoice>();
  const shifts = remunerationMonthShifts(
    month,
    entries.filter((e): e is ShiftEntry => e.kind === "SHIFT"),
  );
  for (const shift of shifts) {
    for (const day of remunerationShiftDays(shift, timeZone)) {
      if (!day.date.startsWith(month + "-") || day.until <= day.from) continue;
      const resolved = resolveRemunerationProfile(profiles, day.date);
      const profile = resolved.profile;
      if (
        !profile ||
        profile.effectiveFrom === null ||
        profile.data.selection.kind !== "tariff" ||
        !["tvl-kr-tdl", "tval-pflege-tdl"].includes(profile.data.selection.packageId)
      )
        continue;
      const key = JSON.stringify([shift.id, profile.effectiveFrom]);
      const previous = choices.get(key);
      choices.set(key, {
        key,
        month,
        shift,
        profile,
        timeZone,
        dates: [...(previous?.dates ?? []), day.date],
      });
    }
  }
  return [...choices.values()].sort(
    (a, b) => a.shift.date.localeCompare(b.shift.date) || a.key.localeCompare(b.key),
  );
}
