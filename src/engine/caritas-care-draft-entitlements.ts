import { Temporal } from "@js-temporal/polyfill";
import {
  validateScopedAllowanceDecisions,
  type MonthlyAllowanceDecisions,
} from "@/domain/allowance-decisions";
import {
  resolveRemunerationProfile,
  type DatedRemunerationProfile,
} from "@/domain/remuneration-profile";
import type { DatedAllowanceEntitlement } from "@/domain/remuneration-supplement";

export type CaritasDraftEntitlementsResult =
  | { readonly kind: "confirmed"; readonly entitlements: readonly DatedAllowanceEntitlement[] }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | "INVALID_MONTH"
        | "PROFILE_MISSING_OR_SPLIT"
        | "DECISIONS_MISSING"
        | "DECISIONS_INVALID"
        | "DECISIONS_STALE"
        | "DECISIONS_TARIFF_MISMATCH"
        | "DECISIONS_INCOMPLETE";
    };

/** A saved empty month is not a confirmed NONE claim; every calendar day needs a tariff-bound decision. */
export function deriveCaritasDraftEntitlements(
  month: string,
  profiles: readonly DatedRemunerationProfile[],
  savedMonths: readonly MonthlyAllowanceDecisions[],
): CaritasDraftEntitlementsResult {
  let lastDay: string;
  try {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/u.test(month))
      return { kind: "unavailable", reason: "INVALID_MONTH" };
    const parsed = Temporal.PlainYearMonth.from(month);
    if (parsed.toString() !== month) return { kind: "unavailable", reason: "INVALID_MONTH" };
    lastDay = `${month}-${String(parsed.daysInMonth).padStart(2, "0")}`;
  } catch {
    return { kind: "unavailable", reason: "INVALID_MONTH" };
  }

  const first = resolveRemunerationProfile(profiles, `${month}-01`);
  const last = resolveRemunerationProfile(profiles, lastDay);
  if (
    first.status !== "dated" ||
    last.status !== "dated" ||
    first.profile !== last.profile ||
    first.profile.data.selection.kind !== "tariff" ||
    !first.profile.data.selection.packageId.startsWith("avr-caritas-p-")
  )
    return { kind: "unavailable", reason: "PROFILE_MISSING_OR_SPLIT" };

  const saved = savedMonths.filter((item) => item.month === month);
  if (saved.length === 0) return { kind: "unavailable", reason: "DECISIONS_MISSING" };
  if (
    saved.length !== 1 ||
    !Number.isSafeInteger(saved[0].revision) ||
    saved[0].revision < 0 ||
    (saved[0].updatedAt !== null && !Number.isFinite(Date.parse(saved[0].updatedAt)))
  )
    return { kind: "unavailable", reason: "DECISIONS_INVALID" };
  if (saved[0].revision === 0) return { kind: "unavailable", reason: "DECISIONS_MISSING" };
  if (saved[0].updatedAt === null) return { kind: "unavailable", reason: "DECISIONS_INVALID" };

  let decisions;
  try {
    decisions = validateScopedAllowanceDecisions(saved[0].decisions);
  } catch {
    return { kind: "unavailable", reason: "DECISIONS_INVALID" };
  }
  const selection = first.profile.data.selection;
  if (selection.kind !== "tariff")
    return { kind: "unavailable", reason: "PROFILE_MISSING_OR_SPLIT" };
  let nextDay = `${month}-01`;
  const entitlements: DatedAllowanceEntitlement[] = [];
  for (const decision of decisions) {
    if (decision.revision !== saved[0].revision)
      return { kind: "unavailable", reason: "DECISIONS_STALE" };
    if (
      decision.tariff.packageId !== selection.packageId ||
      decision.tariff.variant !== selection.variant ||
      decision.tariff.region !== selection.region
    )
      return { kind: "unavailable", reason: "DECISIONS_TARIFF_MISMATCH" };
    if (decision.from.slice(0, 7) !== month || decision.through.slice(0, 7) !== month)
      return { kind: "unavailable", reason: "DECISIONS_INVALID" };
    if (decision.from !== nextDay) return { kind: "unavailable", reason: "DECISIONS_INCOMPLETE" };
    nextDay = Temporal.PlainDate.from(decision.through).add({ days: 1 }).toString();
    entitlements.push({
      from: decision.from,
      through: decision.through,
      status: decision.allowanceStatus,
      origin: "confirmed",
      revision: decision.revision,
    });
  }
  if (nextDay !== Temporal.PlainDate.from(lastDay).add({ days: 1 }).toString())
    return { kind: "unavailable", reason: "DECISIONS_INCOMPLETE" };
  return { kind: "confirmed", entitlements: Object.freeze(entitlements) };
}
