import { Temporal } from "@js-temporal/polyfill";
import old from "../../rules/packages/reviewed/tval-pflege-tdl/2025-11.json";
import current from "../../rules/packages/reviewed/tval-pflege-tdl/2026-04.json";
import january from "../../rules/packages/reviewed/tval-pflege-tdl/2027-01.json";
import march from "../../rules/packages/reviewed/tval-pflege-tdl/2027-03.json";
import future from "../../rules/packages/reviewed/tval-pflege-tdl/2028-01.json";
import { requireTvalPflegeTariff, type TvalPflegeTariff } from "@/domain/tval-pflege-tariff";
import { ALLOWANCE_STATUSES } from "@/domain/types";
import type {
  AllowanceStatus,
  MonthlyPayEstimate,
  ShiftEntry,
  TvoedAssessment,
  UserProfile,
} from "@/domain/types";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { bundledRuleResolver, type RuleResolver } from "@/rules/rule-resolver";
import { validateRulePackage } from "@/rules/validation";
import { overlaySimpleTariffPackage, selectSimpleTariffTable } from "./simple-tariff-table-overlay";
import { createManualMonthlyPayEstimate } from "./pay-fallback";
import { roundRemunerationCents } from "./remuneration-money";
import { calculateTvlFamilyShift } from "./simple-tvl-family-shift";
import { isPayWorkShift } from "./tvoed-pattern";

// Reviewed table amounts overlay the dated local university nursing policy template.
const packages = [old, current, january, march, future].map((raw) => {
  const result = validateRulePackage(raw);
  if (
    !result.ok ||
    result.value.kind !== "TARIFF" ||
    result.value.packageId !== "tval-pflege-tdl" ||
    result.value.engineContractVersion !== 13
  )
    throw new Error("Ung\u00fcltige TVA-L-Ausbildungstabelle.");
  return result.value;
});
const active = (
  date: string,
  item: { readonly validFrom: string; readonly validTo: string | null },
) => item.validFrom <= date && (item.validTo === null || date <= item.validTo);
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export function getTvalPflegeRulePackage(
  date: string,
  resolver: RuleResolver = bundledRuleResolver,
): RuleTariffPackage | null {
  const key = Temporal.PlainDate.from(date).toString();
  const local = packages.find((p) => active(key, p));
  return local
    ? overlaySimpleTariffPackage(
        local,
        selectSimpleTariffTable(resolver, "TVAL_PFLEGE", key),
        resolver,
      )
    : null;
}
export function getTvalPflegeFullTimeMinutes(
  date: string,
  region: TvalPflegeTariff["universityRegion"],
  resolver: RuleResolver = bundledRuleResolver,
): number | null {
  if (region !== "WEST" && region !== "EAST") return null;
  const regionId = region === "WEST" ? "WEST_38_5" : "EAST_UNIVERSITY_HOSPITAL";
  const rows = getTvalPflegeRulePackage(date, resolver)?.rules.employmentWorkingTimeRules?.filter(
    (r) => r.variantId === "CARE" && r.regionId === regionId && active(date, r),
  );
  return rows?.length === 1 ? rows[0].fullTimeWeeklyMinutes : null;
}
function context(
  date: string,
  tariff: TvalPflegeTariff,
  weeklyMinutes: number,
  resolver: RuleResolver,
) {
  const selected = requireTvalPflegeTariff(tariff);
  const pkg = getTvalPflegeRulePackage(date, resolver);
  const fullTime = selected
    ? getTvalPflegeFullTimeMinutes(date, selected.universityRegion, resolver)
    : null;
  if (
    !selected ||
    !pkg ||
    fullTime === null ||
    !Number.isSafeInteger(weeklyMinutes) ||
    weeklyMinutes <= 0 ||
    weeklyMinutes > fullTime
  )
    return null;
  const entries = pkg.rules.payTables
    .flatMap((t) => t.entries)
    .filter((e) => e.groupId === "regular" && e.stepId === String(selected.trainingYear));
  const policy = pkg.rules.tvalTimePremiumPolicy,
    overtime = pkg.rules.tvalOvertimePolicy;
  if (entries.length !== 1 || !policy || !overtime) return null;
  const monthly = entries[0].monthlyCents;
  return {
    pkg,
    monthly,
    fullTime,
    premiumHourlyCents: roundRemunerationCents(
      monthly * 60000,
      fullTime * policy.monthlyFactorThousandths,
    ),
    overtimeHourlyCents: roundRemunerationCents(
      monthly * 60000,
      fullTime * overtime.monthlyFactorThousandths,
    ),
    overtimeBasisPoints: overtime.percentageBasisPoints,
    policy: {
      ...policy,
      saturdaySalariedShiftHourlyCents: policy.hospitalSalariedShiftHourlyCents,
    },
  };
}
export function calculateTvalPflegeShift(
  shift: ShiftEntry,
  work: UserProfile,
  selection: TvalPflegeTariff,
  saturdayShiftWork: boolean,
  resolver: RuleResolver = bundledRuleResolver,
) {
  return calculateTvlFamilyShift(shift, work, saturdayShiftWork, resolver, {
    packageId: "tval-pflege-tdl",
    rulePrefix: "tval",
    roundHourlyPremium: true,
    failureMessage:
      "F\u00fcr einen Dienst fehlt eine g\u00fcltige TVA-L-Ausbildungstabelle oder Vollzeitbasis.",
    context: (date) => context(date, selection, work.weeklyMinutes, resolver),
  });
}
export interface TvalPflegeCalculationOptions {
  readonly allowanceStatus: AllowanceStatus;
  readonly saturdayShiftWork: boolean;
  readonly assessment?: TvoedAssessment;
  readonly confirmedAllowance?: AllowanceStatus | null;
}
export function calculateTvalPflegeMonth(
  month: string,
  shifts: readonly ShiftEntry[],
  work: UserProfile,
  selection: TvalPflegeTariff,
  options: TvalPflegeCalculationOptions,
  resolver: RuleResolver = bundledRuleResolver,
): MonthlyPayEstimate {
  if (
    !/^\d{4}-\d{2}$/.test(month) ||
    !ALLOWANCE_STATUSES.includes(options.allowanceStatus) ||
    typeof options.saturdayShiftWork !== "boolean" ||
    (options.confirmedAllowance != null && options.confirmedAllowance !== options.allowanceStatus)
  )
    throw new Error("Ung\u00fcltige TVA-L-Monatsangaben.");
  const date = Temporal.PlainYearMonth.from(month).toPlainDate({ day: 1 }).toString();
  const ctx = context(date, selection, work.weeklyMinutes, resolver);
  const empty = { ...createManualMonthlyPayEstimate(month, 0), tariffLabel: "TVA-L Pflege" };
  const allowancePolicy = ctx?.pkg.rules.tvalShiftAllowancePolicy;
  const periods = allowancePolicy?.scopes
    .find((s) => s.id === "SECTION_43")
    ?.rates.periods.filter((p) => active(date, p));
  if (!ctx || !allowancePolicy || periods?.length !== 1)
    return {
      ...empty,
      available: false,
      fullTimeTableAmount: null,
      personalBaseAmount: null,
      estimatedGrossAmount: null,
    };
  const policy = periods[0];
  const breakdowns = shifts
    .filter((s) => s.deletedAt === null && s.date.startsWith(month + "-") && isPayWorkShift(s))
    .map((s) => calculateTvalPflegeShift(s, work, selection, options.saturdayShiftWork, resolver));
  const personalBaseAmount =
    roundRemunerationCents(ctx.monthly * work.weeklyMinutes, ctx.fullTime) / 100;
  const status = options.allowanceStatus,
    monthly = status.endsWith("_MONTHLY"),
    alternating = status.startsWith("ALTERNATING");
  const adultRate =
    status === "NONE"
      ? 0
      : alternating
        ? monthly
          ? policy.alternatingMonthlyCents
          : policy.alternatingHourlyCents
        : monthly
          ? policy.shiftMonthlyCents
          : policy.shiftHourlyCents;
  const rate = roundRemunerationCents(adultRate * allowancePolicy.shareBasisPoints, 10000);
  const allowanceAmount =
    roundRemunerationCents(
      rate * (monthly ? work.weeklyMinutes : breakdowns.reduce((sum, b) => sum + b.netMinutes, 0)),
      monthly ? ctx.fullTime : 60,
    ) / 100;
  const timePremiumAmount = money(
    breakdowns.reduce(
      (sum, b) => sum + b.premiumLines.reduce((total, p) => total + p.amount, 0),
      0,
    ),
  );
  const overtimeAmount = money(
    breakdowns.reduce((sum, b) => sum + b.overtimeBaseAmount + b.overtimePremiumAmount, 0),
  );
  return {
    ...empty,
    available: true,
    fullTimeTableAmount: ctx.monthly / 100,
    personalBaseAmount,
    careAllowanceAmount: 0,
    tvoedAllowanceAmount: 0,
    allowanceAmount,
    timePremiumAmount,
    overtimeAmount,
    shiftBreakdowns: breakdowns,
    estimatedGrossAmount: money(
      personalBaseAmount + allowanceAmount + timePremiumAmount + overtimeAmount,
    ),
    assessment: options.assessment ?? empty.assessment,
    confirmedAllowance: options.confirmedAllowance ?? null,
  };
}
