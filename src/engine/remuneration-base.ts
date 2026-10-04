import { Temporal } from "@js-temporal/polyfill";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type {
  MonthlyBaseRemuneration,
  BaseRemunerationPosition as RemunerationPosition,
} from "@/domain/remuneration-result";
import { bundledRuleResolver, type RuleResolver } from "@/rules/rule-resolver";
import { calculateOwnHourlyPeriod, type OwnHourlyInput } from "./remuneration-own-hourly";
import { roundRemunerationCents } from "./remuneration-money";
import { calculateTvoedSueDraftBase, type TvoedSueDraftBaseInput } from "./tvoed-sue-draft-base";
import {
  calculateTvoedAnnexADraftBase,
  type TvoedAnnexADraftBaseInput,
} from "./tvoed-annex-a-draft-base";

import {
  remunerationMonthStart,
  resolveRemunerationMonth,
  type RemunerationPeriod,
} from "./remuneration-context";

export { roundRemunerationCents } from "./remuneration-money";

/** Confirmation is for exactly one cash month; it is never inferred from a dated profile. */
export type TvoedAnnexAMonthConfirmation = Pick<
  TvoedAnnexADraftBaseInput,
  | "applicabilityConfirmed"
  | "comparableFullTimeConfirmed"
  | "fullMonthBaseEntitlementConfirmed"
  | "fullMonthSameContractConfirmed"
> & { readonly month: string };

export type TvoedSueMonthConfirmation = Pick<
  TvoedSueDraftBaseInput,
  | "tariffApplicabilityConfirmed"
  | "sueClassificationConfirmed"
  | "standardFullTimeConfirmed"
  | "fullMonthBaseEntitlementConfirmed"
  | "fullMonthSameContractConfirmed"
> & { readonly month: string };

function basePosition(
  period: RemunerationPeriod,
  monthDays: number,
  annexAConfirmation?: TvoedAnnexAMonthConfirmation,
  sueConfirmation?: TvoedSueMonthConfirmation,
): RemunerationPosition {
  const { from, through, context } = period;
  const calendarDays = Temporal.PlainDate.from(from).until(through).days + 1;
  const base = {
    id: "base:" + from,
    kind: "base" as const,
    label: "Grundvergütung",
    from,
    through,
    source: context.source,
    basis: {
      fullTimeMonthlyCents: null,
      personalMonthlyCents: null,
      weeklyMinutes: null,
      fullTimeWeeklyMinutes: null,
      calendarDays,
      monthDays,
      proration: "unconfirmed" as const,
    },
  };
  if (context.kind === "unavailable")
    return { ...base, status: "unavailable", amountCents: null, issue: context.issue };
  if (context.kind === "tvoed-annex-a-draft") {
    const entireMonth = calendarDays === monthDays && from.endsWith("-01");
    if (!entireMonth || annexAConfirmation?.month !== from.slice(0, 7))
      return {
        ...base,
        label: "Tabellenentgelt (Entwurf)",
        status: "unavailable",
        amountCents: null,
        issue: {
          code: "TARIFF_UNSUPPORTED",
          message:
            "Für das TVöD-Tabellenentgelt fehlen eine vollständige Monatsperiode oder ausdrücklich bestätigte Monatsangaben.",
        },
      };
    const result = calculateTvoedAnnexADraftBase({
      pkg: context.rulePackage,
      date: from,
      variantId: context.variant,
      groupId: context.groupId,
      stepId: context.stepId,
      contractedWeeklyMinutes: context.weeklyMinutes,
      comparableFullTimeWeeklyMinutes: context.fullTimeWeeklyMinutes,
      ...annexAConfirmation,
    });
    if (result.kind === "unavailable")
      return {
        ...base,
        label: "Tabellenentgelt (Entwurf)",
        status: "unavailable",
        amountCents: null,
        issue: {
          code: "TARIFF_UNSUPPORTED",
          message: `Das TVöD-Tabellenentgelt kann noch nicht bestimmt werden: ${result.reason}.`,
        },
      };
    return {
      ...base,
      label: "Tabellenentgelt (Entwurf)",
      status: "estimated",
      amountCents: result.personalTableBaseCents,
      basis: {
        ...base.basis,
        fullTimeMonthlyCents: result.fullTimeTableCents,
        personalMonthlyCents: result.personalTableBaseCents,
        weeklyMinutes: context.weeklyMinutes,
        fullTimeWeeklyMinutes: context.fullTimeWeeklyMinutes,
        proration: "none",
      },
      issue: null,
    };
  }
  if (context.kind === "tvoed-sue-draft") {
    const entireMonth = calendarDays === monthDays && from.endsWith("-01");
    if (!entireMonth || sueConfirmation?.month !== from.slice(0, 7))
      return {
        ...base,
        label: "SuE-Tabellenentgelt (Entwurf)",
        status: "unavailable",
        amountCents: null,
        issue: {
          code: "TARIFF_UNSUPPORTED",
          message:
            "Für das SuE-Tabellenentgelt fehlen ein vollständiger Monat oder bestätigte Angaben.",
        },
      };
    const result = calculateTvoedSueDraftBase({
      pkg: context.rulePackage,
      groupId: context.groupId,
      stepId: context.stepId,
      contractedWeeklyMinutes: context.weeklyMinutes,
      ...sueConfirmation,
    });
    if (result.kind === "unavailable")
      return {
        ...base,
        label: "SuE-Tabellenentgelt (Entwurf)",
        status: "unavailable",
        amountCents: null,
        issue: {
          code: "TARIFF_UNSUPPORTED",
          message: `Das SuE-Tabellenentgelt kann noch nicht bestimmt werden: ${result.reason}.`,
        },
      };
    return {
      ...base,
      label: "SuE-Tabellenentgelt (Entwurf)",
      status: "estimated",
      amountCents: result.personalTableBaseCents,
      basis: {
        ...base.basis,
        fullTimeMonthlyCents: result.fullTimeTableCents,
        personalMonthlyCents: result.personalTableBaseCents,
        weeklyMinutes: context.weeklyMinutes,
        fullTimeWeeklyMinutes: context.fullTimeWeeklyMinutes,
        proration: "none",
      },
      issue: null,
    };
  }
  if (context.kind === "own-configured") {
    const configured = context.configuration.base;
    if (configured.kind === "hourly")
      throw new Error("Stundenlohn benötigt den zeitbezogenen Berechnungspfad.");
    const fullMonth = calendarDays === monthDays;
    const confirmed = fullMonth || configured.partialMonth === "calendar-days";
    return {
      ...base,
      status: confirmed ? "calculated" : "unavailable",
      amountCents: confirmed
        ? roundRemunerationCents(configured.personalCents * calendarDays, monthDays)
        : null,
      basis: {
        ...base.basis,
        personalMonthlyCents: configured.personalCents,
        weeklyMinutes: context.weeklyMinutes,
        proration: fullMonth ? "none" : configured.partialMonth,
      },
      issue: confirmed
        ? null
        : {
            code: "OWN_PRORATION_UNCONFIRMED",
            message: "Bitte die Teilmonatsberechnung der eigenen Grundvergütung bestätigen.",
          },
    };
  }
  if (context.kind === "own-monthly") {
    const completeMonth = calendarDays === monthDays;
    return {
      ...base,
      status: completeMonth ? "calculated" : "unavailable",
      amountCents: completeMonth ? context.monthlyCents : null,
      basis: {
        ...base.basis,
        personalMonthlyCents: context.monthlyCents,
        weeklyMinutes: context.weeklyMinutes,
        proration: completeMonth ? "none" : "unconfirmed",
      },
      issue: completeMonth
        ? null
        : {
            code: "OWN_PRORATION_UNCONFIRMED",
            message:
              "Für einen Teilmonat muss die Berechnungsbasis der eigenen Vergütung bestätigt werden.",
          },
    };
  }
  const personalMonthlyCents = roundRemunerationCents(
    context.monthlyCents * context.weeklyMinutes,
    context.fullTimeWeeklyMinutes,
  );
  return {
    ...base,
    label:
      context.kind === "training-tariff"
        ? "Ausbildungsentgelt · " +
          context.trainingYear +
          ". Ausbildungsjahr · " +
          context.categoryLabel
        : context.kind === "tval-training"
          ? "Ausbildungsentgelt · " + context.periodLabel + " · " + context.categoryLabel
          : base.label,
    status:
      (context.kind === "training-tariff" || context.kind === "tval-training") &&
      (context.weeklyMinutes !== context.fullTimeWeeklyMinutes || calendarDays !== monthDays)
        ? "estimated"
        : "calculated",
    amountCents: roundRemunerationCents(personalMonthlyCents * calendarDays, monthDays),
    basis: {
      ...base.basis,
      fullTimeMonthlyCents: context.monthlyCents,
      personalMonthlyCents,
      weeklyMinutes: context.weeklyMinutes,
      fullTimeWeeklyMinutes: context.fullTimeWeeklyMinutes,
      proration: calendarDays === monthDays ? "none" : "calendar-days",
    },
    issue: null,
  };
}

export function calculateMonthlyBaseRemuneration(
  month: string,
  history: readonly DatedRemunerationProfile[],
  resolver: RuleResolver = bundledRuleResolver,
  hourlyInput?: OwnHourlyInput,
  annexAConfirmation?: TvoedAnnexAMonthConfirmation,
  sueConfirmation?: TvoedSueMonthConfirmation,
): MonthlyBaseRemuneration {
  const monthDays = remunerationMonthStart(month).daysInMonth;
  const positions = resolveRemunerationMonth(month, history, resolver).flatMap((period) =>
    period.context.kind === "own-configured" && period.context.configuration.base.kind === "hourly"
      ? calculateOwnHourlyPeriod(period, monthDays, hourlyInput)
      : [basePosition(period, monthDays, annexAConfirmation, sueConfirmation)],
  );
  const complete = positions.every((position) => position.status !== "unavailable");
  const knownSubtotalCents = positions.reduce(
    (sum, position) => sum + (position.amountCents ?? 0),
    0,
  );
  return {
    month,
    positions,
    complete,
    status: !complete
      ? "unavailable"
      : positions.some((p) => p.status === "estimated")
        ? "estimated"
        : "calculated",
    totalCents: complete ? knownSubtotalCents : null,
    knownSubtotalCents,
  };
}
