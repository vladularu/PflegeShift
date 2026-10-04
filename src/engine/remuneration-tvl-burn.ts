import { Temporal } from "@js-temporal/polyfill";
import {
  resolveRemunerationProfile,
  type DatedRemunerationProfile,
} from "@/domain/remuneration-profile";
import {
  isCurrentTvlServiceFacts,
  validateTvlShiftWork,
  type SavedTvlShiftWork,
} from "@/domain/saved-tvl-shift-work";
import type { SupplementPosition } from "@/domain/remuneration-supplement";
import type { ShiftEntry } from "@/domain/types";
import type { TvlAllowanceDay } from "./remuneration-tvl-allowances";
import type { TvalAllowanceDay } from "./remuneration-tval-allowances";
import { roundRemunerationCents } from "./remuneration-money";
import { remunerationMonthShifts, remunerationShiftDays } from "./remuneration-shift-days";
import { requireTvlBurnCareIntervalParents } from "./tvl-burn-care-intervals";

export interface TvlBurnCareResult {
  readonly positions: readonly SupplementPosition[];
  readonly totalCents: number | null;
}

type CareDay = TvlAllowanceDay | TvalAllowanceDay;
function policyFor(day: CareDay) {
  return day.context.kind === "tval-training"
    ? day.context.rulePackage.rules.tvalCareAllowancePolicy
    : day.context.rulePackage.rules.tvlCareAllowancePolicy;
}
function hourlyRate(day: CareDay): number | null {
  const policy = policyFor(day);
  if (!policy) return null;
  return "shareBasisPoints" in policy
    ? roundRemunerationCents(policy.burnCareFullHourCents * policy.shareBasisPoints, 10000)
    : policy.burnCareFullHourCents;
}

/** Calendar-month estimate from explicitly entered real activity, never the whole scheduled shift. */
export function calculateTvlBurnCare(
  days: readonly TvlAllowanceDay[],
  shifts: readonly ShiftEntry[],
  history: readonly DatedRemunerationProfile[],
  saved: readonly SavedTvlShiftWork[],
  timeZone: string,
): TvlBurnCareResult {
  return calculateCareBurn(days, shifts, history, saved, timeZone);
}

export function calculateTvalBurnCare(
  days: readonly TvalAllowanceDay[],
  shifts: readonly ShiftEntry[],
  history: readonly DatedRemunerationProfile[],
  saved: readonly SavedTvlShiftWork[],
  timeZone: string,
): TvlBurnCareResult {
  return calculateCareBurn(days, shifts, history, saved, timeZone);
}

function calculateCareBurn(
  days: readonly CareDay[],
  shifts: readonly ShiftEntry[],
  history: readonly DatedRemunerationProfile[],
  saved: readonly SavedTvlShiftWork[],
  timeZone: string,
): TvlBurnCareResult {
  if (!days.length) return { positions: [], totalCents: 0 };
  const training = days[0].context.kind === "tval-training";
  const prefix = training ? "tval" : "tvl";
  const month = days[0].date.slice(0, 7);
  const byDate = new Map(days.map((day) => [day.date, day]));
  const eligible = new Set<string>();
  let problem: string | null = null;
  for (const day of days) {
    const facts = day.context.careAllowances;
    if (facts?.paidEntitlement === false || facts?.burnCare === false) continue;
    const groupEligible =
      day.context.kind === "tval-training" ||
      (Number(day.context.groupId.slice(2)) >= 5 && Number(day.context.groupId.slice(2)) <= 9);
    if (facts?.paidEntitlement !== true || facts.burnCare !== true || !groupEligible) {
      problem = training
        ? "Bitte Entgeltanspruch und qualifizierende Schwerbrandpflege im TVA-L-Vergütungsprofil bestätigen."
        : "Bitte Entgeltanspruch, KR5–KR9 und die qualifizierende Schwerbrandpflege im Vergütungsprofil bestätigen.";
    } else eligible.add(day.date);
  }
  const factsByKey = new Map<string, SavedTvlShiftWork[]>();
  const factsByShift = new Map<string, SavedTvlShiftWork[]>();
  for (const raw of saved) {
    const key = JSON.stringify([raw.shiftId, raw.profileEffectiveFrom]);
    const values = factsByKey.get(key) ?? [];
    values.push(raw);
    factsByKey.set(key, values);
    const siblings = factsByShift.get(raw.shiftId) ?? [];
    siblings.push(raw);
    factsByShift.set(raw.shiftId, siblings);
  }
  const rateSet = new Set<number>();
  const actualRanges: { from: number; until: number }[] = [];
  let minutes = 0;
  for (const shift of remunerationMonthShifts(month, shifts)) {
    const parts = remunerationShiftDays(shift, timeZone);
    if (!parts.some((part) => eligible.has(part.date))) continue;
    const checked = new Map<string, SavedTvlShiftWork | null>();
    for (const part of parts) {
      if (!eligible.has(part.date)) continue;
      const profile = resolveRemunerationProfile(history, part.date).profile;
      const key = JSON.stringify([shift.id, profile?.effectiveFrom]);
      if (!checked.has(key)) {
        let value: SavedTvlShiftWork | null = null;
        const matches = factsByKey.get(key) ?? [];
        try {
          if (profile && matches.length === 1) {
            const candidate = validateTvlShiftWork(matches[0]);
            if (
              isCurrentTvlServiceFacts(candidate, shift, timeZone, profile) &&
              candidate.burnCareIntervals != null
            ) {
              requireTvlBurnCareIntervalParents(
                candidate.burnCareIntervals,
                shift,
                timeZone,
                profile,
                history,
              );
              value = candidate;
            }
          }
        } catch {
          /* Invalid facts cannot become a monetary claim. */
        }
        checked.set(key, value);
      }
      const value = checked.get(key);
      if (!value) {
        problem =
          "Tatsächliche Schwerbrandpflegezeiten fehlen oder sind nach Dienst-/Profiländerung neu zu bestätigen. Im TV-L-Dienstformular auch keine Tätigkeit ausdrücklich bestätigen.";
        continue;
      }
      for (const interval of value.burnCareIntervals!) {
        const from = Math.max(part.from, interval.from),
          until = Math.min(part.until, interval.until);
        if (until <= from) continue;
        const rate = hourlyRate(byDate.get(part.date)!);
        if (rate === null)
          problem = "Der Tarifbetrag für Schwerbrandpflege fehlt im gültigen Katalog.";
        else rateSet.add(rate);
        minutes += until - from;
        actualRanges.push({
          from: part.fromEpochMinutes + from - part.from,
          until: part.fromEpochMinutes + until - part.from,
        });
      }
    }
    // Distinct profiles of a midnight shift still share one total pause/duration.
    const current = (factsByShift.get(shift.id) ?? []).flatMap((value) => {
      if (factsByKey.get(JSON.stringify([value.shiftId, value.profileEffectiveFrom]))?.length !== 1)
        return [];
      const profile = history.find((p) => p.effectiveFrom === value.profileEffectiveFrom);
      if (!profile || !isCurrentTvlServiceFacts(value, shift, timeZone, profile)) return [];
      try {
        return validateTvlShiftWork(value).burnCareIntervals ?? [];
      } catch {
        return [];
      }
    });
    if (
      current.reduce((sum, range) => sum + range.until - range.from, 0) >
      parts.reduce((sum, part) => sum + part.netMinutes, 0)
    )
      problem = "Bestätigte Tätigkeitszeiten überschreiten zusammen die Dienstzeit ohne Pause.";
  }
  actualRanges.sort((a, b) => a.from - b.from);
  if (actualRanges.some((range, i) => i > 0 && range.from < actualRanges[i - 1].until))
    problem = "Bestätigte Schwerbrandpflegezeiten überschneiden sich; bitte die Dienste prüfen.";
  if (rateSet.size > 1)
    problem =
      "Mehrere Schwerbrandpflege-Stundensätze innerhalb eines Monats benötigen eine getrennt bestätigte Zuordnung voller Stunden.";
  const rate = [...rateSet][0] ?? hourlyRate(days[0]) ?? null;
  const amount = problem
    ? null
    : minutes === 0
      ? 0
      : rate === null
        ? null
        : Math.floor(minutes / 60) * rate;
  const sources = days.map((day) => day.context.source);
  const source = {
    ...sources[0],
    references: [
      ...new Map(
        days
          .flatMap((day) =>
            day.context.source.references.filter((reference) =>
              policyFor(day)?.sourceIds.includes(reference.id),
            ),
          )
          .map((reference) => [reference.id, reference]),
      ).values(),
    ],
  };
  if (
    sources.some(
      (value) =>
        value.profileEffectiveFrom !== source.profileEffectiveFrom ||
        value.profileRevision !== source.profileRevision,
    )
  ) {
    source.profileEffectiveFrom = null;
    source.profileRevision = null;
  }
  if (sources.some((value) => value.versionId !== source.versionId)) {
    source.versionId = null;
    source.packageValidFrom = null;
    source.packageValidTo = null;
  }
  const position: SupplementPosition = {
    id: prefix + "-care:burn:" + month,
    kind: "allowance",
    label: training ? "TVA-L-Schwerbrandpflege · Ausbildungsanteil" : "TV-L-Schwerbrandpflege",
    from: days[0].date,
    through: days[days.length - 1].date,
    amountCents: amount,
    status: amount === null ? "unavailable" : minutes > 0 ? "estimated" : "calculated",
    source,
    issue:
      amount === null
        ? {
            code: "ALLOWANCE_DECISION_MISSING",
            message: problem ?? "Schwerbrandpflege-Regel fehlt.",
          }
        : null,
    basis: {
      ruleId: prefix + "-part-iv:burn-month-full-hours",
      shiftId: null,
      allowanceType: "care",
      rateCents: rate,
      personalMonthlyCents: null,
      percentageBasisPoints: training
        ? (days[0].context.rulePackage.rules.tvalCareAllowancePolicy?.shareBasisPoints ?? null)
        : null,
      minutes,
      calendarDays: days.length,
      monthDays: Temporal.PlainDate.from(days[0].date).daysInMonth,
      entitlement: null,
      pauseMethod: "none",
      proration: "worked-minutes",
    },
  };
  return { positions: [position], totalCents: amount };
}
