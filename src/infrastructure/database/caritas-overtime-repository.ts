import type { SQLiteDatabase } from "expo-sqlite";
import { ConcurrencyError } from "@/domain/errors";
import {
  isCurrentOvertimeAllocation,
  type SavedOvertimeAllocation,
} from "@/domain/overtime-allocation";
import {
  validateSavedCaritasOvertime,
  type SavedCaritasOvertime,
  type SaveCaritasOvertimeInput,
} from "@/domain/saved-caritas-overtime";
import {
  resolveRemunerationProfile,
  type DatedRemunerationProfile,
} from "@/domain/remuneration-profile";
import type { ShiftEntry } from "@/domain/types";
import { remunerationShiftDays } from "@/engine/remuneration-shift-days";
import { isPayWorkShift } from "@/engine/tvoed-pattern";
import { mapShift } from "./calendar-entry-repository";
import { loadOvertimeAllocation } from "./overtime-allocation-repository";
import { loadProfile } from "./profile-repository";
import { listRemunerationProfiles } from "./remuneration-profile-repository";
import { withImmediateTransaction } from "./transaction";

export const CARITAS_OVERTIME_COLUMNS = ["shift_id", "confirmation_json"] as const;

export interface CaritasOvertimeRow {
  readonly shift_id: string;
  readonly confirmation_json: string;
}

export function mapCaritasOvertimeRow(value: unknown): SavedCaritasOvertime {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Ungültige Caritas-Überstundenbestätigung.");
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).length !== CARITAS_OVERTIME_COLUMNS.length ||
    CARITAS_OVERTIME_COLUMNS.some((key) => !Object.hasOwn(row, key)) ||
    typeof row.confirmation_json !== "string"
  )
    throw new Error("Ungültige Caritas-Überstundenbestätigung.");
  const parsed = validateSavedCaritasOvertime(JSON.parse(row.confirmation_json));
  if (row.shift_id !== parsed.shiftId) throw new Error("Widersprüchliche Caritas-Dienstzuordnung.");
  return parsed;
}

export async function listCaritasOvertime(
  db: SQLiteDatabase,
): Promise<readonly SavedCaritasOvertime[]> {
  const rows = await db.getAllAsync<CaritasOvertimeRow>(
    "SELECT shift_id,confirmation_json FROM caritas_overtime ORDER BY shift_id",
  );
  return Object.freeze(rows.map(mapCaritasOvertimeRow));
}

export async function loadCaritasOvertime(
  db: SQLiteDatabase,
  shiftId: string,
): Promise<SavedCaritasOvertime | null> {
  const row = await db.getFirstAsync<CaritasOvertimeRow>(
    "SELECT shift_id,confirmation_json FROM caritas_overtime WHERE shift_id=?",
    shiftId,
  );
  return row === null ? null : mapCaritasOvertimeRow(row);
}

/** Backup imports may retain stale confirmations, never missing parents or future revisions. */
export function requireCaritasOvertimeParents(
  value: SavedCaritasOvertime,
  shift: ShiftEntry | undefined,
  allocation: SavedOvertimeAllocation | undefined,
  profiles: readonly DatedRemunerationProfile[],
): void {
  const profile = profiles.find((item) => item.effectiveFrom === value.profileEffectiveFrom);
  if (
    !shift ||
    !allocation ||
    !profile ||
    value.shiftRevision > shift.revision ||
    value.allocationRevision > allocation.revision ||
    value.profileRevision > profile.revision ||
    allocation.shiftId !== value.shiftId
  )
    throw new Error("Ungültige Referenz der Caritas-Überstundenbestätigung.");
  if (value.profileRevision === profile.revision) {
    const selection = profile.data.selection;
    if (
      selection.kind !== "tariff" ||
      selection.packageId !== value.packageId ||
      selection.variant !== value.variantId ||
      selection.region !== value.regionId
    )
      throw new Error("Widersprüchliche Caritas-Tarifzuordnung.");
  }
}

export async function saveCaritasOvertime(
  db: SQLiteDatabase,
  input: SaveCaritasOvertimeInput,
): Promise<SavedCaritasOvertime> {
  for (const revision of [
    input.expectedRevision,
    input.expectedShiftRevision,
    input.expectedAllocationRevision,
    input.expectedProfileRevision,
  ])
    if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER)
      throw new Error("Ungültige Bestätigungsrevision.");
  return withImmediateTransaction(db, async (tx) => {
    const row = await tx.getFirstAsync<Parameters<typeof mapShift>[0]>(
      "SELECT * FROM shift_entries WHERE id=? AND deleted_at IS NULL",
      input.shiftId,
    );
    if (!row) throw new ConcurrencyError("Der Dienst ist nicht mehr verfügbar.");
    const shift = mapShift(row);
    const userProfile = await loadProfile(tx);
    const allocation = await loadOvertimeAllocation(tx, input.shiftId);
    if (
      !isPayWorkShift(shift) ||
      shift.revision !== input.expectedShiftRevision ||
      shift.updatedAt !== input.expectedShiftUpdatedAt ||
      userProfile?.timeZone !== input.timeZone ||
      !allocation ||
      allocation.revision !== input.expectedAllocationRevision ||
      !isCurrentOvertimeAllocation(allocation, shift, input.timeZone)
    )
      throw new ConcurrencyError(
        "Dienst, Überstundenaufteilung oder Zeitzone wurden geändert. Bitte neu laden.",
      );
    const validDays = new Set(remunerationShiftDays(shift, input.timeZone).map((day) => day.date));
    if (!allocation.allocations?.every((day) => validDays.has(day.date)))
      throw new Error("Die Überstundenaufteilung gehört nicht zu diesem Dienst.");
    const latestOvertimeMonth = allocation.allocations
      .filter((day) => day.minutes > 0)
      .map((day) => day.date.slice(0, 7))
      .sort()
      .at(-1);
    for (const month of [input.workPayoutMonth, input.premiumPayoutMonth])
      if (month !== null && (!latestOvertimeMonth || month < latestOvertimeMonth))
        throw new Error("Der Auszahlungsmonat liegt vor den bestätigten Überstunden.");
    const profiles = await listRemunerationProfiles(tx);
    const profile = profiles.find((item) => item.effectiveFrom === input.profileEffectiveFrom);
    if (
      !profile ||
      profile.revision !== input.expectedProfileRevision ||
      !allocation.allocations.every(
        (day) => resolveRemunerationProfile(profiles, day.date).profile === profile,
      )
    )
      throw new ConcurrencyError("Der Vergütungsstand wurde geändert. Bitte neu laden.");
    const selection = profile.data.selection;
    if (selection.kind !== "tariff" || !selection.packageId.startsWith("avr-caritas-p-"))
      throw new Error("Für diesen Dienst ist kein Caritas-Pflegeprofil ausgewählt.");
    const prior = await loadCaritasOvertime(tx, input.shiftId);
    if ((prior?.revision ?? 0) !== input.expectedRevision)
      throw new ConcurrencyError(
        "Die Überstundenbestätigung wurde inzwischen geändert. Bitte neu laden.",
      );
    const stamp = new Date(
      Math.max(Date.now(), prior ? Date.parse(prior.updatedAt) : 0),
    ).toISOString();
    const saved = validateSavedCaritasOvertime({
      version: 1,
      shiftId: shift.id,
      shiftRevision: shift.revision,
      shiftUpdatedAt: shift.updatedAt,
      timeZone: input.timeZone,
      allocationRevision: allocation.revision,
      profileEffectiveFrom: profile.effectiveFrom,
      profileRevision: profile.revision,
      packageId: selection.packageId,
      ruleVersionId: input.ruleVersionId,
      variantId: selection.variant,
      regionId: selection.region,
      classification: "CONFIRMED_AVR_OVERTIME",
      classificationCase: input.classificationCase,
      employerOrderConfirmed: input.employerOrderConfirmed,
      applicableRuleConfirmed: input.applicableRuleConfirmed,
      workSettlement: input.workSettlement,
      premiumSettlement: input.premiumSettlement,
      workPayoutMonth: input.workPayoutMonth,
      premiumPayoutMonth: input.premiumPayoutMonth,
      revision: input.expectedRevision + 1,
      confirmedAt: stamp,
      updatedAt: stamp,
    });
    await tx.runAsync(
      `INSERT INTO caritas_overtime(shift_id,confirmation_json) VALUES(?,?)
      ON CONFLICT(shift_id) DO UPDATE SET confirmation_json=excluded.confirmation_json`,
      saved.shiftId,
      JSON.stringify(saved),
    );
    return saved;
  });
}
