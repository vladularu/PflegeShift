import { Temporal } from "@js-temporal/polyfill";
import {
  isCurrentDrkTrainingMonthConfirmation,
  type SavedDrkTrainingMonthConfirmation,
} from "@/domain/saved-drk-training-month-confirmation";
import {
  resolveRemunerationProfile,
  validateRemunerationProfileData,
  type DatedRemunerationProfile,
} from "@/domain/remuneration-profile";
import { trainingProfileForDate, type SavedTrainingProfile } from "@/domain/training-data";
import type { RuleResolver } from "@/rules/rule-resolver";
import {
  calculateDrkTrainingDraftFromProfile,
  type DrkTrainingDraftFromProfileResult,
} from "./drk-training-draft-from-profile";

export interface DrkTrainingDraftFromSavedInput {
  readonly month: string;
  readonly remunerationProfiles: readonly DatedRemunerationProfile[];
  readonly trainingProfiles: readonly SavedTrainingProfile[];
  readonly resolver: RuleResolver;
  readonly confirmations: readonly SavedDrkTrainingMonthConfirmation[];
}

export type DrkTrainingDraftFromSavedResult =
  | DrkTrainingDraftFromProfileResult
  | {
      readonly kind: "unavailable";
      readonly reason: "CONFIRMATION_MISSING" | "CONFIRMATION_AMBIGUOUS" | "CONFIRMATION_STALE";
    };

/** Saved answers unlock only an isolated DRAFT training table base, never complete gross pay. */
export function calculateDrkTrainingDraftFromSaved({
  month,
  remunerationProfiles,
  trainingProfiles,
  resolver,
  confirmations,
}: DrkTrainingDraftFromSavedInput): DrkTrainingDraftFromSavedResult {
  let first: string;
  let last: string;
  try {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/u.test(month))
      return { kind: "unavailable", reason: "INVALID_MONTH" };
    const yearMonth = Temporal.PlainYearMonth.from(month);
    first = yearMonth.toPlainDate({ day: 1 }).toString();
    last = yearMonth.toPlainDate({ day: yearMonth.daysInMonth }).toString();
  } catch {
    return { kind: "unavailable", reason: "INVALID_MONTH" };
  }

  let remunerationStart: ReturnType<typeof resolveRemunerationProfile>;
  let remunerationEnd: ReturnType<typeof resolveRemunerationProfile>;
  try {
    remunerationStart = resolveRemunerationProfile(remunerationProfiles, first);
    remunerationEnd = resolveRemunerationProfile(remunerationProfiles, last);
  } catch {
    return { kind: "unavailable", reason: "PROFILE_INVALID" };
  }
  if (remunerationStart.status !== "dated" || remunerationEnd.status !== "dated")
    return { kind: "unavailable", reason: "PROFILE_MISSING_OR_UNDATED" };
  if (remunerationStart.profile !== remunerationEnd.profile)
    return { kind: "unavailable", reason: "PROFILE_CHANGES_IN_MONTH" };

  let remuneration: ReturnType<typeof validateRemunerationProfileData>;
  try {
    remuneration = validateRemunerationProfileData(remunerationStart.profile.data);
  } catch {
    return { kind: "unavailable", reason: "PROFILE_INVALID" };
  }
  const selection = remuneration.selection;
  if (selection.kind !== "tariff" || selection.packageId !== "drk-rtv-training")
    return { kind: "unavailable", reason: "NOT_DRK_TRAINING_PROFILE" };
  if (selection.region !== "BTG") return { kind: "unavailable", reason: "PROFILE_REGION_MISMATCH" };

  const dates = trainingProfiles.map((value) => value.data.effectiveFrom);
  if (new Set(dates).size !== dates.length)
    return { kind: "unavailable", reason: "TRAINING_PROFILE_INVALID" };
  let trainingStart: SavedTrainingProfile | null;
  let trainingEnd: SavedTrainingProfile | null;
  try {
    trainingStart = trainingProfileForDate(trainingProfiles, first);
    trainingEnd = trainingProfileForDate(trainingProfiles, last);
  } catch {
    return { kind: "unavailable", reason: "TRAINING_PROFILE_INVALID" };
  }
  if (trainingStart === null || trainingEnd === null)
    return { kind: "unavailable", reason: "TRAINING_PROFILE_MISSING" };
  if (trainingStart.data.effectiveFrom !== trainingEnd.data.effectiveFrom)
    return { kind: "unavailable", reason: "TRAINING_PROFILE_CHANGES_IN_MONTH" };

  const from = resolver.resolveTariff(first, selection.packageId);
  const to = resolver.resolveTariff(last, selection.packageId);
  if (!from.ok || !to.ok) return { kind: "unavailable", reason: "RULE_PACKAGE_UNAVAILABLE" };
  if (from.value !== to.value)
    return { kind: "unavailable", reason: "RULE_VERSION_CHANGES_IN_MONTH" };

  const matching = confirmations.filter((value) => value.month === month);
  if (matching.length === 0) return { kind: "unavailable", reason: "CONFIRMATION_MISSING" };
  if (matching.length !== 1) return { kind: "unavailable", reason: "CONFIRMATION_AMBIGUOUS" };
  const saved = matching[0];
  if (
    !isCurrentDrkTrainingMonthConfirmation(
      saved,
      remunerationStart.profile,
      trainingStart,
      from.value.versionId,
    )
  )
    return { kind: "unavailable", reason: "CONFIRMATION_STALE" };

  return calculateDrkTrainingDraftFromProfile({
    month,
    remunerationProfiles,
    trainingProfiles,
    resolver,
    confirmations: {
      drkApplicabilityConfirmed: saved.drkApplicabilityConfirmed === true,
      trainingCategoryConfirmed: saved.trainingCategoryConfirmed === true,
      trainingYearConfirmed: saved.trainingYearConfirmed === true,
      fullMonthBaseEntitlementConfirmed: saved.fullMonthBaseEntitlementConfirmed === true,
      fullTimeTrainingConfirmed: saved.fullTimeTrainingConfirmed === true,
    },
  });
}
