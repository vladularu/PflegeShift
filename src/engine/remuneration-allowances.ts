import { Temporal } from "@js-temporal/polyfill";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type {
  DatedAllowanceEntitlement,
  SupplementPosition,
  SupplementResult,
} from "@/domain/remuneration-supplement";
import { ALLOWANCE_STATUSES, type ShiftEntry, type UserProfile } from "@/domain/types";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { bundledRuleResolver, type RuleResolver } from "@/rules/rule-resolver";
import { applicableAllowanceRules, configuredAllowanceAmount } from "./pay-allowances";
import { roundRemunerationCents } from "./remuneration-base";
import { remunerationMonthStart, resolveRemunerationContext } from "./remuneration-context";
import { remunerationMonthShifts, remunerationShiftDays } from "./remuneration-shift-days";
import { summarizeSupplements } from "./remuneration-supplement-result";
import { remunerationTariffProfile } from "./remuneration-tariff-adapter";
import { calculateOwnMonthlyAllowances } from "./remuneration-own-allowances";
import { trainingAllowanceRules } from "./remuneration-training-allowances";
import { calculateTvlShiftAllowances, type TvlAllowanceDay } from "./remuneration-tvl-allowances";
import {
  calculateTvalShiftAllowances,
  type TvalAllowanceDay,
} from "./remuneration-tval-allowances";
import { calculateTvlCareAllowances } from "./remuneration-tvl-care";
import { calculateTvlBurnCare, calculateTvalBurnCare } from "./remuneration-tvl-burn";
import { calculateTvalCareAllowances } from "./remuneration-tval-care";
import type { SavedTvlShiftWork } from "@/domain/saved-tvl-shift-work";

type AllowanceRule = RuleTariffPackage["rules"]["allowanceRules"][number];
interface Bucket {
  readonly position: SupplementPosition;
  readonly rule: AllowanceRule | null;
  readonly profile: UserProfile;
  readonly fullTimeWeeklyMinutes: number;
  readonly training: boolean;
}
const LABELS = {
  care: "Pflegezulage",
  tvoed: "Tarifliche Zulage",
  shift: "Schichtzulage",
  "alternating-shift": "Wechselschichtzulage",
} as const;

function validateEntitlements(entitlements: readonly DatedAllowanceEntitlement[]): void {
  for (const entry of entitlements) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(entry.from) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(entry.through) ||
      Temporal.PlainDate.from(entry.from).toString() !== entry.from ||
      Temporal.PlainDate.from(entry.through).toString() !== entry.through ||
      entry.from > entry.through ||
      !ALLOWANCE_STATUSES.includes(entry.status) ||
      (entry.origin !== "confirmed" && entry.origin !== "estimated") ||
      (entry.revision !== null && (!Number.isSafeInteger(entry.revision) || entry.revision < 1))
    )
      throw new Error("Ungültige zeitliche Zulagenentscheidung.");
  }
}

function finishBucket(bucket: Bucket): SupplementPosition {
  const { position, rule, profile, fullTimeWeeklyMinutes } = bucket;
  if (!rule || position.amountCents === null) return position;
  const cents = bucket.training
    ? roundRemunerationCents(
        rule.amountCents *
          (rule.amountKind === "FIXED_HOURLY" ? position.basis.minutes : 1) *
          (rule.prorateByPartTime ? profile.weeklyMinutes : 1),
        (rule.amountKind === "FIXED_HOURLY" ? 60 : 1) *
          (rule.prorateByPartTime ? fullTimeWeeklyMinutes : 1),
      )
    : Math.round(
        configuredAllowanceAmount(rule, position.basis.minutes, profile, fullTimeWeeklyMinutes) *
          100,
      );
  const monthly = rule.amountKind === "FIXED_MONTHLY";
  return {
    ...position,
    status:
      bucket.training &&
      monthly &&
      (profile.weeklyMinutes < fullTimeWeeklyMinutes ||
        position.basis.calendarDays < position.basis.monthDays)
        ? "estimated"
        : position.status,
    amountCents: monthly
      ? roundRemunerationCents(cents * position.basis.calendarDays, position.basis.monthDays)
      : cents,
    basis: {
      ...position.basis,
      personalMonthlyCents: monthly ? cents : null,
      proration: monthly
        ? position.basis.calendarDays === position.basis.monthDays
          ? "none"
          : "calendar-days"
        : "worked-minutes",
    },
  };
}

/** Entitlement decisions are inputs, not an inferred legal claim or a fallback to zero. */
export function calculateMonthlyDatedAllowances(
  month: string,
  shifts: readonly ShiftEntry[],
  workProfile: UserProfile,
  history: readonly DatedRemunerationProfile[],
  entitlements: readonly DatedAllowanceEntitlement[],
  resolver: RuleResolver = bundledRuleResolver,
  tvlShiftWork: readonly SavedTvlShiftWork[] = [],
): SupplementResult {
  const first = remunerationMonthStart(month);
  validateEntitlements(entitlements);
  const workDays = new Map<string, { minutes: number; estimatedPause: boolean }>();
  for (const shift of remunerationMonthShifts(month, shifts)) {
    for (const day of remunerationShiftDays(shift, workProfile.timeZone)) {
      const previous = workDays.get(day.date);
      workDays.set(day.date, {
        minutes: (previous?.minutes ?? 0) + day.netMinutes,
        estimatedPause: (previous?.estimatedPause ?? false) || day.estimatedPause,
      });
    }
  }
  const buckets: Bucket[] = [];
  const tvlDays: TvlAllowanceDay[] = [];
  const tvalDays: TvalAllowanceDay[] = [];
  const lastByKey = new Map<string, number>();
  for (let offset = 0; offset < first.daysInMonth; offset += 1) {
    const plainDate = first.add({ days: offset });
    const date = plainDate.toString();
    const context = resolveRemunerationContext(date, history, resolver);
    if (context.kind === "own-configured") continue;
    const matches = entitlements.filter((entry) => entry.from <= date && date <= entry.through);
    if (matches.length > 1)
      throw new Error("Zulagenentscheidungen dürfen sich nicht überschneiden.");
    const entitlement = matches[0] ?? null;
    const work = workDays.get(date) ?? { minutes: 0, estimatedPause: false };
    if (context.kind === "tval-training")
      tvalDays.push({
        date,
        context,
        entitlement,
        employerScope: context.employerScope,
        workedMinutes: work.minutes,
        estimatedPause: work.estimatedPause,
      });
    if (context.kind === "tvl-kr")
      tvlDays.push({
        date,
        context,
        entitlement,
        workedMinutes: work.minutes,
        estimatedPause: work.estimatedPause,
      });
    const types =
      context.kind === "tariff"
        ? ([
            "care",
            "tvoed",
            entitlement?.status.startsWith("ALTERNATING") ? "alternating-shift" : "shift",
          ] as const)
        : context.kind === "training-tariff"
          ? ([
              "care",
              entitlement?.status.startsWith("ALTERNATING") ? "alternating-shift" : "shift",
            ] as const)
          : [null];
    for (const type of types) {
      let rule: AllowanceRule | null = null;
      const profile =
        context.kind === "tariff"
          ? remunerationTariffProfile(workProfile, context)
          : context.kind === "training-tariff"
            ? { ...workProfile, weeklyMinutes: context.weeklyMinutes, tariff: null }
            : workProfile;
      let issue: SupplementPosition["issue"] = null;
      const shiftAllowance = type === "shift" || type === "alternating-shift";
      if (context.kind === "unavailable") issue = context.issue;
      else if (context.kind === "tvoed-annex-a-draft")
        issue = {
          code: "TARIFF_UNSUPPORTED",
          message: "Die weiteren TVöD-Anlage-A-Bestandteile sind noch nicht fachlich freigegeben.",
        };
      else if (context.kind === "tvl-kr")
        issue = {
          code: "TARIFF_UNSUPPORTED",
          message:
            "Weitere TV-L/KR-Pflege- und Tätigkeitszulagen sind noch nicht vollständig angebunden; bestätigte Schichtzulagen werden separat ausgewiesen.",
        };
      else if (context.kind === "tval-training")
        issue = {
          code: "TARIFF_UNSUPPORTED",
          message:
            "Weitere TVA-L-Zulagen, insbesondere BAT-Gefahrenzulagen, sind noch nicht vollständig geprüft; bestätigte Schicht- und Tätigkeitszulagen werden separat ausgewiesen.",
        };
      else if (
        context.kind === "training-tariff" &&
        type === "care" &&
        (context.specialDutyAllowance === null ||
          context.specialDutyAllowance === "OTHER_OR_MULTIPLE")
      )
        issue = {
          code:
            context.specialDutyAllowance === null
              ? "ALLOWANCE_DECISION_MISSING"
              : "TARIFF_UNSUPPORTED",
          message:
            context.specialDutyAllowance === null
              ? "Bitte die tätigkeitsabhängigen Zulagen im datierten Vergütungsprofil ausdrücklich bestätigen."
              : "Weitere oder kombinierte tätigkeitsabhängige Ausbildungszulagen sind noch nicht vollständig abgebildet.",
        };
      else if (context.kind === "own-monthly")
        issue = {
          code: "OWN_ALLOWANCES_UNCONFIGURED",
          message: "Für die eigene Vergütung sind noch keine Zulagenbausteine bestätigt.",
        };
      else if (shiftAllowance && entitlement === null)
        issue = {
          code: "ALLOWANCE_DECISION_MISSING",
          message: "Die Schichtzulagenentscheidung fehlt für diesen Zeitraum.",
        };
      else if (
        type &&
        !(shiftAllowance && entitlement?.status === "NONE") &&
        !(
          context.kind === "training-tariff" &&
          type === "care" &&
          context.specialDutyAllowance === "NONE"
        )
      ) {
        const candidates =
          context.kind === "training-tariff" && (shiftAllowance || type === "care")
            ? trainingAllowanceRules(type, date, entitlement?.status ?? null, context, profile)
            : applicableAllowanceRules(type, {
                date,
                profile,
                rulePackage: context.rulePackage,
                status: entitlement?.status ?? null,
                workMinutes: work.minutes,
                fullTimeWeeklyMinutes: context.fullTimeWeeklyMinutes,
              });
        if (candidates.length !== 1)
          issue = {
            code: candidates.length === 0 ? "ALLOWANCE_RULE_MISSING" : "ALLOWANCE_RULE_AMBIGUOUS",
            message: `Die Regel für ${LABELS[type]} ist ${candidates.length === 0 ? "nicht verfügbar" : "nicht eindeutig"}.`,
          };
        else rule = candidates[0];
      }
      const estimated =
        (shiftAllowance && entitlement?.origin === "estimated") ||
        (rule?.amountKind === "FIXED_HOURLY" && work.estimatedPause);
      const position: SupplementPosition = {
        id: `allowance:${type ?? "unknown"}:${date}`,
        kind: "allowance",
        label:
          context.kind === "tvoed-annex-a-draft"
            ? "Weitere TVöD-Bestandteile"
            : context.kind === "training-tariff" && type === "care"
              ? "Tätigkeitsabhängige Ausbildungszulage"
              : type
                ? LABELS[type]
                : "Zulagen",
        from: date,
        through: date,
        amountCents: issue ? null : 0,
        status: issue ? "unavailable" : estimated ? "estimated" : "calculated",
        source: context.source,
        issue,
        basis: {
          ruleId: rule?.id ?? null,
          shiftId: null,
          allowanceType: type,
          rateCents: rule?.amountCents ?? null,
          personalMonthlyCents: null,
          percentageBasisPoints: null,
          minutes: rule?.amountKind === "FIXED_HOURLY" ? work.minutes : 0,
          calendarDays: 1,
          monthDays: first.daysInMonth,
          entitlement: shiftAllowance ? entitlement : null,
          pauseMethod:
            rule?.amountKind === "FIXED_HOURLY" && work.estimatedPause
              ? "centered-duration-estimate"
              : "none",
          proration: "none",
        },
      };
      // Do not round daily. Contiguous equal monthly components form one period.
      // Pause uncertainty affects the final hourly total, not its rounding partition.
      const key = JSON.stringify([
        type,
        context.source,
        rule,
        shiftAllowance ? entitlement : null,
        issue,
      ]);
      const previousIndex = lastByKey.get(key);
      const previous = previousIndex === undefined ? undefined : buckets[previousIndex];
      if (previous && previous.position.through === plainDate.subtract({ days: 1 }).toString()) {
        buckets[previousIndex!] = {
          ...previous,
          position: {
            ...previous.position,
            through: date,
            status: issue
              ? "unavailable"
              : estimated || previous.position.status === "estimated"
                ? "estimated"
                : "calculated",
            basis: {
              ...previous.position.basis,
              minutes: previous.position.basis.minutes + position.basis.minutes,
              calendarDays: previous.position.basis.calendarDays + 1,
              pauseMethod:
                previous.position.basis.pauseMethod === "centered-duration-estimate" ||
                position.basis.pauseMethod === "centered-duration-estimate"
                  ? "centered-duration-estimate"
                  : "none",
            },
          },
        };
      } else {
        lastByKey.set(key, buckets.length);
        buckets.push({
          position,
          rule,
          profile,
          fullTimeWeeklyMinutes:
            context.kind === "tariff" || context.kind === "training-tariff"
              ? context.fullTimeWeeklyMinutes
              : 1,
          training: context.kind === "training-tariff",
        });
      }
    }
  }
  return summarizeSupplements([
    ...buckets.map(finishBucket),
    ...calculateTvlShiftAllowances(tvlDays),
    ...calculateTvalShiftAllowances(tvalDays),
    ...calculateTvalCareAllowances(
      tvalDays,
      calculateTvalBurnCare(tvalDays, shifts, history, tvlShiftWork, workProfile.timeZone),
    ),
    ...calculateTvlCareAllowances(
      tvlDays,
      calculateTvlBurnCare(tvlDays, shifts, history, tvlShiftWork, workProfile.timeZone),
    ),
    ...calculateOwnMonthlyAllowances(month, history, resolver),
  ]);
}
