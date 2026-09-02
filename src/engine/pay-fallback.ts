import type { MonthlyPayEstimate, TvoedAssessment } from "@/domain/types";

const MANUAL_GROSS_ASSESSMENT: TvoedAssessment = Object.freeze({
  shiftWork: "NOT_DETECTED",
  alternatingShiftWork: "NOT_DETECTED",
  suggestedAllowance: "NONE",
  evidence: Object.freeze([]),
  criteria: Object.freeze([]),
  requiresConfirmation: false,
});

export function createManualMonthlyPayEstimate(
  month: string,
  manualMonthlyGrossCents: number,
): MonthlyPayEstimate {
  const personalBaseAmount = manualMonthlyGrossCents / 100;

  return {
    month,
    tariffLabel: "Manuell hinterlegt",
    available: true,
    fullTimeTableAmount: null,
    personalBaseAmount,
    shiftBreakdowns: [],
    timePremiumAmount: 0,
    overtimeAmount: 0,
    allowanceAmount: 0,
    tvoedAllowanceAmount: 0,
    careAllowanceAmount: 0,
    estimatedGrossAmount: personalBaseAmount,
    assessment: MANUAL_GROSS_ASSESSMENT,
    confirmedAllowance: null,
  };
}
