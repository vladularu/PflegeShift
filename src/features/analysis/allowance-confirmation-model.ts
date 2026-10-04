import { Temporal } from "@js-temporal/polyfill";
import type {
  AllowanceDecisionInput,
  MonthlyAllowanceDecisions,
} from "@/domain/allowance-decisions";
import { requireAllowanceMonth } from "@/domain/allowance-decisions";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import { requireRemunerationDate } from "@/domain/remuneration-profile";
import { ALLOWANCE_STATUSES, type AllowanceStatus } from "@/domain/types";
import { ValidationError } from "@/domain/validation";
import {
  resolveRemunerationContext,
  resolveRemunerationMonth,
} from "@/engine/remuneration-context";
import type { RuleResolver } from "@/rules/rule-resolver";
import { hasTrainingShiftAllowances } from "@/engine/remuneration-training-allowances";
import { hasTvlShiftAllowances } from "@/engine/remuneration-tvl-allowances";
import { hasTvalShiftAllowances } from "@/engine/remuneration-tval-allowances";

export const ALLOWANCE_CONFIRMATION_LABELS: Readonly<Record<AllowanceStatus, string>> = {
  NONE: "Keine Zulage",
  SHIFT_MONTHLY: "Ständige Schichtarbeit",
  SHIFT_HOURLY: "Nichtständige Schichtarbeit",
  ALTERNATING_MONTHLY: "Ständige Wechselschicht",
  ALTERNATING_HOURLY: "Nichtständige Wechselschicht",
};

export function allowanceConfirmationPeriods(
  month: string,
  history: readonly DatedRemunerationProfile[],
  resolver: RuleResolver,
) {
  return resolveRemunerationMonth(month, history, resolver).map((period) => {
    const selection = period.context.profile?.data.selection;
    return {
      from: period.from,
      through: period.through,
      available:
        period.context.kind === "tariff" ||
        (period.context.kind === "tvl-kr" && hasTvlShiftAllowances(period.context, period.from)) ||
        (period.context.kind === "tval-training" &&
          hasTvalShiftAllowances(period.context, period.from)) ||
        (period.context.kind === "training-tariff" &&
          hasTrainingShiftAllowances(period.context, period.from)),
      label:
        period.context.kind === "tariff" && selection?.kind === "tariff"
          ? `TVöD-P · ${selection.variant.replace("_", "-")} · ${selection.region === "KAV_BW" ? "KAV Baden-Württemberg" : "Übrige VKA-Tarifgebiete"} · ${selection.group}/${selection.level}`
          : period.context.kind === "unavailable"
            ? period.context.issue.message
            : period.context.kind === "training-tariff"
              ? hasTrainingShiftAllowances(period.context, period.from)
                ? `TVAöD-Pflege · ${period.context.sector.replace("_", "-")} · ${period.context.tariffRegion === "KAV_BW" ? "KAV Baden-Württemberg" : "Übrige VKA-Tarifgebiete"} · Schichtzulage bestätigen`
                : "Ausbildungsvergütung: Für diesen Zeitraum fehlen noch geprüfte Schichtzulagenregeln."
              : period.context.kind === "tvl-kr"
                ? hasTvlShiftAllowances(period.context, period.from)
                  ? "TV-L/KR · Schichtzulage ausdrücklich bestätigen; keine automatische Anspruchsermittlung."
                  : "TV-L/KR: Für diesen Zeitraum fehlen Schichtzulagenregeln."
                : period.context.kind === "tval-training"
                  ? hasTvalShiftAllowances(period.context, period.from)
                    ? "TVA-L Pflege · Schichtzulage ausdrücklich bestätigen; keine automatische Anspruchsermittlung."
                    : "TVA-L Pflege: Für diesen Zeitraum fehlen Schichtzulagenregeln."
                  : "Eigene Vergütung: keine tarifgebundene Schichtzulage.",
    };
  });
}

function identity(decision: AllowanceDecisionInput["tariff"]) {
  return JSON.stringify([decision.packageId, decision.variant, decision.region]);
}

/** Replaces only the explicitly selected inclusive dates; preserves all other days. */
export function prepareAllowanceConfirmation(input: {
  readonly month: string;
  readonly from: string;
  readonly through: string;
  readonly status: AllowanceStatus | "UNSET";
  readonly history: readonly DatedRemunerationProfile[];
  readonly current: MonthlyAllowanceDecisions;
  readonly resolver: RuleResolver;
}) {
  requireAllowanceMonth(input.month);
  const from = requireRemunerationDate(input.from);
  const through = requireRemunerationDate(input.through);
  if (
    input.current.month !== input.month ||
    from.slice(0, 7) !== input.month ||
    through.slice(0, 7) !== input.month ||
    from > through
  )
    throw new ValidationError("Bitte einen gültigen Zeitraum innerhalb dieses Monats wählen.");
  if (input.status === "UNSET" || !ALLOWANCE_STATUSES.includes(input.status))
    throw new ValidationError("Bitte die Zulagenart ausdrücklich auswählen.");
  const first = resolveRemunerationContext(from, input.history, input.resolver);
  const selection = first.profile?.data.selection;
  if (
    (first.kind !== "tariff" &&
      first.kind !== "training-tariff" &&
      !(first.kind === "tvl-kr" && hasTvlShiftAllowances(first, from)) &&
      !(first.kind === "tval-training" && hasTvalShiftAllowances(first, from))) ||
    selection?.kind !== "tariff" ||
    (first.kind === "training-tariff" && !hasTrainingShiftAllowances(first, from))
  )
    throw new ValidationError("Für diesen Zeitraum fehlt ein berechenbarer datierter Tarif.");
  const tariff = {
    packageId: selection.packageId,
    variant: selection.variant,
    region: selection.region,
  };
  for (
    let day = Temporal.PlainDate.from(from);
    day.toString() <= through;
    day = day.add({ days: 1 })
  ) {
    const context = resolveRemunerationContext(day.toString(), input.history, input.resolver);
    const candidate = context.profile?.data.selection;
    if (
      (context.kind !== "tariff" &&
        context.kind !== "training-tariff" &&
        !(context.kind === "tvl-kr" && hasTvlShiftAllowances(context, day.toString())) &&
        !(context.kind === "tval-training" && hasTvalShiftAllowances(context, day.toString()))) ||
      (context.kind === "training-tariff" &&
        !hasTrainingShiftAllowances(context, day.toString())) ||
      candidate?.kind !== "tariff" ||
      identity(candidate) !== identity(tariff)
    )
      throw new ValidationError(
        "Der Zeitraum überschreitet einen Tarifwechsel. Bitte getrennt bestätigen.",
      );
  }
  const remaining: AllowanceDecisionInput[] = input.current.decisions.flatMap((decision) => {
    const retained = {
      from: decision.from,
      through: decision.through,
      tariff: decision.tariff,
      allowanceStatus: decision.allowanceStatus,
    };
    if (decision.through < from || decision.from > through) return [retained];
    const fragments: AllowanceDecisionInput[] = [];
    if (decision.from < from)
      fragments.push({
        ...retained,
        through: Temporal.PlainDate.from(from).subtract({ days: 1 }).toString(),
      });
    if (decision.through > through)
      fragments.push({
        ...retained,
        from: Temporal.PlainDate.from(through).add({ days: 1 }).toString(),
      });
    return fragments;
  });
  return {
    month: input.month,
    expectedRevision: input.current.revision,
    decisions: [...remaining, { from, through, tariff, allowanceStatus: input.status }].sort(
      (a, b) => a.from.localeCompare(b.from),
    ),
  };
}
