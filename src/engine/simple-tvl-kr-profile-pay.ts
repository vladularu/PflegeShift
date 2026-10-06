import { Temporal } from "@js-temporal/polyfill";
import type {
  CalendarEntry,
  MonthlyTariffDecision,
  ShiftEntry,
  TvoedWorkPatternSettings,
  UserProfile,
} from "@/domain/types";
import { requireTvlKrSalaryTariff } from "@/domain/tvl-kr-tariff";
import type { RuleResolver } from "@/rules/rule-resolver";
import { calculateTvlKrMonth, calculateTvlKrShift, getTvlKrRulePackage } from "./simple-tvl-kr-pay";
import { assessTvoedPattern, isPayWorkShift } from "./tvoed-pattern";

export function selectTvlKrAssessmentShifts(
  entries: readonly CalendarEntry[],
  month: string,
): readonly ShiftEntry[] {
  return entries.filter(
    (entry): entry is ShiftEntry =>
      entry.kind === "SHIFT" && entry.deletedAt === null && entry.date.startsWith(month + "-"),
  );
}

export function calculateTvlKrAssessment(
  month: string,
  shifts: readonly ShiftEntry[],
  settings: TvoedWorkPatternSettings,
  source: RuleResolver,
) {
  const date = Temporal.PlainYearMonth.from(month).toPlainDate({ day: 1 }).toString();
  const pkg = getTvlKrRulePackage(date);
  if (!pkg) return { available: false, assessment: null, tariffLabel: "TV-L Pflege" };
  const relevant = shifts.filter(
    (s) => s.deletedAt === null && s.date.startsWith(month + "-") && isPayWorkShift(s),
  );
  const local: RuleResolver = { ...source, resolveTariff: () => ({ ok: true, value: pkg }) };
  const assessment = assessTvoedPattern(relevant, settings, local, date);
  const starts = relevant.map(
    (s) =>
      Temporal.PlainTime.from(s.startTime!).hour * 60 +
      Temporal.PlainTime.from(s.startTime!).minute,
  );
  const ends = relevant.map((s, index) => {
    const time = Temporal.PlainTime.from(s.endTime!);
    const end = time.hour * 60 + time.minute;
    return end <= starts[index] ? end + 1440 : end;
  });
  const startsChange = starts.length > 1 && Math.max(...starts) - Math.min(...starts) >= 120;
  const span = starts.length > 0 ? Math.max(...ends) - Math.min(...starts) : 0;
  const spansDay = span >= 780;
  if (startsChange && spansDay) return { available: true, assessment, tariffLabel: "TV-L Pflege" };
  return {
    available: true,
    tariffLabel: "TV-L Pflege",
    assessment: {
      ...assessment,
      shiftWork: relevant.length === 0 ? ("NOT_DETECTED" as const) : ("REVIEW" as const),
      alternatingShiftWork: relevant.length === 0 ? ("NOT_DETECTED" as const) : ("REVIEW" as const),
      suggestedAllowance: "NONE" as const,
      criteria: assessment.criteria.map((criterion) =>
        criterion.key === "SHIFT_CHANGES"
          ? {
              ...criterion,
              state: relevant.length === 0 ? ("NOT_MET" as const) : ("OPEN" as const),
              detail:
                "Für TV-L müssen die Dienstbeginne um mindestens zwei Stunden wechseln und die Dienste eine Spanne von mindestens 13 Stunden abdecken.",
            }
          : criterion,
      ),
    },
  };
}

export function calculateTvlKrProfileShift(
  shift: ShiftEntry,
  profile: UserProfile,
  resolver: RuleResolver,
  saturdayShiftWork: boolean,
) {
  const selection = requireTvlKrSalaryTariff(profile.tvlKrTariff);
  if (!selection) throw new Error("TV-L-Pflegegruppe fehlt.");
  return calculateTvlKrShift(
    shift,
    profile,
    { payGroup: selection.payGroup, payLevel: selection.payLevel },
    selection.universityRegion,
    saturdayShiftWork,
    resolver,
  );
}

export function calculateTvlKrProfileMonth(
  month: string,
  shifts: readonly ShiftEntry[],
  profile: UserProfile,
  decision: MonthlyTariffDecision | null,
  assessmentShifts: readonly ShiftEntry[],
  settings: TvoedWorkPatternSettings,
  resolver: RuleResolver,
) {
  const selection = requireTvlKrSalaryTariff(profile.tvlKrTariff);
  if (!selection) throw new Error("TV-L-Pflegegruppe fehlt.");
  const assessment = calculateTvlKrAssessment(
    month,
    assessmentShifts,
    settings,
    resolver,
  ).assessment;
  const allowanceStatus = decision?.allowanceStatus ?? assessment?.suggestedAllowance ?? "NONE";
  const saturdayShiftWork =
    assessment?.shiftWork === "DETECTED" ||
    assessment?.alternatingShiftWork === "DETECTED" ||
    allowanceStatus !== "NONE";
  return calculateTvlKrMonth(
    month,
    shifts,
    profile,
    { payGroup: selection.payGroup, payLevel: selection.payLevel },
    selection.universityRegion,
    {
      allowanceStatus,
      saturdayShiftWork,
      assessment: assessment ?? undefined,
      confirmedAllowance: decision?.allowanceStatus ?? null,
    },
    resolver,
  );
}
