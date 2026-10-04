import { Temporal } from "@js-temporal/polyfill";
import type { DatedRemunerationProfile } from "./remuneration-profile";
import { requireRemunerationDate } from "./remuneration-profile";
import type { SavedTrainingProfile } from "./training-data";
import { requireInstant, requireLocalMonth } from "./validation";

export interface SavedDrkTrainingMonthConfirmation {
  readonly month: string;
  readonly remunerationProfileEffectiveFrom: string;
  readonly remunerationProfileRevision: number;
  readonly trainingProfileEffectiveFrom: string;
  readonly trainingProfileRevision: number;
  readonly packageId: "drk-rtv-training";
  readonly ruleVersionId: string;
  readonly variantId: "ANLAGE_3" | "ANLAGE_3A_A" | "ANLAGE_3A_B";
  readonly regionId: "BTG";
  readonly groupId: string;
  readonly trainingYear: number;
  readonly weeklyMinutes: number;
  readonly fullTimeWeeklyMinutes: number;
  readonly trainingProfession: string;
  readonly trainingLegalBasis: "PFLBG" | "BBIG" | "OTHER";
  readonly trainingStartedOn: string;
  readonly trainingExpectedEndOn: string | null;
  readonly trainingYearConfirmedFrom: string;
  readonly drkApplicabilityConfirmed: boolean | null;
  readonly trainingCategoryConfirmed: boolean | null;
  readonly trainingYearConfirmed: boolean | null;
  readonly fullMonthBaseEntitlementConfirmed: boolean | null;
  readonly fullTimeTrainingConfirmed: boolean | null;
  readonly revision: number;
  readonly confirmedAt: string;
  readonly updatedAt: string;
}

export interface SaveDrkTrainingMonthConfirmationInput {
  readonly month: string;
  readonly remunerationProfileEffectiveFrom: string;
  readonly expectedRemunerationProfileRevision: number;
  readonly trainingProfileEffectiveFrom: string;
  readonly expectedTrainingProfileRevision: number;
  readonly ruleVersionId: string;
  readonly drkApplicabilityConfirmed: boolean | null;
  readonly trainingCategoryConfirmed: boolean | null;
  readonly trainingYearConfirmed: boolean | null;
  readonly fullMonthBaseEntitlementConfirmed: boolean | null;
  readonly fullTimeTrainingConfirmed: boolean | null;
  readonly expectedRevision: number;
}

const KEYS = [
  "month",
  "remunerationProfileEffectiveFrom",
  "remunerationProfileRevision",
  "trainingProfileEffectiveFrom",
  "trainingProfileRevision",
  "packageId",
  "ruleVersionId",
  "variantId",
  "regionId",
  "groupId",
  "trainingYear",
  "weeklyMinutes",
  "fullTimeWeeklyMinutes",
  "trainingProfession",
  "trainingLegalBasis",
  "trainingStartedOn",
  "trainingExpectedEndOn",
  "trainingYearConfirmedFrom",
  "drkApplicabilityConfirmed",
  "trainingCategoryConfirmed",
  "trainingYearConfirmed",
  "fullMonthBaseEntitlementConfirmed",
  "fullTimeTrainingConfirmed",
  "revision",
  "confirmedAt",
  "updatedAt",
] as const;

const GROUP_BY_VARIANT = {
  ANLAGE_3: "anlage-3-general",
  ANLAGE_3A_A: "anlage-3a-a",
  ANLAGE_3A_B: "anlage-3a-b",
} as const;

export function isDrkTrainingVariant(
  value: unknown,
): value is SavedDrkTrainingMonthConfirmation["variantId"] {
  return value === "ANLAGE_3" || value === "ANLAGE_3A_A" || value === "ANLAGE_3A_B";
}

/** Strict document validation also protects imported backups from invented facts. */
export function validateSavedDrkTrainingMonthConfirmation(
  value: unknown,
): SavedDrkTrainingMonthConfirmation {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Ungültige DRK-Ausbildungsbestätigung.");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== KEYS.length || KEYS.some((key) => !Object.hasOwn(row, key)))
    throw new Error("Unbekanntes Format der DRK-Ausbildungsbestätigung.");
  if (
    row.packageId !== "drk-rtv-training" ||
    !isDrkTrainingVariant(row.variantId) ||
    row.regionId !== "BTG" ||
    row.groupId !== GROUP_BY_VARIANT[row.variantId] ||
    typeof row.ruleVersionId !== "string" ||
    !/^[a-z0-9][a-z0-9._-]{0,100}$/iu.test(row.ruleVersionId)
  )
    throw new Error("Ungültige DRK-Ausbildungstarifzuordnung.");
  for (const revision of [
    row.remunerationProfileRevision,
    row.trainingProfileRevision,
    row.revision,
  ])
    if (!Number.isSafeInteger(revision) || (revision as number) < 1)
      throw new Error("Ungültige DRK-Ausbildungsrevision.");
  if (
    !Number.isSafeInteger(row.trainingYear) ||
    (row.trainingYear as number) < 1 ||
    (row.trainingYear as number) > 6
  )
    throw new Error("Ungültiges DRK-Ausbildungsjahr.");
  for (const minutes of [row.weeklyMinutes, row.fullTimeWeeklyMinutes])
    if (!Number.isSafeInteger(minutes) || (minutes as number) < 1 || (minutes as number) > 2520)
      throw new Error("Ungültige DRK-Ausbildungszeit.");
  if ((row.weeklyMinutes as number) !== (row.fullTimeWeeklyMinutes as number))
    throw new Error("Teilzeit-Ausbildung benötigt eine gesonderte Berechnung.");
  if (
    typeof row.trainingProfession !== "string" ||
    !row.trainingProfession.trim() ||
    row.trainingProfession.length > 200 ||
    row.trainingProfession !== row.trainingProfession.trim() ||
    (row.trainingLegalBasis !== "PFLBG" &&
      row.trainingLegalBasis !== "BBIG" &&
      row.trainingLegalBasis !== "OTHER") ||
    (row.variantId === "ANLAGE_3" && row.trainingLegalBasis === "PFLBG")
  )
    throw new Error("Ungültige DRK-Ausbildungsgrundlage.");
  for (const answer of [
    row.drkApplicabilityConfirmed,
    row.trainingCategoryConfirmed,
    row.trainingYearConfirmed,
    row.fullMonthBaseEntitlementConfirmed,
    row.fullTimeTrainingConfirmed,
  ])
    if (answer !== true && answer !== false && answer !== null)
      throw new Error("Ungültige DRK-Ausbildungsantwort.");
  const month = requireLocalMonth(row.month);
  const first = `${month}-01`;
  const last = `${month}-${String(Temporal.PlainYearMonth.from(month).daysInMonth).padStart(2, "0")}`;
  const remunerationProfileEffectiveFrom = requireRemunerationDate(
    row.remunerationProfileEffectiveFrom,
  );
  const trainingProfileEffectiveFrom = requireRemunerationDate(row.trainingProfileEffectiveFrom);
  const trainingStartedOn = requireRemunerationDate(row.trainingStartedOn);
  const trainingExpectedEndOn =
    row.trainingExpectedEndOn === null ? null : requireRemunerationDate(row.trainingExpectedEndOn);
  const trainingYearConfirmedFrom = requireRemunerationDate(row.trainingYearConfirmedFrom);
  if (
    remunerationProfileEffectiveFrom > first ||
    trainingProfileEffectiveFrom > first ||
    trainingStartedOn > first ||
    (trainingExpectedEndOn !== null && trainingExpectedEndOn < last) ||
    trainingYearConfirmedFrom < trainingStartedOn ||
    trainingYearConfirmedFrom > first
  )
    throw new Error("DRK-Ausbildungsstand gilt nicht für den ganzen Monat.");
  const confirmedAt = requireInstant(row.confirmedAt, "Bestätigung");
  const updatedAt = requireInstant(row.updatedAt, "Aktualisierung");
  if (Date.parse(confirmedAt) > Date.parse(updatedAt))
    throw new Error("Ungültiger DRK-Ausbildungsbestätigungszeitpunkt.");
  return Object.freeze({
    month,
    remunerationProfileEffectiveFrom,
    remunerationProfileRevision: row.remunerationProfileRevision as number,
    trainingProfileEffectiveFrom,
    trainingProfileRevision: row.trainingProfileRevision as number,
    packageId: "drk-rtv-training",
    ruleVersionId: row.ruleVersionId as string,
    variantId: row.variantId,
    regionId: "BTG",
    groupId: row.groupId as string,
    trainingYear: row.trainingYear as number,
    weeklyMinutes: row.weeklyMinutes as number,
    fullTimeWeeklyMinutes: row.fullTimeWeeklyMinutes as number,
    trainingProfession: row.trainingProfession as string,
    trainingLegalBasis:
      row.trainingLegalBasis as SavedDrkTrainingMonthConfirmation["trainingLegalBasis"],
    trainingStartedOn,
    trainingExpectedEndOn,
    trainingYearConfirmedFrom,
    drkApplicabilityConfirmed: row.drkApplicabilityConfirmed as boolean | null,
    trainingCategoryConfirmed: row.trainingCategoryConfirmed as boolean | null,
    trainingYearConfirmed: row.trainingYearConfirmed as boolean | null,
    fullMonthBaseEntitlementConfirmed: row.fullMonthBaseEntitlementConfirmed as boolean | null,
    fullTimeTrainingConfirmed: row.fullTimeTrainingConfirmed as boolean | null,
    revision: row.revision as number,
    confirmedAt,
    updatedAt,
  });
}

export function isCurrentDrkTrainingMonthConfirmation(
  value: SavedDrkTrainingMonthConfirmation,
  remunerationProfile: DatedRemunerationProfile,
  trainingProfile: SavedTrainingProfile,
  ruleVersionId: string,
): boolean {
  const selection = remunerationProfile.data.selection;
  const training = trainingProfile.data.training;
  return (
    value.remunerationProfileEffectiveFrom === remunerationProfile.effectiveFrom &&
    value.remunerationProfileRevision === remunerationProfile.revision &&
    value.trainingProfileEffectiveFrom === trainingProfile.data.effectiveFrom &&
    value.trainingProfileRevision === trainingProfile.revision &&
    value.ruleVersionId === ruleVersionId &&
    selection.kind === "tariff" &&
    selection.packageId === "drk-rtv-training" &&
    selection.variant === value.variantId &&
    selection.region === "BTG" &&
    selection.group.toLowerCase() === value.groupId &&
    selection.level === String(value.trainingYear) &&
    selection.fullTimeWeeklyMinutes === value.fullTimeWeeklyMinutes &&
    remunerationProfile.data.weeklyMinutes === value.weeklyMinutes &&
    trainingProfile.data.status === "training" &&
    training !== null &&
    training.profession === value.trainingProfession &&
    training.legalBasis === value.trainingLegalBasis &&
    training.startedOn === value.trainingStartedOn &&
    training.expectedEndOn === value.trainingExpectedEndOn &&
    training.year === value.trainingYear &&
    training.yearConfirmedFrom === value.trainingYearConfirmedFrom
  );
}
