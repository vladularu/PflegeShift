import { Temporal } from "@js-temporal/polyfill";
import training2025 from "../../rules/packages/reviewed/tvaoed-pflege-vka/2025-04-r1.json";
import training2026 from "../../rules/packages/reviewed/tvaoed-pflege-vka/2026-05-r1.json";
import type {
  CalendarEntry,
  MonthlyPayEstimate,
  MonthlyTariffDecision,
  PremiumLine,
  ShiftEntry,
  ShiftPremiumBreakdown,
  TvoedWorkPatternSettings,
  UserProfile,
} from "@/domain/types";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { validateRulePackage } from "@/rules/validation";
import { RuleResolutionError, type RuleResolver } from "@/rules/rule-resolver";
import { conditionsMatch } from "./pay-conditions";
import { createManualMonthlyPayEstimate } from "./pay-fallback";
import { countPremiumMinutes } from "./pay-premium-minutes";
import { roundRemunerationCents } from "./remuneration-money";
import { assessTvoedKCalendarMonth } from "./tvoed-k-calendar-assessment";
import { assessTvoedPattern, isPayWorkShift } from "./tvoed-pattern";
import { calculateTimedShiftBounds, calculateTimedShiftMinutes } from "./working-time";

// Explicitly approved, local nursing category b. Other DRAFT families and the remote
// catalog remain untouched. Raw packages keep their review metadata and sources.
const packages = [training2025, training2026].map((value) => {
  const checked = validateRulePackage(value);
  if (!checked.ok || checked.value.kind !== "TARIFF")
    throw new Error("Ungültige Pflege-Ausbildungstabelle.");
  return checked.value;
});
const overlays = new WeakMap<RuleResolver, RuleResolver>();
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function trainingPackage(date: string): RuleTariffPackage | null {
  const key = Temporal.PlainDate.from(date).toString();
  return (
    packages.find((p) => p.validFrom <= key && (p.validTo === null || key <= p.validTo)) ?? null
  );
}

function trainingResolver(source: RuleResolver): RuleResolver {
  const existing = overlays.get(source);
  if (existing) return existing;
  const overlay: RuleResolver = {
    ...source,
    resolveTariff: (date, packageId) => {
      if (packageId && packageId !== "tvaoed-pflege-vka")
        return source.resolveTariff(date, packageId);
      const value = trainingPackage(date);
      return value
        ? { ok: true, value }
        : {
            ok: false,
            error: {
              code: "RULE_PACKAGE_NOT_FOUND",
              kind: "TARIFF",
              packageId: "tvaoed-pflege-vka",
              effectiveDate: date,
              message: "Für diesen Monat liegt noch keine geprüfte Ausbildungstabelle vor.",
            },
          };
    },
  };
  overlays.set(source, overlay);
  return overlay;
}

function trainingContext(
  date: string,
  profile: Pick<UserProfile, "nursingTrainingTariff" | "weeklyMinutes">,
) {
  const selection = profile.nursingTrainingTariff;
  const rulePackage = trainingPackage(date);
  if (!selection || !rulePackage) return null;
  const entries = rulePackage.rules.payTables
    .filter((t) => t.id === rulePackage.rules.selector.payTableId)
    .flatMap((t) => t.entries)
    .filter((e) => e.groupId === "b" && e.stepId === "s" + selection.trainingYear);
  const weekly = rulePackage.rules.weeklyWorkingTimeRules?.filter(
    (r) => r.sectors.includes(selection.sector) && r.tariffRegions.includes(selection.tariffRegion),
  );
  if (
    entries.length !== 1 ||
    weekly?.length !== 1 ||
    profile.weeklyMinutes > weekly[0].fullTimeWeeklyMinutes
  )
    return null;
  return {
    rulePackage,
    monthlyCents: entries[0].monthlyCents,
    fullTimeWeeklyMinutes: weekly[0].fullTimeWeeklyMinutes,
  };
}

export function selectNursingTrainingAssessmentShifts(
  entries: readonly CalendarEntry[],
  month: string,
): readonly ShiftEntry[] {
  const first = Temporal.PlainDate.from(month + "-01");
  const from = first.subtract({ months: 2 }).toString();
  const through = first.add({ months: 1 }).subtract({ days: 1 }).toString();
  return entries.filter(
    (entry): entry is ShiftEntry =>
      entry.kind === "SHIFT" &&
      entry.deletedAt === null &&
      entry.date >= from &&
      entry.date <= through,
  );
}

export function calculateNursingTrainingAssessment(
  month: string,
  shifts: readonly ShiftEntry[],
  settings: TvoedWorkPatternSettings,
  source: RuleResolver,
  profile: Pick<UserProfile, "nursingTrainingTariff" | "timeZone">,
) {
  const date = month + "-01";
  if (!trainingPackage(date))
    return { available: false, assessment: null, tariffLabel: "TVAöD Pflege" };
  const first = Temporal.PlainDate.from(date);
  const from = first.subtract({ months: 2 }).toString();
  const through = first.add({ months: 1 }).subtract({ days: 1 }).toString();
  const relevant = shifts.filter(
    (s) => s.deletedAt === null && s.date >= from && s.date <= through,
  );
  const resolver = trainingResolver(source);
  const assessed =
    profile.nursingTrainingTariff?.sector === "BT_K"
      ? assessTvoedKCalendarMonth(month, relevant, settings, resolver, profile.timeZone)
      : { assessment: assessTvoedPattern(relevant, settings, resolver, date) };
  return { ...assessed, available: true, tariffLabel: "TVAöD Pflege" };
}

export function calculateNursingTrainingShift(
  shift: ShiftEntry,
  profile: UserProfile,
  source: RuleResolver,
): ShiftPremiumBreakdown {
  const empty: ShiftPremiumBreakdown = {
    shiftId: shift.id,
    date: shift.date,
    netMinutes: 0,
    premiumLines: [],
    overtimeBaseAmount: 0,
    overtimePremiumAmount: 0,
    totalAmount: 0,
  };
  if (shift.deletedAt !== null || !isPayWorkShift(shift)) return empty;
  const bounds = calculateTimedShiftBounds(shift, profile.timeZone);
  if (!bounds) return empty;
  const pause = Math.min(shift.breakMinutes, bounds.grossMinutes);
  const breakStart = Math.floor((bounds.grossMinutes - pause) / 2);
  const lines = new Map<string, PremiumLine>();
  const overtimeMinutes = shift.tariffOvertimeConfirmed
    ? Math.min(shift.overtimeMinutes, bounds.netMinutes)
    : 0;
  let overtimeRemaining = overtimeMinutes;
  let overtimeBaseCents = 0,
    overtimePremiumCents = 0;
  const zonedStart = Temporal.Instant.fromEpochMilliseconds(
    bounds.startEpochMinutes * 60000,
  ).toZonedDateTimeISO(profile.timeZone);
  let from = 0;
  while (from < bounds.grossMinutes) {
    const start = zonedStart.add({ minutes: from });
    const tomorrow = start
      .toPlainDate()
      .add({ days: 1 })
      .toZonedDateTime({ timeZone: profile.timeZone, plainTime: "00:00" });
    const until = Math.min(
      bounds.grossMinutes,
      Number(tomorrow.epochMilliseconds - zonedStart.epochMilliseconds) / 60000,
    );
    const context = trainingContext(start.toPlainDate().toString(), profile);
    if (!context)
      throw new RuleResolutionError({
        code: "RULE_PACKAGE_NOT_FOUND",
        kind: "TARIFF",
        packageId: "tvaoed-pflege-vka",
        effectiveDate: start.toPlainDate().toString(),
        message: "Für einen Dienst fehlt eine gültige Ausbildungstabelle.",
      });
    const factor = context.rulePackage.rules.hourlyCalculation!.monthlyFactorThousandths;
    const hourlyCents = roundRemunerationCents(
      context.monthlyCents * 60000,
      context.fullTimeWeeklyMinutes * factor,
    );
    const buckets = countPremiumMinutes(
      shift,
      { ...profile, tariff: null },
      bounds.grossMinutes,
      breakStart,
      breakStart + pause,
      context.rulePackage,
      source,
      { from, until },
    );
    for (const [id, minutes] of buckets.byRuleId) {
      const rule = context.rulePackage.rules.premiumRules.find((r) => r.id === id)!;
      if (rule.premiumType === "OVERTIME") continue;
      const floor =
        rule.premiumType === "NIGHT" &&
        hourlyCents * rule.percentageBasisPoints <
          context.rulePackage.rules.trainingPay!.minimumNightHourlyCents * 10000;
      const percentage = floor ? 10000 : rule.percentageBasisPoints;
      const rate = floor
        ? context.rulePackage.rules.trainingPay!.minimumNightHourlyCents
        : hourlyCents;
      const key = rule.premiumType.startsWith("HOLIDAY_")
        ? "holiday"
        : rule.premiumType === "PRE_HOLIDAY"
          ? "preholiday"
          : rule.premiumType.toLowerCase();
      const amount = roundRemunerationCents(rate * minutes * percentage, 600000) / 100;
      const previous = lines.get(key);
      const combinedMinutes = (previous?.minutes ?? 0) + minutes;
      lines.set(key, {
        key,
        label: rule.label,
        minutes: combinedMinutes,
        percentage: percentage / 100,
        hourlyRate: previous
          ? money(
              (previous.hourlyRate * previous.minutes + (rate / 100) * minutes) / combinedMinutes,
            )
          : rate / 100,
        amount: money((previous?.amount ?? 0) + amount),
      });
    }
    // Confirmed overtime is attached to the end of the worked shift, so a new
    // tariff date after midnight also supplies the corresponding overtime rate.
    const breakInSection = Math.max(
      0,
      Math.min(until, breakStart + pause) - Math.max(from, breakStart),
    );
    const workInSection = until - from - breakInSection;
    const workedAfter = Math.max(
      0,
      bounds.grossMinutes - until - Math.max(0, breakStart + pause - Math.max(until, breakStart)),
    );
    const overtimeInSection = Math.min(workInSection, Math.max(0, overtimeRemaining - workedAfter));
    if (overtimeInSection > 0) {
      const rule = context.rulePackage.rules.premiumRules.find(
        (r) => r.premiumType === "OVERTIME",
      )!;
      overtimeBaseCents += roundRemunerationCents(hourlyCents * overtimeInSection, 60);
      overtimePremiumCents += roundRemunerationCents(
        hourlyCents * overtimeInSection * rule.percentageBasisPoints,
        600000,
      );
      overtimeRemaining -= overtimeInSection;
    }
    from = until;
  }
  const premiumLines = [...lines.values()];
  return {
    ...empty,
    netMinutes: calculateTimedShiftMinutes(shift, profile.timeZone),
    premiumLines,
    overtimeBaseAmount: overtimeBaseCents / 100,
    overtimePremiumAmount: overtimePremiumCents / 100,
    totalAmount: money(
      premiumLines.reduce((sum, p) => sum + p.amount, 0) +
        (overtimeBaseCents + overtimePremiumCents) / 100,
    ),
  };
}

export function calculateNursingTrainingMonth(
  month: string,
  shifts: readonly ShiftEntry[],
  profile: UserProfile,
  decision: MonthlyTariffDecision | null,
  assessmentShifts: readonly ShiftEntry[],
  settings: TvoedWorkPatternSettings,
  resolver: RuleResolver,
): MonthlyPayEstimate {
  const date = month + "-01";
  const context = trainingContext(date, profile);
  const empty = createManualMonthlyPayEstimate(month, 0);
  if (!context)
    return {
      ...empty,
      tariffLabel: "TVAöD Pflege",
      available: false,
      fullTimeTableAmount: null,
      personalBaseAmount: null,
      estimatedGrossAmount: null,
    };
  const assessment = calculateNursingTrainingAssessment(
    month,
    assessmentShifts,
    settings,
    resolver,
    profile,
  ).assessment!;
  const monthShifts = shifts.filter(
    (s) => s.deletedAt === null && s.date.startsWith(month + "-") && isPayWorkShift(s),
  );
  const shiftBreakdowns = monthShifts.map((s) =>
    calculateNursingTrainingShift(s, profile, resolver),
  );
  const personalBaseAmount =
    roundRemunerationCents(
      context.monthlyCents * profile.weeklyMinutes,
      context.fullTimeWeeklyMinutes,
    ) / 100;
  const timePremiumAmount = money(
    shiftBreakdowns.reduce((sum, b) => sum + b.premiumLines.reduce((s, p) => s + p.amount, 0), 0),
  );
  const overtimeAmount = money(
    shiftBreakdowns.reduce((sum, b) => sum + b.overtimeBaseAmount + b.overtimePremiumAmount, 0),
  );
  const status = decision?.allowanceStatus ?? assessment.suggestedAllowance;
  const selection = profile.nursingTrainingTariff!;
  const allowanceType = status.startsWith("ALTERNATING") ? "alternating-shift" : "shift";
  const rules =
    status === "NONE"
      ? []
      : context.rulePackage.rules.allowanceRules.filter(
          (rule) =>
            rule.allowanceType === allowanceType &&
            rule.validFrom <= date &&
            (rule.validTo === null || date <= rule.validTo) &&
            (rule.conditions.sectors === null ||
              rule.conditions.sectors.includes(selection.sector)) &&
            (rule.conditions.tariffRegions == null ||
              rule.conditions.tariffRegions.includes(selection.tariffRegion)) &&
            conditionsMatch(
              { ...rule.conditions, sectors: null, tariffRegions: null },
              { ...profile, tariff: null },
              date,
              null,
              status,
            ),
        );
  if (rules.length > 1) throw new Error("Mehrere Pflege-Ausbildungszulagen für diesen Monat.");
  const allowance = rules[0];
  const workMinutes = shiftBreakdowns.reduce((sum, b) => sum + b.netMinutes, 0);
  const allowanceAmount = !allowance
    ? 0
    : allowance.amountKind === "FIXED_HOURLY"
      ? roundRemunerationCents(allowance.amountCents * workMinutes, 60) / 100
      : roundRemunerationCents(
          allowance.amountCents *
            (allowance.prorateByPartTime ? profile.weeklyMinutes : context.fullTimeWeeklyMinutes),
          context.fullTimeWeeklyMinutes,
        ) / 100;
  return {
    ...empty,
    month,
    tariffLabel: "TVAöD Pflege",
    available: true,
    fullTimeTableAmount: context.monthlyCents / 100,
    personalBaseAmount,
    shiftBreakdowns,
    timePremiumAmount,
    overtimeAmount,
    allowanceAmount,
    tvoedAllowanceAmount: 0,
    careAllowanceAmount: 0,
    estimatedGrossAmount: money(
      personalBaseAmount + timePremiumAmount + overtimeAmount + allowanceAmount,
    ),
    assessment,
    confirmedAllowance: decision?.allowanceStatus ?? null,
  };
}
