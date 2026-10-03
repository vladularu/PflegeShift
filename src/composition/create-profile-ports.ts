import type { SQLiteDatabase } from "expo-sqlite";
import type {
  PflegeShiftRepositoryPort,
  RemunerationRepositoryPort,
} from "@/application/pflegeshift-ports";
import { loadProfile, saveProfile } from "@/infrastructure/database/repository";
import { saveDatedRemunerationProfile } from "@/infrastructure/database/remuneration-profile-repository";
import { loadRemunerationSnapshot } from "@/infrastructure/database/remuneration-snapshot-repository";
import { saveMonthlyAllowanceDecisions } from "@/infrastructure/database/allowance-decision-repository";
import { saveOvertimeAllocation } from "@/infrastructure/database/overtime-allocation-repository";
import { savePaidAbsence } from "@/infrastructure/database/paid-absence-repository";
import { saveTvlShiftWork } from "@/infrastructure/database/tvl-shift-work-repository";
import { saveCaritasMonthFacts } from "@/infrastructure/database/caritas-month-facts-repository";
import { saveTvoedAnnexAMonthConfirmation } from "@/infrastructure/database/tvoed-annex-a-month-confirmation-repository";
import { saveTvoedAnnexAPremiumFacts } from "@/infrastructure/database/tvoed-annex-a-premium-facts-repository";
import { saveTvoedSueMonthConfirmation } from "@/infrastructure/database/tvoed-sue-month-confirmation-repository";
import { saveTvoedSueAllowanceConfirmation } from "@/infrastructure/database/tvoed-sue-allowance-confirmation-repository";
import { saveDrkEmployeeMonthConfirmation } from "@/infrastructure/database/drk-employee-month-confirmation-repository";
import { saveDrkTrainingMonthConfirmation } from "@/infrastructure/database/drk-training-month-confirmation-repository";
import {
  saveActualOwnAnnualPayment,
  revokeActualOwnAnnualPayment,
} from "@/infrastructure/database/annual-payment-repository";
import type { TrainingRepositoryPort } from "@/application/training-ports";
import {
  saveTariffAnnualClaim,
  revokeTariffAnnualClaim,
} from "@/infrastructure/database/tariff-annual-claim-repository";
import {
  loadTrainingSnapshot,
  saveTrainingProfile,
  saveShiftTraining,
} from "@/infrastructure/database/training-repository";

/** Keeps personal profile and remuneration bindings on the same keyed connection. */
export function createProfilePorts(db: SQLiteDatabase): {
  readonly repository: Pick<PflegeShiftRepositoryPort, "loadProfile" | "saveProfile">;
  readonly remuneration: RemunerationRepositoryPort;
  readonly training: TrainingRepositoryPort;
} {
  return {
    training: {
      loadSnapshot: () => loadTrainingSnapshot(db),
      saveProfile: (input) => saveTrainingProfile(db, input),
      saveShift: (input) => saveShiftTraining(db, input),
    },
    repository: {
      loadProfile: () => loadProfile(db),
      saveProfile: (input) => saveProfile(db, input),
    },
    remuneration: {
      saveDrkEmployeeMonthConfirmation: (input) => saveDrkEmployeeMonthConfirmation(db, input),
      saveDrkTrainingMonthConfirmation: (input) => saveDrkTrainingMonthConfirmation(db, input),
      saveCaritasMonthFacts: (input) => saveCaritasMonthFacts(db, input),
      saveTvoedAnnexAMonthConfirmation: (input) => saveTvoedAnnexAMonthConfirmation(db, input),
      saveTvoedAnnexAPremiumFacts: (input) => saveTvoedAnnexAPremiumFacts(db, input),
      saveTvoedSueMonthConfirmation: (input) => saveTvoedSueMonthConfirmation(db, input),
      saveTvoedSueAllowanceConfirmation: (input) => saveTvoedSueAllowanceConfirmation(db, input),
      saveTvlShiftWork: (input) => saveTvlShiftWork(db, input),
      saveTariffAnnualClaim: (input) => saveTariffAnnualClaim(db, input),
      revokeTariffAnnualClaim: (expected) => revokeTariffAnnualClaim(db, expected),
      saveActualAnnualPayment: (input) => saveActualOwnAnnualPayment(db, input),
      revokeActualAnnualPayment: (expected) => revokeActualOwnAnnualPayment(db, expected),
      savePaidAbsence: (input) => savePaidAbsence(db, input),
      loadSnapshot: () => loadRemunerationSnapshot(db),
      saveProfile: (input) => saveDatedRemunerationProfile(db, input),
      saveAllowanceDecisions: (input) => saveMonthlyAllowanceDecisions(db, input),
      saveOvertimeAllocation: (input) => saveOvertimeAllocation(db, input),
    },
  };
}
