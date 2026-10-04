import { Temporal } from "@js-temporal/polyfill";
import type { SavedOvertimeAllocation } from "./overtime-allocation";
import { isCurrentOvertimeAllocation } from "./overtime-allocation";
import type { DatedRemunerationProfile } from "./remuneration-profile";
import { requireRemunerationDate } from "./remuneration-profile";
import type { ShiftEntry } from "./types";
import { requireInstant } from "./validation";

export type CaritasOvertimeCase = "STANDARD_WEEK" | "WORK_CORRIDOR" | "DAILY_FRAME" | "SHIFT_PLAN";

/** The allocation gives minutes; this separate record confirms their AVR classification and settlement. */
export interface SavedCaritasOvertime {
  readonly version: 1;
  readonly shiftId: string;
  readonly shiftRevision: number;
  readonly shiftUpdatedAt: string;
  readonly timeZone: string;
  readonly allocationRevision: number;
  readonly profileEffectiveFrom: string;
  readonly profileRevision: number;
  readonly packageId: string;
  readonly ruleVersionId: string;
  readonly variantId: string;
  readonly regionId: string;
  readonly classification: "CONFIRMED_AVR_OVERTIME";
  readonly classificationCase: CaritasOvertimeCase;
  readonly employerOrderConfirmed: true;
  readonly applicableRuleConfirmed: true;
  readonly workSettlement: "CASH" | "TIME";
  readonly premiumSettlement: "CASH" | "TIME";
  /** Null means cash timing is not confirmed; time settlement must have no payout month. */
  readonly workPayoutMonth: string | null;
  readonly premiumPayoutMonth: string | null;
  readonly revision: number;
  readonly confirmedAt: string;
  readonly updatedAt: string;
}

export interface SaveCaritasOvertimeInput {
  readonly shiftId: string;
  readonly expectedShiftRevision: number;
  readonly expectedShiftUpdatedAt: string;
  readonly timeZone: string;
  readonly expectedAllocationRevision: number;
  readonly profileEffectiveFrom: string;
  readonly expectedProfileRevision: number;
  readonly ruleVersionId: string;
  readonly classificationCase: CaritasOvertimeCase;
  readonly employerOrderConfirmed: true;
  readonly applicableRuleConfirmed: true;
  readonly workSettlement: "CASH" | "TIME";
  readonly premiumSettlement: "CASH" | "TIME";
  readonly workPayoutMonth: string | null;
  readonly premiumPayoutMonth: string | null;
  readonly expectedRevision: number;
}

const KEYS = [
  "version",
  "shiftId",
  "shiftRevision",
  "shiftUpdatedAt",
  "timeZone",
  "allocationRevision",
  "profileEffectiveFrom",
  "profileRevision",
  "packageId",
  "ruleVersionId",
  "variantId",
  "regionId",
  "classification",
  "classificationCase",
  "employerOrderConfirmed",
  "applicableRuleConfirmed",
  "workSettlement",
  "premiumSettlement",
  "workPayoutMonth",
  "premiumPayoutMonth",
  "revision",
  "confirmedAt",
  "updatedAt",
] as const;

function identifier(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9._-]{0,100}$/iu.test(value))
    throw new Error("Ungültige Caritas-Tarifzuordnung.");
  return value;
}

function payoutMonth(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/u.test(value))
    throw new Error("Ungültiger Auszahlungsmonat.");
  const month = Temporal.PlainYearMonth.from(value);
  if (month.toString() !== value) throw new Error("Ungültiger Auszahlungsmonat.");
  return value;
}

export function validateSavedCaritasOvertime(value: unknown): SavedCaritasOvertime {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Ungültige Caritas-Überstundenbestätigung.");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== KEYS.length || KEYS.some((key) => !Object.hasOwn(row, key)))
    throw new Error("Unbekanntes Format der Caritas-Überstundenbestätigung.");
  if (row.version !== 1) throw new Error("Unbekannte Version der Caritas-Überstundenbestätigung.");
  if (typeof row.shiftId !== "string" || !row.shiftId.trim() || row.shiftId.length > 200)
    throw new Error("Ungültige Dienstzuordnung.");
  for (const revision of [
    row.shiftRevision,
    row.allocationRevision,
    row.profileRevision,
    row.revision,
  ])
    if (!Number.isSafeInteger(revision) || (revision as number) < 1)
      throw new Error("Ungültige Bestätigungsrevision.");
  if (typeof row.timeZone !== "string" || !row.timeZone || /^[+-]/u.test(row.timeZone))
    throw new Error("Ungültige Zeitzone.");
  Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(row.timeZone);
  if (
    row.classification !== "CONFIRMED_AVR_OVERTIME" ||
    !["STANDARD_WEEK", "WORK_CORRIDOR", "DAILY_FRAME", "SHIFT_PLAN"].includes(
      row.classificationCase as string,
    ) ||
    row.employerOrderConfirmed !== true ||
    row.applicableRuleConfirmed !== true ||
    !["CASH", "TIME"].includes(row.workSettlement as string) ||
    !["CASH", "TIME"].includes(row.premiumSettlement as string)
  )
    throw new Error("Die tarifliche Einstufung und Abrechnung müssen bestätigt sein.");
  const workPayoutMonth = payoutMonth(row.workPayoutMonth);
  const premiumPayoutMonth = payoutMonth(row.premiumPayoutMonth);
  if (
    (row.workSettlement === "TIME" && workPayoutMonth !== null) ||
    (row.premiumSettlement === "TIME" && premiumPayoutMonth !== null)
  )
    throw new Error("Bei Zeitausgleich darf kein Auszahlungsmonat angegeben sein.");
  const confirmedAt = requireInstant(row.confirmedAt, "Bestätigung");
  const updatedAt = requireInstant(row.updatedAt, "Aktualisierung");
  if (Date.parse(confirmedAt) > Date.parse(updatedAt))
    throw new Error("Ungültiger Bestätigungszeitpunkt.");
  return Object.freeze({
    version: 1,
    shiftId: row.shiftId,
    shiftRevision: row.shiftRevision as number,
    shiftUpdatedAt: requireInstant(row.shiftUpdatedAt, "Dienständerung"),
    timeZone: row.timeZone,
    allocationRevision: row.allocationRevision as number,
    profileEffectiveFrom: requireRemunerationDate(row.profileEffectiveFrom),
    profileRevision: row.profileRevision as number,
    packageId: identifier(row.packageId),
    ruleVersionId: identifier(row.ruleVersionId),
    variantId: identifier(row.variantId),
    regionId: identifier(row.regionId),
    classification: "CONFIRMED_AVR_OVERTIME",
    classificationCase: row.classificationCase as CaritasOvertimeCase,
    employerOrderConfirmed: true,
    applicableRuleConfirmed: true,
    workSettlement: row.workSettlement as "CASH" | "TIME",
    premiumSettlement: row.premiumSettlement as "CASH" | "TIME",
    workPayoutMonth,
    premiumPayoutMonth,
    revision: row.revision as number,
    confirmedAt,
    updatedAt,
  });
}

/** A changed shift, allocation, profile or rule version requires reconfirmation. */
export function isCurrentCaritasOvertime(
  value: SavedCaritasOvertime,
  shift: ShiftEntry,
  allocation: SavedOvertimeAllocation,
  profile: DatedRemunerationProfile,
  ruleVersionId: string,
  timeZone: string,
): boolean {
  const selection = profile.data.selection;
  return (
    value.shiftId === shift.id &&
    value.shiftRevision === shift.revision &&
    value.shiftUpdatedAt === shift.updatedAt &&
    value.timeZone === timeZone &&
    isCurrentOvertimeAllocation(allocation, shift, timeZone) &&
    value.allocationRevision === allocation.revision &&
    value.profileEffectiveFrom === profile.effectiveFrom &&
    value.profileRevision === profile.revision &&
    selection.kind === "tariff" &&
    selection.packageId === value.packageId &&
    selection.variant === value.variantId &&
    selection.region === value.regionId &&
    value.ruleVersionId === ruleVersionId
  );
}
