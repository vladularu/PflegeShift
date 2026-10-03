import { Temporal } from "@js-temporal/polyfill";
import type { ShiftEntry, TvoedAssessment, TvoedWorkPatternSettings } from "@/domain/types";
import { explainNightSequence } from "./tvoed-k-calendar-nights";
import { assessTvoedPattern, isPayWorkShift } from "./tvoed-pattern";
import type { RuleResolver } from "@/rules/rule-resolver";

/** Estimate policy, not a B2 claim based on asserted completeness. */
export function assessTvoedKCalendarMonth(
  month: string,
  shifts: readonly ShiftEntry[],
  settings: TvoedWorkPatternSettings,
  resolver: RuleResolver,
  timeZone: string,
  effectiveDate = `${month}-01`,
) {
  if (
    Temporal.PlainDate.from(effectiveDate).toString() !== effectiveDate ||
    !effectiveDate.startsWith(`${month}-`)
  )
    throw new Error("Das Regeldatum muss im Prüfmonat liegen.");
  const current = shifts.filter((s) => s.date.startsWith(`${month}-`) && s.deletedAt === null);
  const hasWork = current.some(isPayWorkShift);
  const nightSequence = explainNightSequence(shifts, month, timeZone);
  const observed = shifts.filter((s) => s.deletedAt === null);
  const matched = nightSequence.dates.length === 3 && !nightSequence.uncertain;
  let assessment = matched
    ? assessTvoedPattern(observed, settings, resolver, effectiveDate, {
        met: true,
        count: nightSequence.qualifiedNightCount,
      })
    : assessTvoedPattern(hasWork ? observed : [], settings, resolver, effectiveDate);
  let continued = false;
  if (!hasWork && nightSequence.hasAbsence && settings.assignment === "PERMANENT") {
    const history = assessTvoedPattern(
      observed.filter((s) => s.date < `${month}-01`),
      settings,
      resolver,
      effectiveDate,
    );
    if (
      history.suggestedAllowance === "ALTERNATING_MONTHLY" ||
      history.suggestedAllowance === "SHIFT_MONTHLY"
    ) {
      assessment = history;
      continued = true;
    }
  }
  const estimateNote = continued
    ? "Vorläufig: Monatszulage aus deinem bisherigen Dienstmuster bei Urlaub/Krankheit fortgeschätzt; Fortzahlung nicht bestätigt."
    : !matched
      ? "Vorläufig: Keine eindeutige Nachtdienstfolge für diesen Monat. Die Muster-Schätzung ist kein bestätigter Anspruch."
      : nightSequence.hasAbsence
        ? "Schätzung aus eingetragenen Diensten. Urlaub/Krankheit und ein vollständiger Anspruch sind damit nicht bestätigt."
        : "Schätzung aus eingetragenen Diensten und gespeicherten Arbeitsplatzangaben, kein bestätigter Anspruch.";
  const result: TvoedAssessment = {
    ...assessment,
    estimateNote,
    alternatingShiftWork:
      !matched && assessment.alternatingShiftWork === "DETECTED"
        ? "REVIEW"
        : assessment.alternatingShiftWork,
    criteria: assessment.criteria.map((criterion) =>
      criterion.key === "NIGHT_SHIFTS"
        ? {
            ...criterion,
            detail: matched
              ? "Zwei weitere Nachtdienste dieses Monats innerhalb der Zeitmonatsfrist erkannt"
              : "Monatsfolge offen; fehlende Einträge sind keine Anspruchsablehnung",
            state: matched ? "MET" : "OPEN",
          }
        : criterion,
    ),
  };
  return { assessment: result, nightSequence };
}
