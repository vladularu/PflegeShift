import type { DatedRemunerationProfile } from "./remuneration-profile";
import { requireRemunerationDate } from "./remuneration-profile";
import { requireLocalMonth, requireInstant } from "./validation";

/** Each answer is explicit and belongs to one cash month, profile revision and rule version. */
export interface SavedTvoedAnnexAMonthConfirmation {
  readonly month: string;
  readonly profileEffectiveFrom: string;
  readonly profileRevision: number;
  readonly packageId: "tvoed-vka-anlage-a";
  readonly ruleVersionId: string;
  readonly variantId: "BT_K" | "BT_B";
  readonly regionId: "VKA";
  readonly groupId: string;
  readonly stepId: string;
  readonly contractedWeeklyMinutes: number;
  readonly comparableFullTimeWeeklyMinutes: number;
  readonly applicabilityConfirmed: boolean | null;
  readonly comparableFullTimeConfirmed: boolean | null;
  readonly fullMonthBaseEntitlementConfirmed: boolean | null;
  readonly fullMonthSameContractConfirmed: boolean | null;
  readonly revision: number;
  readonly confirmedAt: string;
  readonly updatedAt: string;
}

export interface SaveTvoedAnnexAMonthConfirmationInput {
  readonly month: string;
  readonly profileEffectiveFrom: string;
  readonly expectedProfileRevision: number;
  readonly ruleVersionId: string;
  readonly applicabilityConfirmed: boolean | null;
  readonly comparableFullTimeConfirmed: boolean | null;
  readonly fullMonthBaseEntitlementConfirmed: boolean | null;
  readonly fullMonthSameContractConfirmed: boolean | null;
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
  "comparableFullTimeWeeklyMinutes",
  "applicabilityConfirmed",
  "comparableFullTimeConfirmed",
  "fullMonthBaseEntitlementConfirmed",
  "fullMonthSameContractConfirmed",
  "revision",
  "confirmedAt",
  "updatedAt",
] as const;

export function validateSavedTvoedAnnexAMonthConfirmation(
  value: unknown,
): SavedTvoedAnnexAMonthConfirmation {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Ungültige TVöD-Monatsbestätigung.");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== KEYS.length || KEYS.some((key) => !Object.hasOwn(row, key)))
    throw new Error("Unbekanntes Format der TVöD-Monatsbestätigung.");
  if (
    row.packageId !== "tvoed-vka-anlage-a" ||
    (row.variantId !== "BT_K" && row.variantId !== "BT_B") ||
    row.regionId !== "VKA" ||
    typeof row.ruleVersionId !== "string" ||
    !/^[a-z0-9][a-z0-9._-]{0,100}$/iu.test(row.ruleVersionId) ||
    typeof row.groupId !== "string" ||
    !/^eg(?:[1-9]|1[0-5])(?:[abc])?$/u.test(row.groupId) ||
    typeof row.stepId !== "string" ||
    !/^s[1-6]$/u.test(row.stepId)
  )
    throw new Error("Ungültige TVöD-Tarifzuordnung.");
  for (const revision of [row.profileRevision, row.revision])
    if (!Number.isSafeInteger(revision) || (revision as number) < 1)
      throw new Error("Ungültige Bestätigungsrevision.");
  for (const minutes of [row.contractedWeeklyMinutes, row.comparableFullTimeWeeklyMinutes])
    if (!Number.isSafeInteger(minutes) || (minutes as number) < 1 || (minutes as number) > 2520)
      throw new Error("Ungültige TVöD-Wochenarbeitszeit.");
  if ((row.contractedWeeklyMinutes as number) > (row.comparableFullTimeWeeklyMinutes as number))
    throw new Error("Ungültige TVöD-Wochenarbeitszeit.");
  for (const fact of [
    row.applicabilityConfirmed,
    row.comparableFullTimeConfirmed,
    row.fullMonthBaseEntitlementConfirmed,
    row.fullMonthSameContractConfirmed,
  ])
    if (fact !== true && fact !== false && fact !== null)
      throw new Error("Ungültige TVöD-Anspruchsbestätigung.");
  const confirmedAt = requireInstant(row.confirmedAt, "Bestätigung");
  const updatedAt = requireInstant(row.updatedAt, "Aktualisierung");
  if (Date.parse(confirmedAt) > Date.parse(updatedAt))
    throw new Error("Ungültiger Bestätigungszeitpunkt.");
  return Object.freeze({
    month: requireLocalMonth(row.month),
    profileEffectiveFrom: requireRemunerationDate(row.profileEffectiveFrom),
    profileRevision: row.profileRevision as number,
    packageId: "tvoed-vka-anlage-a",
    ruleVersionId: row.ruleVersionId,
    variantId: row.variantId,
    regionId: "VKA",
    groupId: row.groupId,
    stepId: row.stepId,
    contractedWeeklyMinutes: row.contractedWeeklyMinutes as number,
    comparableFullTimeWeeklyMinutes: row.comparableFullTimeWeeklyMinutes as number,
    applicabilityConfirmed: row.applicabilityConfirmed as boolean | null,
    comparableFullTimeConfirmed: row.comparableFullTimeConfirmed as boolean | null,
    fullMonthBaseEntitlementConfirmed: row.fullMonthBaseEntitlementConfirmed as boolean | null,
    fullMonthSameContractConfirmed: row.fullMonthSameContractConfirmed as boolean | null,
    revision: row.revision as number,
    confirmedAt,
    updatedAt,
  });
}

export function isCurrentTvoedAnnexAMonthConfirmation(
  value: SavedTvoedAnnexAMonthConfirmation,
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
    selection.region === value.regionId &&
    selection.group.toLowerCase() === value.groupId &&
    `s${selection.level}` === value.stepId &&
    selection.fullTimeWeeklyMinutes === value.comparableFullTimeWeeklyMinutes &&
    profile.data.weeklyMinutes === value.contractedWeeklyMinutes
  );
}
