import { Temporal } from "@js-temporal/polyfill";
import { validateScopedAllowanceDecisions } from "@/domain/allowance-decisions";
import type {
  AllowanceTariffIdentity,
  DatedAllowanceAssessment,
  ScopedAllowanceDecision,
} from "@/domain/remuneration-assessment";
import {
  resolveRemunerationProfile,
  validateRemunerationProfileData,
  type DatedRemunerationProfile,
} from "@/domain/remuneration-profile";
import type { DatedAllowanceEntitlement } from "@/domain/remuneration-supplement";
import type {
  MonthlyTariffDecision,
  ShiftEntry,
  TvoedWorkPatternSettings,
  UserProfile,
} from "@/domain/types";
import { validateMonthlyTariffDecision } from "@/domain/validation";
import { bundledRuleResolver, type RuleResolver } from "@/rules/rule-resolver";
import {
  remunerationMonthStart,
  resolveRemunerationMonth,
  type RemunerationPeriod,
} from "./remuneration-context";
import { bindRemunerationTariffResolver } from "./remuneration-tariff-adapter";
import { assessTvoedKCalendarMonth } from "./tvoed-k-calendar-assessment";
import { assessTvoedPattern, isPayWorkShift } from "./tvoed-pattern";

import { hasTrainingShiftAllowances } from "./remuneration-training-allowances";
import { hasTvlShiftAllowances } from "./remuneration-tvl-allowances";
import { hasTvalShiftAllowances } from "./remuneration-tval-allowances";

export interface DatedAllowanceAssessmentInput {
  readonly month: string;
  /** Include the requested tariff's lookback; do not prefilter to the current month. */
  readonly shifts: readonly ShiftEntry[];
  readonly workProfile: UserProfile;
  readonly history: readonly DatedRemunerationProfile[];
  readonly settings: TvoedWorkPatternSettings;
  readonly decisions?: readonly ScopedAllowanceDecision[];
  readonly legacyDecision?: MonthlyTariffDecision | null;
  readonly resolver?: RuleResolver;
}

function identityKey(identity: AllowanceTariffIdentity): string {
  return JSON.stringify([identity.packageId, identity.variant, identity.region]);
}

function identityAt(history: readonly DatedRemunerationProfile[], date: string): string | null {
  const resolved = resolveRemunerationProfile(history, date);
  if (resolved.status !== "dated") return null;
  try {
    const selection = validateRemunerationProfileData(resolved.profile.data).selection;
    return selection.kind === "tariff" ? identityKey(selection) : null;
  } catch {
    return null;
  }
}

function validateDecisions(
  decisions: readonly ScopedAllowanceDecision[],
  legacy: MonthlyTariffDecision | null,
  month: string,
): void {
  validateScopedAllowanceDecisions(decisions);
  if (legacy) {
    validateMonthlyTariffDecision(legacy);
    if (legacy.month !== month)
      throw new Error("Die bisherige Zulagenentscheidung gehört zu einem anderen Monat.");
  }
}

/** A change away and back starts a new spell; group/step/part-time changes do not. */
function observationWindow(period: RemunerationPeriod, input: DatedAllowanceAssessmentInput) {
  const first = remunerationMonthStart(input.month);
  const context = period.context;
  if (context.kind !== "tariff" && context.kind !== "training-tariff")
    throw new Error("Tarifkontext fehlt.");
  const wanted = identityAt(input.history, period.from);
  const minimum = first
    .subtract({ months: context.rulePackage.rules.workPatternPolicy.assessmentLookbackMonths })
    .toString();
  const maximum = first.add({ months: 1 }).subtract({ days: 1 }).toString();
  let from = Temporal.PlainDate.from(period.from);
  let through = from;
  while (from.toString() > minimum) {
    const previous = from.subtract({ days: 1 });
    if (identityAt(input.history, previous.toString()) !== wanted) break;
    from = previous;
  }
  while (through.toString() < maximum) {
    const next = through.add({ days: 1 });
    if (identityAt(input.history, next.toString()) !== wanted) break;
    through = next;
  }
  const observedFrom = from.toString();
  const observedThrough = through.toString();
  const shifts = input.shifts.filter(
    (shift) =>
      shift.deletedAt === null && shift.date >= observedFrom && shift.date <= observedThrough,
  );
  const seen = new Set<string>();
  for (const shift of shifts) {
    if (seen.has(shift.id))
      throw new Error("Ein Dienst wurde mehrfach zur Zulagenprüfung übergeben.");
    seen.add(shift.id);
  }
  return { observedFrom, observedThrough, shifts };
}

function splitDecisions(period: RemunerationPeriod, decisions: readonly ScopedAllowanceDecision[]) {
  const exclusive = Temporal.PlainDate.from(period.through).add({ days: 1 }).toString();
  const boundaries = new Set([period.from, exclusive]);
  for (const decision of decisions) {
    const end = Temporal.PlainDate.from(decision.through).add({ days: 1 }).toString();
    if (decision.from > period.from && decision.from < exclusive) boundaries.add(decision.from);
    if (end > period.from && end < exclusive) boundaries.add(end);
  }
  const ordered = [...boundaries].sort();
  return ordered.slice(0, -1).map((from, index) => ({
    from,
    through: Temporal.PlainDate.from(ordered[index + 1])
      .subtract({ days: 1 })
      .toString(),
    decision:
      decisions.find((decision) => decision.from <= from && decision.through >= from) ?? null,
  }));
}

function assessPeriod(
  period: RemunerationPeriod,
  input: DatedAllowanceAssessmentInput,
  resolver: RuleResolver,
): DatedAllowanceAssessment {
  const { context, from, through } = period;
  const base: DatedAllowanceAssessment = {
    tariff: null,
    nightSequence: null,
    from,
    through,
    source: context.source,
    assessment: null,
    entitlement: null,
    observedFrom: null,
    observedThrough: null,
    settingsUpdatedAt: input.settings.updatedAt,
    issue: null,
  };
  if (context.kind === "unavailable") return { ...base, issue: context.issue };
  if (context.kind === "tval-training")
    return {
      ...base,
      issue: {
        code: "TARIFF_UNSUPPORTED",
        message:
          "TVA-L-Pflege-Schichtzulagen werden nicht aus TVöD-Arbeitsmustern abgeleitet. Bitte den Anspruch für den Zeitraum ausdrücklich bestätigen.",
      },
    };
  if (context.kind === "tvl-kr")
    return {
      ...base,
      issue: {
        code: "TARIFF_UNSUPPORTED",
        message: "Für TV-L/KR ist noch keine vollständige Schichtzulagenprüfung verfügbar.",
      },
    };
  if (context.kind === "training-tariff" && !hasTrainingShiftAllowances(context, from))
    return {
      ...base,
      issue: {
        code: "TARIFF_UNSUPPORTED",
        message:
          "Für diesen historischen Zeitraum fehlen noch geprüfte Ausbildungs-Schichtzulagenregeln.",
      },
    };
  if (context.kind === "own-monthly" || context.kind === "own-configured")
    return {
      ...base,
      issue: {
        code: "OWN_ASSESSMENT_UNSUPPORTED",
        message:
          "Eine tarifliche Schichtzulage wird bei eigener Vergütung nicht automatisch angenommen.",
      },
    };
  const window = observationWindow(period, input);
  const bound = bindRemunerationTariffResolver(resolver, context.rulePackage.packageId);
  const selection = context.profile!.data.selection;
  const btK = selection.kind === "tariff" && selection.variant === "BT_K";
  const hasWork = window.shifts.some(
    (shift) => shift.date.startsWith(input.month + "-") && isPayWorkShift(shift),
  );
  const calendarAssessment = btK
    ? assessTvoedKCalendarMonth(
        input.month,
        window.shifts,
        input.settings,
        bound,
        input.workProfile.timeZone,
        from,
      )
    : null;
  const assessment =
    calendarAssessment?.assessment ??
    assessTvoedPattern(hasWork ? window.shifts : [], input.settings, bound, from);
  const incomplete = input.settings.assignment === "UNKNOWN" || assessment.requiresConfirmation;
  return {
    ...base,
    tariff:
      selection.kind === "tariff"
        ? { packageId: selection.packageId, variant: selection.variant, region: selection.region }
        : null,
    nightSequence: calendarAssessment?.nightSequence ?? null,
    assessment,
    observedFrom: window.observedFrom,
    observedThrough: window.observedThrough,
    entitlement: incomplete
      ? null
      : {
          from,
          through,
          status: assessment.suggestedAllowance,
          origin: "estimated",
          revision: null,
        },
    issue: incomplete
      ? {
          code: "WORKPLACE_SETTINGS_UNCONFIRMED",
          message:
            "Arbeitsbereich oder dauerhafte Zuordnung müssen für die Zulagen-Schätzung bestätigt werden.",
        }
      : null,
  };
}

export function deriveDatedAllowanceAssessments(input: DatedAllowanceAssessmentInput) {
  remunerationMonthStart(input.month);
  const decisions = input.decisions ?? [];
  const legacy = input.legacyDecision ?? null;
  const resolver = input.resolver ?? bundledRuleResolver;
  validateDecisions(decisions, legacy, input.month);
  const periods = resolveRemunerationMonth(input.month, input.history, resolver).flatMap(
    (period) => {
      const automatic = assessPeriod(period, input, resolver);
      return splitDecisions(period, decisions).map(
        ({ from, through, decision }): DatedAllowanceAssessment => {
          const result = {
            ...automatic,
            from,
            through,
            entitlement: automatic.entitlement ? { ...automatic.entitlement, from, through } : null,
          };
          if (
            period.context.kind !== "tariff" &&
            period.context.kind !== "training-tariff" &&
            !(period.context.kind === "tvl-kr" && hasTvlShiftAllowances(period.context, from)) &&
            !(
              period.context.kind === "tval-training" &&
              hasTvalShiftAllowances(period.context, from)
            )
          )
            return result;
          if (decision) {
            if (identityKey(decision.tariff) !== identityAt(input.history, from))
              return {
                ...result,
                entitlement: null,
                issue: {
                  code: "ALLOWANCE_DECISION_TARIFF_MISMATCH",
                  message: "Die gespeicherte Bestätigung gehört zu einem anderen Tarifbereich.",
                },
              };
            return {
              ...result,
              issue: null,
              entitlement: {
                from,
                through,
                status: decision.allowanceStatus,
                origin: "confirmed",
                revision: decision.revision,
              },
            };
          }
          if (legacy)
            return {
              ...result,
              entitlement: null,
              issue: {
                code: "ALLOWANCE_RECONFIRMATION_REQUIRED",
                message:
                  "Die bisherige Monatsbestätigung hat keine Tarifzuordnung. Bitte für diesen Vergütungsstand erneut bestätigen.",
              },
            };
          return result;
        },
      );
    },
  );
  const entitlements: readonly DatedAllowanceEntitlement[] = periods.flatMap((period) =>
    period.entitlement ? [period.entitlement] : [],
  );
  return {
    periods,
    entitlements,
    complete: periods.every((period) => period.entitlement !== null),
    legacyDecision: legacy,
  };
}
