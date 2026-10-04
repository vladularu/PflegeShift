import type { SQLiteDatabase } from "expo-sqlite";
import { listMonthlyAllowanceDecisions } from "./allowance-decision-repository";
import { mapShift } from "./calendar-entry-repository";
import { listCaritasMonthFacts } from "./caritas-month-facts-repository";
import { listCaritasOvertime } from "./caritas-overtime-repository";
import { listCaritasWorkDays } from "./caritas-work-day-repository";
import { listOvertimeAllocations } from "./overtime-allocation-repository";
import { loadProfile } from "./profile-repository";
import { listRemunerationProfiles } from "./remuneration-profile-repository";
import { listTariffAnnualClaims } from "./tariff-annual-claim-repository";
import { listShiftTraining } from "./training-repository";
import { withImmediateTransaction } from "./transaction";

/** One full local view: delayed cash payouts may refer to work before the selected month. */
export async function loadCaritasDraftSnapshot(db: SQLiteDatabase) {
  return withImmediateTransaction(db, async (tx) => {
    const profile = await loadProfile(tx);
    const shiftRows = await tx.getAllAsync<Parameters<typeof mapShift>[0]>(
      "SELECT * FROM shift_entries WHERE deleted_at IS NULL ORDER BY date,id",
    );
    const shifts = Object.freeze(shiftRows.map(mapShift));
    const pauseDetails = await listShiftTraining(tx);
    const remunerationProfiles = await listRemunerationProfiles(tx);
    const allowanceDecisions = await listMonthlyAllowanceDecisions(tx);
    const overtimeAllocations = await listOvertimeAllocations(tx);
    const overtimeConfirmations = await listCaritasOvertime(tx);
    const monthFacts = await listCaritasMonthFacts(tx);
    const workDayConfirmations = await listCaritasWorkDays(tx);
    const tariffAnnualClaims = await listTariffAnnualClaims(tx);
    return Object.freeze({
      profile,
      shifts,
      pauseDetails,
      remunerationProfiles,
      allowanceDecisions,
      overtimeAllocations,
      overtimeConfirmations,
      monthFacts,
      workDayConfirmations,
      tariffAnnualClaims,
      entriesComplete: true as const,
      historyComplete: true as const,
    });
  });
}
