import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type {
  TimeRemunerationPosition,
  TimeRemunerationResult,
} from "@/domain/remuneration-result";
import type { ShiftEntry, UserProfile } from "@/domain/types";
import { bundledRuleResolver, RuleResolutionError, type RuleResolver } from "@/rules/rule-resolver";
import { calculateShiftTimePremiumInterval, PremiumRuleDataError } from "./pay";
import { remunerationMonthShifts, remunerationShiftDays } from "./remuneration-shift-days";
import { roundRemunerationCents } from "./remuneration-base";
import { remunerationMonthStart, resolveRemunerationContext } from "./remuneration-context";
import { calculateOwnShiftDayPremiums } from "./remuneration-own-premiums";
import {
  bindRemunerationTariffResolver,
  remunerationTariffProfile,
} from "./remuneration-tariff-adapter";

function summarize(
  rawPositions: readonly TimeRemunerationPosition[],
  netMinutes: number,
): TimeRemunerationResult {
  // Midnight alone must not introduce another rounding step. A new month,
  // profile, tariff version or rate remains a separate accounting component.
  const grouped = new Map<string, TimeRemunerationPosition>();
  for (const position of rawPositions) {
    const { ruleId, hourlyRateCents, percentageBasisPoints, roundedPremiumHourlyCents } =
      position.basis;
    const key =
      position.amountCents === null || ruleId === null
        ? position.id
        : JSON.stringify([
            position.shiftId,
            position.from.slice(0, 7),
            position.source,
            ruleId,
            hourlyRateCents,
            percentageBasisPoints,
            roundedPremiumHourlyCents,
            position.status,
            position.basis.pauseMethod,
          ]);
    const previous = grouped.get(key);
    if (!previous || (hourlyRateCents === null && percentageBasisPoints !== 0)) {
      grouped.set(key, position);
      continue;
    }
    const minutes = previous.basis.minutes + position.basis.minutes;
    grouped.set(key, {
      ...previous,
      through: position.through,
      untilEpochMinutes: position.untilEpochMinutes,
      amountCents: roundRemunerationCents(
        (roundedPremiumHourlyCents == null
          ? (hourlyRateCents ?? 0) * (percentageBasisPoints ?? 10000)
          : roundedPremiumHourlyCents * 10000) * minutes,
        60 * 10_000,
      ),
      basis: { ...previous.basis, minutes },
    });
  }
  const positions = [...grouped.values()];
  const complete = positions.every((position) => position.amountCents !== null);
  const knownSubtotalCents = positions.reduce(
    (sum, position) => sum + (position.amountCents ?? 0),
    0,
  );
  return {
    positions,
    netMinutes,
    complete,
    totalCents: complete ? knownSubtotalCents : null,
    knownSubtotalCents,
    status: !complete
      ? "unavailable"
      : positions.some((position) => position.status === "estimated")
        ? "estimated"
        : "calculated",
  };
}

/** The caller supplies the original whole shift, never a fabricated split shift. */
export function calculateDatedShiftTimePremiums(
  shift: ShiftEntry,
  workProfile: UserProfile,
  history: readonly DatedRemunerationProfile[],
  resolver: RuleResolver = bundledRuleResolver,
  includedMonth?: string,
): TimeRemunerationResult {
  if (includedMonth !== undefined) remunerationMonthStart(includedMonth);
  const positions: TimeRemunerationPosition[] = [];
  let netMinutes = 0;
  for (const day of remunerationShiftDays(shift, workProfile.timeZone)) {
    const {
      date,
      fromEpochMinutes: from,
      untilEpochMinutes: until,
      netMinutes: minutes,
      estimatedPause,
    } = day;
    if ((includedMonth === undefined || date.startsWith(includedMonth + "-")) && minutes > 0) {
      netMinutes += minutes;
      const context = resolveRemunerationContext(date, history, resolver);
      const base: TimeRemunerationPosition = {
        id: shift.id + ":" + from,
        kind: "time-premium",
        label: "Zeitzuschläge",
        from: date,
        through: date,
        fromEpochMinutes: from,
        untilEpochMinutes: until,
        shiftId: shift.id,
        source: context.source,
        status: estimatedPause ? "estimated" : "calculated",
        amountCents: 0,
        issue: null,
        basis: {
          ruleId: null,
          minutes,
          hourlyRateCents: null,
          percentageBasisPoints: null,
          pauseMethod: estimatedPause ? "centered-duration-estimate" : "none",
        },
      };
      if (context.kind === "unavailable")
        positions.push({ ...base, status: "unavailable", amountCents: null, issue: context.issue });
      else if (context.kind === "own-configured")
        positions.push(
          ...calculateOwnShiftDayPremiums(
            base,
            day,
            shift,
            workProfile,
            context.configuration,
            resolver,
          ),
        );
      else if (context.kind === "own-monthly")
        positions.push({
          ...base,
          status: "unavailable",
          amountCents: null,
          issue: {
            code: "OWN_PREMIUMS_UNCONFIGURED",
            message: "Für die eigene Vergütung sind noch keine Zuschlagsparameter bestätigt.",
          },
        });
      else {
        try {
          if (
            !context.rulePackage.rules.premiumRules.some((rule) => rule.premiumType !== "OVERTIME")
          )
            throw new PremiumRuleDataError();
          const result = calculateShiftTimePremiumInterval(
            shift,
            remunerationTariffProfile(workProfile, context),
            bindRemunerationTariffResolver(resolver, context.rulePackage.packageId),
            {
              from: day.from,
              until: day.until,
              date,
            },
          );
          if (result.premiumLines.length === 0)
            positions.push({ ...base, label: "Keine Zeitzuschläge in diesem Abschnitt" });
          for (const line of result.premiumLines)
            positions.push({
              ...base,
              id: base.id + ":" + line.ruleId,
              label: line.label,
              amountCents: Math.round(line.amount * 100),
              basis: {
                ...base.basis,
                ruleId: line.ruleId ?? null,
                minutes: line.minutes,
                hourlyRateCents: Math.round(line.hourlyRate * 100),
                percentageBasisPoints: Math.round(line.percentage * 100),
              },
            });
        } catch (error) {
          if (error instanceof PremiumRuleDataError)
            positions.push({
              ...base,
              status: "unavailable",
              amountCents: null,
              issue: { code: "PREMIUM_RATE_MISSING", message: error.message },
            });
          else if (error instanceof RuleResolutionError && error.failure.kind === "HOLIDAY")
            positions.push({
              ...base,
              status: "unavailable",
              amountCents: null,
              issue: {
                code: "HOLIDAY_RULES_UNAVAILABLE",
                message: "Die Feiertagsregeln sind für diesen Abschnitt nicht verfügbar.",
              },
            });
          else throw error;
        }
      }
    }
  }
  return summarize(positions, netMinutes);
}

export function calculateMonthlyTimeRemuneration(
  month: string,
  shifts: readonly ShiftEntry[],
  workProfile: UserProfile,
  history: readonly DatedRemunerationProfile[],
  resolver: RuleResolver = bundledRuleResolver,
): TimeRemunerationResult {
  const results = remunerationMonthShifts(month, shifts).map((shift) =>
    calculateDatedShiftTimePremiums(shift, workProfile, history, resolver, month),
  );
  return summarize(
    results.flatMap((result) => result.positions),
    results.reduce((sum, result) => sum + result.netMinutes, 0),
  );
}
