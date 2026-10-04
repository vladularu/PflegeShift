import type { TimeRemunerationPosition } from "@/domain/remuneration-result";
import type { ShiftEntry, UserProfile } from "@/domain/types";
import type { RuleResolver } from "@/rules/rule-resolver";
import { PremiumRuleDataError } from "./pay";
import { countPremiumMinutes } from "./pay-premium-minutes";
import { roundRemunerationCents } from "./remuneration-money";
import type { RemunerationShiftDay } from "./remuneration-shift-days";
import type { TrainingPayContext } from "./remuneration-training-context";
import { calculateTimedShiftBounds } from "./working-time";

/** Contract 10: the selected training year supplies the individual hourly base.
 * A reduced monthly entitlement and reduced working week cancel proportionally;
 * applying the part-time factor again would reduce the same hour twice.
 */
export function calculateTrainingShiftDayPremiums(
  base: TimeRemunerationPosition,
  day: RemunerationShiftDay,
  shift: ShiftEntry,
  work: UserProfile,
  context: TrainingPayContext,
  resolver: RuleResolver,
): TimeRemunerationPosition[] {
  const { rules } = context.rulePackage;
  const factor = rules.hourlyCalculation?.monthlyFactorThousandths;
  const training = rules.trainingPay;
  if (
    rules.selection?.capabilities.timePremiums !== "SUPPORTED" ||
    !training ||
    !factor ||
    context.fullTimeWeeklyMinutes <= 0 ||
    !rules.premiumRules.some((rule) => rule.premiumType !== "OVERTIME")
  )
    throw new PremiumRuleDataError();
  const hourlyCents = roundRemunerationCents(
    context.monthlyCents * 60_000,
    context.fullTimeWeeklyMinutes * factor,
  );
  const bounds = calculateTimedShiftBounds(shift, work.timeZone);
  if (!bounds) throw new PremiumRuleDataError();
  const pause = Math.min(bounds.grossMinutes, shift.breakMinutes);
  const pauseStart = Math.floor((bounds.grossMinutes - pause) / 2);
  const buckets = countPremiumMinutes(
    shift,
    { ...work, tariff: null },
    bounds.grossMinutes,
    pauseStart,
    pauseStart + pause,
    context.rulePackage,
    resolver,
    { from: day.from, until: day.until },
  );
  const positions: TimeRemunerationPosition[] = [];
  for (const [id, minutes] of buckets.byRuleId) {
    const rule = rules.premiumRules.find((item) => item.id === id);
    if (!rule || rule.rateBasis !== "INDIVIDUAL_HOURLY" || rule.referenceStepId !== null)
      throw new PremiumRuleDataError();
    const floorApplies =
      rule.premiumType === "NIGHT" &&
      hourlyCents * rule.percentageBasisPoints < training.minimumNightHourlyCents * 10_000;
    const rate = floorApplies ? training.minimumNightHourlyCents : hourlyCents;
    const percentage = floorApplies ? null : rule.percentageBasisPoints;
    positions.push({
      ...base,
      id: base.id + ":" + id,
      label: rule.label + (floorApplies ? " · tariflicher Mindestzuschlag" : ""),
      amountCents: roundRemunerationCents(rate * minutes * (percentage ?? 10_000), 600_000),
      status: context.weeklyMinutes < context.fullTimeWeeklyMinutes ? "estimated" : base.status,
      basis: {
        ...base.basis,
        ruleId: id,
        minutes,
        hourlyRateCents: rate,
        percentageBasisPoints: percentage,
      },
    });
  }
  return positions.length
    ? positions
    : [{ ...base, label: "Keine Zeitzuschläge in diesem Abschnitt" }];
}
