import { Temporal } from "@js-temporal/polyfill";
import type { SavedShiftTraining } from "@/domain/training-data";
import type { ShiftEntry, UserProfile } from "@/domain/types";
import {
  tvoedAnnexAShiftBinding,
  type TvoedAnnexADraftDayDecision,
} from "@/domain/saved-tvoed-annex-a-premium-facts";
import { bundledRuleResolver, type RuleResolver } from "@/rules/rule-resolver";
import { deriveCaritasDraftMonthWorkSlices } from "./caritas-care-draft-work-slices";
import { resolveHolidayMapForMonth } from "./holidays";
import {
  calculateTvoedAnnexADraftTimePremiums,
  type TvoedAnnexADraftTimePremiumInput,
  type TvoedAnnexADraftTimePremiumResult,
} from "./tvoed-annex-a-draft-time-premiums";

export { tvoedAnnexAShiftBinding } from "@/domain/saved-tvoed-annex-a-premium-facts";

export type TvoedAnnexADraftFromWorkResult =
  | Extract<TvoedAnnexADraftTimePremiumResult, { kind: "draft-time-premiums" }>
  | {
      readonly kind: "unavailable";
      readonly stage: "work-slices" | "work-facts" | "premium";
      readonly reason: string;
      readonly shiftId?: string;
      readonly date?: string;
    };

export interface TvoedAnnexADraftFromWorkInput extends Omit<
  TvoedAnnexADraftTimePremiumInput,
  "workedSlices" | "workDataComplete"
> {
  readonly shifts: readonly ShiftEntry[];
  readonly pauseDetails: readonly SavedShiftTraining[];
  readonly workProfile: Pick<UserProfile, "federalState" | "holidayRegion" | "timeZone">;
  readonly entriesComplete: boolean;
  readonly dayDecisions: readonly TvoedAnnexADraftDayDecision[];
  readonly resolver?: RuleResolver;
}

function realDate(value: string): boolean {
  try {
    return (
      /^\d{4}-\d{2}-\d{2}$/u.test(value) && Temporal.PlainDate.from(value).toString() === value
    );
  } catch {
    return false;
  }
}

/**
 * Candidate-only bridge from revision-bound actual pauses and versioned holidays.
 * No unconfirmed work class, holiday compensation, or Saturday status is inferred.
 */
export function calculateTvoedAnnexADraftTimePremiumsFromWork(
  input: TvoedAnnexADraftFromWorkInput,
): TvoedAnnexADraftFromWorkResult {
  if (input.workProfile.timeZone !== "Europe/Berlin")
    return { kind: "unavailable", stage: "work-slices", reason: "TIME_ZONE_UNSUPPORTED" };
  const work = deriveCaritasDraftMonthWorkSlices({
    month: input.month,
    shifts: input.shifts,
    details: input.pauseDetails,
    timeZone: input.workProfile.timeZone,
    entriesComplete: input.entriesComplete,
  });
  if (work.kind === "unavailable") return { ...work, stage: "work-slices" };
  // The shared net-work collector excludes TRAINING. It may still represent paid
  // work, so it must not silently turn a month with training into zero premiums.
  const first = Temporal.PlainYearMonth.from(input.month).toPlainDate({ day: 1 });
  const previousDate = first.subtract({ days: 1 }).toString();
  const unresolvedTraining = input.shifts.find((shift) => {
    if (shift.deletedAt !== null || shift.type !== "TRAINING") return false;
    if (shift.date.startsWith(`${input.month}-`)) return true;
    return (
      shift.date === previousDate &&
      shift.startTime !== null &&
      shift.endTime !== null &&
      shift.endTime <= shift.startTime &&
      shift.endTime !== "00:00"
    );
  });
  if (unresolvedTraining)
    return {
      kind: "unavailable",
      stage: "work-slices",
      reason: "TRAINING_WORK_UNRESOLVED",
      shiftId: unresolvedTraining.id,
    };
  if (input.workProfile.holidayRegion === "UNKNOWN")
    return { kind: "unavailable", stage: "work-facts", reason: "HOLIDAY_REGION_UNKNOWN" };
  const decisions = new Map<string, TvoedAnnexADraftDayDecision>();
  for (const decision of input.dayDecisions) {
    if (
      !decision.shiftId ||
      !realDate(decision.date) ||
      decision.origin !== "confirmed" ||
      typeof decision.shiftBinding !== "string" ||
      !decision.shiftBinding ||
      !["REGULAR_ACTIVE", "SPECIAL", null].includes(decision.workKind) ||
      ![true, false, null].includes(decision.holidayTimeOff) ||
      ![true, false, null].includes(decision.shiftWork) ||
      ![true, false, null].includes(decision.legacyAngestellteClass)
    )
      return {
        kind: "unavailable",
        stage: "work-facts",
        reason: "INVALID_DECISION",
        shiftId: decision.shiftId,
        date: decision.date,
      };
    const key = `${decision.shiftId}:${decision.date}`;
    if (decisions.has(key))
      return {
        kind: "unavailable",
        stage: "work-facts",
        reason: "DECISION_AMBIGUOUS",
        shiftId: decision.shiftId,
        date: decision.date,
      };
    decisions.set(key, decision);
  }
  let holidayMap: ReturnType<typeof resolveHolidayMapForMonth>;
  try {
    holidayMap = resolveHolidayMapForMonth(
      input.month,
      input.workProfile.federalState,
      input.resolver ?? bundledRuleResolver,
      input.workProfile.holidayRegion,
    );
  } catch {
    return { kind: "unavailable", stage: "work-facts", reason: "HOLIDAY_RULES_UNAVAILABLE" };
  }
  if (holidayMap.status !== "AVAILABLE")
    return { kind: "unavailable", stage: "work-facts", reason: "HOLIDAY_RULES_UNAVAILABLE" };
  const workedSlices: TvoedAnnexADraftTimePremiumInput["workedSlices"][number][] = [];
  for (const slice of work.slices) {
    const decision = decisions.get(`${slice.shiftId}:${slice.date}`);
    if (!decision || decision.workKind === null)
      return {
        kind: "unavailable",
        stage: "work-facts",
        reason: "WORK_KIND_UNCONFIRMED",
        shiftId: slice.shiftId,
        date: slice.date,
      };
    const shift = input.shifts.find((entry) => entry.id === slice.shiftId);
    if (
      !shift ||
      decision.shiftBinding !== tvoedAnnexAShiftBinding(shift, input.workProfile.timeZone)
    )
      return {
        kind: "unavailable",
        stage: "work-facts",
        reason: "DECISION_STALE",
        shiftId: slice.shiftId,
        date: slice.date,
      };
    const publicHoliday = holidayMap.holidays.has(slice.date);
    workedSlices.push({
      date: slice.date,
      fromMinute: slice.fromMinute,
      throughMinute: slice.throughMinute,
      actualElapsedMinutes: slice.throughMinute - slice.fromMinute,
      workKind: decision.workKind,
      publicHoliday,
      holidayTimeOff: publicHoliday ? (decision.holidayTimeOff ?? undefined) : undefined,
      shiftWork: decision.shiftWork ?? undefined,
      legacyAngestellteClass: decision.legacyAngestellteClass ?? undefined,
    });
  }
  const result = calculateTvoedAnnexADraftTimePremiums({
    pkg: input.pkg,
    month: input.month,
    variantId: input.variantId,
    groupId: input.groupId,
    fullTimeWeeklyMinutes: input.fullTimeWeeklyMinutes,
    fullTimeReferenceConfirmed: input.fullTimeReferenceConfirmed,
    applicabilityConfirmed: input.applicabilityConfirmed,
    workDataComplete: true,
    cashPaymentConfirmed: input.cashPaymentConfirmed,
    localAgreement: input.localAgreement,
    workedSlices,
  });
  return result.kind === "unavailable" ? { ...result, stage: "premium" } : result;
}
