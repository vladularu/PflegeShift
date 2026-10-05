import { Temporal } from "@js-temporal/polyfill";
import type { CalendarEntry, ShiftEntry, TvoedAssessment, UserProfile } from "@/domain/types";
import { requireTvUkNursingTariff } from "@/domain/tvuk-nursing-tariff";
import { bundledRuleResolver, type RuleResolver } from "@/rules/rule-resolver";
import {
  calculateTvUkNursingMonth,
  calculateTvUkNursingShift,
  getTvUkNursingTable,
} from "./simple-tvuk-nursing-pay";
import { isPayWorkShift } from "./tvoed-pattern";

export function selectTvUkAssessmentShifts(
  entries: readonly CalendarEntry[],
  month: string,
): readonly ShiftEntry[] {
  return entries.filter(
    (e): e is ShiftEntry =>
      e.kind === "SHIFT" && e.deletedAt === null && e.date.startsWith(month + "-"),
  );
}
export function calculateTvUkNursingAssessment(month: string, shifts: readonly ShiftEntry[]) {
  const relevant = shifts.filter(
    (s) => s.deletedAt === null && s.date.startsWith(month + "-") && isPayWorkShift(s),
  );
  const times = relevant.map((s) => {
    const start = Temporal.PlainTime.from(s.startTime!);
    const end = Temporal.PlainTime.from(s.endTime!);
    const from = start.hour * 60 + start.minute;
    const until = end.hour * 60 + end.minute;
    return { from, until: until <= from ? until + 1440 : until };
  });
  const change =
    times.length > 1 &&
    Math.max(...times.map((t) => t.from)) > Math.min(...times.map((t) => t.from));
  const span =
    times.length > 0
      ? Math.max(...times.map((t) => t.until)) - Math.min(...times.map((t) => t.from))
      : 0;
  const regular = change && span >= 780;
  const assessment: TvoedAssessment = {
    shiftWork: regular ? "DETECTED" : times.length ? "REVIEW" : "NOT_DETECTED",
    alternatingShiftWork: "NOT_DETECTED",
    suggestedAllowance: "NONE",
    evidence: regular
      ? ["Wechselnde Dienstbeginne und mindestens 13 Stunden Dienstspanne im Monat."]
      : [],
    criteria: [
      {
        key: "SHIFT_CHANGES",
        label: "Regelmäßiger Schichtdienst",
        detail:
          "TV-UK: Wechsel der täglichen Arbeitszeit innerhalb eines Monats und eine Dienstspanne von mindestens 13 Stunden.",
        state: regular ? "MET" : times.length ? "OPEN" : "NOT_MET",
      },
    ],
    requiresConfirmation: false,
    estimateNote:
      "Schichtdienst aus den erfassten Diensten geschätzt. Nachtpausen werden als unbezahlte Pausen berücksichtigt, solange die Voraussetzung für eine bezahlte Pause nicht bestätigt ist.",
  };
  return {
    available: getTvUkNursingTable(month + "-01") !== null,
    assessment,
    tariffLabel: "TV-UK Pflege (Baden-Württemberg)",
  };
}
export function calculateTvUkNursingProfileShift(
  shift: ShiftEntry,
  profile: UserProfile,
  resolver: RuleResolver = bundledRuleResolver,
  regularShiftWork = false,
) {
  const selection = requireTvUkNursingTariff(profile.tvUkNursingTariff);
  if (!selection) throw new Error("TV-UK-Pflegegruppe fehlt.");
  return calculateTvUkNursingShift(shift, profile, selection, { regularShiftWork }, resolver);
}
export function calculateTvUkNursingProfileMonth(
  month: string,
  shifts: readonly ShiftEntry[],
  profile: UserProfile,
  assessmentShifts: readonly ShiftEntry[] = shifts,
  resolver: RuleResolver = bundledRuleResolver,
) {
  const selection = requireTvUkNursingTariff(profile.tvUkNursingTariff);
  if (!selection) throw new Error("TV-UK-Pflegegruppe fehlt.");
  const result = calculateTvUkNursingAssessment(month, assessmentShifts);
  return calculateTvUkNursingMonth(
    month,
    shifts,
    profile,
    selection,
    { regularShiftWork: result.assessment.shiftWork === "DETECTED", assessment: result.assessment },
    resolver,
  );
}
