import type { SupplementPosition } from "@/domain/remuneration-supplement";
import { trainingPayIssues } from "@/rules/training-pay-validation";
import { roundRemunerationCents } from "./remuneration-money";
import type { TrainingPayContext } from "./remuneration-training-context";

/** Explicit payable minutes only. Eligibility and legal permission are separate checks. */
export function calculateTrainingOvertime(
  position: SupplementPosition,
  context: TrainingPayContext,
): readonly SupplementPosition[] {
  const { rules } = context.rulePackage;
  const overtime = rules.premiumRules.filter((rule) => rule.premiumType === "OVERTIME");
  const factor = rules.hourlyCalculation?.monthlyFactorThousandths;
  if (
    rules.selection?.capabilities.overtime !== "SUPPORTED" ||
    overtime.length !== 1 ||
    trainingPayIssues(context.rulePackage).length > 0 ||
    !factor ||
    context.fullTimeWeeklyMinutes <= 0
  )
    return [
      {
        ...position,
        amountCents: null,
        status: "unavailable",
        issue: {
          code: "OVERTIME_RULE_MISSING",
          message: "Für Ausbildungsüberstunden fehlt eine eindeutige unterstützte Tarifregel.",
        },
      },
    ];
  const rule = overtime[0];
  // Full-time table pay / full-time week: a part-time reduction must not be applied twice.
  const hourlyCents = roundRemunerationCents(
    context.monthlyCents * 60_000,
    context.fullTimeWeeklyMinutes * factor,
  );
  return [
    {
      ...position,
      label: "Ausbildungsüberstunden · Grundvergütung",
      status: "estimated",
      amountCents: roundRemunerationCents(hourlyCents * position.basis.minutes, 60),
      basis: { ...position.basis, rateCents: hourlyCents },
    },
    {
      ...position,
      id: position.id + ":premium",
      kind: "overtime-premium",
      label: rule.label,
      status: "estimated",
      amountCents: roundRemunerationCents(
        hourlyCents * position.basis.minutes * rule.percentageBasisPoints,
        600_000,
      ),
      basis: {
        ...position.basis,
        ruleId: rule.id,
        rateCents: hourlyCents,
        percentageBasisPoints: rule.percentageBasisPoints,
      },
    },
  ];
}
