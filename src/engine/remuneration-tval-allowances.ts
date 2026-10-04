import { Temporal } from "@js-temporal/polyfill";
import type { RemunerationSource } from "@/domain/remuneration-result";
import type { TvalEmployerScope } from "@/domain/remuneration-profile";
import type {
  DatedAllowanceEntitlement,
  SupplementPosition,
} from "@/domain/remuneration-supplement";
import { tvalShiftAllowanceIssues } from "@/rules/tval-shift-allowance-validation";
import type { TvalTrainingPayContext } from "./remuneration-tval-context";
import { roundRemunerationCents } from "./remuneration-money";

export type { TvalEmployerScope } from "@/domain/remuneration-profile";
export function hasTvalShiftAllowances(context: TvalTrainingPayContext, date: string): boolean {
  const pkg = context.rulePackage;
  return (
    pkg.validFrom <= date &&
    (pkg.validTo === null || date <= pkg.validTo) &&
    pkg.rules.tvalShiftAllowancePolicy !== undefined &&
    tvalShiftAllowanceIssues(pkg).length === 0
  );
}
export interface TvalAllowanceDay {
  readonly date: string;
  readonly context: TvalTrainingPayContext & { readonly source: RemunerationSource };
  readonly employerScope: TvalEmployerScope | null;
  readonly entitlement: DatedAllowanceEntitlement | null;
  readonly workedMinutes: number;
  readonly estimatedPause: boolean;
}

/** Confirmed claims only. Training status never implies hospital scope or shift rights. */
export function calculateTvalShiftAllowances(
  days: readonly TvalAllowanceDay[],
): SupplementPosition[] {
  const buckets: {
    key: string;
    position: SupplementPosition;
    monthly: boolean;
    personal: number | null;
  }[] = [];
  const checked = new Map<TvalTrainingPayContext["rulePackage"], boolean>();
  let previousDate: string | null = null;
  for (const { date, context, employerScope, entitlement, workedMinutes, estimatedPause } of days) {
    const plain = Temporal.PlainDate.from(date);
    if (
      plain.toString() !== date ||
      (previousDate !== null && date <= previousDate) ||
      !Number.isSafeInteger(workedMinutes) ||
      workedMinutes < 0 ||
      !Number.isSafeInteger(context.weeklyMinutes) ||
      context.weeklyMinutes <= 0 ||
      !Number.isSafeInteger(context.fullTimeWeeklyMinutes) ||
      context.weeklyMinutes > context.fullTimeWeeklyMinutes
    )
      throw new Error("Ungültiger oder doppelter TVA-L-Zulagentag.");
    previousDate = date;
    const pkg = context.rulePackage;
    const policy = pkg.rules.tvalShiftAllowancePolicy;
    if (!checked.has(pkg)) checked.set(pkg, !!policy && tvalShiftAllowanceIssues(pkg).length === 0);
    const valid =
      checked.get(pkg) && pkg.validFrom <= date && (pkg.validTo === null || date <= pkg.validTo);
    const periods = valid
      ? policy?.scopes
          .find((scope) => scope.id === employerScope)
          ?.rates.periods.filter(
            (period) =>
              period.validFrom <= date && (period.validTo === null || date <= period.validTo),
          )
      : undefined;
    const period = periods?.length === 1 ? periods[0] : null;
    const confirmed =
      entitlement?.origin === "confirmed" && entitlement.from <= date && date <= entitlement.through
        ? entitlement
        : null;
    const status = confirmed?.status;
    const monthly = status?.endsWith("_MONTHLY") ?? false;
    const alternating = status?.startsWith("ALTERNATING") ?? false;
    const noClaim = status === "NONE";
    const employeeRate =
      !valid || !status
        ? null
        : noClaim
          ? 0
          : !period
            ? null
            : alternating
              ? monthly
                ? period.alternatingMonthlyCents
                : period.alternatingHourlyCents
              : monthly
                ? period.shiftMonthlyCents
                : period.shiftHourlyCents;
    const trainingRate =
      employeeRate === null
        ? null
        : roundRemunerationCents(employeeRate * policy!.shareBasisPoints, 10000);
    const personal =
      trainingRate === null
        ? null
        : monthly
          ? roundRemunerationCents(
              trainingRate * context.weeklyMinutes,
              context.fullTimeWeeklyMinutes,
            )
          : trainingRate;
    const issue: SupplementPosition["issue"] = !valid
      ? {
          code: "ALLOWANCE_RULE_MISSING",
          message: "Die datierte TVA-L-Schichtzulagenregel fehlt oder ist ungültig.",
        }
      : !confirmed
        ? {
            code: "ALLOWANCE_DECISION_MISSING",
            message:
              "Bitte den TVA-L-Schichtzulagenanspruch für diesen Zeitraum ausdrücklich bestätigen.",
          }
        : !noClaim && !period
          ? {
              code: "ALLOWANCE_DECISION_MISSING",
              message:
                "Bitte bestätigen, ob die allgemeine TV-L-Regel oder die Krankenhausregelung nach § 43 gilt.",
            }
          : null;
    const position: SupplementPosition = {
      id: "tval-shift-allowance:" + date,
      kind: "allowance",
      label: alternating
        ? "TVA-L-Wechselschichtzulage · Ausbildungsanteil"
        : "TVA-L-Schichtzulage · Ausbildungsanteil",
      from: date,
      through: date,
      source: context.source,
      status: issue ? "unavailable" : noClaim ? "calculated" : "estimated",
      amountCents: issue ? null : 0,
      issue,
      basis: {
        ruleId: period ? "tval-" + employerScope + ":" + status + ":" + period.validFrom : null,
        shiftId: null,
        allowanceType: alternating ? "alternating-shift" : "shift",
        rateCents: employeeRate,
        personalMonthlyCents: monthly ? personal : null,
        percentageBasisPoints: valid ? policy!.shareBasisPoints : null,
        minutes: !monthly && !noClaim ? workedMinutes : 0,
        calendarDays: 1,
        monthDays: plain.daysInMonth,
        entitlement: confirmed,
        pauseMethod: !monthly && !noClaim && estimatedPause ? "centered-duration-estimate" : "none",
        proration: issue
          ? "unconfirmed"
          : monthly
            ? "calendar-days"
            : noClaim
              ? "none"
              : "worked-minutes",
      },
    };
    const key = JSON.stringify([
      date.slice(0, 7),
      context.source,
      context.weeklyMinutes,
      context.fullTimeWeeklyMinutes,
      employerScope,
      period,
      confirmed,
      employeeRate,
      personal,
      issue,
    ]);
    const previous = buckets.at(-1);
    if (
      previous?.key === key &&
      previous.position.through === plain.subtract({ days: 1 }).toString()
    ) {
      previous.position = {
        ...previous.position,
        through: date,
        basis: {
          ...previous.position.basis,
          calendarDays: previous.position.basis.calendarDays + 1,
          minutes: previous.position.basis.minutes + position.basis.minutes,
          pauseMethod:
            previous.position.basis.pauseMethod === "centered-duration-estimate"
              ? previous.position.basis.pauseMethod
              : position.basis.pauseMethod,
        },
      };
    } else buckets.push({ key, position, monthly, personal });
  }
  return buckets.map(({ position, monthly, personal }) => {
    if (position.issue || personal === null) return position;
    const { calendarDays, monthDays, minutes } = position.basis;
    return {
      ...position,
      amountCents: monthly
        ? roundRemunerationCents(personal * calendarDays, monthDays)
        : roundRemunerationCents(personal * minutes, 60),
      basis: {
        ...position.basis,
        proration: monthly && calendarDays === monthDays ? "none" : position.basis.proration,
      },
    };
  });
}
