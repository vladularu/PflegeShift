import type { SQLiteDatabase } from "expo-sqlite";
import { listMonthlyAllowanceDecisions } from "./allowance-decision-repository";
import { listOvertimeAllocations } from "./overtime-allocation-repository";
import { listPaidAbsences } from "./paid-absence-repository";
import { listRemunerationProfiles } from "./remuneration-profile-repository";
import { withImmediateTransaction } from "./transaction";
import { listActualOwnAnnualPayments } from "./annual-payment-repository";
import { listTariffAnnualClaims } from "./tariff-annual-claim-repository";
import { listTvlShiftWork } from "./tvl-shift-work-repository";
import { listCaritasMonthFacts } from "./caritas-month-facts-repository";
import { listTvoedAnnexAMonthConfirmations } from "./tvoed-annex-a-month-confirmation-repository";
import { listTvoedAnnexAPremiumFacts } from "./tvoed-annex-a-premium-facts-repository";
import { listTvoedSueMonthConfirmations } from "./tvoed-sue-month-confirmation-repository";
import { listTvoedSueAllowanceConfirmations } from "./tvoed-sue-allowance-confirmation-repository";
import { listDrkEmployeeMonthConfirmations } from "./drk-employee-month-confirmation-repository";
import { listDrkTrainingMonthConfirmations } from "./drk-training-month-confirmation-repository";

/** One committed view; do not mix a pre-write profile with post-write confirmations. */
export async function loadRemunerationSnapshot(db: SQLiteDatabase) {
  return withImmediateTransaction(db, async (transaction) => {
    const profiles = await listRemunerationProfiles(transaction);
    const allowanceDecisions = await listMonthlyAllowanceDecisions(transaction);
    const overtimeAllocations = await listOvertimeAllocations(transaction);
    const paidAbsences = await listPaidAbsences(transaction);
    const actualAnnualPayments = await listActualOwnAnnualPayments(transaction);
    const tariffAnnualClaims = await listTariffAnnualClaims(transaction);
    const tvlShiftWork = await listTvlShiftWork(transaction);
    const caritasMonthFacts = await listCaritasMonthFacts(transaction);
    const tvoedAnnexAMonthConfirmations = await listTvoedAnnexAMonthConfirmations(transaction);
    const tvoedAnnexAPremiumFacts = await listTvoedAnnexAPremiumFacts(transaction);
    const tvoedSueMonthConfirmations = await listTvoedSueMonthConfirmations(transaction);
    const tvoedSueAllowanceConfirmations = await listTvoedSueAllowanceConfirmations(transaction);
    const drkEmployeeMonthConfirmations = await listDrkEmployeeMonthConfirmations(transaction);
    const drkTrainingMonthConfirmations = await listDrkTrainingMonthConfirmations(transaction);
    return Object.freeze({
      drkEmployeeMonthConfirmations,
      drkTrainingMonthConfirmations,
      caritasMonthFacts,
      tvoedAnnexAMonthConfirmations,
      tvoedAnnexAPremiumFacts,
      tvoedSueMonthConfirmations,
      tvoedSueAllowanceConfirmations,
      tvlShiftWork,
      profiles,
      allowanceDecisions,
      overtimeAllocations,
      paidAbsences,
      actualAnnualPayments,
      tariffAnnualClaims,
    });
  });
}
