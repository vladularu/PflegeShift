import type { DatedRemunerationProfile } from "./remuneration-profile";
import { requireRemunerationDate } from "./remuneration-profile";
import { requireInstant, requireLocalMonth } from "./validation";

/** A confirmed answer belongs to one cash month and one exact profile/rule revision. */
export interface SavedTvoedSueMonthConfirmation {
  readonly month: string;
  readonly profileEffectiveFrom: string;
  readonly profileRevision: number;
  readonly packageId: "tvoed-vka-sue-bt-b";
  readonly ruleVersionId: string;
  readonly variantId: "BT_B";
  readonly regionId: "VKA";
  readonly groupId: string;
  readonly stepId: string;
  readonly contractedWeeklyMinutes: number;
  readonly standardFullTimeWeeklyMinutes: 2340;
  readonly tariffApplicabilityConfirmed: boolean | null;
  readonly sueClassificationConfirmed: boolean | null;
  readonly standardFullTimeConfirmed: boolean | null;
  readonly fullMonthBaseEntitlementConfirmed: boolean | null;
  readonly fullMonthSameContractConfirmed: boolean | null;
  readonly revision: number;
  readonly confirmedAt: string;
  readonly updatedAt: string;
}

export interface SaveTvoedSueMonthConfirmationInput {
  readonly month: string;
  readonly profileEffectiveFrom: string;
  readonly expectedProfileRevision: number;
  readonly ruleVersionId: string;
  readonly tariffApplicabilityConfirmed: boolean | null;
  readonly sueClassificationConfirmed: boolean | null;
  readonly standardFullTimeConfirmed: boolean | null;
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
  "standardFullTimeWeeklyMinutes",
  "tariffApplicabilityConfirmed",
  "sueClassificationConfirmed",
  "standardFullTimeConfirmed",
  "fullMonthBaseEntitlementConfirmed",
  "fullMonthSameContractConfirmed",
  "revision",
  "confirmedAt",
  "updatedAt",
] as const;
const GROUP = /^s(?:18|17|16|15|14|13|12|11b|11a|9|8b|8a|7|4|3|2)$/u;

export function validateSavedTvoedSueMonthConfirmation(
  value: unknown,
): SavedTvoedSueMonthConfirmation {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Ungültige SuE-Monatsbestätigung.");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== KEYS.length || KEYS.some((key) => !Object.hasOwn(row, key)))
    throw new Error("Unbekanntes Format der SuE-Monatsbestätigung.");
  if (
    row.packageId !== "tvoed-vka-sue-bt-b" ||
    row.variantId !== "BT_B" ||
    row.regionId !== "VKA" ||
    typeof row.ruleVersionId !== "string" ||
    !/^[a-z0-9][a-z0-9._-]{0,100}$/iu.test(row.ruleVersionId) ||
    typeof row.groupId !== "string" ||
    !GROUP.test(row.groupId) ||
    typeof row.stepId !== "string" ||
    !/^s[1-6]$/u.test(row.stepId)
  )
    throw new Error("Ungültige SuE-Tarifzuordnung.");
  for (const revision of [row.profileRevision, row.revision])
    if (!Number.isSafeInteger(revision) || (revision as number) < 1)
      throw new Error("Ungültige SuE-Bestätigungsrevision.");
  if (
    !Number.isSafeInteger(row.contractedWeeklyMinutes) ||
    (row.contractedWeeklyMinutes as number) < 1 ||
    (row.contractedWeeklyMinutes as number) > 2340 ||
    row.standardFullTimeWeeklyMinutes !== 2340
  )
    throw new Error("Ungültige SuE-Wochenarbeitszeit.");
  for (const fact of [
    row.tariffApplicabilityConfirmed,
    row.sueClassificationConfirmed,
    row.standardFullTimeConfirmed,
    row.fullMonthBaseEntitlementConfirmed,
    row.fullMonthSameContractConfirmed,
  ])
    if (fact !== true && fact !== false && fact !== null)
      throw new Error("Ungültige SuE-Anspruchsbestätigung.");
  const confirmedAt = requireInstant(row.confirmedAt, "Bestätigung");
  const updatedAt = requireInstant(row.updatedAt, "Aktualisierung");
  if (Date.parse(confirmedAt) > Date.parse(updatedAt))
    throw new Error("Ungültiger SuE-Bestätigungszeitpunkt.");
  return Object.freeze({
    month: requireLocalMonth(row.month),
    profileEffectiveFrom: requireRemunerationDate(row.profileEffectiveFrom),
    profileRevision: row.profileRevision as number,
    packageId: "tvoed-vka-sue-bt-b",
    ruleVersionId: row.ruleVersionId,
    variantId: "BT_B",
    regionId: "VKA",
    groupId: row.groupId,
    stepId: row.stepId,
    contractedWeeklyMinutes: row.contractedWeeklyMinutes as number,
    standardFullTimeWeeklyMinutes: 2340,
    tariffApplicabilityConfirmed: row.tariffApplicabilityConfirmed as boolean | null,
    sueClassificationConfirmed: row.sueClassificationConfirmed as boolean | null,
    standardFullTimeConfirmed: row.standardFullTimeConfirmed as boolean | null,
    fullMonthBaseEntitlementConfirmed: row.fullMonthBaseEntitlementConfirmed as boolean | null,
    fullMonthSameContractConfirmed: row.fullMonthSameContractConfirmed as boolean | null,
    revision: row.revision as number,
    confirmedAt,
    updatedAt,
  });
}

export function isCurrentTvoedSueMonthConfirmation(
  value: SavedTvoedSueMonthConfirmation,
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
    selection.fullTimeWeeklyMinutes === value.standardFullTimeWeeklyMinutes &&
    profile.data.weeklyMinutes === value.contractedWeeklyMinutes
  );
}
