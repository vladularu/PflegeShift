import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import {
  isCurrentTvoedSueAllowanceConfirmation,
  type SavedTvoedSueAllowanceConfirmation,
} from "@/domain/saved-tvoed-sue-allowance-confirmation";
import type { SupplementPosition } from "@/domain/remuneration-supplement";
import { bundledRuleResolver, type RuleResolver } from "@/rules/rule-resolver";
import type { TvoedSueMonthConfirmation } from "./remuneration-base";
import { remunerationMonthStart, resolveRemunerationMonth } from "./remuneration-context";
import { calculateTvoedSueDraftAllowance } from "./tvoed-sue-draft-allowance";

/** A saved answer can add one marked partial amount, never complete the draft tariff. */
export function calculateSavedTvoedSueAllowancePosition(
  month: string,
  history: readonly DatedRemunerationProfile[],
  saved: readonly SavedTvoedSueAllowanceConfirmation[],
  baseConfirmation: TvoedSueMonthConfirmation | undefined,
  resolver: RuleResolver = bundledRuleResolver,
): SupplementPosition | null {
  const answers = saved.filter((item) => item.month === month);
  if (answers.length === 0) return null;
  const periods = resolveRemunerationMonth(month, history, resolver);
  if (periods.length !== 1 || periods[0].context.kind !== "tvoed-sue-draft") return null;
  const context = periods[0].context;
  const first = remunerationMonthStart(month);
  const position: SupplementPosition = {
    id: `allowance:tvoed-sue:${month}`,
    kind: "allowance",
    label: "SuE-Zulage (Entwurf)",
    from: periods[0].from,
    through: periods[0].through,
    amountCents: null,
    status: "unavailable",
    source: context.source,
    issue: {
      code: "TARIFF_UNSUPPORTED",
      message: "Die SuE-Zulagenbestätigung passt nicht zum aktuellen Monats- und Tarifstand.",
    },
    basis: {
      ruleId: null,
      shiftId: null,
      allowanceType: "tvoed",
      rateCents: null,
      personalMonthlyCents: null,
      percentageBasisPoints: null,
      minutes: 0,
      calendarDays: first.daysInMonth,
      monthDays: first.daysInMonth,
      entitlement: null,
      pauseMethod: "none",
      proration: "none",
    },
  };
  const answer = answers[0];
  if (
    answers.length !== 1 ||
    context.profile === null ||
    context.source.versionId === null ||
    !isCurrentTvoedSueAllowanceConfirmation(answer, context.profile, context.source.versionId) ||
    baseConfirmation?.month !== month
  )
    return position;

  const result = calculateTvoedSueDraftAllowance({
    pkg: context.rulePackage,
    groupId: context.groupId,
    stepId: context.stepId,
    contractedWeeklyMinutes: context.weeklyMinutes,
    ...baseConfirmation,
    sectionXxivClassificationConfirmed: answer.sectionXxivClassificationConfirmed === true,
    fullMonthAllowanceEntitlementConfirmed: answer.fullMonthAllowanceEntitlementConfirmed === true,
    caseGroup: answer.caseGroup ?? "UNKNOWN",
    conversionDays: answer.conversionDays ?? "UNKNOWN",
  });
  if (result.kind === "not-applicable") return null;
  if (result.kind === "unavailable")
    return {
      ...position,
      issue: {
        code: "TARIFF_UNSUPPORTED",
        message: `Die SuE-Zulage kann noch nicht bestimmt werden: ${result.reason}.`,
      },
    };
  return {
    ...position,
    amountCents: result.personalAllowanceCents,
    status: "estimated",
    issue: null,
    basis: {
      ...position.basis,
      rateCents: result.fullTimeAllowanceCents,
      personalMonthlyCents: result.personalAllowanceCents,
    },
  };
}
