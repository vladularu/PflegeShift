import type { TvlBurnCareInterval } from "@/domain/tvl-burn-care";
import type { ShiftEntry } from "@/domain/types";
import {
  resolveRemunerationProfile,
  type DatedRemunerationProfile,
} from "@/domain/remuneration-profile";
import { remunerationShiftDays } from "./remuneration-shift-days";

/** Check real elapsed bounds and profile allocation, not the estimated location of a duration-only break. */
export function requireTvlBurnCareIntervalParents(
  intervals: readonly TvlBurnCareInterval[],
  shift: ShiftEntry,
  timeZone: string,
  profile: DatedRemunerationProfile,
  history: readonly DatedRemunerationProfile[],
): void {
  const days = remunerationShiftDays(shift, timeZone);
  const total = intervals.reduce((sum, interval) => sum + interval.until - interval.from, 0);
  if (!days.length || total > days.reduce((sum, day) => sum + day.netMinutes, 0))
    throw new Error(
      "Schwerbrandpflegezeiten überschreiten die tatsächliche Dienstzeit ohne Pause.",
    );
  for (const interval of intervals) {
    let covered = 0;
    for (const day of days) {
      const duration = Math.max(
        0,
        Math.min(day.until, interval.until) - Math.max(day.from, interval.from),
      );
      if (duration && resolveRemunerationProfile(history, day.date).profile !== profile)
        throw new Error("Schwerbrandpflegezeit gehört zu einem anderen Vergütungszeitraum.");
      covered += duration;
    }
    if (covered !== interval.until - interval.from)
      throw new Error("Schwerbrandpflegezeit liegt außerhalb des Dienstes.");
  }
}
