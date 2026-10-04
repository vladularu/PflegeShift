import { Temporal } from "@js-temporal/polyfill";
import type { TimeRemunerationPosition } from "@/domain/remuneration-result";
import type { ShiftEntry, UserProfile } from "@/domain/types";
import type { RuleResolver } from "@/rules/rule-resolver";
import type { RuleTimeWindow } from "@/rules/contracts.generated";
import { resolveHolidayMapForMonth } from "./holidays";
import { PremiumRuleDataError } from "./pay";
import { roundRemunerationCents } from "./remuneration-money";
import type { RemunerationShiftDay } from "./remuneration-shift-days";
import type { TvlKrPayContext } from "./remuneration-tvl-context";
import { calculateTimedShiftBounds } from "./working-time";

/** Personal facts, never inferred from a template name or the employee's age. */
export interface TvlSaturdayFacts {
  readonly shiftWork: boolean | null;
}
interface Candidate {
  readonly id: string;
  readonly label: string;
  readonly hourlyCents: number;
  readonly percentage: number | null;
  readonly unknown?: boolean;
}
const units = (item: Candidate) => item.hourlyCents * (item.percentage ?? 10000);
const inWindow = (minute: number, window: RuleTimeWindow) =>
  window.startMinute < window.endMinute
    ? minute >= window.startMinute && minute < window.endMinute
    : minute >= window.startMinute || minute < window.endMinute;

export function calculateTvlShiftDayPremiums(
  base: TimeRemunerationPosition,
  day: RemunerationShiftDay,
  shift: ShiftEntry,
  work: UserProfile,
  context: TvlKrPayContext,
  resolver: RuleResolver,
  saturdayFacts?: TvlSaturdayFacts,
): TimeRemunerationPosition[] {
  const policy = context.rulePackage.rules.tvlTimePremiumPolicy;
  const reference = context.rulePackage.rules.payTables[0]?.entries.find(
    (entry) => entry.groupId === context.groupId && entry.stepId === policy?.referenceStepId,
  );
  if (!policy || !reference) throw new PremiumRuleDataError();
  const hourlyCents = roundRemunerationCents(
    reference.monthlyCents * 60000,
    context.fullTimeWeeklyMinutes * policy.monthlyFactorThousandths,
  );
  const percentage = (id: string, label: string, rate: number): Candidate => ({
    id,
    label,
    hourlyCents,
    percentage: rate,
  });
  const saturdayPercent = percentage("saturday", "Samstagszuschlag", policy.saturdayBasisPoints);
  const saturdayFixed: Candidate = {
    id: "saturday-fixed",
    label: "Samstagszuschlag · § 38 Abs. 5 Satz 1",
    hourlyCents: policy.saturdaySalariedShiftHourlyCents,
    percentage: null,
  };
  let saturday: Candidate | null;
  if (saturdayFacts?.shiftWork === false) saturday = saturdayPercent;
  else if (saturdayFacts?.shiftWork === true && context.employmentCategory !== null)
    saturday = context.employmentCategory === "SALARIED_SECTION_38_5_1" ? saturdayFixed : null;
  else {
    const possible =
      saturdayFacts?.shiftWork === true
        ? [saturdayFixed]
        : context.employmentCategory === "OTHER"
          ? [saturdayPercent]
          : [saturdayPercent, saturdayFixed];
    const upper = possible.reduce((a, b) => (units(a) >= units(b) ? a : b));
    saturday = { ...upper, id: "saturday-unconfirmed", unknown: true };
  }
  const holidays = resolveHolidayMapForMonth(
    day.date.slice(0, 7),
    work.federalState,
    resolver,
    work.holidayRegion,
  );
  if (holidays.status !== "AVAILABLE")
    return [
      {
        ...base,
        status: "unavailable",
        amountCents: null,
        issue: {
          code: "HOLIDAY_RULES_UNAVAILABLE",
          message: "Die Feiertagsregeln fehlen für diesen TV-L-Abschnitt.",
        },
      },
    ];
  const bounds = calculateTimedShiftBounds(shift, work.timeZone);
  if (!bounds) throw new PremiumRuleDataError();
  const pause = Math.min(bounds.grossMinutes, shift.breakMinutes);
  const pauseFrom = Math.floor((bounds.grossMinutes - pause) / 2);
  const start = Temporal.Instant.fromEpochMilliseconds(
    day.fromEpochMinutes * 60000,
  ).toZonedDateTimeISO(work.timeZone);
  const end = Temporal.Instant.fromEpochMilliseconds(
    (day.untilEpochMinutes - 1) * 60000,
  ).toZonedDateTimeISO(work.timeZone);
  const transition = start.offsetNanoseconds !== end.offsetNanoseconds;
  const weekday = start.dayOfWeek;
  const buckets = new Map<string, { candidate: Candidate; minutes: number }>();
  const count = (candidate: Candidate) => {
    const old = buckets.get(candidate.id);
    buckets.set(candidate.id, { candidate, minutes: (old?.minutes ?? 0) + 1 });
  };
  for (let offset = day.from; offset < day.until; offset++) {
    if (offset >= pauseFrom && offset < pauseFrom + pause) continue;
    const cursor = transition ? start.add({ minutes: offset - day.from }) : null;
    const minute = cursor
      ? cursor.hour * 60 + cursor.minute
      : start.hour * 60 + start.minute + offset - day.from;
    if (inWindow(minute, policy.nightWindow))
      count(percentage("night", "Nachtzuschlag", policy.nightBasisPoints));
    const competing: Candidate[] = [];
    if (weekday === 7)
      competing.push(percentage("sunday", "Sonntagszuschlag", policy.sundayBasisPoints));
    if (holidays.holidays.has(day.date))
      competing.push(
        percentage(
          shift.holidayPremiumMode === "WITH_TIME_OFF"
            ? "holiday-with-time-off"
            : "holiday-without-time-off",
          "Feiertagszuschlag",
          shift.holidayPremiumMode === "WITH_TIME_OFF"
            ? policy.holidayWithTimeOffBasisPoints
            : policy.holidayWithoutTimeOffBasisPoints,
        ),
      );
    if (
      policy.preHolidayMonthDays.includes(day.date.slice(5)) &&
      inWindow(minute, policy.preHolidayWindow)
    )
      competing.push(
        percentage("pre-holiday", "Vorfesttagszuschlag", policy.preHolidayBasisPoints),
      );
    if (weekday === 6 && saturday && inWindow(minute, policy.saturdayWindow))
      competing.push(saturday);
    // A known payment dominating every possible Saturday outcome remains provable.
    const winner = competing.reduce<Candidate | null>(
      (best, item) => (best === null || units(item) > units(best) ? item : best),
      null,
    );
    if (winner) count(winner);
  }
  return buckets.size
    ? [...buckets.values()].map(({ candidate, minutes }) => ({
        ...base,
        id: base.id + ":tvl-" + candidate.id,
        label: candidate.label,
        status: candidate.unknown ? "unavailable" : base.status,
        amountCents: candidate.unknown
          ? null
          : roundRemunerationCents(units(candidate) * minutes, 600000),
        issue: candidate.unknown
          ? {
              code: "PROFILE_INVALID",
              message:
                "Für den Samstagszuschlag bitte Schichtarbeitsbezug und Kategorie nach § 38 Abs. 5 TV-L bestätigen.",
            }
          : null,
        basis: {
          ...base.basis,
          ruleId: "tvl-" + candidate.id,
          minutes,
          hourlyRateCents: candidate.unknown ? null : candidate.hourlyCents,
          percentageBasisPoints: candidate.unknown ? null : candidate.percentage,
        },
      }))
    : [{ ...base, label: "Keine TV-L-Zeitzuschläge in diesem Abschnitt" }];
}
