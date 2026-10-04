import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import {
  isCurrentTvoedAnnexAMonthConfirmation,
  type SavedTvoedAnnexAMonthConfirmation,
} from "@/domain/saved-tvoed-annex-a-month-confirmation";
import { bundledRuleResolver, type RuleResolver } from "@/rules/rule-resolver";
import type { TvoedAnnexAMonthConfirmation } from "./remuneration-base";
import { resolveRemunerationMonth } from "./remuneration-context";

/** Stale answers never become an implicit tariff entitlement in a later month or rule version. */
export function resolveSavedTvoedAnnexAMonthConfirmation(
  month: string,
  history: readonly DatedRemunerationProfile[],
  saved: readonly SavedTvoedAnnexAMonthConfirmation[],
  resolver: RuleResolver = bundledRuleResolver,
): TvoedAnnexAMonthConfirmation | undefined {
  if (!saved.some((item) => item.month === month)) return undefined;
  const period = resolveRemunerationMonth(month, history, resolver);
  if (period.length !== 1 || period[0].context.kind !== "tvoed-annex-a-draft") return undefined;
  const context = period[0].context;
  if (context.profile === null || context.source.versionId === null) return undefined;
  const answer = saved.find((item) => item.month === month);
  if (
    !answer ||
    !isCurrentTvoedAnnexAMonthConfirmation(answer, context.profile, context.source.versionId)
  )
    return undefined;
  return Object.freeze({
    month,
    applicabilityConfirmed: answer.applicabilityConfirmed === true,
    comparableFullTimeConfirmed: answer.comparableFullTimeConfirmed === true,
    fullMonthBaseEntitlementConfirmed: answer.fullMonthBaseEntitlementConfirmed === true,
    fullMonthSameContractConfirmed: answer.fullMonthSameContractConfirmed === true,
  });
}
