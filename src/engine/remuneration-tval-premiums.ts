import { Temporal } from "@js-temporal/polyfill";
import type { TimeRemunerationPosition } from "@/domain/remuneration-result";
import type { TvlEmploymentCategory } from "@/domain/remuneration-profile";
import type { ShiftEntry, UserProfile } from "@/domain/types";
import type { RuleTimeWindow } from "@/rules/contracts.generated";
import type { RuleResolver } from "@/rules/rule-resolver";
import { resolveHolidayMapForMonth } from "./holidays";
import { PremiumRuleDataError } from "./pay";
import { roundRemunerationCents } from "./remuneration-money";
import type { RemunerationShiftDay } from "./remuneration-shift-days";
import type { TvalTrainingPayContext } from "./remuneration-tval-context";
import { calculateTimedShiftBounds } from "./working-time";

/** Must be confirmed for this service/profile; never inferred from a shift label. */
export interface TvalSaturdayFacts {
  readonly shiftWork: boolean | null;
  readonly employmentCategory: TvlEmploymentCategory | null;
}
interface Candidate {
  readonly id: string;
  readonly label: string;
  readonly hourlyBase: number;
  readonly percentage: number | null;
  readonly premiumHourly: number;
  readonly unknown?: boolean;
}
const inWindow = (minute: number, window: RuleTimeWindow) =>
  window.startMinute < window.endMinute
    ? minute >= window.startMinute && minute < window.endMinute
    : minute >= window.startMinute || minute < window.endMinute;

export function calculateTvalShiftDayPremiums(
  base: TimeRemunerationPosition,
  day: RemunerationShiftDay,
  shift: ShiftEntry,
  work: UserProfile,
  context: TvalTrainingPayContext,
  resolver: RuleResolver,
  facts?: TvalSaturdayFacts,
): TimeRemunerationPosition[] {
  const p = context.rulePackage.rules.tvalTimePremiumPolicy;
  if (!p) throw new PremiumRuleDataError();
  const hourlyBase = roundRemunerationCents(
    context.monthlyCents * 60000,
    context.fullTimeWeeklyMinutes * p.monthlyFactorThousandths,
  );
  const percent = (id: string, label: string, rate: number): Candidate => ({
    id,
    label,
    hourlyBase,
    percentage: rate,
    premiumHourly: roundRemunerationCents(hourlyBase * rate, 10000),
  });
  const saturdayPercent = percent("saturday", "Samstagszuschlag", p.saturdayBasisPoints);
  const saturdayFixed: Candidate = {
    id: "saturday-fixed",
    label: "Samstagszuschlag · § 43 / § 38 Abs. 5",
    hourlyBase: p.hospitalSalariedShiftHourlyCents,
    percentage: null,
    premiumHourly: p.hospitalSalariedShiftHourlyCents,
  };
  let saturday: Candidate | null = null;
  if (facts?.shiftWork === false) saturday = saturdayPercent;
  else {
    const noShiftPayment =
      context.employerScope === "GENERAL" || facts?.employmentCategory === "OTHER";
    const fixedConfirmed =
      context.employerScope === "SECTION_43" &&
      facts?.employmentCategory === "SALARIED_SECTION_38_5_1";
    if (facts?.shiftWork === true && fixedConfirmed) saturday = saturdayFixed;
    else if (!(facts?.shiftWork === true && noShiftPayment)) {
      const upper =
        facts?.shiftWork === true
          ? saturdayFixed
          : noShiftPayment || saturdayPercent.premiumHourly >= saturdayFixed.premiumHourly
            ? saturdayPercent
            : saturdayFixed;
      saturday = { ...upper, id: "saturday-unconfirmed", unknown: true };
    }
  }
  const holidays = resolveHolidayMapForMonth(
    day.date.slice(0, 7),
    work.federalState,
    resolver,
    work.holidayRegion,
  );
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
  const buckets = new Map<string, { candidate: Candidate; minutes: number }>();
  const count = (candidate: Candidate) => {
    const prior = buckets.get(candidate.id);
    buckets.set(candidate.id, { candidate, minutes: (prior?.minutes ?? 0) + 1 });
  };
  for (let offset = day.from; offset < day.until; offset++) {
    if (offset >= pauseFrom && offset < pauseFrom + pause) continue;
    const cursor = transition ? start.add({ minutes: offset - day.from }) : null;
    const minute = cursor
      ? cursor.hour * 60 + cursor.minute
      : start.hour * 60 + start.minute + offset - day.from;
    if (inWindow(minute, p.nightWindow))
      count(percent("night", "Nachtzuschlag", p.nightBasisPoints));
    const competing: Candidate[] = [];
    if (start.dayOfWeek === 7)
      competing.push(percent("sunday", "Sonntagszuschlag", p.sundayBasisPoints));
    const holidayRate =
      shift.holidayPremiumMode === "WITH_TIME_OFF"
        ? p.holidayWithTimeOffBasisPoints
        : p.holidayWithoutTimeOffBasisPoints;
    if (holidays.status === "AVAILABLE" && holidays.holidays.has(day.date))
      competing.push(
        percent(
          shift.holidayPremiumMode === "WITH_TIME_OFF"
            ? "holiday-with-time-off"
            : "holiday-without-time-off",
          "Feiertagszuschlag",
          holidayRate,
        ),
      );
    if (p.preHolidayMonthDays.includes(day.date.slice(5)) && inWindow(minute, p.preHolidayWindow))
      competing.push(percent("pre-holiday", "Vorfesttagszuschlag", p.preHolidayBasisPoints));
    if (start.dayOfWeek === 6 && saturday && inWindow(minute, p.saturdayWindow))
      competing.push(saturday);
    if (holidays.status !== "AVAILABLE")
      competing.push({
        ...percent("holiday-unconfirmed", "Feiertagszuschlag ungeklärt", holidayRate),
        unknown: true,
      });
    const winner = competing.reduce<Candidate | null>(
      (best, item) =>
        best === null ||
        item.premiumHourly > best.premiumHourly ||
        (item.premiumHourly === best.premiumHourly && best.unknown && !item.unknown)
          ? item
          : best,
      null,
    );
    if (winner) count(winner);
  }
  return buckets.size
    ? [...buckets.values()].map(({ candidate: c, minutes }) => ({
        ...base,
        id: base.id + ":tval-" + c.id,
        label: c.label,
        status: c.unknown ? ("unavailable" as const) : base.status,
        amountCents: c.unknown ? null : roundRemunerationCents(c.premiumHourly * minutes, 60),
        issue: c.unknown
          ? {
              code:
                c.id === "holiday-unconfirmed"
                  ? ("HOLIDAY_RULES_UNAVAILABLE" as const)
                  : ("PROFILE_INVALID" as const),
              message:
                c.id === "holiday-unconfirmed"
                  ? "Feiertagsregeln fehlen für diesen TVA-L-Abschnitt."
                  : "Für den TVA-L-Samstagszuschlag bitte Arbeitgeberregelung, Schichtarbeitsbezug und Beschäftigtenkategorie bestätigen.",
            }
          : null,
        basis: {
          ...base.basis,
          ruleId: "tval-" + c.id,
          minutes,
          hourlyRateCents: c.unknown ? null : c.hourlyBase,
          percentageBasisPoints: c.unknown ? null : c.percentage,
          roundedPremiumHourlyCents: c.unknown ? null : c.premiumHourly,
        },
      }))
    : [{ ...base, label: "Keine TVA-L-Zeitzuschläge in diesem Abschnitt" }];
}
