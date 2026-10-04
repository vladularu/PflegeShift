import { Temporal } from "@js-temporal/polyfill";
import {
  resolveRemunerationProfile,
  validateRemunerationProfileData,
  type DatedRemunerationProfile,
} from "@/domain/remuneration-profile";
import {
  trainingProfileForDate,
  validateTrainingProfile,
  type SavedTrainingProfile,
} from "@/domain/training-data";
import type { RuleResolver } from "@/rules/rule-resolver";
import {
  calculateDrkTrainingDraftTableBase,
  type DrkTrainingDraftBaseInput,
  type DrkTrainingDraftBaseResult,
} from "./drk-training-draft-base";

type Confirmations = Pick<
  DrkTrainingDraftBaseInput,
  | "drkApplicabilityConfirmed"
  | "trainingCategoryConfirmed"
  | "trainingYearConfirmed"
  | "fullMonthBaseEntitlementConfirmed"
  | "fullTimeTrainingConfirmed"
>;

export interface DrkTrainingDraftFromProfileInput {
  readonly month: string;
  readonly remunerationProfiles: readonly DatedRemunerationProfile[];
  readonly trainingProfiles: readonly SavedTrainingProfile[];
  readonly resolver: RuleResolver;
  /** No occupation-based inference: these personal facts must be confirmed. */
  readonly confirmations: Confirmations;
}

export type DrkTrainingDraftFromProfileResult =
  | DrkTrainingDraftBaseResult
  | {
      readonly kind: "unavailable";
      readonly reason:
        | "PROFILE_MISSING_OR_UNDATED"
        | "PROFILE_INVALID"
        | "PROFILE_CHANGES_IN_MONTH"
        | "NOT_DRK_TRAINING_PROFILE"
        | "PROFILE_REGION_MISMATCH"
        | "RULE_PACKAGE_UNAVAILABLE"
        | "RULE_VERSION_CHANGES_IN_MONTH"
        | "TRAINING_PROFILE_MISSING"
        | "TRAINING_PROFILE_INVALID"
        | "TRAINING_PROFILE_CHANGES_IN_MONTH"
        | "TRAINING_STATUS_MISSING"
        | "TRAINING_NOT_FULL_MONTH"
        | "TRAINING_LEGAL_BASIS_UNKNOWN"
        | "TRAINING_YEAR_CONFLICT"
        | "TRAINING_CATEGORY_CONFLICT";
    };

const groupByVariant: Readonly<Record<string, string>> = {
  ANLAGE_3: "anlage-3-general",
  ANLAGE_3A_A: "anlage-3a-a",
  ANLAGE_3A_B: "anlage-3a-b",
};

/** Dated profile bridge for DRK apprentice DRAFTs; never a complete salary. */
export function calculateDrkTrainingDraftFromProfile({
  month,
  remunerationProfiles,
  trainingProfiles,
  resolver,
  confirmations,
}: DrkTrainingDraftFromProfileInput): DrkTrainingDraftFromProfileResult {
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
  let training: ReturnType<typeof validateTrainingProfile>;
  try {
    training = validateTrainingProfile(trainingStart.data);
  } catch {
    return { kind: "unavailable", reason: "TRAINING_PROFILE_INVALID" };
  }
  if (training.status !== "training" || training.training === null)
    return { kind: "unavailable", reason: "TRAINING_STATUS_MISSING" };
  if (
    training.training.startedOn > first ||
    (training.training.expectedEndOn !== null && training.training.expectedEndOn < last)
  )
    return { kind: "unavailable", reason: "TRAINING_NOT_FULL_MONTH" };
  if (training.training.legalBasis === "UNKNOWN")
    return { kind: "unavailable", reason: "TRAINING_LEGAL_BASIS_UNKNOWN" };
  if (
    training.training.year === null ||
    training.training.yearConfirmedFrom === null ||
    training.training.yearConfirmedFrom > first ||
    selection.level !== String(training.training.year)
  )
    return { kind: "unavailable", reason: "TRAINING_YEAR_CONFLICT" };
  if (
    groupByVariant[selection.variant] !== selection.group.toLowerCase() ||
    (selection.variant === "ANLAGE_3" && training.training.legalBasis === "PFLBG")
  )
    return { kind: "unavailable", reason: "TRAINING_CATEGORY_CONFLICT" };
  if (remuneration.weeklyMinutes !== selection.fullTimeWeeklyMinutes)
    return { kind: "unavailable", reason: "NON_FULL_TIME_SEPARATE_CALCULATION" };

  const from = resolver.resolveTariff(first, selection.packageId);
  const to = resolver.resolveTariff(last, selection.packageId);
  if (!from.ok || !to.ok) return { kind: "unavailable", reason: "RULE_PACKAGE_UNAVAILABLE" };
  if (from.value !== to.value)
    return { kind: "unavailable", reason: "RULE_VERSION_CHANGES_IN_MONTH" };
  return calculateDrkTrainingDraftTableBase({
    pkg: from.value,
    month,
    variantId: selection.variant,
    trainingYear: training.training.year,
    ...confirmations,
  });
}
