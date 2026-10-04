import { Temporal } from "@js-temporal/polyfill";
import type { SupplementPosition } from "@/domain/remuneration-supplement";
import type { TvalAllowanceDay } from "./remuneration-tval-allowances";
import type { TvlBurnCareResult } from "./remuneration-tvl-burn";
import { roundRemunerationCents } from "./remuneration-money";

/** TVA-L §8(5a): one clinical claim, half employee rate, then personal/calendar share. */
export function calculateTvalCareAllowances(
  days: readonly TvalAllowanceDay[],
  burn: TvlBurnCareResult,
): SupplementPosition[] {
  if (!days.length) return [];
  const positions: SupplementPosition[] = [];
  let previousKey: string | null = null;
  for (const { date, context } of days) {
    const plain = Temporal.PlainDate.from(date);
    const policy = context.rulePackage.rules.tvalCareAllowancePolicy;
    const facts = context.careAllowances;
    const valid =
      policy &&
      context.rulePackage.validFrom <= date &&
      (context.rulePackage.validTo === null || date <= context.rulePackage.validTo);
    const noClaim = facts?.clinical === "NONE" || facts?.paidEntitlement === false;
    const employee = !valid
      ? null
      : noClaim
        ? 0
        : facts?.paidEntitlement !== true || facts.clinical === null || burn.totalCents === null
          ? null
          : facts.clinical === "HIGHER"
            ? policy.clinicalHigherMonthlyCents
            : policy.clinicalLowerMonthlyCents;
    const trainingRate =
      employee === null ? null : roundRemunerationCents(employee * policy!.shareBasisPoints, 10000);
    const personal =
      trainingRate === null
        ? null
        : roundRemunerationCents(
            trainingRate * context.weeklyMinutes,
            context.fullTimeWeeklyMinutes,
          );
    const issue: SupplementPosition["issue"] = !valid
      ? {
          code: "ALLOWANCE_RULE_MISSING",
          message: "Die datierte TVA-L-Tätigkeitszulagenregel fehlt.",
        }
      : employee === null
        ? {
            code: "ALLOWANCE_DECISION_MISSING",
            message:
              burn.totalCents === null
                ? "Schwerbrandpflegeanspruch und tatsächliche Zeiten bitte klären; die monatliche Anrechnung ist offen."
                : "Bitte Entgeltanspruch und qualifizierende TVA-L-Tätigkeit im datierten Profil bestätigen.",
          }
        : null;
    const key = JSON.stringify([
      date.slice(0, 7),
      context.source,
      policy,
      facts,
      personal,
      employee,
      issue,
    ]);
    const previous = positions.at(-1);
    if (
      previous &&
      previousKey === key &&
      previous.through === plain.subtract({ days: 1 }).toString()
    ) {
      positions[positions.length - 1] = {
        ...previous,
        through: date,
        basis: { ...previous.basis, calendarDays: previous.basis.calendarDays + 1 },
      };
      continue;
    }
    previousKey = key;
    positions.push({
      id: "tval-care:clinical:" + date,
      kind: "allowance",
      label: "TVA-L-Tätigkeitszulage · Ausbildungsanteil",
      from: date,
      through: date,
      amountCents: personal === null ? null : 0,
      status: issue ? "unavailable" : noClaim ? "calculated" : "estimated",
      issue,
      source: {
        ...context.source,
        references: context.source.references.filter((reference) =>
          policy?.sourceIds.includes(reference.id),
        ),
      },
      basis: {
        ruleId: "tval-part-iv:clinical",
        shiftId: null,
        allowanceType: "care",
        rateCents: employee,
        personalMonthlyCents: personal,
        percentageBasisPoints: policy?.shareBasisPoints ?? null,
        minutes: 0,
        calendarDays: 1,
        monthDays: plain.daysInMonth,
        entitlement: null,
        pauseMethod: "none",
        proration: "calendar-days",
      },
    });
  }
  const finished = positions.map((position) => ({
    ...position,
    amountCents:
      position.basis.personalMonthlyCents === null
        ? null
        : roundRemunerationCents(
            position.basis.personalMonthlyCents * position.basis.calendarDays,
            position.basis.monthDays,
          ),
    basis: {
      ...position.basis,
      proration:
        position.basis.calendarDays === position.basis.monthDays
          ? ("none" as const)
          : ("calendar-days" as const),
    },
  }));
  const unknown = finished.some((position) => position.amountCents === null);
  const burnAmount = burn.totalCents ?? 0;
  if (unknown && burnAmount > 0) {
    for (let i = 0; i < finished.length; i++) {
      if ((finished[i].amountCents ?? 0) > 0)
        finished[i] = {
          ...finished[i],
          amountCents: null,
          status: "unavailable",
          issue: {
            code: "ALLOWANCE_DECISION_MISSING",
            message:
              "Monatliche Tätigkeitszulage nicht vollständig geklärt; Schwerbrandpflege-Anrechnung bleibt offen.",
          },
        };
    }
  }
  const offset = unknown
    ? 0
    : Math.min(
        burnAmount,
        finished.reduce((sum, position) => sum + (position.amountCents ?? 0), 0),
      );
  const offsetPositions: SupplementPosition[] =
    offset > 0
      ? [
          {
            ...finished[0],
            source: burn.positions[0]?.source ?? finished[0].source,
            id: "tval-care:burn-offset:" + days[0].date.slice(0, 7),
            label: "Anrechnung Schwerbrandpflege auf TVA-L-Tätigkeitszulage",
            from: days[0].date,
            through: days.at(-1)!.date,
            amountCents: -offset,
            status: "estimated",
            issue: null,
            basis: {
              ...finished[0].basis,
              ruleId: "tval-part-iv:burn-month-offset",
              rateCents: null,
              personalMonthlyCents: null,
              calendarDays: days.length,
              proration: "none",
            },
          },
        ]
      : [];
  return [...finished, ...burn.positions, ...offsetPositions];
}
