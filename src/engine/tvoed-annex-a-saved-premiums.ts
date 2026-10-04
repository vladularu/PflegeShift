import { Temporal } from "@js-temporal/polyfill";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type {
  TimeRemunerationPosition,
  TimeRemunerationResult,
} from "@/domain/remuneration-result";
import {
  isCurrentTvoedAnnexAPremiumFacts,
  tvoedAnnexAShiftBinding,
  type SavedTvoedAnnexAPremiumFacts,
} from "@/domain/saved-tvoed-annex-a-premium-facts";
import type { SavedTvoedAnnexAMonthConfirmation } from "@/domain/saved-tvoed-annex-a-month-confirmation";
import type { SavedShiftTraining } from "@/domain/training-data";
import type { ShiftEntry, UserProfile } from "@/domain/types";
import { bundledRuleResolver, type RuleResolver } from "@/rules/rule-resolver";
import { deriveCaritasDraftMonthWorkSlices } from "./caritas-care-draft-work-slices";
import { resolveRemunerationMonth } from "./remuneration-context";
import { remunerationShiftDays } from "./remuneration-shift-days";
import { resolveSavedTvoedAnnexAMonthConfirmation } from "./tvoed-annex-a-saved-confirmation";
import { calculateTvoedAnnexADraftTimePremiumsFromWork } from "./tvoed-annex-a-draft-from-work";
import type { TvoedAnnexADraftTimePremiumResult } from "./tvoed-annex-a-draft-time-premiums";

type Premium = Extract<
  TvoedAnnexADraftTimePremiumResult,
  { kind: "draft-time-premiums" }
>["positions"][number]["premium"];
const LABEL: Record<Premium, string> = {
  NIGHT: "Nachtzuschlag (Entwurf)",
  SUNDAY: "Sonntagszuschlag (Entwurf)",
  HOLIDAY_WITH_TIME_OFF: "Feiertagszuschlag mit Freizeitausgleich (Entwurf)",
  HOLIDAY_WITHOUT_TIME_OFF: "Feiertagszuschlag ohne Freizeitausgleich (Entwurf)",
  PRE_HOLIDAY: "Vorfeiertagszuschlag (Entwurf)",
  SATURDAY: "Samstagszuschlag (Entwurf)",
};

export interface SavedAnnexAPremiumCalculationInput {
  readonly month: string;
  readonly shifts: readonly ShiftEntry[];
  readonly workProfile: UserProfile;
  readonly history: readonly DatedRemunerationProfile[];
  readonly savedMonthConfirmations: readonly SavedTvoedAnnexAMonthConfirmation[];
  readonly savedPremiumFacts: readonly SavedTvoedAnnexAPremiumFacts[];
  readonly pauseDetails: readonly SavedShiftTraining[];
  readonly entriesComplete: boolean;
  readonly pauseDetailsComplete: boolean;
  readonly resolver?: RuleResolver;
}

/** A draft partial amount is exposed only when every separate evidence gate passes. */
export function calculateSavedTvoedAnnexADraftTimePremiums(
  input: SavedAnnexAPremiumCalculationInput,
): TimeRemunerationResult | null {
  const facts = input.savedPremiumFacts.find((item) => item.month === input.month);
  if (!facts) return null;
  const resolver = input.resolver ?? bundledRuleResolver;
  const periods = resolveRemunerationMonth(input.month, input.history, resolver);
  if (periods.length !== 1 || periods[0].context.kind !== "tvoed-annex-a-draft") return null;
  const context = periods[0].context;
  if (context.profile === null || context.source.versionId === null) return null;
  const unavailable = (message: string): TimeRemunerationResult => {
    const date = `${input.month}-01`;
    const start = Temporal.PlainDate.from(date).toZonedDateTime({
      timeZone: "Europe/Berlin",
      plainTime: "00:00",
    });
    return {
      status: "unavailable",
      complete: false,
      totalCents: null,
      knownSubtotalCents: 0,
      netMinutes: 0,
      positions: [
        {
          id: `tvoed-annex-a:${input.month}:unavailable`,
          kind: "time-premium",
          label: "TVöD-Zeitzuschläge (Entwurf)",
          from: date,
          through: date,
          fromEpochMinutes: Number(start.epochMilliseconds) / 60_000,
          untilEpochMinutes: Number(start.add({ days: 1 }).epochMilliseconds) / 60_000,
          shiftId: null,
          status: "unavailable",
          amountCents: null,
          source: context.source,
          basis: {
            ruleId: null,
            minutes: 0,
            hourlyRateCents: null,
            percentageBasisPoints: null,
            pauseMethod: "none",
          },
          issue: { code: "DRAFT_PREMIUM_FACTS_INCOMPLETE", message },
        },
      ],
    };
  };
  if (!input.entriesComplete || !input.pauseDetailsComplete)
    return unavailable("Dienst- oder Pausendaten sind noch nicht vollständig geladen.");
  if (!isCurrentTvoedAnnexAPremiumFacts(facts, context.profile, context.source.versionId))
    return unavailable("Zuschlagsangaben gehören zu einem früheren Profil- oder Regelstand.");
  const shifts = new Map(input.shifts.map((shift) => [shift.id, shift]));
  if (
    facts.dayDecisions.some((decision) => {
      const shift = shifts.get(decision.shiftId);
      return (
        !shift ||
        decision.shiftBinding !== tvoedAnnexAShiftBinding(shift, input.workProfile.timeZone) ||
        !remunerationShiftDays(shift, input.workProfile.timeZone).some(
          (day) => day.date === decision.date && day.until > day.from,
        )
      );
    })
  )
    return unavailable("Bestätigte Zuschlagsangaben passen nicht mehr zu den aktuellen Diensten.");
  const confirmation = resolveSavedTvoedAnnexAMonthConfirmation(
    input.month,
    input.history,
    input.savedMonthConfirmations,
    resolver,
  );
  if (!confirmation) return unavailable("TVöD-Monatsangaben sind nicht aktuell bestätigt.");
  const result = calculateTvoedAnnexADraftTimePremiumsFromWork({
    pkg: context.rulePackage,
    month: input.month,
    variantId: context.variant,
    groupId: context.groupId,
    fullTimeWeeklyMinutes: context.fullTimeWeeklyMinutes,
    fullTimeReferenceConfirmed: confirmation.comparableFullTimeConfirmed,
    applicabilityConfirmed: confirmation.applicabilityConfirmed,
    cashPaymentConfirmed: facts.cashPaymentConfirmed === true,
    localAgreement: facts.localAgreement,
    shifts: input.shifts,
    pauseDetails: input.pauseDetails,
    workProfile: input.workProfile,
    entriesComplete: input.entriesComplete,
    dayDecisions: facts.dayDecisions,
    resolver,
  });
  if (result.kind !== "draft-time-premiums")
    return unavailable("Arbeits-, Pausen- oder Vertragsangaben reichen für Zuschläge nicht aus.");
  const actualWork = deriveCaritasDraftMonthWorkSlices({
    month: input.month,
    shifts: input.shifts,
    details: input.pauseDetails,
    timeZone: input.workProfile.timeZone,
    entriesComplete: input.entriesComplete,
  });
  if (actualWork.kind === "unavailable")
    return unavailable("Die tatsächliche Arbeitszeit konnte nicht vollständig geprüft werden.");
  const netMinutes = actualWork.slices.reduce(
    (total, slice) => total + slice.throughMinute - slice.fromMinute,
    0,
  );
  const positions: TimeRemunerationPosition[] = result.positions.map((item) => {
    const start = Temporal.PlainDate.from(item.date).toZonedDateTime({
      timeZone: input.workProfile.timeZone,
      plainTime: "00:00",
    });
    return {
      id: `tvoed-annex-a:${input.month}:${item.date}:${item.premium}`,
      kind: "time-premium",
      label: LABEL[item.premium],
      from: item.date,
      through: item.date,
      fromEpochMinutes: Number(start.epochMilliseconds) / 60_000,
      untilEpochMinutes: Number(start.add({ days: 1 }).epochMilliseconds) / 60_000,
      shiftId: null,
      status: "estimated",
      amountCents: item.amountCents,
      source: context.source,
      basis: {
        ruleId: `tvoed-annex-a:${item.premium.toLowerCase()}`,
        minutes: item.minutes,
        hourlyRateCents: result.referenceHourlyCents,
        percentageBasisPoints: item.percentageBasisPoints,
        pauseMethod: "confirmed-intervals",
      },
      issue: null,
    };
  });
  return {
    status: "estimated",
    complete: true,
    totalCents: result.amountCents,
    knownSubtotalCents: result.amountCents,
    netMinutes,
    positions,
  };
}
