import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import {
  isCurrentTvoedSueMonthConfirmation,
  type SavedTvoedSueMonthConfirmation,
} from "@/domain/saved-tvoed-sue-month-confirmation";
import { bundledRuleResolver, type RuleResolver } from "@/rules/rule-resolver";
import type { TvoedSueMonthConfirmation } from "./remuneration-base";
import { resolveRemunerationMonth } from "./remuneration-context";

/** Never reuse a stale answer after a profile, rule, or within-month tariff change. */
export function resolveSavedTvoedSueMonthConfirmation(
  month: string,
  history: readonly DatedRemunerationProfile[],
  saved: readonly SavedTvoedSueMonthConfirmation[],
  resolver: RuleResolver = bundledRuleResolver,
): TvoedSueMonthConfirmation | undefined {
  const answer = saved.find((item) => item.month === month);
  if (!answer) return undefined;
  const period = resolveRemunerationMonth(month, history, resolver);
  if (period.length !== 1 || period[0].context.kind !== "tvoed-sue-draft") return undefined;
  const context = period[0].context;
  if (context.profile === null || context.source.versionId === null) return undefined;
  if (!isCurrentTvoedSueMonthConfirmation(answer, context.profile, context.source.versionId))
    return undefined;
  return Object.freeze({
    month,
    tariffApplicabilityConfirmed: answer.tariffApplicabilityConfirmed === true,
    sueClassificationConfirmed: answer.sueClassificationConfirmed === true,
    standardFullTimeConfirmed: answer.standardFullTimeConfirmed === true,
    fullMonthBaseEntitlementConfirmed: answer.fullMonthBaseEntitlementConfirmed === true,
    fullMonthSameContractConfirmed: answer.fullMonthSameContractConfirmed === true,
  });
}
