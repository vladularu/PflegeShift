import { Temporal } from "@js-temporal/polyfill";
import {
  isCurrentCaritasOvertime,
  type SavedCaritasOvertime,
} from "@/domain/saved-caritas-overtime";
import {
  isCurrentOvertimeAllocation,
  type SavedOvertimeAllocation,
} from "@/domain/overtime-allocation";
import {
  resolveRemunerationProfile,
  type DatedRemunerationProfile,
} from "@/domain/remuneration-profile";
import type { ShiftEntry } from "@/domain/types";
import type { RuleResolver } from "@/rules/rule-resolver";
import { calculateCaritasCareDraftOvertime } from "./caritas-care-draft-overtime";
import { remunerationShiftDays } from "./remuneration-shift-days";

export interface CaritasDraftOvertimePayoutInput {
  readonly month: string;
  readonly timeZone: string;
  /** The caller must supply the full saved work history through this payout month. */
  readonly historyComplete: boolean;
  readonly shifts: readonly ShiftEntry[];
  readonly allocations: readonly SavedOvertimeAllocation[];
  readonly confirmations: readonly SavedCaritasOvertime[];
  readonly profiles: readonly DatedRemunerationProfile[];
  readonly resolver: RuleResolver;
}

export type CaritasDraftOvertimePayoutResult =
  | {
      readonly kind: "draft-confirmed-payouts";
      readonly status: "estimated";
      readonly month: string;
      /** Only explicitly timed cash payouts; not a complete monthly gross-pay amount. */
      readonly cashSubtotalCents: number;
      readonly positions: readonly {
        readonly shiftId: string;
        readonly workDate: string;
        readonly payoutMonth: string;
        readonly component: "WORK_HOURS" | "OVERTIME_PREMIUM";
        readonly minutes: number;
        readonly amountCents: number;
        readonly packageId: string;
        readonly versionId: string;
        readonly sourceIds: readonly string[];
      }[];
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | "INVALID_MONTH"
        | "HISTORY_INCOMPLETE"
        | "DUPLICATE_RECORD"
        | "ORPHAN_RECORD"
        | "CLASSIFICATION_UNCONFIRMED"
        | "ALLOCATION_MISSING_OR_STALE"
        | "CONFIRMATION_MISSING_OR_STALE"
        | "PAYOUT_MONTH_UNKNOWN"
        | "PROFILE_MISSING_OR_STALE"
        | "RULE_PACKAGE_MISSING_OR_CHANGED"
        | "OVERTIME_CALCULATION_UNAVAILABLE"
        | "AMOUNT_OVERFLOW";
      readonly shiftId?: string;
      readonly date?: string;
    };

function uniqueByShift<T extends { readonly shiftId: string }>(
  records: readonly T[],
): Map<string, T> | null {
  const result = new Map<string, T>();
  for (const value of records) {
    if (result.has(value.shiftId)) return null;
    result.set(value.shiftId, value);
  }
  return result;
}

/** A candidate-only payout view. Unknown timing and stale history never become a zero payment. */
export function calculateCaritasDraftOvertimePayoutMonth(
  input: CaritasDraftOvertimePayoutInput,
): CaritasDraftOvertimePayoutResult {
  let monthEnd: string;
  try {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/u.test(input.month))
      return { kind: "unavailable", reason: "INVALID_MONTH" };
    const parsed = Temporal.PlainYearMonth.from(input.month);
    if (parsed.toString() !== input.month) return { kind: "unavailable", reason: "INVALID_MONTH" };
    monthEnd = `${input.month}-${String(parsed.daysInMonth).padStart(2, "0")}`;
  } catch {
    return { kind: "unavailable", reason: "INVALID_MONTH" };
  }
  if (!input.historyComplete) return { kind: "unavailable", reason: "HISTORY_INCOMPLETE" };

  const shifts = new Map<string, ShiftEntry>();
  for (const shift of input.shifts) {
    if (shifts.has(shift.id)) return { kind: "unavailable", reason: "DUPLICATE_RECORD" };
    shifts.set(shift.id, shift);
  }
  const allocations = uniqueByShift(input.allocations);
  const confirmations = uniqueByShift(input.confirmations);
  if (!allocations || !confirmations) return { kind: "unavailable", reason: "DUPLICATE_RECORD" };
  if ([...allocations.keys(), ...confirmations.keys()].some((shiftId) => !shifts.has(shiftId)))
    return { kind: "unavailable", reason: "ORPHAN_RECORD" };
  for (const confirmation of input.confirmations) {
    if (
      confirmation.workPayoutMonth !== input.month &&
      confirmation.premiumPayoutMonth !== input.month
    )
      continue;
    const shift = shifts.get(confirmation.shiftId)!;
    if (
      shift.date > monthEnd ||
      shift.deletedAt !== null ||
      shift.overtimeMinutes <= 0 ||
      !shift.tariffOvertimeConfirmed
    )
      return {
        kind: "unavailable",
        reason: "CONFIRMATION_MISSING_OR_STALE",
        shiftId: confirmation.shiftId,
      };
  }

  const positions: Extract<
    CaritasDraftOvertimePayoutResult,
    { kind: "draft-confirmed-payouts" }
  >["positions"][number][] = [];
  const checkedConfirmations = new Set<string>();
  for (const shift of input.shifts) {
    if (shift.date > monthEnd || shift.overtimeMinutes <= 0) continue;
    const days = remunerationShiftDays(shift, input.timeZone);
    if (days.length === 0)
      return { kind: "unavailable", reason: "ALLOCATION_MISSING_OR_STALE", shiftId: shift.id };
    const dayProfiles = days.map((day) => resolveRemunerationProfile(input.profiles, day.date));
    if (dayProfiles.some((value) => value.status !== "dated"))
      return { kind: "unavailable", reason: "PROFILE_MISSING_OR_STALE", shiftId: shift.id };
    const caritasDays = dayProfiles.filter((value) => {
      const selection = value.profile?.data.selection;
      return selection?.kind === "tariff" && selection.packageId.startsWith("avr-caritas-p-");
    });
    if (caritasDays.length === 0) continue;
    if (caritasDays.length !== days.length)
      return { kind: "unavailable", reason: "PROFILE_MISSING_OR_STALE", shiftId: shift.id };
    if (!shift.tariffOvertimeConfirmed)
      return { kind: "unavailable", reason: "CLASSIFICATION_UNCONFIRMED", shiftId: shift.id };
    const allocation = allocations.get(shift.id);
    if (!allocation || !isCurrentOvertimeAllocation(allocation, shift, input.timeZone))
      return { kind: "unavailable", reason: "ALLOCATION_MISSING_OR_STALE", shiftId: shift.id };
    if (
      allocation.allocations === null ||
      allocation.allocations.reduce((sum, day) => sum + day.minutes, 0) !== shift.overtimeMinutes ||
      allocation.allocations.some((item) => {
        const day = days.find((value) => value.date === item.date);
        return !day || item.minutes > day.until - day.from;
      })
    )
      return { kind: "unavailable", reason: "ALLOCATION_MISSING_OR_STALE", shiftId: shift.id };
    const activeDays = allocation.allocations.filter((day) => day.minutes > 0);
    const latestWorkMonth = activeDays.at(-1)?.date.slice(0, 7);
    if (!latestWorkMonth)
      return { kind: "unavailable", reason: "ALLOCATION_MISSING_OR_STALE", shiftId: shift.id };
    // A cross-month shift cannot be paid before its last allocated workday.
    if (latestWorkMonth > input.month) continue;
    const confirmation = confirmations.get(shift.id);
    if (!confirmation)
      return { kind: "unavailable", reason: "CONFIRMATION_MISSING_OR_STALE", shiftId: shift.id };
    if (confirmation.allocationRevision !== allocation.revision)
      return { kind: "unavailable", reason: "CONFIRMATION_MISSING_OR_STALE", shiftId: shift.id };
    if (
      (confirmation.workPayoutMonth !== null && confirmation.workPayoutMonth < latestWorkMonth) ||
      (confirmation.premiumPayoutMonth !== null &&
        confirmation.premiumPayoutMonth < latestWorkMonth)
    )
      return { kind: "unavailable", reason: "CONFIRMATION_MISSING_OR_STALE", shiftId: shift.id };
    if (
      (confirmation.workSettlement === "CASH" && confirmation.workPayoutMonth === null) ||
      (confirmation.premiumSettlement === "CASH" && confirmation.premiumPayoutMonth === null)
    )
      return { kind: "unavailable", reason: "PAYOUT_MONTH_UNKNOWN", shiftId: shift.id };

    const profile = input.profiles.find(
      (item) => item.effectiveFrom === confirmation.profileEffectiveFrom,
    );
    if (!profile)
      return { kind: "unavailable", reason: "PROFILE_MISSING_OR_STALE", shiftId: shift.id };
    const selection = profile.data.selection;
    if (
      selection.kind !== "tariff" ||
      activeDays.some((day) => {
        const resolved = resolveRemunerationProfile(input.profiles, day.date);
        return resolved.status !== "dated" || resolved.profile !== profile;
      })
    )
      return { kind: "unavailable", reason: "PROFILE_MISSING_OR_STALE", shiftId: shift.id };
    if (
      !isCurrentCaritasOvertime(
        confirmation,
        shift,
        allocation,
        profile,
        confirmation.ruleVersionId,
        input.timeZone,
      )
    )
      return { kind: "unavailable", reason: "CONFIRMATION_MISSING_OR_STALE", shiftId: shift.id };
    checkedConfirmations.add(shift.id);
    if (
      confirmation.workPayoutMonth !== input.month &&
      confirmation.premiumPayoutMonth !== input.month
    )
      continue;

    for (const day of activeDays) {
      const resolved = input.resolver.resolveTariff(day.date, confirmation.packageId);
      if (
        !resolved.ok ||
        resolved.value.packageId !== confirmation.packageId ||
        resolved.value.versionId !== confirmation.ruleVersionId
      )
        return {
          kind: "unavailable",
          reason: "RULE_PACKAGE_MISSING_OR_CHANGED",
          shiftId: shift.id,
          date: day.date,
        };
      const result = calculateCaritasCareDraftOvertime({
        pkg: resolved.value,
        date: day.date,
        variantId: confirmation.variantId,
        regionId: confirmation.regionId,
        groupId: selection.group,
        stepId: selection.level,
        minutes: day.minutes,
        classification: confirmation.classification,
        workSettlement: confirmation.workSettlement,
        premiumSettlement: confirmation.premiumSettlement,
      });
      if (result.kind === "unavailable")
        return {
          kind: "unavailable",
          reason: "OVERTIME_CALCULATION_UNAVAILABLE",
          shiftId: shift.id,
          date: day.date,
        };
      for (const item of result.positions) {
        const payoutMonth =
          item.component === "WORK_HOURS"
            ? confirmation.workPayoutMonth
            : confirmation.premiumPayoutMonth;
        if (payoutMonth !== input.month || item.settlement !== "CASH") continue;
        positions.push({
          shiftId: shift.id,
          workDate: day.date,
          payoutMonth: input.month,
          component: item.component,
          minutes: day.minutes,
          amountCents: item.cashAmountCents,
          packageId: result.packageId,
          versionId: result.versionId,
          sourceIds: result.sourceIds,
        });
      }
    }
  }
  const missedPayout = input.confirmations.find(
    (value) =>
      (value.workPayoutMonth === input.month || value.premiumPayoutMonth === input.month) &&
      !checkedConfirmations.has(value.shiftId),
  );
  if (missedPayout)
    return {
      kind: "unavailable",
      reason: "CONFIRMATION_MISSING_OR_STALE",
      shiftId: missedPayout.shiftId,
    };
  const cashSubtotalCents = positions.reduce((sum, item) => sum + item.amountCents, 0);
  if (!Number.isSafeInteger(cashSubtotalCents))
    return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };
  return {
    kind: "draft-confirmed-payouts",
    status: "estimated",
    month: input.month,
    cashSubtotalCents,
    positions,
  };
}
