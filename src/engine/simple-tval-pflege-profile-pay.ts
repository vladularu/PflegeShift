import { Temporal } from "@js-temporal/polyfill";
import { requireTvalPflegeTariff } from "@/domain/tval-pflege-tariff";
import type {
  MonthlyTariffDecision,
  ShiftEntry,
  TvoedWorkPatternSettings,
  UserProfile,
} from "@/domain/types";
import type { RuleResolver } from "@/rules/rule-resolver";
import {
  calculateTvalPflegeMonth,
  calculateTvalPflegeShift,
  getTvalPflegeRulePackage,
} from "./simple-tval-pflege-pay";
import { calculateTvlKrAssessment } from "./simple-tvl-kr-profile-pay";

/** TVA-L section 8 uses TV-L section 7 shift definitions and the current-month night window. */
export function calculateTvalPflegeAssessment(
  month: string,
  shifts: readonly ShiftEntry[],
  settings: TvoedWorkPatternSettings,
  resolver: RuleResolver,
) {
  const date = Temporal.PlainYearMonth.from(month).toPlainDate({ day: 1 }).toString();
  if (!getTvalPflegeRulePackage(date))
    return { available: false, assessment: null, tariffLabel: "TVA-L Pflege" };
  return {
    ...calculateTvlKrAssessment(month, shifts, settings, resolver),
    tariffLabel: "TVA-L Pflege",
  };
}
export function calculateTvalPflegeProfileShift(
  shift: ShiftEntry,
  profile: UserProfile,
  resolver: RuleResolver,
  saturdayShiftWork: boolean,
) {
  const selection = requireTvalPflegeTariff(profile.tvalPflegeTariff);
  if (!selection) throw new Error("TVA-L-Ausbildungsjahr fehlt.");
  return calculateTvalPflegeShift(shift, profile, selection, saturdayShiftWork, resolver);
}
export function calculateTvalPflegeProfileMonth(
  month: string,
  shifts: readonly ShiftEntry[],
  profile: UserProfile,
  decision: MonthlyTariffDecision | null,
  assessmentShifts: readonly ShiftEntry[],
  settings: TvoedWorkPatternSettings,
  resolver: RuleResolver,
) {
  const selection = requireTvalPflegeTariff(profile.tvalPflegeTariff);
  if (!selection) throw new Error("TVA-L-Ausbildungsjahr fehlt.");
  const assessment = calculateTvalPflegeAssessment(
    month,
    assessmentShifts,
    settings,
    resolver,
  ).assessment;
  const allowanceStatus = decision?.allowanceStatus ?? assessment?.suggestedAllowance ?? "NONE";
  const saturdayShiftWork =
    assessment?.shiftWork === "DETECTED" ||
    assessment?.alternatingShiftWork === "DETECTED" ||
    allowanceStatus !== "NONE";
  return calculateTvalPflegeMonth(
    month,
    shifts,
    profile,
    selection,
    {
      allowanceStatus,
      saturdayShiftWork,
      assessment: assessment ?? undefined,
      confirmedAllowance: decision?.allowanceStatus ?? null,
    },
    resolver,
  );
}
