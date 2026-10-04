import type { SavedShiftTraining } from "@/domain/training-data";
import {
  isCurrentCaritasMonthFacts,
  type SavedCaritasMonthFacts,
} from "@/domain/saved-caritas-month-facts";
import { isCurrentCaritasWorkDay, type SavedCaritasWorkDay } from "@/domain/saved-caritas-work-day";
import {
  resolveRemunerationProfile,
  type DatedRemunerationProfile,
} from "@/domain/remuneration-profile";
import type { ShiftEntry, UserProfile } from "@/domain/types";
import type { RuleResolver } from "@/rules/rule-resolver";
import { validateRulePackage } from "@/rules/validation";
import {
  calculateCaritasCareDraftMonth,
  type CaritasCareDraftMonthInput,
  type CaritasCareDraftMonthResult,
} from "./caritas-care-draft-month";
import {
  deriveCaritasDraftWorkFacts,
  type CaritasDraftWorkDayDecision,
  type CaritasDraftWorkFactsResult,
} from "./caritas-care-draft-work-facts";
import {
  deriveCaritasDraftMonthWorkSlices,
  type CaritasDraftMonthWorkSlices,
} from "./caritas-care-draft-work-slices";
import { remunerationShiftDays } from "./remuneration-shift-days";
import { Temporal } from "@js-temporal/polyfill";

export interface CaritasCareDraftSavedMonthInput extends Omit<
  CaritasCareDraftMonthInput,
  "workedSlices" | "workDataComplete"
> {
  readonly workProfile: Pick<UserProfile, "timeZone" | "federalState" | "holidayRegion">;
  readonly shifts: readonly ShiftEntry[];
  readonly pauseDetails: readonly SavedShiftTraining[];
  readonly entriesComplete: boolean;
  readonly dayDecisions: readonly CaritasDraftWorkDayDecision[];
  readonly resolver?: RuleResolver;
}

export type CaritasCareDraftSavedMonthResult =
  | Extract<CaritasCareDraftMonthResult, { kind: "draft-known-subtotal" }>
  | {
      readonly kind: "unavailable";
      readonly stage: "work-slices" | "holiday-facts" | "pay";
      readonly reason:
        | Extract<CaritasDraftMonthWorkSlices, { kind: "unavailable" }>["reason"]
        | Extract<CaritasDraftWorkFactsResult, { kind: "unavailable" }>["reason"]
        | Extract<CaritasCareDraftMonthResult, { kind: "unavailable" }>["reason"];
      readonly shiftId?: string;
      readonly date?: string;
    };

export interface CaritasCareDraftPersistedMonthInput extends Omit<
  CaritasCareDraftSavedMonthInput,
  "dayDecisions"
> {
  readonly workDayConfirmations: readonly SavedCaritasWorkDay[];
}

export interface CaritasCareDraftStoredMonthInput extends Omit<
  CaritasCareDraftPersistedMonthInput,
  | "variantId"
  | "regionId"
  | "groupId"
  | "stepId"
  | "weeklyMinutes"
  | "fullMonthEmploymentConfirmed"
  | "fullMonthlyBaseEntitlementConfirmed"
  | "fixedAllowanceClaim"
  | "careAllowanceClaim"
  | "localAgreement"
> {
  readonly remunerationProfiles: readonly DatedRemunerationProfile[];
  readonly monthFacts: readonly SavedCaritasMonthFacts[];
}

export type CaritasCareDraftStoredMonthResult =
  | CaritasCareDraftSavedMonthResult
  | {
      readonly kind: "unavailable";
      readonly stage: "month-facts";
      readonly reason:
        | "INVALID_MONTH"
        | "PROFILE_MISSING_OR_SPLIT"
        | "MONTH_FACTS_MISSING_OR_STALE"
        | "EMPLOYMENT_UNKNOWN";
    };

export interface CaritasCareDraftCatalogMonthInput extends Omit<
  CaritasCareDraftStoredMonthInput,
  "pkg" | "resolver"
> {
  readonly resolver: RuleResolver;
}

export type CaritasCareDraftCatalogMonthResult =
  | CaritasCareDraftStoredMonthResult
  | {
      readonly kind: "unavailable";
      readonly stage: "rule-catalog";
      readonly reason: "RULE_PACKAGE_MISSING" | "RULE_PACKAGE_AMBIGUOUS" | "RULE_PACKAGE_INVALID";
    };

function wholeMonthTariffProfile(
  month: string,
  profiles: readonly DatedRemunerationProfile[],
):
  | { readonly profile: DatedRemunerationProfile; readonly error: null }
  | {
      readonly profile: null;
      readonly error: "INVALID_MONTH" | "PROFILE_MISSING_OR_SPLIT";
    } {
  let through: string;
  try {
    const parsed = Temporal.PlainYearMonth.from(month);
    if (parsed.toString() !== month) throw new Error("invalid month");
    through = `${month}-${String(parsed.daysInMonth).padStart(2, "0")}`;
  } catch {
    return { profile: null, error: "INVALID_MONTH" };
  }
  const first = resolveRemunerationProfile(profiles, `${month}-01`);
  const last = resolveRemunerationProfile(profiles, through);
  if (
    first.status !== "dated" ||
    last.status !== "dated" ||
    first.profile !== last.profile ||
    first.profile.data.selection.kind !== "tariff"
  )
    return { profile: null, error: "PROFILE_MISSING_OR_SPLIT" };
  return { profile: first.profile, error: null };
}

/** Resolve a candidate strictly from the injected catalog and saved profile. */
export function calculateCaritasCareDraftMonthFromCatalog(
  input: CaritasCareDraftCatalogMonthInput,
): CaritasCareDraftCatalogMonthResult {
  const selected = wholeMonthTariffProfile(input.month, input.remunerationProfiles);
  if (selected.profile === null)
    return { kind: "unavailable", stage: "month-facts", reason: selected.error };
  const selection = selected.profile.data.selection;
  if (selection.kind !== "tariff")
    return { kind: "unavailable", stage: "month-facts", reason: "PROFILE_MISSING_OR_SPLIT" };
  const resolved = input.resolver.resolveTariff(`${input.month}-01`, selection.packageId);
  if (!resolved.ok)
    return {
      kind: "unavailable",
      stage: "rule-catalog",
      reason:
        resolved.error.code === "RULE_PACKAGE_AMBIGUOUS"
          ? "RULE_PACKAGE_AMBIGUOUS"
          : "RULE_PACKAGE_MISSING",
    };
  const validated = validateRulePackage(resolved.value);
  if (
    !validated.ok ||
    validated.value.kind !== "TARIFF" ||
    validated.value.packageId !== selection.packageId ||
    validated.value.engineContractVersion !== 14 ||
    validated.value.status !== "DRAFT"
  )
    return { kind: "unavailable", stage: "rule-catalog", reason: "RULE_PACKAGE_INVALID" };
  return calculateCaritasCareDraftMonthFromStored({ ...input, pkg: validated.value });
}

/** Candidate integration: derive all personal pay inputs from the selected persisted profile and facts. */
export function calculateCaritasCareDraftMonthFromStored(
  input: CaritasCareDraftStoredMonthInput,
): CaritasCareDraftStoredMonthResult {
  const selected = wholeMonthTariffProfile(input.month, input.remunerationProfiles);
  if (selected.profile === null)
    return { kind: "unavailable", stage: "month-facts", reason: selected.error };
  const profile = selected.profile;
  if (
    profile.data.selection.kind !== "tariff" ||
    profile.data.selection.packageId !== input.pkg.packageId
  )
    return { kind: "unavailable", stage: "month-facts", reason: "PROFILE_MISSING_OR_SPLIT" };
  const facts = input.monthFacts.find((value) => value.month === input.month);
  if (
    !facts ||
    !isCurrentCaritasMonthFacts(facts, profile, input.pkg.packageId, input.pkg.versionId)
  )
    return { kind: "unavailable", stage: "month-facts", reason: "MONTH_FACTS_MISSING_OR_STALE" };
  if (facts.fullMonthEmploymentConfirmed === null)
    return { kind: "unavailable", stage: "month-facts", reason: "EMPLOYMENT_UNKNOWN" };
  const selection = profile.data.selection;
  if (selection.kind !== "tariff")
    return { kind: "unavailable", stage: "month-facts", reason: "PROFILE_MISSING_OR_SPLIT" };
  return calculateCaritasCareDraftMonthFromPersisted({
    pkg: input.pkg,
    month: input.month,
    variantId: selection.variant,
    regionId: selection.region,
    groupId: selection.group,
    stepId: selection.level,
    weeklyMinutes: profile.data.weeklyMinutes,
    fullMonthEmploymentConfirmed: facts.fullMonthEmploymentConfirmed,
    fullMonthlyBaseEntitlementConfirmed: facts.fullMonthlyBaseEntitlementConfirmed === true,
    fixedAllowanceClaim: facts.fixedAllowanceClaim,
    careAllowanceClaim: facts.careAllowanceClaim,
    localAgreement: facts.localAgreement,
    workProfile: input.workProfile,
    shifts: input.shifts,
    pauseDetails: input.pauseDetails,
    entriesComplete: input.entriesComplete,
    shiftEntitlements: input.shiftEntitlements,
    workDayConfirmations: input.workDayConfirmations,
    resolver: input.resolver,
  });
}

/** Use only facts bound to the current service revision and timezone. Stale rows stay in storage. */
export function calculateCaritasCareDraftMonthFromPersisted(
  input: CaritasCareDraftPersistedMonthInput,
): CaritasCareDraftSavedMonthResult {
  const shifts = new Map(input.shifts.map((shift) => [shift.id, shift]));
  const dayDecisions: CaritasDraftWorkDayDecision[] = [];
  for (const value of input.workDayConfirmations) {
    const shift = shifts.get(value.shiftId);
    if (
      !shift ||
      !isCurrentCaritasWorkDay(value, shift, input.workProfile.timeZone) ||
      !remunerationShiftDays(shift, input.workProfile.timeZone).some(
        (day) => day.date === value.date,
      )
    )
      continue;
    dayDecisions.push({
      shiftId: value.shiftId,
      date: value.date,
      origin: value.origin,
      holidayTimeOff: value.holidayTimeOff,
      shiftWork: value.shiftWork,
    });
  }
  return calculateCaritasCareDraftMonthFromSaved({ ...input, dayDecisions });
}

/** Candidate-only integration path; no app activation or complete gross-pay claim. */
export function calculateCaritasCareDraftMonthFromSaved(
  input: CaritasCareDraftSavedMonthInput,
): CaritasCareDraftSavedMonthResult {
  const work = deriveCaritasDraftMonthWorkSlices({
    month: input.month,
    shifts: input.shifts,
    details: input.pauseDetails,
    timeZone: input.workProfile.timeZone,
    entriesComplete: input.entriesComplete,
  });
  if (work.kind === "unavailable") return { ...work, stage: "work-slices" };
  const facts = deriveCaritasDraftWorkFacts({
    pkg: input.pkg,
    slices: work.slices,
    decisions: input.dayDecisions,
    federalState: input.workProfile.federalState,
    holidayRegion: input.workProfile.holidayRegion,
    resolver: input.resolver,
  });
  if (facts.kind === "unavailable") return { ...facts, stage: "holiday-facts" };
  const result = calculateCaritasCareDraftMonth({
    ...input,
    workedSlices: facts.slices,
    workDataComplete: true,
  });
  return result.kind === "unavailable" ? { ...result, stage: "pay" } : result;
}
