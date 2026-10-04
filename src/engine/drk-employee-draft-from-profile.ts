import { Temporal } from "@js-temporal/polyfill";
import {
  resolveRemunerationProfile,
  validateRemunerationProfileData,
  type DatedRemunerationProfile,
} from "@/domain/remuneration-profile";
import type { RuleResolver } from "@/rules/rule-resolver";
import {
  calculateDrkEmployeeDraftTableBase,
  type DrkEmployeeDraftBaseInput,
  type DrkEmployeeDraftBaseResult,
} from "./drk-employee-draft-base";

type Confirmations = Pick<
  DrkEmployeeDraftBaseInput,
  | "drkApplicabilityConfirmed"
  | "annexAssignmentConfirmed"
  | "payGroupAndStepConfirmed"
  | "weeklyTimeBasisConfirmed"
  | "fullMonthBaseEntitlementConfirmed"
>;

export interface DrkEmployeeDraftFromProfileInput {
  readonly month: string;
  readonly profiles: readonly DatedRemunerationProfile[];
  readonly resolver: RuleResolver;
  /** Personal facts are explicit and not inferred from a job title or employer name. */
  readonly confirmations: Confirmations;
}

export type DrkEmployeeDraftFromProfileResult =
  | DrkEmployeeDraftBaseResult
  | {
      readonly kind: "unavailable";
      readonly reason:
        | "PROFILE_MISSING_OR_UNDATED"
        | "PROFILE_INVALID"
        | "PROFILE_CHANGES_IN_MONTH"
        | "NOT_DRK_EMPLOYEE_PROFILE"
        | "PROFILE_REGION_MISMATCH"
        | "RULE_PACKAGE_UNAVAILABLE"
        | "RULE_VERSION_CHANGES_IN_MONTH";
    };

const employeeFamilies = new Set(["drk-rtv-e", "drk-rtv-p", "drk-rtv-s"]);

/** Exact dated profile + injected catalog, never a bundled tariff fallback or complete gross. */
export function calculateDrkEmployeeDraftFromProfile({
  month,
  profiles,
  resolver,
  confirmations,
}: DrkEmployeeDraftFromProfileInput): DrkEmployeeDraftFromProfileResult {
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
  if (selection.kind !== "tariff" || !employeeFamilies.has(selection.packageId))
    return { kind: "unavailable", reason: "NOT_DRK_EMPLOYEE_PROFILE" };
  if (selection.region !== "BTG") return { kind: "unavailable", reason: "PROFILE_REGION_MISMATCH" };

  const from = resolver.resolveTariff(first, selection.packageId);
  const to = resolver.resolveTariff(last, selection.packageId);
  if (!from.ok || !to.ok) return { kind: "unavailable", reason: "RULE_PACKAGE_UNAVAILABLE" };
  if (from.value !== to.value)
    return { kind: "unavailable", reason: "RULE_VERSION_CHANGES_IN_MONTH" };

  return calculateDrkEmployeeDraftTableBase({
    pkg: from.value,
    month,
    variantId: selection.variant,
    groupId: selection.group,
    stepId: `s${selection.level}`,
    contractedWeeklyMinutes: data.weeklyMinutes,
    fullTimeWeeklyMinutes: selection.fullTimeWeeklyMinutes,
    ...confirmations,
  });
}
