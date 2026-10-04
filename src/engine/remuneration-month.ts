import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type { SavedOvertimeAllocation } from "@/domain/overtime-allocation";
import type { SavedPaidAbsence } from "@/domain/paid-absence";
import type { ActualOwnAnnualPayment } from "@/domain/annual-payment";
import type { SavedTariffAnnualClaim } from "@/domain/saved-tariff-annual-claim";
import type { SavedTvlShiftWork } from "@/domain/saved-tvl-shift-work";
import type { SavedTvoedAnnexAMonthConfirmation } from "@/domain/saved-tvoed-annex-a-month-confirmation";
import type { SavedTvoedAnnexAPremiumFacts } from "@/domain/saved-tvoed-annex-a-premium-facts";
import type { SavedShiftTraining } from "@/domain/training-data";

import type { SavedTvoedSueMonthConfirmation } from "@/domain/saved-tvoed-sue-month-confirmation";
import type { SavedTvoedSueAllowanceConfirmation } from "@/domain/saved-tvoed-sue-allowance-confirmation";
import { calculateOwnAnnualPayments } from "./remuneration-annual-payment";
import { calculateTariffAnnualPayments, combineAnnualPayments } from "./remuneration-tariff-annual";
import { missingTariffAnnualClaims } from "./remuneration-annual-coverage";
import type { RemunerationPosition, RemunerationStatus } from "@/domain/remuneration-result";
import type {
  DatedAllowanceEntitlement,
  OvertimeDayAllocation,
} from "@/domain/remuneration-supplement";
import type { ShiftEntry, UserProfile } from "@/domain/types";
import { bundledRuleResolver, type RuleResolver } from "@/rules/rule-resolver";
import {
  calculateMonthlyBaseRemuneration,
  type TvoedAnnexAMonthConfirmation,
  type TvoedSueMonthConfirmation,
} from "./remuneration-base";
import { calculateMonthlyTimeRemuneration } from "./remuneration-premiums";
import { calculateMonthlyDatedAllowances } from "./remuneration-allowances";
import { calculateMonthlyDatedOvertime } from "./remuneration-overtime";
import {
  deriveDatedAllowanceAssessments,
  type DatedAllowanceAssessmentInput,
} from "./remuneration-assessment";

import { resolveSavedTvoedAnnexAMonthConfirmation } from "./tvoed-annex-a-saved-confirmation";
import { calculateSavedTvoedAnnexADraftTimePremiums } from "./tvoed-annex-a-saved-premiums";

import { resolveSavedTvoedSueMonthConfirmation } from "./tvoed-sue-saved-confirmation";
import { calculateSavedTvoedSueAllowancePosition } from "./tvoed-sue-saved-allowance";
import { summarizeSupplements } from "./remuneration-supplement-result";

export interface DatedMonthlyRemunerationInput {
  readonly month: string;
  readonly shifts: readonly ShiftEntry[];
  readonly workProfile: UserProfile;
  readonly history: readonly DatedRemunerationProfile[];
  readonly allowanceEntitlements: readonly DatedAllowanceEntitlement[];
  readonly overtimeAllocations?: ReadonlyMap<string, readonly OvertimeDayAllocation[]>;
  readonly savedOvertimeAllocations?: readonly SavedOvertimeAllocation[];
  readonly paidAbsences?: readonly SavedPaidAbsence[];
  readonly actualAnnualPayments?: readonly ActualOwnAnnualPayment[];
  readonly tariffAnnualClaims?: readonly SavedTariffAnnualClaim[];
  readonly tvlShiftWork?: readonly SavedTvlShiftWork[];
  readonly annexAConfirmation?: TvoedAnnexAMonthConfirmation;
  readonly sueConfirmation?: TvoedSueMonthConfirmation;
  readonly savedAnnexAConfirmations?: readonly SavedTvoedAnnexAMonthConfirmation[];
  readonly savedAnnexAPremiumFacts?: readonly SavedTvoedAnnexAPremiumFacts[];
  readonly annexAPauseDetails?: readonly SavedShiftTraining[];
  readonly annexAEntriesComplete?: boolean;
  readonly annexAPauseDetailsComplete?: boolean;
  readonly savedSueConfirmations?: readonly SavedTvoedSueMonthConfirmation[];
  readonly savedSueAllowanceConfirmations?: readonly SavedTvoedSueAllowanceConfirmation[];
  readonly resolver?: RuleResolver;
}

/** App-facing orchestration: assessment and money use the same dated tariff context. */
export function calculateAssessedMonthlyRemuneration(
  input: DatedAllowanceAssessmentInput &
    Pick<
      DatedMonthlyRemunerationInput,
      | "overtimeAllocations"
      | "savedOvertimeAllocations"
      | "paidAbsences"
      | "actualAnnualPayments"
      | "tariffAnnualClaims"
      | "tvlShiftWork"
      | "annexAConfirmation"
      | "sueConfirmation"
      | "savedAnnexAConfirmations"
      | "savedAnnexAPremiumFacts"
      | "annexAPauseDetails"
      | "annexAEntriesComplete"
      | "annexAPauseDetailsComplete"
      | "savedSueConfirmations"
      | "savedSueAllowanceConfirmations"
    >,
) {
  const allowanceAssessment = deriveDatedAllowanceAssessments(input);
  const remuneration = calculateDatedMonthlyRemuneration({
    ...input,
    allowanceEntitlements: allowanceAssessment.entitlements,
  });
  return { ...remuneration, allowanceAssessment };
}

/** Dated components and cash-month annual payments share one result contract. */
export function calculateDatedMonthlyRemuneration(input: DatedMonthlyRemunerationInput) {
  const {
    month,
    shifts,
    workProfile,
    history,
    allowanceEntitlements,
    overtimeAllocations,
    savedOvertimeAllocations,
    resolver = bundledRuleResolver,
  } = input;
  const sueConfirmation =
    input.sueConfirmation ??
    resolveSavedTvoedSueMonthConfirmation(
      month,
      history,
      input.savedSueConfirmations ?? [],
      resolver,
    );
  const base = calculateMonthlyBaseRemuneration(
    month,
    history,
    resolver,
    {
      shifts,
      timeZone: workProfile.timeZone,
      paidAbsences: input.paidAbsences ?? [],
    },
    input.annexAConfirmation ??
      resolveSavedTvoedAnnexAMonthConfirmation(
        month,
        history,
        input.savedAnnexAConfirmations ?? [],
        resolver,
      ),
    sueConfirmation,
  );
  const timePremiums =
    calculateSavedTvoedAnnexADraftTimePremiums({
      month,
      shifts,
      workProfile,
      history,
      savedMonthConfirmations: input.savedAnnexAConfirmations ?? [],
      savedPremiumFacts: input.savedAnnexAPremiumFacts ?? [],
      pauseDetails: input.annexAPauseDetails ?? [],
      entriesComplete: input.annexAEntriesComplete === true,
      pauseDetailsComplete: input.annexAPauseDetailsComplete === true,
      resolver,
    }) ??
    calculateMonthlyTimeRemuneration(
      month,
      shifts,
      workProfile,
      history,
      resolver,
      input.tvlShiftWork ?? [],
    );
  const datedAllowances = calculateMonthlyDatedAllowances(
    month,
    shifts,
    workProfile,
    history,
    allowanceEntitlements,
    resolver,
    input.tvlShiftWork ?? [],
  );
  const sueAllowance = calculateSavedTvoedSueAllowancePosition(
    month,
    history,
    input.savedSueAllowanceConfirmations ?? [],
    sueConfirmation,
    resolver,
  );
  const allowances = sueAllowance
    ? summarizeSupplements([...datedAllowances.positions, sueAllowance])
    : datedAllowances;
  const overtime = calculateMonthlyDatedOvertime(
    month,
    shifts,
    workProfile,
    history,
    resolver,
    overtimeAllocations,
    savedOvertimeAllocations,
  );
  const annualPayments = combineAnnualPayments(
    calculateOwnAnnualPayments(month, history, input.actualAnnualPayments, resolver),
    calculateTariffAnnualPayments(month, input.tariffAnnualClaims ?? [], resolver),
    missingTariffAnnualClaims(month, history, input.tariffAnnualClaims ?? [], resolver),
  );
  const components = [base, timePremiums, allowances, overtime, annualPayments];
  const complete = components.every((component) => component.complete);
  const knownSubtotalCents = components.reduce(
    (sum, component) => sum + component.knownSubtotalCents,
    0,
  );
  const status: RemunerationStatus = !complete
    ? "unavailable"
    : components.some((component) => component.status === "estimated")
      ? "estimated"
      : "calculated";
  const positions: readonly RemunerationPosition[] = [
    ...base.positions,
    ...timePremiums.positions,
    ...allowances.positions,
    ...overtime.positions,
    ...annualPayments.positions,
  ];
  return {
    month,
    complete,
    status,
    knownSubtotalCents,
    estimatedGrossCents: complete ? knownSubtotalCents : null,
    base,
    timePremiums,
    allowances,
    overtime,
    annualPayments,
    positions,
  };
}
