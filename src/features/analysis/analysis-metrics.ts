import {
  SHIFT_TYPES,
  type CalendarEntry,
  type ShiftEntry,
  type ShiftType,
  type UserProfile,
} from "@/domain/types";
import { calculateDailyWorkCredit, calculateTimedDailyWorkCredit } from "@/engine/daily-summary";
import { bundledRuleResolver, type RuleResolver } from "@/rules/rule-resolver";

type ProfileForTime = Pick<UserProfile, "federalState" | "weeklyMinutes" | "timeZone"> &
  Partial<Pick<UserProfile, "holidayRegion">>;

export interface ShiftTypeAnalysisItem {
  readonly type: ShiftType;
  readonly count: number;
  readonly minutes: number;
}

export interface ShiftAppearance {
  readonly title: string;
  readonly color: string;
  readonly symbol: string;
}

export interface MonthlyShiftTypeAnalysis {
  readonly appearances?: Readonly<Partial<Record<ShiftType, readonly ShiftAppearance[]>>>;
  readonly items: readonly ShiftTypeAnalysisItem[];
  readonly totalCount: number;
  readonly totalMinutes: number;
}

export function buildMonthlyShiftTypeAnalysis(
  month: string,
  entries: readonly CalendarEntry[],
  profile: ProfileForTime,
  ruleResolver: RuleResolver = bundledRuleResolver,
): MonthlyShiftTypeAnalysis {
  return buildMonthlyShiftTypeAnalysisWithCredit(month, entries, (date, shifts) =>
    calculateDailyWorkCredit(date, shifts, profile, ruleResolver),
  );
}

export function buildMonthlyTimedShiftTypeAnalysis(
  month: string,
  entries: readonly CalendarEntry[],
  profile: Pick<ProfileForTime, "timeZone">,
): MonthlyShiftTypeAnalysis {
  return buildMonthlyShiftTypeAnalysisWithCredit(month, entries, (date, shifts) =>
    calculateTimedDailyWorkCredit(date, shifts, profile),
  );
}

function buildMonthlyShiftTypeAnalysisWithCredit(
  month: string,
  entries: readonly CalendarEntry[],
  calculateCredit: (
    date: string,
    shifts: readonly ShiftEntry[],
  ) => { readonly minutesByType: Readonly<Partial<Record<ShiftType, number>>> },
): MonthlyShiftTypeAnalysis {
  const counts: Partial<Record<ShiftType, number>> = {};
  const minutes: Partial<Record<ShiftType, number>> = {};
  const appearances: Partial<Record<ShiftType, ShiftAppearance[]>> = {};
  const shiftsByDate = new Map<string, ShiftEntry[]>();

  for (const entry of entries) {
    if (entry.kind !== "SHIFT" || entry.deletedAt !== null || !entry.date.startsWith(`${month}-`)) {
      continue;
    }
    const styles = appearances[entry.type] ?? [];
    if (
      !styles.some(
        (style) =>
          style.title === entry.title &&
          style.color === entry.color &&
          style.symbol === entry.symbol,
      )
    ) {
      styles.push(Object.freeze({ title: entry.title, color: entry.color, symbol: entry.symbol }));
      appearances[entry.type] = styles;
    }
    counts[entry.type] = (counts[entry.type] ?? 0) + 1;
    const dateShifts = shiftsByDate.get(entry.date) ?? [];
    dateShifts.push(entry);
    shiftsByDate.set(entry.date, dateShifts);
  }

  for (const [date, dateShifts] of shiftsByDate) {
    const daily = calculateCredit(date, dateShifts);
    for (const type of SHIFT_TYPES) {
      const creditedMinutes = daily.minutesByType[type] ?? 0;
      if (creditedMinutes > 0) minutes[type] = (minutes[type] ?? 0) + creditedMinutes;
    }
  }

  const items = Object.freeze(
    SHIFT_TYPES.filter((type) => (counts[type] ?? 0) > 0 || (minutes[type] ?? 0) > 0).map((type) =>
      Object.freeze({
        type,
        count: counts[type] ?? 0,
        minutes: minutes[type] ?? 0,
      }),
    ),
  );

  return Object.freeze({
    items,
    ...(items.length
      ? {
          appearances: Object.freeze(
            Object.fromEntries(
              Object.entries(appearances).map(([type, styles]) => [type, Object.freeze(styles)]),
            ),
          ),
        }
      : {}),
    totalCount: items.reduce((sum, item) => sum + item.count, 0),
    totalMinutes: items.reduce((sum, item) => sum + item.minutes, 0),
  });
}

export function combineShiftTypeAnalyses(
  parts: readonly MonthlyShiftTypeAnalysis[],
): MonthlyShiftTypeAnalysis {
  const items = SHIFT_TYPES.map((type) => ({
    type,
    count: parts.reduce(
      (sum, part) => sum + (part.items.find((item) => item.type === type)?.count ?? 0),
      0,
    ),
    minutes: parts.reduce(
      (sum, part) => sum + (part.items.find((item) => item.type === type)?.minutes ?? 0),
      0,
    ),
  })).filter((item) => item.count > 0 || item.minutes > 0);
  const appearances: Partial<Record<ShiftType, readonly ShiftAppearance[]>> = {};
  for (const type of SHIFT_TYPES) {
    const styles = parts.flatMap((part) => part.appearances?.[type] ?? []);
    const unique = styles.filter(
      (style, index) =>
        styles.findIndex(
          (other) =>
            other.title === style.title &&
            other.color === style.color &&
            other.symbol === style.symbol,
        ) === index,
    );
    if (unique.length) appearances[type] = Object.freeze(unique);
  }
  return Object.freeze({
    ...(Object.keys(appearances).length ? { appearances: Object.freeze(appearances) } : {}),
    items: Object.freeze(items.map((item) => Object.freeze(item))),
    totalCount: items.reduce((sum, item) => sum + item.count, 0),
    totalMinutes: items.reduce((sum, item) => sum + item.minutes, 0),
  });
}
