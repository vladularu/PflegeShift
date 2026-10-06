import { Temporal } from "@js-temporal/polyfill";
import type {
  CalendarEntry,
  MonthlyTariffDecision,
  ShiftEntry,
  TvoedAssessment,
  TvoedWorkPatternSettings,
  UserProfile,
} from "@/domain/types";
import { requireTvhKrTariff } from "@/domain/tvh-kr-tariff";
import { bundledRuleResolver, type RuleResolver } from "@/rules/rule-resolver";
import { calculateTvhKrMonth, calculateTvhKrShift, getTvhKrTable } from "./simple-tvh-kr-pay";
import { DEFAULT_TVOED_WORK_PATTERN_SETTINGS, isPayWorkShift } from "./tvoed-pattern";
import { calculateTimedShiftBounds } from "./working-time";

export function selectTvhKrAssessmentShifts(
  entries: readonly CalendarEntry[],
  month: string,
): readonly ShiftEntry[] {
  return entries.filter(
    (e): e is ShiftEntry =>
      e.kind === "SHIFT" && e.deletedAt === null && e.date.startsWith(month + "-"),
  );
}
export function calculateTvhKrAssessment(
  month: string,
  shifts: readonly ShiftEntry[],
  settings: TvoedWorkPatternSettings = DEFAULT_TVOED_WORK_PATTERN_SETTINGS,
  timeZone = "Europe/Berlin",
) {
  const date = Temporal.PlainYearMonth.from(month).toPlainDate({ day: 1 }).toString();
  if (!getTvhKrTable(date))
    return { available: false, assessment: null, tariffLabel: "TV-H Pflege" };
  const relevant = shifts
    .filter((s) => s.deletedAt === null && s.date.startsWith(month + "-") && isPayWorkShift(s))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime!.localeCompare(b.startTime!));
  const times = relevant.map((s) => {
    const from = Temporal.PlainTime.from(s.startTime!);
    const end = Temporal.PlainTime.from(s.endTime!);
    const start = from.hour * 60 + from.minute;
    const until = end.hour * 60 + end.minute;
    return { start, end: until <= start ? until + 1440 : until };
  });
  const changes = times.reduce(
    (sum, t, i) => sum + (i > 0 && Math.abs(t.start - times[i - 1].start) >= 120 ? 1 : 0),
    0,
  );
  const span = times.length
    ? Math.max(...times.map((t) => t.end)) - Math.min(...times.map((t) => t.start))
    : 0;
  const regular = changes >= 2 && span >= 780;
  const nightCount = relevant.filter((s) => {
    const bounds = calculateTimedShiftBounds(s, timeZone);
    if (!bounds) return false;
    const start = Temporal.Instant.fromEpochMilliseconds(
      bounds.startEpochMinutes * 60000,
    ).toZonedDateTimeISO(timeZone);
    const pause = Math.min(s.breakMinutes, bounds.grossMinutes);
    const pauseFrom = Math.floor((bounds.grossMinutes - pause) / 2);
    const transition =
      start.offsetNanoseconds !== start.add({ minutes: bounds.grossMinutes - 1 }).offsetNanoseconds;
    const startMinute = start.hour * 60 + start.minute;
    let count = 0;
    for (let i = 0; i < bounds.grossMinutes; i++) {
      if (i >= pauseFrom && i < pauseFrom + pause) continue;
      const t = transition ? start.add({ minutes: i }) : null;
      const m = t ? t.hour * 60 + t.minute : (startMinute + i) % 1440;
      if (m >= 1260 || m < 360) count++;
    }
    return count >= 120;
  }).length;
  const hasNights = nightCount >= 1;
  const alternating = regular && hasNights && settings.workplaceCoverage === "AROUND_THE_CLOCK";
  const pattern = alternating
    ? "ALTERNATING"
    : regular && !hasNights
      ? "SHIFT"
      : regular && settings.workplaceCoverage === "NOT_AROUND_THE_CLOCK"
        ? "SHIFT"
        : null;
  const suggestedAllowance =
    pattern === null
      ? "NONE"
      : settings.assignment === "PERMANENT"
        ? pattern === "ALTERNATING"
          ? "ALTERNATING_MONTHLY"
          : "SHIFT_MONTHLY"
        : settings.assignment === "TEMPORARY"
          ? pattern === "ALTERNATING"
            ? "ALTERNATING_HOURLY"
            : "SHIFT_HOURLY"
          : "NONE";
  const assessment: TvoedAssessment = {
    shiftWork: regular ? "DETECTED" : times.length ? "REVIEW" : "NOT_DETECTED",
    alternatingShiftWork: alternating
      ? "DETECTED"
      : hasNights && regular && settings.workplaceCoverage !== "NOT_AROUND_THE_CLOCK"
        ? "REVIEW"
        : "NOT_DETECTED",
    suggestedAllowance,
    requiresConfirmation:
      regular &&
      (settings.assignment === "UNKNOWN" ||
        (hasNights && settings.workplaceCoverage === "UNKNOWN")),
    evidence: [
      `${relevant.length} Arbeitsdienste`,
      `${changes} Wechsel um mindestens zwei Stunden`,
      `${nightCount} Nachtschichten mit mindestens zwei Stunden Nachtarbeit`,
    ],
    criteria: [
      {
        key: "SHIFT_CHANGES",
        label: "Regelmäßiger Wechsel",
        detail:
          "TV-H: wechselnde Dienstbeginne um mindestens zwei Stunden und eine Dienstspanne von mindestens 13 Stunden innerhalb eines Monats.",
        state: regular ? "MET" : times.length ? "OPEN" : "NOT_MET",
      },
      {
        key: "NIGHT_SHIFTS",
        label: "Wiederkehrende Nachtschichten",
        detail:
          "TV-H: Nachtschicht mit mindestens zwei Stunden Nachtarbeit und erneute Nachtschicht spätestens nach einem Monat.",
        state: hasNights ? "MET" : "NOT_MET",
      },
      {
        key: "AROUND_THE_CLOCK",
        label: "Arbeitsbereich rund um die Uhr",
        detail:
          "Diese Angabe beschreibt den Betrieb; sie wird nicht aus deinem Kalender abgeleitet.",
        state:
          settings.workplaceCoverage === "AROUND_THE_CLOCK"
            ? "MET"
            : settings.workplaceCoverage === "NOT_AROUND_THE_CLOCK"
              ? "NOT_MET"
              : "OPEN",
      },
      {
        key: "ASSIGNMENT",
        label: "Dauerhafte Zuordnung",
        detail:
          "Die bestehende Angabe zur dauerhaften oder gelegentlichen Schichtarbeit bestimmt die Zulagenart.",
        state: settings.assignment === "UNKNOWN" ? "OPEN" : "MET",
      },
    ],
    estimateNote:
      "Schichtmuster aus den erfassten Diensten geschätzt; keine Arbeitgeberentscheidung.",
  };
  return { available: true, assessment, tariffLabel: "TV-H Pflege" };
}
export function calculateTvhKrProfileShift(
  shift: ShiftEntry,
  profile: UserProfile,
  resolver: RuleResolver = bundledRuleResolver,
  saturdayShiftWork = false,
) {
  const selection = requireTvhKrTariff(profile.tvhKrTariff);
  if (!selection) throw new Error("TV-H-Pflegegruppe fehlt.");
  return calculateTvhKrShift(
    shift,
    profile,
    selection,
    { allowanceStatus: "NONE", saturdayShiftWork },
    resolver,
  );
}
export function calculateTvhKrProfileMonth(
  month: string,
  shifts: readonly ShiftEntry[],
  profile: UserProfile,
  decision: MonthlyTariffDecision | null,
  assessmentShifts: readonly ShiftEntry[],
  settings: TvoedWorkPatternSettings,
  resolver: RuleResolver,
) {
  const selection = requireTvhKrTariff(profile.tvhKrTariff);
  if (!selection) throw new Error("TV-H-Pflegegruppe fehlt.");
  const assessment = calculateTvhKrAssessment(
    month,
    assessmentShifts,
    settings,
    profile.timeZone,
  ).assessment;
  const allowanceStatus = decision?.allowanceStatus ?? assessment?.suggestedAllowance ?? "NONE";
  const saturdayShiftWork =
    assessment?.shiftWork === "DETECTED" ||
    assessment?.alternatingShiftWork === "DETECTED" ||
    allowanceStatus !== "NONE";
  return calculateTvhKrMonth(
    month,
    shifts,
    profile,
    selection,
    {
      allowanceStatus,
      saturdayShiftWork,
      assessment: assessment ?? undefined,
      confirmedAllowance: decision?.allowanceStatus ?? null,
    },
    resolver,
  );
}
