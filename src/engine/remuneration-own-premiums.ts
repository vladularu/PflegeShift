import { Temporal } from "@js-temporal/polyfill";
import type { OwnRemunerationConfiguration, OwnTimePremium } from "@/domain/own-remuneration";
import type { TimeRemunerationPosition } from "@/domain/remuneration-result";
import type { ShiftEntry, UserProfile } from "@/domain/types";
import type { RuleResolver } from "@/rules/rule-resolver";
import type { RemunerationShiftDay } from "./remuneration-shift-days";
import { calculateTimedShiftBounds } from "./working-time";
import { resolveHolidayMapForMonth } from "./holidays";
import { roundRemunerationCents } from "./remuneration-base";

const LABELS = {
  night: "Eigener Nachtzuschlag",
  saturday: "Eigener Samstagszuschlag",
  sunday: "Eigener Sonntagszuschlag",
  holiday: "Eigener Feiertagszuschlag",
} as const;
type Issue = TimeRemunerationPosition["issue"];
interface Candidate {
  readonly rule: OwnTimePremium;
  readonly hourlyCents: number | null;
  readonly percentage: number | null;
  /** Hourly cents multiplied by 10000; compare before any rounding. */
  readonly units: number;
  readonly issue: Issue;
}
function inWindow(rule: OwnTimePremium, minute: number): boolean {
  const w = rule.window;
  return (
    w === null ||
    (w.startMinute < w.endMinute
      ? minute >= w.startMinute && minute < w.endMinute
      : minute >= w.startMinute || minute < w.endMinute)
  );
}
function candidate(
  rule: OwnTimePremium,
  config: OwnRemunerationConfiguration,
  holidayUnknown: boolean,
): Candidate {
  const hourlyCents =
    rule.rate.kind === "hourly"
      ? rule.rate.centsPerHour
      : config.base.kind === "hourly"
        ? config.base.centsPerHour
        : config.percentageBasisHourlyCents;
  const percentage = rule.rate.kind === "percent" ? rule.rate.basisPoints : null;
  const missingBasis = hourlyCents === null && percentage !== 0;
  return {
    rule,
    hourlyCents,
    percentage,
    units: (hourlyCents ?? 0) * (percentage ?? 10000),
    issue: holidayUnknown
      ? {
          code: "HOLIDAY_RULES_UNAVAILABLE",
          message: "Die Feiertagsregeln sind für diesen Zuschlag nicht verfügbar.",
        }
      : missingBasis
        ? {
            code: "PREMIUM_RATE_MISSING",
            message: "Bitte die persönliche Stundenbasis für prozentuale Zuschläge bestätigen.",
          }
        : null,
  };
}

/** Input configuration has passed the shared profile validator at context resolution. */
export function calculateOwnShiftDayPremiums(
  base: TimeRemunerationPosition,
  day: RemunerationShiftDay,
  shift: ShiftEntry,
  work: UserProfile,
  config: OwnRemunerationConfiguration,
  resolver: RuleResolver,
): readonly TimeRemunerationPosition[] {
  const premiums = config.timePremiums;
  if (premiums === null) return [{ ...base, label: "Eigene Zeitzuschläge ausgeschaltet" }];
  const bounds = calculateTimedShiftBounds(shift, work.timeZone);
  if (!bounds) throw new Error("Dienstzeit fehlt für eigene Zuschläge.");
  const breakDuration = Math.min(bounds.grossMinutes, shift.breakMinutes);
  const breakFrom = Math.floor((bounds.grossMinutes - breakDuration) / 2);
  const breakUntil = breakFrom + breakDuration;
  const localStart = Temporal.Instant.fromEpochMilliseconds(
    day.fromEpochMinutes * 60000,
  ).toZonedDateTimeISO(work.timeZone);
  const localEnd = Temporal.Instant.fromEpochMilliseconds(
    (day.untilEpochMinutes - 1) * 60000,
  ).toZonedDateTimeISO(work.timeZone);
  const transition = localStart.offsetNanoseconds !== localEnd.offsetNanoseconds;
  const startMinute = localStart.hour * 60 + localStart.minute;
  const weekday = localStart.dayOfWeek;
  const applicable = premiums.rules.filter(
    (rule) =>
      rule.type === "night" ||
      rule.type === "holiday" ||
      (rule.type === "saturday" && weekday === 6) ||
      (rule.type === "sunday" && weekday === 7),
  );
  let holiday: boolean | null | undefined;
  const buckets = new Map<string, { entry: Candidate; minutes: number }>();
  const count = (entry: Candidate) => {
    const previous = buckets.get(entry.rule.id);
    buckets.set(entry.rule.id, { entry, minutes: (previous?.minutes ?? 0) + 1 });
  };
  for (let offset = day.from; offset < day.until; offset++) {
    if (offset >= breakFrom && offset < breakUntil) continue;
    const cursor = transition ? localStart.add({ minutes: offset - day.from }) : null;
    const minute = cursor ? cursor.hour * 60 + cursor.minute : startMinute + offset - day.from;
    const matches: Candidate[] = [];
    for (const rule of applicable) {
      if (!inWindow(rule, minute)) continue;
      if (rule.type === "holiday") {
        if (holiday === undefined) {
          const result = resolveHolidayMapForMonth(
            day.date.slice(0, 7),
            work.federalState,
            resolver,
            work.holidayRegion,
          );
          holiday = result.status === "AVAILABLE" ? result.holidays.has(day.date) : null;
        }
        if (holiday === false) continue;
      }
      matches.push(candidate(rule, config, rule.type === "holiday" && holiday === null));
    }
    if (premiums.combination === "add") matches.forEach(count);
    else {
      const unknown = matches.filter((entry) => entry.issue !== null);
      if (unknown.length) unknown.forEach(count);
      else {
        const winner = matches.reduce<Candidate | null>(
          (best, entry) =>
            best === null ||
            entry.units > best.units ||
            (entry.units === best.units && entry.rule.id < best.rule.id)
              ? entry
              : best,
          null,
        );
        if (winner) count(winner);
      }
    }
  }
  if (buckets.size === 0)
    return [{ ...base, label: "Keine eigenen Zeitzuschläge in diesem Abschnitt" }];
  return [...buckets.values()].map(({ entry, minutes }) => ({
    ...base,
    id: base.id + ":own:" + entry.rule.id,
    label: LABELS[entry.rule.type],
    amountCents: entry.issue ? null : roundRemunerationCents(entry.units * minutes, 60 * 10000),
    status: entry.issue ? "unavailable" : base.status,
    issue: entry.issue,
    basis: {
      ...base.basis,
      ruleId: entry.rule.id,
      minutes,
      hourlyRateCents: entry.hourlyCents,
      percentageBasisPoints: entry.percentage,
    },
  }));
}
