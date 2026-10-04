import { Temporal } from "@js-temporal/polyfill";
import type { UserProfile } from "@/domain/types";
import type { RuleTariffPackage, RuleTimeWindow } from "@/rules/contracts.generated";
import { bundledRuleResolver, type RuleResolver } from "@/rules/rule-resolver";
import type { CaritasDraftWorkedSlice } from "./caritas-care-draft-time-premiums";
import type { CaritasDraftShiftNetSlice } from "./caritas-care-draft-work-slices";
import { resolveHolidayMapForMonth } from "./holidays";

/** A dated, explicitly confirmed fact; defaults on a shift template are not confirmation. */
export interface CaritasDraftWorkDayDecision {
  readonly shiftId: string;
  readonly date: string;
  readonly origin: "confirmed";
  readonly holidayTimeOff: boolean | null;
  readonly shiftWork: boolean | null;
}

export type CaritasDraftWorkFactsResult =
  | {
      readonly kind: "confirmed-work-facts";
      readonly slices: readonly CaritasDraftWorkedSlice[];
      readonly federalState: UserProfile["federalState"];
      readonly holidayRegion: UserProfile["holidayRegion"];
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | "HOLIDAY_RULES_UNAVAILABLE"
        | "HOLIDAY_REGION_UNCONFIRMED"
        | "HOLIDAY_TIME_OFF_UNCONFIRMED"
        | "SHIFT_WORK_UNCONFIRMED"
        | "DECISION_AMBIGUOUS"
        | "INVALID_WORKED_SLICE"
        | "MISSING_POLICY"
        | "INVALID_DECISION";
      readonly shiftId?: string;
      readonly date?: string;
    };

function realDate(value: string): boolean {
  try {
    return (
      /^\d{4}-\d{2}-\d{2}$/u.test(value) && Temporal.PlainDate.from(value).toString() === value
    );
  } catch {
    return false;
  }
}

function needsSaturdayFact(slice: CaritasDraftShiftNetSlice, window: RuleTimeWindow): boolean {
  if (Temporal.PlainDate.from(slice.date).dayOfWeek !== 6) return false;
  return window.startMinute < window.endMinute
    ? slice.fromMinute < window.endMinute && slice.throughMinute > window.startMinute
    : slice.fromMinute < window.endMinute || slice.throughMinute > window.startMinute;
}

/**
 * Enriches confirmed net work with the existing versioned holiday resolver.
 * Compensation and shift-work classifications remain explicit user/employer facts.
 */
export function deriveCaritasDraftWorkFacts(input: {
  readonly pkg: RuleTariffPackage;
  readonly slices: readonly CaritasDraftShiftNetSlice[];
  readonly decisions: readonly CaritasDraftWorkDayDecision[];
  readonly federalState: UserProfile["federalState"];
  readonly holidayRegion: UserProfile["holidayRegion"];
  readonly resolver?: RuleResolver;
}): CaritasDraftWorkFactsResult {
  const policy = input.pkg.rules.caritasTimePremiumPolicy;
  if (!policy) return { kind: "unavailable", reason: "MISSING_POLICY" };
  if (input.holidayRegion === "UNKNOWN")
    return { kind: "unavailable", reason: "HOLIDAY_REGION_UNCONFIRMED" };
  const resolver = input.resolver ?? bundledRuleResolver;
  const holidays = new Map<string, ReturnType<typeof resolveHolidayMapForMonth>>();
  const decisions = new Map<string, CaritasDraftWorkDayDecision>();
  for (const decision of input.decisions) {
    if (
      typeof decision.shiftId !== "string" ||
      !decision.shiftId ||
      !realDate(decision.date) ||
      ![true, false, null].includes(decision.holidayTimeOff) ||
      ![true, false, null].includes(decision.shiftWork) ||
      decision.origin !== "confirmed"
    )
      return {
        kind: "unavailable",
        reason: "INVALID_DECISION",
        shiftId: decision.shiftId,
        date: decision.date,
      };
    const key = `${decision.shiftId}:${decision.date}`;
    if (decisions.has(key))
      return {
        kind: "unavailable",
        reason: "DECISION_AMBIGUOUS",
        shiftId: decision.shiftId,
        date: decision.date,
      };
    decisions.set(key, decision);
  }

  const slices: CaritasDraftWorkedSlice[] = [];
  for (const slice of input.slices) {
    if (
      !realDate(slice.date) ||
      !Number.isSafeInteger(slice.fromMinute) ||
      !Number.isSafeInteger(slice.throughMinute) ||
      slice.fromMinute < 0 ||
      slice.throughMinute > 1440 ||
      slice.fromMinute >= slice.throughMinute
    )
      return {
        kind: "unavailable",
        reason: "INVALID_WORKED_SLICE",
        shiftId: slice.shiftId,
        date: slice.date,
      };
    const month = slice.date.slice(0, 7);
    let resolution = holidays.get(month);
    if (!resolution) {
      resolution = resolveHolidayMapForMonth(
        month,
        input.federalState,
        resolver,
        input.holidayRegion,
      );
      holidays.set(month, resolution);
    }
    if (resolution.status !== "AVAILABLE")
      return {
        kind: "unavailable",
        reason: "HOLIDAY_RULES_UNAVAILABLE",
        shiftId: slice.shiftId,
        date: slice.date,
      };
    const publicHoliday = resolution.holidays.has(slice.date);
    const decision = decisions.get(`${slice.shiftId}:${slice.date}`);
    if (publicHoliday && typeof decision?.holidayTimeOff !== "boolean")
      return {
        kind: "unavailable",
        reason: "HOLIDAY_TIME_OFF_UNCONFIRMED",
        shiftId: slice.shiftId,
        date: slice.date,
      };
    if (needsSaturdayFact(slice, policy.saturdayWindow) && typeof decision?.shiftWork !== "boolean")
      return {
        kind: "unavailable",
        reason: "SHIFT_WORK_UNCONFIRMED",
        shiftId: slice.shiftId,
        date: slice.date,
      };
    slices.push({
      date: slice.date,
      fromMinute: slice.fromMinute,
      throughMinute: slice.throughMinute,
      publicHoliday,
      holidayTimeOff: publicHoliday ? decision!.holidayTimeOff : null,
      shiftWork: decision?.shiftWork ?? null,
    });
  }
  return {
    kind: "confirmed-work-facts",
    slices,
    federalState: input.federalState,
    holidayRegion: input.holidayRegion,
  };
}
