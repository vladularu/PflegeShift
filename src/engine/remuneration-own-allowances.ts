import { Temporal } from "@js-temporal/polyfill";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type { SupplementPosition } from "@/domain/remuneration-supplement";
import type { RuleResolver } from "@/rules/rule-resolver";
import { roundRemunerationCents } from "./remuneration-base";
import { remunerationMonthStart, resolveRemunerationMonth } from "./remuneration-context";

/** Explicit personal amounts: neither tariff entitlement nor a second part-time factor. */
export function calculateOwnMonthlyAllowances(
  month: string,
  history: readonly DatedRemunerationProfile[],
  resolver: RuleResolver,
): readonly SupplementPosition[] {
  const first = remunerationMonthStart(month);
  if (!history.some((profile) => profile.data.selection.kind === "own-configured")) return [];
  const result: SupplementPosition[] = [];
  for (const period of resolveRemunerationMonth(month, history, resolver)) {
    const { context } = period;
    if (context.kind !== "own-configured") continue;
    const position = (
      id: string,
      label: string,
      from: string,
      through: string,
    ): SupplementPosition => ({
      id: `own-allowance:${id}:${from}`,
      kind: "allowance",
      label,
      from,
      through,
      amountCents: 0,
      status: "calculated",
      source: context.source,
      issue: null,
      basis: {
        ruleId: id,
        shiftId: null,
        allowanceType: null,
        rateCents: null,
        personalMonthlyCents: null,
        percentageBasisPoints: null,
        minutes: 0,
        calendarDays: Temporal.PlainDate.from(from).until(through).days + 1,
        monthDays: first.daysInMonth,
        entitlement: null,
        pauseMethod: "none",
        proration: "none",
      },
    });
    for (const allowance of context.configuration.fixedAllowances) {
      const from = allowance.validFrom > period.from ? allowance.validFrom : period.from;
      const through =
        allowance.validTo !== null && allowance.validTo < period.through
          ? allowance.validTo
          : period.through;
      if (from > through) continue;
      const line = position(allowance.id, allowance.title, from, through);
      const fullMonth = line.basis.calendarDays === first.daysInMonth;
      const confirmed = fullMonth || allowance.partialMonth === "calendar-days";
      result.push({
        ...line,
        status: confirmed ? "calculated" : "unavailable",
        amountCents: confirmed
          ? roundRemunerationCents(
              allowance.monthlyCents * line.basis.calendarDays,
              first.daysInMonth,
            )
          : null,
        basis: {
          ...line.basis,
          personalMonthlyCents: allowance.monthlyCents,
          proration: fullMonth ? "none" : allowance.partialMonth,
        },
        issue: confirmed
          ? null
          : {
              code: "OWN_PRORATION_UNCONFIRMED",
              message: `Bitte die Teilmonatsberechnung für „${allowance.title}“ bestätigen.`,
            },
      });
    }
  }
  return result;
}
