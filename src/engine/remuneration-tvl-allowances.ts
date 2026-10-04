import { Temporal } from "@js-temporal/polyfill";
import type {
  DatedAllowanceEntitlement,
  SupplementPosition,
} from "@/domain/remuneration-supplement";
import type { RemunerationSource } from "@/domain/remuneration-result";
import type { TvlKrPayContext } from "./remuneration-tvl-context";
import { roundRemunerationCents } from "./remuneration-money";

export interface TvlAllowanceDay {
  readonly date: string;
  readonly context: TvlKrPayContext & { readonly source: RemunerationSource };
  readonly entitlement: DatedAllowanceEntitlement | null;
  readonly workedMinutes: number;
  readonly estimatedPause: boolean;
}
function policyAt(context: TvlKrPayContext, date: string) {
  const periods = context.rulePackage.rules.tvlShiftAllowancePolicy?.periods.filter(
    (period) => period.validFrom <= date && (period.validTo === null || date <= period.validTo),
  );
  return periods?.length === 1 ? periods[0] : null;
}
export function hasTvlShiftAllowances(context: TvlKrPayContext, date: string): boolean {
  return policyAt(context, date) !== null;
}

/** Only explicitly confirmed periods. The TVöD pattern heuristic does not establish TV-L rights. */
export function calculateTvlShiftAllowances(
  days: readonly TvlAllowanceDay[],
): SupplementPosition[] {
  const buckets: {
    key: string;
    position: SupplementPosition;
    monthly: boolean;
    personal: number | null;
  }[] = [];
  for (const { date, context, entitlement, workedMinutes, estimatedPause } of days) {
    if (!context.rulePackage.rules.tvlShiftAllowancePolicy) continue;
    const policy = policyAt(context, date);
    const confirmed = entitlement?.origin === "confirmed" ? entitlement : null;
    const status = confirmed?.status;
    const monthly = status?.endsWith("_MONTHLY") ?? false;
    const alternating = status?.startsWith("ALTERNATING") ?? false;
    const rate =
      !policy || !status
        ? null
        : status === "NONE"
          ? 0
          : alternating
            ? monthly
              ? policy.alternatingMonthlyCents
              : policy.alternatingHourlyCents
            : monthly
              ? policy.shiftMonthlyCents
              : policy.shiftHourlyCents;
    const personal =
      rate === null
        ? null
        : monthly
          ? roundRemunerationCents(rate * context.weeklyMinutes, context.fullTimeWeeklyMinutes)
          : rate;
    const plain = Temporal.PlainDate.from(date);
    const position: SupplementPosition = {
      id: "tvl-shift-allowance:" + date,
      kind: "allowance",
      label: alternating ? "TV-L-Wechselschichtzulage" : "TV-L-Schichtzulage",
      from: date,
      through: date,
      source: context.source,
      status: rate === null ? "unavailable" : status === "NONE" ? "calculated" : "estimated",
      amountCents: rate === null ? null : 0,
      issue: !policy
        ? {
            code: "ALLOWANCE_RULE_MISSING",
            message: "Die datierte TV-L-Schichtzulagenregel fehlt.",
          }
        : !confirmed
          ? {
              code: "ALLOWANCE_DECISION_MISSING",
              message:
                "Bitte den TV-L-Schichtzulagenanspruch für diesen Zeitraum ausdrücklich bestätigen.",
            }
          : null,
      basis: {
        ruleId: policy
          ? "tvl-" + (status ?? "unconfirmed").toLowerCase() + ":" + policy.validFrom
          : null,
        shiftId: null,
        allowanceType: alternating ? "alternating-shift" : "shift",
        rateCents: rate,
        personalMonthlyCents: monthly ? personal : null,
        percentageBasisPoints: null,
        minutes: !monthly && status !== "NONE" ? workedMinutes : 0,
        calendarDays: 1,
        monthDays: plain.daysInMonth,
        entitlement: confirmed,
        pauseMethod:
          !monthly && status !== "NONE" && estimatedPause ? "centered-duration-estimate" : "none",
        proration: monthly ? "calendar-days" : status === "NONE" ? "none" : "worked-minutes",
      },
    };
    const key = JSON.stringify([
      date.slice(0, 7),
      context.source,
      context.weeklyMinutes,
      context.fullTimeWeeklyMinutes,
      policy,
      confirmed,
      rate,
    ]);
    const previous = buckets.at(-1);
    if (
      previous &&
      previous.key === key &&
      previous.position.through === plain.subtract({ days: 1 }).toString()
    ) {
      const before = previous.position;
      previous.position = {
        ...before,
        through: date,
        basis: {
          ...before.basis,
          minutes: before.basis.minutes + position.basis.minutes,
          calendarDays: before.basis.calendarDays + 1,
          pauseMethod:
            before.basis.pauseMethod === "centered-duration-estimate"
              ? before.basis.pauseMethod
              : position.basis.pauseMethod,
        },
      };
    } else buckets.push({ key, position, monthly, personal });
  }
  return buckets.map(({ position, monthly, personal }) => {
    if (personal === null) return position;
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
