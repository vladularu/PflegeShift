import type { SupplementPosition } from "@/domain/remuneration-supplement";
import type { TvlKrPayContext } from "./remuneration-tvl-context";
import { roundRemunerationCents } from "./remuneration-money";

/** Confirmed cash-payable minutes only; this is not an eligibility or worktime-balance check. */
export function calculateTvlOvertime(
  position: SupplementPosition,
  context: TvlKrPayContext,
): readonly SupplementPosition[] {
  const { rules } = context.rulePackage;
  const policy = rules.tvlOvertimePolicy;
  const entries =
    rules.payTables.find((table) => table.id === rules.selector.payTableId)?.entries ?? [];
  const capped = entries.filter(
    (entry) => entry.groupId === context.groupId && entry.stepId === policy?.maximumBaseStepId,
  );
  const reference = entries.filter(
    (entry) => entry.groupId === context.groupId && entry.stepId === policy?.premiumReferenceStepId,
  );
  const groupRates = policy?.groupRates.filter((rate) => rate.groupId === context.groupId);
  if (
    !policy ||
    rules.selection?.capabilities.overtime !== "SUPPORTED" ||
    capped.length !== 1 ||
    reference.length !== 1 ||
    groupRates?.length !== 1 ||
    context.fullTimeWeeklyMinutes <= 0
  ) {
    return [
      {
        ...position,
        status: "unavailable",
        amountCents: null,
        issue: {
          code: "OVERTIME_RULE_MISSING",
          message:
            "Die TV-L/KR-Überstundenregel oder ihre Stundenbasis fehlt bzw. ist nicht eindeutig.",
        },
      },
    ];
  }
  // Full-time table values and full-time working week even for part-time employees (§ 24).
  const hourly = (monthlyCents: number) =>
    roundRemunerationCents(
      monthlyCents * 60000,
      context.fullTimeWeeklyMinutes * policy.monthlyFactorThousandths,
    );
  const baseRate = hourly(Math.min(context.monthlyCents, capped[0].monthlyCents));
  const referenceRate = hourly(reference[0].monthlyCents);
  const percentage = groupRates[0].percentageBasisPoints;
  const premiumRate = roundRemunerationCents(referenceRate * percentage, 10000);
  return [
    {
      ...position,
      label: "TV-L-Überstunden · Grundvergütung",
      status: "estimated",
      amountCents: roundRemunerationCents(baseRate * position.basis.minutes, 60),
      basis: { ...position.basis, ruleId: "tvl-overtime-base", rateCents: baseRate },
    },
    {
      ...position,
      id: position.id + ":premium",
      kind: "overtime-premium",
      label: "TV-L-Überstundenzuschlag",
      status: "estimated",
      amountCents: roundRemunerationCents(premiumRate * position.basis.minutes, 60),
      basis: {
        ...position.basis,
        ruleId: "tvl-overtime-premium",
        rateCents: referenceRate,
        percentageBasisPoints: percentage,
      },
    },
  ];
}
