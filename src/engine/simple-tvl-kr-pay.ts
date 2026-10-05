import { Temporal } from "@js-temporal/polyfill";
import kr2025 from "../../rules/packages/reviewed/tvl-kr-tdl/2025-11.json";
import kr2026 from "../../rules/packages/reviewed/tvl-kr-tdl/2026-04.json";
import kr2027 from "../../rules/packages/reviewed/tvl-kr-tdl/2027-03.json";
import kr2028 from "../../rules/packages/reviewed/tvl-kr-tdl/2028-01.json";
import {
  requireTvlKrTariff,
  type TvlKrTariff,
  type TvlKrUniversityRegion,
} from "@/domain/tvl-kr-tariff";
import { ALLOWANCE_STATUSES } from "@/domain/types";
import type {
  AllowanceStatus,
  MonthlyPayEstimate,
  ShiftEntry,
  ShiftPremiumBreakdown,
  TvoedAssessment,
  UserProfile,
} from "@/domain/types";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { bundledRuleResolver, type RuleResolver } from "@/rules/rule-resolver";
import { validateRulePackage } from "@/rules/validation";
import { createManualMonthlyPayEstimate } from "./pay-fallback";
import { roundRemunerationCents } from "./remuneration-money";
import { isPayWorkShift } from "./tvoed-pattern";
import { calculateTvlFamilyShift } from "./simple-tvl-family-shift";

// A bounded local adapter for the explicitly selected nursing table. The raw
// packages retain DRAFT; this does not extend the remote catalog's contracts.
const packages = [kr2025, kr2026, kr2027, kr2028].map((raw) => {
  const result = validateRulePackage(raw);
  if (
    !result.ok ||
    result.value.kind !== "TARIFF" ||
    result.value.packageId !== "tvl-kr-tdl" ||
    result.value.engineContractVersion !== 12
  )
    throw new Error("Ungültige TV-L-Pflegetabelle.");
  return result.value;
});
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const active = (
  date: string,
  item: { readonly validFrom: string; readonly validTo: string | null },
) => item.validFrom <= date && (item.validTo === null || date <= item.validTo);

export function getTvlKrRulePackage(date: string): RuleTariffPackage | null {
  const key = Temporal.PlainDate.from(date).toString();
  return packages.find((p) => active(key, p)) ?? null;
}

export function getTvlKrUniversityFullTimeMinutes(
  date: string,
  region: TvlKrUniversityRegion,
): number | null {
  if (region !== "WEST" && region !== "EAST") return null;
  const pkg = getTvlKrRulePackage(date);
  const regionId = region === "WEST" ? "WEST_38_5" : "EAST_UNIVERSITY_HOSPITAL";
  const rules = pkg?.rules.employmentWorkingTimeRules?.filter(
    (r) => r.variantId === "SECTION_43" && r.regionId === regionId && active(date, r),
  );
  return rules?.length === 1 ? rules[0].fullTimeWeeklyMinutes : null;
}

function context(
  date: string,
  selection: TvlKrTariff,
  region: TvlKrUniversityRegion,
  weeklyMinutes: number,
) {
  const selected = requireTvlKrTariff(selection);
  const pkg = getTvlKrRulePackage(date);
  const fullTime = getTvlKrUniversityFullTimeMinutes(date, region);
  if (
    !selected ||
    !pkg ||
    fullTime === null ||
    !Number.isSafeInteger(weeklyMinutes) ||
    weeklyMinutes <= 0 ||
    weeklyMinutes > fullTime
  )
    return null;
  const group = selected.payGroup.toLowerCase();
  const entries = pkg.rules.payTables
    .filter((t) => t.id === pkg.rules.selector.payTableId)
    .flatMap((t) => t.entries);
  const value = (step: number) => {
    const matching = entries.filter((e) => e.groupId === group && e.stepId === String(step));
    return matching.length === 1 ? matching[0].monthlyCents : null;
  };
  const monthly = value(selected.payLevel),
    premium = value(3),
    overtime = value(Math.min(selected.payLevel, 4));
  const policy = pkg.rules.tvlTimePremiumPolicy,
    overtimePolicy = pkg.rules.tvlOvertimePolicy;
  const overtimeRules = overtimePolicy?.groupRates.filter((r) => r.groupId === group);
  if (
    monthly === null ||
    premium === null ||
    overtime === null ||
    !policy ||
    !overtimePolicy ||
    overtimeRules?.length !== 1
  )
    return null;
  return {
    pkg,
    fullTime,
    monthly,
    premiumHourlyCents: roundRemunerationCents(
      premium * 60000,
      fullTime * policy.monthlyFactorThousandths,
    ),
    overtimeHourlyCents: roundRemunerationCents(
      overtime * 60000,
      fullTime * overtimePolicy.monthlyFactorThousandths,
    ),
    overtimeBasisPoints: overtimeRules[0].percentageBasisPoints,
    policy,
  };
}

export interface TvlKrCalculationOptions {
  readonly allowanceStatus: AllowanceStatus;
  /** Explicit nursing shift-work estimate/decision supplied by the caller. */
  readonly saturdayShiftWork: boolean;
  readonly assessment?: TvoedAssessment;
  readonly confirmedAllowance?: AllowanceStatus | null;
}

export function calculateTvlKrShift(
  shift: ShiftEntry,
  work: UserProfile,
  selection: TvlKrTariff,
  region: TvlKrUniversityRegion,
  saturdayShiftWork: boolean,
  resolver: RuleResolver = bundledRuleResolver,
): ShiftPremiumBreakdown {
  return calculateTvlFamilyShift(shift, work, saturdayShiftWork, resolver, {
    packageId: "tvl-kr-tdl",
    rulePrefix: "tvl",
    roundHourlyPremium: false,
    failureMessage:
      "F\u00fcr einen Dienst fehlt eine g\u00fcltige TV-L-Pflegetabelle oder Vollzeitbasis.",
    context: (date) => context(date, selection, region, work.weeklyMinutes),
  });
}

export function calculateTvlKrMonth(
  month: string,
  shifts: readonly ShiftEntry[],
  work: UserProfile,
  selection: TvlKrTariff,
  region: TvlKrUniversityRegion,
  options: TvlKrCalculationOptions,
  resolver: RuleResolver = bundledRuleResolver,
): MonthlyPayEstimate {
  if (
    !/^\d{4}-\d{2}$/.test(month) ||
    !ALLOWANCE_STATUSES.includes(options.allowanceStatus) ||
    typeof options.saturdayShiftWork !== "boolean" ||
    (options.confirmedAllowance != null && options.confirmedAllowance !== options.allowanceStatus)
  )
    throw new Error("Ungültige TV-L-Monatsangaben.");
  const date = Temporal.PlainYearMonth.from(month).toPlainDate({ day: 1 }).toString();
  const ctx = context(date, selection, region, work.weeklyMinutes);
  const empty = { ...createManualMonthlyPayEstimate(month, 0), tariffLabel: "TV-L Pflege" };
  if (!ctx)
    return {
      ...empty,
      available: false,
      fullTimeTableAmount: null,
      personalBaseAmount: null,
      estimatedGrossAmount: null,
    };
  const policy = ctx.pkg.rules.tvlShiftAllowancePolicy?.periods.find((p) => active(date, p));
  const care = ctx.pkg.rules.tvlCareAllowancePolicy;
  if (!policy || !care)
    return {
      ...empty,
      available: false,
      fullTimeTableAmount: null,
      personalBaseAmount: null,
      estimatedGrossAmount: null,
    };
  const breakdowns = shifts
    .filter((s) => s.deletedAt === null && s.date.startsWith(month + "-") && isPayWorkShift(s))
    .map((s) =>
      calculateTvlKrShift(s, work, selection, region, options.saturdayShiftWork, resolver),
    );
  const personalBaseAmount =
    roundRemunerationCents(ctx.monthly * work.weeklyMinutes, ctx.fullTime) / 100;
  const careAllowanceAmount =
    roundRemunerationCents(care.nursingMonthlyCents * work.weeklyMinutes, ctx.fullTime) / 100;
  const status = options.allowanceStatus;
  const monthly = status.endsWith("_MONTHLY"),
    alternating = status.startsWith("ALTERNATING");
  const rate =
    status === "NONE"
      ? 0
      : alternating
        ? monthly
          ? policy.alternatingMonthlyCents
          : policy.alternatingHourlyCents
        : monthly
          ? policy.shiftMonthlyCents
          : policy.shiftHourlyCents;
  const allowanceAmount =
    roundRemunerationCents(
      rate * (monthly ? work.weeklyMinutes : breakdowns.reduce((sum, b) => sum + b.netMinutes, 0)),
      monthly ? ctx.fullTime : 60,
    ) / 100;
  const timePremiumAmount = money(
    breakdowns.reduce((sum, b) => sum + b.premiumLines.reduce((s, p) => s + p.amount, 0), 0),
  );
  const overtimeAmount = money(
    breakdowns.reduce((sum, b) => sum + b.overtimeBaseAmount + b.overtimePremiumAmount, 0),
  );
  return {
    ...empty,
    available: true,
    fullTimeTableAmount: ctx.monthly / 100,
    personalBaseAmount,
    careAllowanceAmount,
    tvoedAllowanceAmount: 0,
    allowanceAmount,
    timePremiumAmount,
    overtimeAmount,
    shiftBreakdowns: breakdowns,
    estimatedGrossAmount: money(
      personalBaseAmount +
        careAllowanceAmount +
        allowanceAmount +
        timePremiumAmount +
        overtimeAmount,
    ),
    assessment: options.assessment ?? empty.assessment,
    confirmedAllowance: options.confirmedAllowance ?? null,
  };
}
