import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import {
  isCurrentOvertimeAllocation,
  validateOvertimeAllocation,
  type SavedOvertimeAllocation,
} from "@/domain/overtime-allocation";
import type {
  OvertimeDayAllocation,
  SupplementPosition,
  SupplementResult,
} from "@/domain/remuneration-supplement";
import type { ShiftEntry, UserProfile } from "@/domain/types";
import { bundledRuleResolver, type RuleResolver } from "@/rules/rule-resolver";
import { conditionsMatch } from "./pay-conditions";
import {
  getHourlyTableAmountForStep,
  getIndividualHourlyRate,
  getOvertimeBaseHourlyRate,
} from "./tariff";
import { roundRemunerationCents } from "./remuneration-base";
import {
  remunerationMonthStart,
  resolveRemunerationContext,
  type RemunerationContext,
} from "./remuneration-context";
import { remunerationMonthShifts, remunerationShiftDays } from "./remuneration-shift-days";
import {
  bindRemunerationTariffResolver,
  remunerationTariffProfile,
} from "./remuneration-tariff-adapter";
import { summarizeSupplements } from "./remuneration-supplement-result";
import { isPayWorkShift } from "./tvoed-pattern";
import { calculateOwnOvertime } from "./remuneration-own-overtime";
import { calculateTvlOvertime } from "./remuneration-tvl-overtime";
import { calculateTvalOvertime } from "./remuneration-tval-overtime";

function overtimeContextKey(
  context: RemunerationContext,
  date: string,
  work: UserProfile,
  shift: ShiftEntry,
): string {
  const applicable =
    context.kind === "tariff"
      ? context.rulePackage.rules.premiumRules.filter(
          (rule) =>
            rule.premiumType === "OVERTIME" &&
            conditionsMatch(
              rule.conditions,
              remunerationTariffProfile(work, context),
              date,
              shift,
              null,
            ),
        )
      : [];
  return JSON.stringify([
    date.slice(0, 7),
    context.kind,
    context.source,
    context.kind === "unavailable" ? context.issue : null,
    applicable,
    context.kind === "tval-training"
      ? [
          context.monthlyCents,
          context.fullTimeWeeklyMinutes,
          context.rulePackage.rules.tvalOvertimePolicy,
        ]
      : null,
    context.kind === "tvl-kr"
      ? [
          context.groupId,
          context.monthlyCents,
          context.fullTimeWeeklyMinutes,
          context.rulePackage.rules.tvlOvertimePolicy,
        ]
      : null,
  ]);
}

function positionFor(
  shift: ShiftEntry,
  date: string,
  through: string,
  minutes: number,
  context: RemunerationContext,
): SupplementPosition {
  return {
    id: `overtime:${shift.id}:${date}`,
    kind: "overtime-base",
    label: "Überstunden-Grundvergütung",
    from: date,
    through,
    amountCents: 0,
    status: "calculated",
    source: context.source,
    issue: null,
    basis: {
      ruleId: null,
      shiftId: shift.id,
      allowanceType: null,
      rateCents: null,
      personalMonthlyCents: null,
      percentageBasisPoints: null,
      minutes,
      calendarDays: 0,
      monthDays: remunerationMonthStart(date.slice(0, 7)).daysInMonth,
      entitlement: null,
      pauseMethod: "none",
      proration: "worked-minutes",
    },
  };
}

function unavailable(
  position: SupplementPosition,
  code: NonNullable<SupplementPosition["issue"]>["code"],
  message: string,
): SupplementPosition {
  return { ...position, amountCents: null, status: "unavailable", issue: { code, message } };
}

function calculateAllocatedOvertime(
  position: SupplementPosition,
  context: RemunerationContext,
  shift: ShiftEntry,
  work: UserProfile,
  resolver: RuleResolver,
): readonly SupplementPosition[] {
  if (context.kind === "unavailable")
    return [{ ...position, amountCents: null, status: "unavailable", issue: context.issue }];
  if (context.kind === "tval-training") return calculateTvalOvertime(position, context);
  if (context.kind === "tvl-kr") return calculateTvlOvertime(position, context);
  if (context.kind === "own-configured")
    return calculateOwnOvertime(position, context.configuration);
  if (context.kind === "own-monthly")
    return [
      unavailable(
        position,
        "OWN_OVERTIME_UNCONFIGURED",
        "Für die eigene Vergütung ist die Überstunden-Auszahlungsbasis noch nicht bestätigt.",
      ),
    ];
  const profile = remunerationTariffProfile(work, context);
  const tariff = profile.tariff!;
  const rules = context.rulePackage.rules.premiumRules.filter(
    (rule) =>
      rule.premiumType === "OVERTIME" &&
      conditionsMatch(rule.conditions, profile, position.from, shift, null),
  );
  if (rules.length !== 1)
    return [
      unavailable(
        position,
        rules.length ? "OVERTIME_RULE_AMBIGUOUS" : "OVERTIME_RULE_MISSING",
        "Die Überstundenregel ist nicht eindeutig verfügbar.",
      ),
    ];
  const rule = rules[0];
  const bound = bindRemunerationTariffResolver(resolver, context.rulePackage.packageId);
  const individualRate = getIndividualHourlyRate(tariff, position.from, bound);
  const maximumStep = context.rulePackage.rules.overtimeBaseRule?.maximumStepId;
  const maximumRate = maximumStep
    ? getHourlyTableAmountForStep(tariff, position.from, maximumStep, bound)
    : null;
  const premiumRate =
    rule.rateBasis === "INDIVIDUAL_HOURLY"
      ? individualRate
      : rule.referenceStepId
        ? getHourlyTableAmountForStep(tariff, position.from, rule.referenceStepId, bound)
        : null;
  if (individualRate === null || maximumRate === null || premiumRate === null)
    return [
      unavailable(
        position,
        "OVERTIME_RATE_MISSING",
        "Die Stundenbasis oder tarifliche Stufenbegrenzung für Überstunden fehlt.",
      ),
    ];
  const baseCents = Math.round(
    getOvertimeBaseHourlyRate(context.rulePackage, tariff, individualRate) * 100,
  );
  const premiumCents = Math.round(premiumRate * 100);
  return [
    {
      ...position,
      amountCents: roundRemunerationCents(baseCents * position.basis.minutes, 60),
      basis: { ...position.basis, rateCents: baseCents },
    },
    {
      ...position,
      id: position.id + ":premium",
      kind: "overtime-premium",
      label: rule.label,
      amountCents: roundRemunerationCents(
        premiumCents * position.basis.minutes * rule.percentageBasisPoints,
        60 * 10_000,
      ),
      basis: {
        ...position.basis,
        ruleId: rule.id,
        rateCents: premiumCents,
        percentageBasisPoints: rule.percentageBasisPoints,
      },
    },
  ];
}

/** Only explicitly confirmed payable overtime; a positive worktime balance is not an input. */
export function calculateDatedShiftOvertime(
  shift: ShiftEntry,
  work: UserProfile,
  history: readonly DatedRemunerationProfile[],
  resolver: RuleResolver = bundledRuleResolver,
  allocations?: readonly OvertimeDayAllocation[],
  includedMonth?: string,
  savedAllocation?: SavedOvertimeAllocation,
): SupplementResult {
  if (allocations !== undefined && savedAllocation !== undefined)
    throw new Error(
      "Gespeicherte und unversionierte Überstunden-Aufteilungen dürfen nicht gemischt werden.",
    );
  const saved =
    savedAllocation === undefined ? undefined : validateOvertimeAllocation(savedAllocation);
  if (includedMonth !== undefined) remunerationMonthStart(includedMonth);
  if (
    shift.deletedAt !== null ||
    !isPayWorkShift(shift) ||
    !shift.tariffOvertimeConfirmed ||
    shift.overtimeMinutes === 0
  )
    return summarizeSupplements([]);
  const days = remunerationShiftDays(shift, work.timeZone);
  if (days.length === 0) {
    if (includedMonth !== undefined && !shift.date.startsWith(includedMonth + "-"))
      return summarizeSupplements([]);
    const context = resolveRemunerationContext(shift.date, history, resolver);
    return summarizeSupplements([
      unavailable(
        positionFor(shift, shift.date, shift.date, shift.overtimeMinutes, context),
        "OVERTIME_MINUTES_INVALID",
        "Bestätigte Überstunden benötigen tatsächliche Dienstzeit.",
      ),
    ]);
  }
  const included = days.filter(
    (day) => includedMonth === undefined || day.date.startsWith(includedMonth + "-"),
  );
  if (!included.length) return summarizeSupplements([]);
  const contexts = days.map((day) => resolveRemunerationContext(day.date, history, resolver));
  const firstContext = contexts[0];
  const whole = positionFor(
    shift,
    included[0].date,
    included[included.length - 1].date,
    shift.overtimeMinutes,
    contexts[days.findIndex((day) => day.date === included[0].date)],
  );
  const netMinutes = days.reduce((sum, day) => sum + day.netMinutes, 0);
  if (saved !== undefined && !isCurrentOvertimeAllocation(saved, shift, work.timeZone))
    return summarizeSupplements([
      unavailable(
        whole,
        "OVERTIME_ALLOCATION_REQUIRED",
        saved.allocations === null
          ? "Die Tagesaufteilung wurde aufgehoben. Bitte die Überstunden erneut den jeweiligen Tagen zuordnen."
          : "Dienst oder Zeitzone stimmen nicht mehr mit der gespeicherten Tagesaufteilung überein. Bitte die Überstunden erneut bestätigen.",
      ),
    ]);
  // Null has already been rejected above: never turn a revoked allocation into fallback pay.
  const dayAllocations = saved === undefined ? allocations : saved.allocations!;
  if (
    !Number.isSafeInteger(shift.overtimeMinutes) ||
    shift.overtimeMinutes < 0 ||
    shift.overtimeMinutes > netMinutes
  )
    return summarizeSupplements([
      unavailable(
        whole,
        "OVERTIME_MINUTES_INVALID",
        "Bestätigte Überstunden dürfen die tatsächliche Dienstzeit nicht überschreiten.",
      ),
    ]);
  if (dayAllocations !== undefined) {
    const seen = new Set<string>();
    const valid = dayAllocations.every((allocation) => {
      const day = days.find((candidate) => candidate.date === allocation.date);
      if (
        !day ||
        seen.has(allocation.date) ||
        !Number.isSafeInteger(allocation.minutes) ||
        allocation.minutes < 0 ||
        // The centered pause is only an estimate. Explicit day allocations may
        // reflect a different actual pause; total overtime is still capped by net time.
        allocation.minutes > day.until - day.from
      )
        return false;
      seen.add(allocation.date);
      return true;
    });
    if (
      !valid ||
      dayAllocations.reduce((sum, allocation) => sum + allocation.minutes, 0) !==
        shift.overtimeMinutes
    )
      throw new Error(
        "Die bestätigte Tagesaufteilung muss die Überstunden vollständig und eindeutig zuordnen.",
      );
    const grouped = new Map<
      string,
      { position: SupplementPosition; context: RemunerationContext }
    >();
    for (const allocation of [...dayAllocations].sort((left, right) =>
      left.date.localeCompare(right.date),
    )) {
      if (
        allocation.minutes === 0 ||
        (includedMonth !== undefined && !allocation.date.startsWith(includedMonth + "-"))
      )
        continue;
      const index = days.findIndex((day) => day.date === allocation.date);
      const context = contexts[index];
      const key = overtimeContextKey(context, allocation.date, work, shift);
      const prior = grouped.get(key);
      grouped.set(key, {
        context,
        position: prior
          ? {
              ...prior.position,
              through: allocation.date,
              basis: {
                ...prior.position.basis,
                minutes: prior.position.basis.minutes + allocation.minutes,
              },
            }
          : positionFor(shift, allocation.date, allocation.date, allocation.minutes, context),
      });
    }
    return summarizeSupplements(
      [...grouped.values()].flatMap(({ position, context }) =>
        calculateAllocatedOvertime(position, context, shift, work, resolver),
      ),
    );
  }
  const key = overtimeContextKey(firstContext, days[0].date, work, shift);
  const sameBasis = contexts.every(
    (context, index) => overtimeContextKey(context, days[index].date, work, shift) === key,
  );
  if (!sameBasis)
    return summarizeSupplements([
      unavailable(
        whole,
        "OVERTIME_ALLOCATION_REQUIRED",
        "Bitte bestätigte Überstunden den jeweiligen Tagen zuordnen; der Dienst überschreitet einen Vergütungs- oder Monatswechsel.",
      ),
    ]);
  return summarizeSupplements(
    calculateAllocatedOvertime(whole, firstContext, shift, work, resolver),
  );
}

export function calculateMonthlyDatedOvertime(
  month: string,
  shifts: readonly ShiftEntry[],
  work: UserProfile,
  history: readonly DatedRemunerationProfile[],
  resolver: RuleResolver = bundledRuleResolver,
  allocations: ReadonlyMap<string, readonly OvertimeDayAllocation[]> = new Map(),
  savedAllocations: readonly SavedOvertimeAllocation[] = [],
): SupplementResult {
  if (allocations.size > 0 && savedAllocations.length > 0)
    throw new Error(
      "Gespeicherte und unversionierte Überstunden-Aufteilungen dürfen nicht gemischt werden.",
    );
  const savedByShift = new Map<string, SavedOvertimeAllocation>();
  for (const value of savedAllocations) {
    const saved = validateOvertimeAllocation(value);
    if (savedByShift.has(saved.shiftId))
      throw new Error("Überstunden-Aufteilung für denselben Dienst mehrfach vorhanden.");
    savedByShift.set(saved.shiftId, saved);
  }
  return summarizeSupplements(
    remunerationMonthShifts(month, shifts).flatMap(
      (shift) =>
        calculateDatedShiftOvertime(
          shift,
          work,
          history,
          resolver,
          allocations.get(shift.id),
          month,
          savedByShift.get(shift.id),
        ).positions,
    ),
  );
}
