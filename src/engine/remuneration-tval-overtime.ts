import type { SupplementPosition } from "@/domain/remuneration-supplement";
import type { TvalTrainingPayContext } from "./remuneration-tval-context";
import { roundRemunerationCents } from "./remuneration-money";

/** Confirmed cash-payable overtime, not eligibility, a time balance or time-off conversion. */
export function calculateTvalOvertime(
  position: SupplementPosition,
  context: TvalTrainingPayContext,
): readonly SupplementPosition[] {
  const policy = context.rulePackage.rules.tvalOvertimePolicy;
  if (
    !policy ||
    context.rulePackage.rules.selection?.capabilities.overtime !== "SUPPORTED" ||
    context.fullTimeWeeklyMinutes <= 0
  )
    return [
      {
        ...position,
        status: "unavailable",
        amountCents: null,
        issue: {
          code: "OVERTIME_RULE_MISSING",
          message: "Die TVA-L-Pflege-Überstundenregel oder ihre Stundenbasis fehlt.",
        },
      },
    ];
  // The table and working week are both full-time, even with part-time training.
  // Round the hourly amount, then the hourly premium, then each payable line (§ 24 TV-L).
  const hourly = roundRemunerationCents(
    context.monthlyCents * 60000,
    context.fullTimeWeeklyMinutes * policy.monthlyFactorThousandths,
  );
  const premium = roundRemunerationCents(hourly * policy.percentageBasisPoints, 10000);
  return [
    {
      ...position,
      label: "TVA-L-Überstunden · Grundvergütung",
      status: "estimated",
      amountCents: roundRemunerationCents(hourly * position.basis.minutes, 60),
      basis: { ...position.basis, ruleId: "tval-overtime-base", rateCents: hourly },
    },
    {
      ...position,
      id: position.id + ":premium",
      kind: "overtime-premium",
      label: "TVA-L-Überstundenzuschlag",
      status: "estimated",
      amountCents: roundRemunerationCents(premium * position.basis.minutes, 60),
      basis: {
        ...position.basis,
        ruleId: "tval-overtime-premium",
        rateCents: hourly,
        percentageBasisPoints: policy.percentageBasisPoints,
      },
    },
  ];
}
