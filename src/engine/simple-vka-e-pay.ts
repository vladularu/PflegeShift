import { Temporal } from "@js-temporal/polyfill";
import table2025 from "../../rules/packages/reviewed/tvoed-vka-anlage-a/2025-04-01-draft1.json";
import table2026 from "../../rules/packages/reviewed/tvoed-vka-anlage-a/2026-05-01-draft1.json";
import { tariffFullTimeWeeklyMinutes } from "@/domain/employment-profile";
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
import { RuleResolutionError, bundledRuleResolver, type RuleResolver } from "@/rules/rule-resolver";
import { conditionsMatch } from "./pay-conditions";
import { createManualMonthlyPayEstimate } from "./pay-fallback";
import { countPremiumMinutes } from "./pay-premium-minutes";
import { roundRemunerationCents } from "./remuneration-money";
import { assessTvoedKCalendarMonth } from "./tvoed-k-calendar-assessment";
import { assessTvoedPattern, isPayWorkShift } from "./tvoed-pattern";
import { calculateTimedShiftBounds, calculateTimedShiftMinutes } from "./working-time";

// Explicit local E-table adapter. Raw Annex-A source packages remain DRAFT.
// Shared nursing shift rules use the same VKA AT/BT-K/BT-B source provisions;
// E table/hourly bases and E-only entitlements are selected separately below.
const packages = [table2025, table2026].map((value) => {
  const checked = validateRulePackage(value);
  if (!checked.ok || checked.value.kind !== "TARIFF")
    throw new Error("Ungültige Pflege-E-Tabelle.");
  return checked.value;
});
const overlays = new WeakMap<RuleResolver, RuleResolver>();
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function ePackage(date: string): RuleTariffPackage | null {
  const key = Temporal.PlainDate.from(date).toString();
  const table = packages.find(
    (p) => p.validFrom <= key && (p.validTo === null || key <= p.validTo),
  );
  if (!table) return null;
  const base = bundledRuleResolver.resolveTariff(key);
  if (!base.ok) return null;
  return {
    ...table,
    rules: {
      ...table.rules,
      hourlyCalculation: {
        monthlyFactorThousandths:
          table.rules.tvoedAnnexATimePremiumPolicy!.monthlyFactorThousandths,
        rounding: "HALF_UP",
        sourceIds: table.rules.tvoedAnnexATimePremiumPolicy!.sourceIds,
      },
      premiumRules: base.value.rules.premiumRules.filter((r) => r.premiumType !== "OVERTIME"),
      combinationRules: base.value.rules.combinationRules,
      allowanceRules: base.value.rules.allowanceRules.filter(
        (r) => r.allowanceType === "shift" || r.allowanceType === "alternating-shift",
      ),
      workPatternPolicy: base.value.rules.workPatternPolicy,
      workPatternRules: base.value.rules.workPatternRules,
    },
  };
}

function eResolver(source: RuleResolver): RuleResolver {
  const existing = overlays.get(source);
  if (existing) return existing;
  const overlay: RuleResolver = {
    ...source,
    resolveTariff: (date, packageId) => {
      if (packageId && packageId !== "tvoed-vka-anlage-a")
        return source.resolveTariff(date, packageId);
      const value = ePackage(date);
      return value
        ? { ok: true, value }
        : {
            ok: false,
            error: {
              code: "RULE_PACKAGE_NOT_FOUND",
              kind: "TARIFF",
              packageId: "tvoed-vka-anlage-a",
              effectiveDate: date,
              message: "Für diesen Monat liegt noch keine geprüfte E-Tabelle vor.",
            },
          };
    },
  };
  overlays.set(source, overlay);
  return overlay;
}

function eContext(date: string, profile: Pick<UserProfile, "vkaETariff" | "weeklyMinutes">) {
  const selection = profile.vkaETariff;
  const rulePackage = ePackage(date);
  if (!selection || !rulePackage) return null;
  const entries = rulePackage.rules.payTables
    .filter((t) => t.id === rulePackage.rules.selector.payTableId)
    .flatMap((t) => t.entries);
  const value = (level: number) =>
    entries.find(
      (e) =>
        e.groupId === selection.payGroup.toLowerCase().replace("e", "eg") &&
        e.stepId === "s" + level,
    )?.monthlyCents;
  const monthlyCents = value(selection.payLevel),
    premiumCents = value(3),
    overtimeBaseCents = value(Math.min(selection.payLevel, 4));
  const fullTimeWeeklyMinutes = tariffFullTimeWeeklyMinutes(
    selection.sector,
    selection.tariffRegion,
  );
  if (
    monthlyCents == null ||
    premiumCents == null ||
    overtimeBaseCents == null ||
    profile.weeklyMinutes > fullTimeWeeklyMinutes
  )
    return null;
  const group = selection.payGroup;
  const overtimePercentageBasisPoints = [
    "E1",
    "E2",
    "E3",
    "E4",
    "E5",
    "E6",
    "E7",
    "E8",
    "E9a",
    "E9b",
  ].includes(group)
    ? 3000
    : 1500;
  return {
    rulePackage,
    monthlyCents,
    premiumCents,
    overtimeBaseCents,
    fullTimeWeeklyMinutes,
    overtimePercentageBasisPoints,
  };
}

export function selectVkaEAssessmentShifts(
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

export function calculateVkaEAssessment(
  month: string,
  shifts: readonly ShiftEntry[],
  settings: TvoedWorkPatternSettings,
  source: RuleResolver,
  profile: Pick<UserProfile, "vkaETariff" | "timeZone">,
) {
  const date = month + "-01";
  if (!ePackage(date))
    return { available: false, assessment: null, tariffLabel: "TVöD · E-Tabelle" };
  const first = Temporal.PlainDate.from(date);
  const from = first.subtract({ months: 2 }).toString();
  const through = first.add({ months: 1 }).subtract({ days: 1 }).toString();
  const relevant = shifts.filter(
    (s) => s.deletedAt === null && s.date >= from && s.date <= through,
  );
  const resolver = eResolver(source);
  const assessed =
    profile.vkaETariff?.sector === "BT_K"
      ? assessTvoedKCalendarMonth(month, relevant, settings, resolver, profile.timeZone)
      : { assessment: assessTvoedPattern(relevant, settings, resolver, date) };
  return { ...assessed, available: true, tariffLabel: "TVöD · E-Tabelle" };
}

export function calculateVkaEShift(
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
    const context = eContext(start.toPlainDate().toString(), profile);
    if (!context)
      throw new RuleResolutionError({
        code: "RULE_PACKAGE_NOT_FOUND",
        kind: "TARIFF",
        packageId: "tvoed-vka-anlage-a",
        effectiveDate: start.toPlainDate().toString(),
        message: "Für einen Dienst fehlt eine gültige E-Tabelle.",
      });
    const factor = context.rulePackage.rules.hourlyCalculation!.monthlyFactorThousandths;
    const hourlyCents = roundRemunerationCents(
      context.premiumCents * 60000,
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
      const percentage = rule.percentageBasisPoints;
      const rate = hourlyCents;
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
      const baseHourlyCents = roundRemunerationCents(
        context.overtimeBaseCents * 60000,
        context.fullTimeWeeklyMinutes * factor,
      );
      overtimeBaseCents += roundRemunerationCents(baseHourlyCents * overtimeInSection, 60);
      overtimePremiumCents += roundRemunerationCents(
        hourlyCents * overtimeInSection * context.overtimePercentageBasisPoints,
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

export function calculateVkaEMonth(
  month: string,
  shifts: readonly ShiftEntry[],
  profile: UserProfile,
  decision: MonthlyTariffDecision | null,
  assessmentShifts: readonly ShiftEntry[],
  settings: TvoedWorkPatternSettings,
  resolver: RuleResolver,
): MonthlyPayEstimate {
  const date = month + "-01";
  const context = eContext(date, profile);
  const empty = createManualMonthlyPayEstimate(month, 0);
  if (!context)
    return {
      ...empty,
      tariffLabel: "TVöD · E-Tabelle",
      available: false,
      fullTimeTableAmount: null,
      personalBaseAmount: null,
      estimatedGrossAmount: null,
    };
  const assessment = calculateVkaEAssessment(
    month,
    assessmentShifts,
    settings,
    resolver,
    profile,
  ).assessment!;
  const monthShifts = shifts.filter(
    (s) => s.deletedAt === null && s.date.startsWith(month + "-") && isPayWorkShift(s),
  );
  const shiftBreakdowns = monthShifts.map((s) => calculateVkaEShift(s, profile, resolver));
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
  const selection = profile.vkaETariff!;
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
  if (rules.length > 1) throw new Error("Mehrere E-Schichtzulagen für diesen Monat.");
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
  const fixedCents =
    selection.sector === "BT_K" && !["E1", "E2", "E3", "E4"].includes(selection.payGroup)
      ? selection.tariffRegion === "KAV_BW"
        ? 3500
        : 2500
      : 0;
  const tvoedAllowanceAmount =
    roundRemunerationCents(fixedCents * profile.weeklyMinutes, context.fullTimeWeeklyMinutes) / 100;
  return {
    ...empty,
    month,
    tariffLabel: "TVöD · E-Tabelle",
    available: true,
    fullTimeTableAmount: context.monthlyCents / 100,
    personalBaseAmount,
    shiftBreakdowns,
    timePremiumAmount,
    overtimeAmount,
    allowanceAmount,
    tvoedAllowanceAmount,
    careAllowanceAmount: 0,
    estimatedGrossAmount: money(
      personalBaseAmount +
        timePremiumAmount +
        overtimeAmount +
        allowanceAmount +
        tvoedAllowanceAmount,
    ),
    assessment,
    confirmedAllowance: decision?.allowanceStatus ?? null,
  };
}
