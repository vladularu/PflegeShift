import { Temporal } from "@js-temporal/polyfill";
import {
  isCurrentDrkEmployeeMonthConfirmation,
  isDrkEmployeePackageId,
  type SavedDrkEmployeeMonthConfirmation,
} from "@/domain/saved-drk-employee-month-confirmation";
import {
  resolveRemunerationProfile,
  validateRemunerationProfileData,
  type DatedRemunerationProfile,
} from "@/domain/remuneration-profile";
import type { RuleResolver } from "@/rules/rule-resolver";
import {
  calculateDrkEmployeeDraftFromProfile,
  type DrkEmployeeDraftFromProfileResult,
} from "./drk-employee-draft-from-profile";

export interface DrkEmployeeDraftFromSavedInput {
  readonly month: string;
  readonly profiles: readonly DatedRemunerationProfile[];
  readonly resolver: RuleResolver;
  readonly confirmations: readonly SavedDrkEmployeeMonthConfirmation[];
}

export type DrkEmployeeDraftFromSavedResult =
  | DrkEmployeeDraftFromProfileResult
  | {
      readonly kind: "unavailable";
      readonly reason: "CONFIRMATION_MISSING" | "CONFIRMATION_AMBIGUOUS" | "CONFIRMATION_STALE";
    };

/** Saved answers unlock only an isolated DRAFT table base, never complete gross pay. */
export function calculateDrkEmployeeDraftFromSaved({
  month,
  profiles,
  resolver,
  confirmations,
}: DrkEmployeeDraftFromSavedInput): DrkEmployeeDraftFromSavedResult {
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

  let start: ReturnType<typeof resolveRemunerationProfile>;
  let end: ReturnType<typeof resolveRemunerationProfile>;
  try {
    start = resolveRemunerationProfile(profiles, first);
    end = resolveRemunerationProfile(profiles, last);
  } catch {
    return { kind: "unavailable", reason: "PROFILE_INVALID" };
  }
  if (start.status !== "dated" || end.status !== "dated")
    return { kind: "unavailable", reason: "PROFILE_MISSING_OR_UNDATED" };
  if (start.profile !== end.profile)
    return { kind: "unavailable", reason: "PROFILE_CHANGES_IN_MONTH" };

  let data: ReturnType<typeof validateRemunerationProfileData>;
  try {
    data = validateRemunerationProfileData(start.profile.data);
  } catch {
    return { kind: "unavailable", reason: "PROFILE_INVALID" };
  }
  const selection = data.selection;
  if (selection.kind !== "tariff" || !isDrkEmployeePackageId(selection.packageId))
    return { kind: "unavailable", reason: "NOT_DRK_EMPLOYEE_PROFILE" };
  if (selection.region !== "BTG") return { kind: "unavailable", reason: "PROFILE_REGION_MISMATCH" };

  const from = resolver.resolveTariff(first, selection.packageId);
  const to = resolver.resolveTariff(last, selection.packageId);
  if (!from.ok || !to.ok) return { kind: "unavailable", reason: "RULE_PACKAGE_UNAVAILABLE" };
  if (from.value !== to.value)
    return { kind: "unavailable", reason: "RULE_VERSION_CHANGES_IN_MONTH" };

  const matching = confirmations.filter((value) => value.month === month);
  if (matching.length === 0) return { kind: "unavailable", reason: "CONFIRMATION_MISSING" };
  if (matching.length !== 1) return { kind: "unavailable", reason: "CONFIRMATION_AMBIGUOUS" };
  const saved = matching[0];
  if (!isCurrentDrkEmployeeMonthConfirmation(saved, start.profile, from.value.versionId))
    return { kind: "unavailable", reason: "CONFIRMATION_STALE" };

  return calculateDrkEmployeeDraftFromProfile({
    month,
    profiles,
    resolver,
    confirmations: {
      drkApplicabilityConfirmed: saved.drkApplicabilityConfirmed === true,
      annexAssignmentConfirmed: saved.annexAssignmentConfirmed === true,
      payGroupAndStepConfirmed: saved.payGroupAndStepConfirmed === true,
      weeklyTimeBasisConfirmed: saved.weeklyTimeBasisConfirmed === true,
      fullMonthBaseEntitlementConfirmed: saved.fullMonthBaseEntitlementConfirmed === true,
    },
  });
}
