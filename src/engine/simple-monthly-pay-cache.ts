import type {
  MonthlyPayEstimate,
  MonthlyTariffDecision,
  ShiftEntry,
  TvoedWorkPatternSettings,
  UserProfile,
} from "@/domain/types";
import type { RuleResolver } from "@/rules/rule-resolver";

export interface SimpleMonthlyPayInput {
  readonly month: string;
  readonly shifts: readonly ShiftEntry[];
  readonly profile: UserProfile;
  readonly decision: MonthlyTariffDecision | null;
  readonly assessmentShifts: readonly ShiftEntry[];
  readonly workPatternSettings: TvoedWorkPatternSettings;
  readonly ruleResolver: RuleResolver;
}

const MAX_CACHED_MONTHS = 24;

function freezeEstimate<T>(value: T, visited = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || visited.has(value)) return value;
  visited.add(value);
  for (const child of Object.values(value)) freezeEstimate(child, visited);
  return Object.freeze(value);
}

/** Shared across report screens, scoped to the immutable catalog resolver. */
export function createSimpleMonthlyPayCache() {
  const byResolver = new WeakMap<RuleResolver, Map<string, MonthlyPayEstimate>>();
  return (
    input: SimpleMonthlyPayInput,
    calculate: () => MonthlyPayEstimate,
  ): MonthlyPayEstimate => {
    // Content keys also catch changes with unchanged revisions or freshly loaded objects.
    const key = JSON.stringify([
      input.month,
      input.profile,
      input.decision,
      input.workPatternSettings,
      input.shifts,
      input.assessmentShifts,
    ]);
    const entries = byResolver.get(input.ruleResolver);
    const existing = entries?.get(key);
    if (existing) {
      entries!.delete(key);
      entries!.set(key, existing);
      return existing;
    }

    const result = calculate();
    // Rule failures and unavailable results must be retryable immediately.
    if (!result.available) return result;
    const snapshot = freezeEstimate(result);
    const next = entries ?? new Map<string, MonthlyPayEstimate>();
    next.set(key, snapshot);
    if (next.size > MAX_CACHED_MONTHS) next.delete(next.keys().next().value!);
    if (!entries) byResolver.set(input.ruleResolver, next);
    return snapshot;
  };
}
