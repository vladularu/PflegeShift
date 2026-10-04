import type { DatedRemunerationProfile } from "./remuneration-profile";
import { requireRemunerationDate } from "./remuneration-profile";
import { requireInstant, requireLocalMonth } from "./validation";

export type DrkEmployeePackageId = "drk-rtv-e" | "drk-rtv-p" | "drk-rtv-s";

/** Personal answers are bound to one month, profile revision and catalog version. */
export interface SavedDrkEmployeeMonthConfirmation {
  readonly month: string;
  readonly profileEffectiveFrom: string;
  readonly profileRevision: number;
  readonly packageId: DrkEmployeePackageId;
  readonly ruleVersionId: string;
  readonly variantId: "ANLAGE_A1" | "ANLAGE_A2" | "ANLAGE_A3";
  readonly regionId: "BTG";
  readonly groupId: string;
  readonly stepId: string;
  readonly contractedWeeklyMinutes: number;
  readonly fullTimeWeeklyMinutes: number;
  readonly drkApplicabilityConfirmed: boolean | null;
  readonly annexAssignmentConfirmed: boolean | null;
  readonly payGroupAndStepConfirmed: boolean | null;
  readonly weeklyTimeBasisConfirmed: boolean | null;
  readonly fullMonthBaseEntitlementConfirmed: boolean | null;
  readonly revision: number;
  readonly confirmedAt: string;
  readonly updatedAt: string;
}

export interface SaveDrkEmployeeMonthConfirmationInput {
  readonly month: string;
  readonly profileEffectiveFrom: string;
  readonly expectedProfileRevision: number;
  readonly ruleVersionId: string;
  readonly drkApplicabilityConfirmed: boolean | null;
  readonly annexAssignmentConfirmed: boolean | null;
  readonly payGroupAndStepConfirmed: boolean | null;
  readonly weeklyTimeBasisConfirmed: boolean | null;
  readonly fullMonthBaseEntitlementConfirmed: boolean | null;
  readonly expectedRevision: number;
}

const KEYS = [
  "month",
  "profileEffectiveFrom",
  "profileRevision",
  "packageId",
  "ruleVersionId",
  "variantId",
  "regionId",
  "groupId",
  "stepId",
  "contractedWeeklyMinutes",
  "fullTimeWeeklyMinutes",
  "drkApplicabilityConfirmed",
  "annexAssignmentConfirmed",
  "payGroupAndStepConfirmed",
  "weeklyTimeBasisConfirmed",
  "fullMonthBaseEntitlementConfirmed",
  "revision",
  "confirmedAt",
  "updatedAt",
] as const;

const VARIANTS: Readonly<
  Record<DrkEmployeePackageId, SavedDrkEmployeeMonthConfirmation["variantId"]>
> = {
  "drk-rtv-e": "ANLAGE_A1",
  "drk-rtv-p": "ANLAGE_A2",
  "drk-rtv-s": "ANLAGE_A3",
};

export function isDrkEmployeePackageId(value: unknown): value is DrkEmployeePackageId {
  return value === "drk-rtv-e" || value === "drk-rtv-p" || value === "drk-rtv-s";
}

export function validateSavedDrkEmployeeMonthConfirmation(
  value: unknown,
): SavedDrkEmployeeMonthConfirmation {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Ungültige DRK-Monatsbestätigung.");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== KEYS.length || KEYS.some((key) => !Object.hasOwn(row, key)))
    throw new Error("Unbekanntes Format der DRK-Monatsbestätigung.");
  if (
    !isDrkEmployeePackageId(row.packageId) ||
    row.variantId !== VARIANTS[row.packageId] ||
    row.regionId !== "BTG" ||
    typeof row.ruleVersionId !== "string" ||
    !/^[a-z0-9][a-z0-9._-]{0,100}$/iu.test(row.ruleVersionId) ||
    typeof row.groupId !== "string" ||
    !/^[a-z][a-z0-9]{0,15}$/u.test(row.groupId) ||
    typeof row.stepId !== "string" ||
    !/^s[1-6]$/u.test(row.stepId)
  )
    throw new Error("Ungültige DRK-Tarifzuordnung.");
  for (const revision of [row.profileRevision, row.revision])
    if (!Number.isSafeInteger(revision) || (revision as number) < 1)
      throw new Error("Ungültige DRK-Bestätigungsrevision.");
  for (const minutes of [row.contractedWeeklyMinutes, row.fullTimeWeeklyMinutes])
    if (!Number.isSafeInteger(minutes) || (minutes as number) < 1 || (minutes as number) > 2520)
      throw new Error("Ungültige DRK-Wochenarbeitszeit.");
  if ((row.contractedWeeklyMinutes as number) > (row.fullTimeWeeklyMinutes as number))
    throw new Error("Ungültige DRK-Wochenarbeitszeit.");
  for (const answer of [
    row.drkApplicabilityConfirmed,
    row.annexAssignmentConfirmed,
    row.payGroupAndStepConfirmed,
    row.weeklyTimeBasisConfirmed,
    row.fullMonthBaseEntitlementConfirmed,
  ])
    if (answer !== true && answer !== false && answer !== null)
      throw new Error("Ungültige DRK-Anspruchsbestätigung.");
  const confirmedAt = requireInstant(row.confirmedAt, "Bestätigung");
  const updatedAt = requireInstant(row.updatedAt, "Aktualisierung");
  if (Date.parse(confirmedAt) > Date.parse(updatedAt))
    throw new Error("Ungültiger DRK-Bestätigungszeitpunkt.");
  return Object.freeze({
    month: requireLocalMonth(row.month),
    profileEffectiveFrom: requireRemunerationDate(row.profileEffectiveFrom),
    profileRevision: row.profileRevision as number,
    packageId: row.packageId,
    ruleVersionId: row.ruleVersionId,
    variantId: row.variantId as SavedDrkEmployeeMonthConfirmation["variantId"],
    regionId: "BTG",
    groupId: row.groupId,
    stepId: row.stepId,
    contractedWeeklyMinutes: row.contractedWeeklyMinutes as number,
    fullTimeWeeklyMinutes: row.fullTimeWeeklyMinutes as number,
    drkApplicabilityConfirmed: row.drkApplicabilityConfirmed as boolean | null,
    annexAssignmentConfirmed: row.annexAssignmentConfirmed as boolean | null,
    payGroupAndStepConfirmed: row.payGroupAndStepConfirmed as boolean | null,
    weeklyTimeBasisConfirmed: row.weeklyTimeBasisConfirmed as boolean | null,
    fullMonthBaseEntitlementConfirmed: row.fullMonthBaseEntitlementConfirmed as boolean | null,
    revision: row.revision as number,
    confirmedAt,
    updatedAt,
  });
}

export function isCurrentDrkEmployeeMonthConfirmation(
  value: SavedDrkEmployeeMonthConfirmation,
  profile: DatedRemunerationProfile,
  ruleVersionId: string,
): boolean {
  const selection = profile.data.selection;
  return (
    value.profileEffectiveFrom === profile.effectiveFrom &&
    value.profileRevision === profile.revision &&
    value.ruleVersionId === ruleVersionId &&
    selection.kind === "tariff" &&
    selection.packageId === value.packageId &&
    selection.variant === value.variantId &&
    selection.region === "BTG" &&
    selection.group.toLowerCase() === value.groupId &&
    `s${selection.level}` === value.stepId &&
    selection.fullTimeWeeklyMinutes === value.fullTimeWeeklyMinutes &&
    profile.data.weeklyMinutes === value.contractedWeeklyMinutes
  );
}
