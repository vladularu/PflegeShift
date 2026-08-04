import type { ShiftType } from "@/domain/types";

const ABSENCE_TYPES = new Set<ShiftType>(["VACATION", "SICK", "FREE"]);

export interface AnnualServiceDistributionItem {
  readonly type: ShiftType;
  readonly count: number;
  readonly percentage: number;
}

export interface AnnualAbsenceDistributionItem {
  readonly type: ShiftType;
  readonly count: number;
}

export interface AnnualDistributionSections {
  readonly services: readonly AnnualServiceDistributionItem[];
  readonly absences: readonly AnnualAbsenceDistributionItem[];
}

export function buildAnnualDistributionSections(
  distribution: ReadonlyMap<ShiftType, number>,
): AnnualDistributionSections {
  const populatedEntries = [...distribution.entries()]
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1]);
  const serviceEntries = populatedEntries.filter(([type]) => !ABSENCE_TYPES.has(type));
  const serviceTotal = serviceEntries.reduce((sum, [, count]) => sum + count, 0);

  return Object.freeze({
    services: Object.freeze(
      serviceEntries.map(([type, count]) =>
        Object.freeze({
          type,
          count,
          percentage: serviceTotal === 0 ? 0 : Math.round((count / serviceTotal) * 100),
        }),
      ),
    ),
    absences: Object.freeze(
      populatedEntries
        .filter(([type]) => ABSENCE_TYPES.has(type))
        .map(([type, count]) => Object.freeze({ type, count })),
    ),
  });
}
