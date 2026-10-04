import { Temporal } from "@js-temporal/polyfill";
import type { SupplementPosition } from "@/domain/remuneration-supplement";
import type { TvlAllowanceDay } from "./remuneration-tvl-allowances";
import { roundRemunerationCents } from "./remuneration-money";
import type { TvlBurnCareResult } from "./remuneration-tvl-burn";

type Component = "nursing" | "instructor" | "clinical" | "leadership" | "function";
const labels: Record<Component, string> = {
  nursing: "TV-L-Pflegezulage",
  instructor: "TV-L-Praxisanleitung",
  clinical: "TV-L-Tätigkeitszulage",
  leadership: "TV-L-Leitungszulage",
  function: "TV-L-Funktions-/Stationsleitungszulage",
};

function rateFor(
  day: TvlAllowanceDay,
  component: Component,
  burnUnclear: boolean,
  burnPositive: boolean,
): number | null {
  const { context } = day;
  const p = context.rulePackage.rules.tvlCareAllowancePolicy;
  const facts = context.careAllowances;
  if (!p || !facts) return null;
  const group = Number(context.groupId.slice(2));
  if (component === "function") {
    if (facts.functionDuty === "NONE" || facts.paidEntitlement === false) return 0;
    if (facts.functionDuty == null || facts.paidEntitlement !== true) return null;
    if (facts.functionDuty === "LEADERSHIP" && group < 9) return null;
    // Section 43 no. 8: do not add the smaller amount to a competing clinical allowance.
    // An unresolved burn-care offset makes that competing payment unknown as well.
    const clinical = rateFor(day, "clinical", burnUnclear, burnPositive);
    if (clinical === null) return null;
    if (clinical > 0 && burnPositive) return null; // Concurrent §43 entitlement after offset requires fachliche clarification.
    return clinical > 0 ? 0 : (p.functionMonthlyCents ?? null);
  }
  if (component === "nursing") {
    if (facts.nursing === false || facts.paidEntitlement === false) return 0;
    return facts.nursing && facts.paidEntitlement ? p.nursingMonthlyCents : null;
  }
  if (component === "instructor") {
    if (facts.instructor === false || facts.paidEntitlement === false) return 0;
    // Part IV section 1 PE3 is attached to the relevant KR5–9 activities.
    if (group < 5 || group > 9) return null;
    return facts.instructor && facts.paidEntitlement ? p.instructorMonthlyCents : null;
  }
  if (component === "leadership") {
    if (facts.leadershipAnnexFNumber === "NONE" || facts.paidEntitlement === false) return 0;
    if (facts.paidEntitlement !== true || facts.leadershipAnnexFNumber === null || group < 9)
      return null;
    return (
      p.leadershipTiers.find((tier) => tier.annexFNumber === facts.leadershipAnnexFNumber)
        ?.monthlyCents ?? null
    );
  }
  if (facts.clinical === "NONE" || facts.paidEntitlement === false) return 0;
  if (facts.clinical === null || facts.paidEntitlement !== true || burnUnclear) return null;
  const leader = facts.clinical.startsWith("LEADER");
  if (leader ? group < 9 || group > 15 : group < 5 || group > 9) return null;
  return facts.clinical.endsWith("HIGHER")
    ? p.clinicalHigherMonthlyCents
    : p.clinicalLowerMonthlyCents;
}

/** Monthly activity offsets are applied once, after part-time and dated-period calculation. */
export function calculateTvlCareAllowances(
  days: readonly TvlAllowanceDay[],
  burn: TvlBurnCareResult,
): SupplementPosition[] {
  const result: SupplementPosition[] = [];
  // An offset in the same month can affect a different dated profile interval.
  const burnUnclear = burn.totalCents === null;
  for (const component of Object.keys(labels) as Component[]) {
    let previousKey: string | null = null;
    for (const day of days) {
      const { context, date } = day;
      const policy = context.rulePackage.rules.tvlCareAllowancePolicy;
      if (!policy) {
        previousKey = null;
        continue;
      }
      const plain = Temporal.PlainDate.from(date);
      const rate = rateFor(day, component, burnUnclear, (burn.totalCents ?? 0) > 0);
      const personal =
        rate === null
          ? null
          : roundRemunerationCents(rate * context.weeklyMinutes, context.fullTimeWeeklyMinutes);
      const key = JSON.stringify([
        component,
        date.slice(0, 7),
        context.source,
        context.groupId,
        context.weeklyMinutes,
        context.fullTimeWeeklyMinutes,
        context.careAllowances,
        policy,
        rate,
      ]);
      const previous = result.at(-1);
      if (
        previous &&
        previousKey === key &&
        previous.through === plain.subtract({ days: 1 }).toString()
      ) {
        result[result.length - 1] = {
          ...previous,
          through: date,
          basis: { ...previous.basis, calendarDays: previous.basis.calendarDays + 1 },
        };
        continue;
      }
      previousKey = key;
      result.push({
        id: "tvl-care:" + component + ":" + date,
        kind: "allowance",
        label: labels[component],
        from: date,
        through: date,
        amountCents: rate === null ? null : 0,
        status: rate === null ? "unavailable" : rate === 0 ? "calculated" : "estimated",
        source: {
          ...context.source,
          references: context.source.references.filter((source) =>
            policy.sourceIds.includes(source.id),
          ),
        },
        issue:
          rate !== null
            ? null
            : {
                code: "ALLOWANCE_DECISION_MISSING",
                message:
                  component === "clinical" && burnUnclear
                    ? "Schwerbrandpflegezeiten oder Anspruch bitte klären; die monatliche Anrechnung auf die Tätigkeitszulage ist noch unbestimmt."
                    : component === "function" && (burn.totalCents ?? 0) > 0
                      ? "Zusammentreffen von Funktionszulage, Tätigkeitszulage und Schwerbrandpflege bitte fachlich klären."
                      : "Bitte die persönlichen Voraussetzungen, Entgeltanspruch und passende Tätigkeits-/Gruppenzuordnung im datierten Vergütungsprofil bestätigen.",
              },
        basis: {
          ruleId: component === "function" ? "tvl-section-43:8" : "tvl-part-iv:" + component,
          shiftId: null,
          allowanceType: "care",
          rateCents: rate,
          personalMonthlyCents: personal,
          percentageBasisPoints: null,
          minutes: 0,
          calendarDays: 1,
          monthDays: plain.daysInMonth,
          entitlement: null,
          pauseMethod: "none",
          proration: "calendar-days",
        },
      });
    }
  }
  const finished: SupplementPosition[] = result.map((position) => ({
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
        position.basis.calendarDays === position.basis.monthDays ? "none" : "calendar-days",
    },
  }));
  const clinical = finished.filter((position) => position.basis.ruleId === "tvl-part-iv:clinical");
  const clinicalUnknown = clinical.some((position) => position.amountCents === null);
  const clinicalTotal = clinical.reduce((sum, position) => sum + (position.amountCents ?? 0), 0);
  const burnAmount = burn.totalCents ?? 0;
  // Do not report an unoffset partial monthly claim as a known payable amount.
  if (clinicalUnknown && burnAmount > 0) {
    for (let i = 0; i < finished.length; i++) {
      const position = finished[i];
      if (position.basis.ruleId === "tvl-part-iv:clinical" && (position.amountCents ?? 0) > 0)
        finished[i] = {
          ...position,
          amountCents: null,
          status: "unavailable",
          issue: {
            code: "ALLOWANCE_DECISION_MISSING",
            message:
              "Die Tätigkeitszulage ist nicht für den ganzen Monat geklärt; ihre Schwerbrandpflege-Anrechnung bleibt offen.",
          },
        };
    }
  }
  const offset = !clinicalUnknown && burnAmount > 0 ? Math.min(clinicalTotal, burnAmount) : 0;
  const offsetPosition: SupplementPosition[] =
    offset > 0
      ? [
          {
            ...burn.positions[0],
            id: "tvl-care:burn-offset:" + days[0].date.slice(0, 7),
            label: "Anrechnung Schwerbrandpflege auf Tätigkeitszulage",
            amountCents: -offset,
            status: "estimated",
            issue: null,
            basis: {
              ...burn.positions[0].basis,
              ruleId: "tvl-part-iv:burn-month-offset",
              rateCents: null,
              personalMonthlyCents: null,
              proration: "none",
            },
          },
        ]
      : [];
  return [...finished, ...burn.positions, ...offsetPosition];
}
