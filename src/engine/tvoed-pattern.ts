import { Temporal } from "@js-temporal/polyfill";

import type {
  AllowanceStatus,
  ShiftEntry,
  TvoedAssessment,
  TvoedWorkPatternSettings,
} from "@/domain/types";
import { getTariffRulePackage } from "@/engine/tariff";
import { BUNDLED_TARIFF_RULES } from "@/rules/bundled-rules";
import type { RuleTimeWindow, RuleWorkPatternPolicy } from "@/rules/contracts.generated";
import { bundledRuleResolver, type RuleResolver } from "@/rules/rule-resolver";

const WORK_TYPES = new Set(["EARLY", "LATE", "NIGHT", "DAY", "CUSTOM"]);

export const DEFAULT_TVOED_WORK_PATTERN_SETTINGS: TvoedWorkPatternSettings = Object.freeze({
  workplaceCoverage: "UNKNOWN",
  assignment: "UNKNOWN",
  updatedAt: null,
});

export function isPayWorkShift(shift: ShiftEntry): boolean {
  return (
    !shift.allDay &&
    WORK_TYPES.has(shift.type) &&
    shift.startTime !== null &&
    shift.endTime !== null
  );
}

function shiftWindow(shift: ShiftEntry, policy: RuleWorkPatternPolicy): string {
  const [hour, minute] = shift.startTime!.split(":").map(Number);
  const value = hour * 60 + minute;
  const boundaries = policy.shiftWindowBoundaries;
  if (value < boundaries.nightEndMinute || value >= boundaries.nightStartMinute) return "Nacht";
  if (value < boundaries.earlyEndMinute) return "Früh";
  if (value < boundaries.dayEndMinute) return "Tag";
  return "Spät";
}

function intervalOverlap(start: number, end: number, rangeStart: number, rangeEnd: number): number {
  return Math.max(0, Math.min(end, rangeEnd) - Math.max(start, rangeStart));
}

function timeWindowOverlap(start: number, end: number, window: RuleTimeWindow): number {
  let minutes = 0;
  for (let day = -1; day <= 2; day += 1) {
    const dayStart = day * 24 * 60;
    if (window.startMinute < window.endMinute) {
      minutes += intervalOverlap(
        start,
        end,
        dayStart + window.startMinute,
        dayStart + window.endMinute,
      );
    } else {
      minutes += intervalOverlap(start, end, dayStart + window.startMinute, dayStart + 24 * 60);
      minutes += intervalOverlap(start, end, dayStart, dayStart + window.endMinute);
    }
  }
  return minutes;
}

function tariffNightMinutes(shift: ShiftEntry, policy: RuleWorkPatternPolicy): number {
  const [startHour, startMinute] = shift.startTime!.split(":").map(Number);
  const [endHour, endMinute] = shift.endTime!.split(":").map(Number);
  const start = startHour * 60 + startMinute;
  const rawEnd = endHour * 60 + endMinute;
  const end = rawEnd <= start ? rawEnd + 24 * 60 : rawEnd;
  const gross = Math.max(0, end - start);
  const breakMinutes = Math.min(gross, shift.breakMinutes);
  const breakStart = start + Math.floor((gross - breakMinutes) / 2);
  const breakEnd = breakStart + breakMinutes;
  return (
    timeWindowOverlap(start, end, policy.nightWindow) -
    timeWindowOverlap(breakStart, breakEnd, policy.nightWindow)
  );
}

function hasRecurringNightShifts(
  shifts: readonly ShiftEntry[],
  policy: RuleWorkPatternPolicy,
): boolean {
  const nights = shifts.filter(
    (shift) => tariffNightMinutes(shift, policy) >= policy.nightQualificationMinutes,
  );
  return nights.some((night, index) => {
    const deadline = Temporal.PlainDate.from(night.date)
      .add({ months: policy.recurringWindowMonths })
      .toString();
    return (
      nights.slice(index + 1).filter((candidate) => candidate.date <= deadline).length >=
      policy.recurringNightShiftCount - 1
    );
  });
}

export function assessTvoedPattern(
  shifts: readonly ShiftEntry[],
  settings: TvoedWorkPatternSettings = DEFAULT_TVOED_WORK_PATTERN_SETTINGS,
  ruleResolver: RuleResolver = bundledRuleResolver,
  effectiveDate?: string,
  calendarNightEvidence?: { readonly met: boolean; readonly count: number },
): TvoedAssessment {
  const work = shifts
    .filter(isPayWorkShift)
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) || left.startTime!.localeCompare(right.startTime!),
    );
  const policy =
    getTariffRulePackage(effectiveDate ?? work.at(-1)?.date ?? "", ruleResolver)?.rules
      .workPatternPolicy ?? BUNDLED_TARIFF_RULES.at(-1)!.rules.workPatternPolicy;
  const orderedWindows = work.map((shift) => shiftWindow(shift, policy));
  const windows = new Set(orderedWindows);
  const nightShiftCount =
    calendarNightEvidence?.count ??
    work.filter((shift) => tariffNightMinutes(shift, policy) >= policy.nightQualificationMinutes)
      .length;
  const changeCount = orderedWindows.reduce(
    (count, window, index) =>
      index > 0 && orderedWindows[index - 1] !== window ? count + 1 : count,
    0,
  );
  const hasRegularChange = changeCount >= policy.regularChangeCount;
  const recurringNightShifts = calendarNightEvidence?.met ?? hasRecurringNightShifts(work, policy);
  const hasAlternatingPattern =
    work.length >= policy.alternatingMinimumShifts &&
    windows.size >= policy.alternatingMinimumWindows &&
    recurringNightShifts &&
    hasRegularChange;
  const shiftWork =
    work.length === 0
      ? "NOT_DETECTED"
      : work.length >= policy.shiftWorkMinimumShifts &&
          windows.size >= policy.shiftWorkMinimumWindows &&
          hasRegularChange
        ? "DETECTED"
        : "REVIEW";
  const alternatingShiftWork =
    work.length === 0 ||
    nightShiftCount === 0 ||
    settings.workplaceCoverage === "NOT_AROUND_THE_CLOCK"
      ? "NOT_DETECTED"
      : hasAlternatingPattern && settings.workplaceCoverage === "AROUND_THE_CLOCK"
        ? "DETECTED"
        : hasAlternatingPattern || windows.size >= 2
          ? "REVIEW"
          : "NOT_DETECTED";
  const detectedPattern =
    alternatingShiftWork === "DETECTED" ? "ALTERNATING" : shiftWork === "DETECTED" ? "SHIFT" : null;
  const requiresCoverage = hasAlternatingPattern && settings.workplaceCoverage === "UNKNOWN";
  const suggestedAllowance: AllowanceStatus = requiresCoverage
    ? "NONE"
    : detectedPattern === "ALTERNATING" && settings.assignment === "PERMANENT"
      ? "ALTERNATING_MONTHLY"
      : detectedPattern === "ALTERNATING" && settings.assignment === "TEMPORARY"
        ? "ALTERNATING_HOURLY"
        : detectedPattern === "SHIFT" && settings.assignment === "PERMANENT"
          ? "SHIFT_MONTHLY"
          : detectedPattern === "SHIFT" && settings.assignment === "TEMPORARY"
            ? "SHIFT_HOURLY"
            : "NONE";
  const requiresAssignment = detectedPattern !== null && settings.assignment === "UNKNOWN";
  return {
    shiftWork,
    alternatingShiftWork,
    suggestedAllowance,
    requiresConfirmation: requiresCoverage || requiresAssignment,
    evidence: [
      `${work.length} Arbeitsdienste`,
      `${windows.size} Dienstlagen${windows.size ? `: ${[...windows].join(", ")}` : ""}`,
      `${changeCount} Wechsel der Dienstlage`,
      nightShiftCount > 0
        ? `${nightShiftCount} Nachtschichten mit mindestens ${
            Math.round((policy.nightQualificationMinutes / 60) * 100) / 100
          } Stunden Nachtarbeit`
        : "Keine tarifliche Nachtschicht erkannt",
    ],
    criteria: [
      {
        key: "SHIFT_CHANGES",
        label: "Regelmäßiger Wechsel",
        detail: hasRegularChange
          ? `${changeCount} Wechsel zwischen ${windows.size} Dienstlagen erkannt`
          : "Für eine belastbare Erkennung fehlen regelmäßige Wechsel",
        state: hasRegularChange ? "MET" : work.length === 0 ? "NOT_MET" : "OPEN",
      },
      {
        key: "NIGHT_SHIFTS",
        label: "Wiederkehrende Nachtschichten",
        detail: recurringNightShifts
          ? `Mindestens ${policy.recurringNightShiftCount} tarifliche Nachtschichten innerhalb von ${policy.recurringWindowMonths} Monat(en) erkannt`
          : `${nightShiftCount} tarifliche Nachtschichten im Prüfzeitraum erkannt`,
        state: recurringNightShifts ? "MET" : nightShiftCount === 0 ? "NOT_MET" : "OPEN",
      },
      {
        key: "AROUND_THE_CLOCK",
        label: "Arbeitsbereich rund um die Uhr",
        detail:
          settings.workplaceCoverage === "AROUND_THE_CLOCK"
            ? "Vom Nutzer bestätigt"
            : settings.workplaceCoverage === "NOT_AROUND_THE_CLOCK"
              ? "Vom Nutzer verneint"
              : "Kann nicht aus Dienstzeiten abgeleitet werden",
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
          settings.assignment === "PERMANENT"
            ? "Dauerhaft Teil der Stelle"
            : settings.assignment === "TEMPORARY"
              ? "Nur gelegentlich oder vertretungsweise"
              : "Kann nicht aus Kalendereinträgen abgeleitet werden",
        state: settings.assignment === "UNKNOWN" ? "OPEN" : "MET",
      },
    ],
  };
}
