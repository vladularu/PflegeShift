export const ANALYSIS_VIEW_KEY = "analysis_view_v1";
export const ANALYSIS_CARDS = ["WORK", "CHECK", "PAY", "SHIFTS"] as const;
export type AnalysisCardId = (typeof ANALYSIS_CARDS)[number];
export type ShiftMetric = "COUNT" | "HOURS";
export interface AnalysisViewPreferences {
  readonly version: 1;
  readonly order: readonly AnalysisCardId[];
  readonly hidden: readonly AnalysisCardId[];
  readonly shiftMetric: ShiftMetric;
}
export const DEFAULT_ANALYSIS_VIEW: AnalysisViewPreferences = Object.freeze({
  version: 1,
  order: ANALYSIS_CARDS,
  hidden: Object.freeze([]),
  shiftMetric: "HOURS",
});
export const ANALYSIS_CARD_TITLES: Record<AnalysisCardId, string> = {
  WORK: "Arbeitszeit",
  CHECK: "Prüfung",
  PAY: "Gehalt",
  SHIFTS: "Schichten",
};
export function parseAnalysisView(value: string): AnalysisViewPreferences {
  const data: unknown = JSON.parse(value);
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("Ungültige Ansicht.");
  const v = data as Record<string, unknown>;
  const validIds = (ids: unknown): ids is AnalysisCardId[] =>
    Array.isArray(ids) &&
    ids.every((id) => ANALYSIS_CARDS.includes(id)) &&
    new Set(ids).size === ids.length;
  if (
    Object.keys(v).sort().join(",") !== "hidden,order,shiftMetric,version" ||
    v.version !== 1 ||
    !validIds(v.order) ||
    v.order.length !== ANALYSIS_CARDS.length ||
    !validIds(v.hidden) ||
    (v.shiftMetric !== "COUNT" && v.shiftMetric !== "HOURS")
  ) {
    throw new Error("Ungültige Ansicht.");
  }
  return Object.freeze({
    version: 1,
    order: Object.freeze([...v.order]),
    hidden: Object.freeze([...v.hidden]),
    shiftMetric: v.shiftMetric,
  });
}
export function moveAnalysisCard(
  preferences: AnalysisViewPreferences,
  id: AnalysisCardId,
  delta: -1 | 1,
): AnalysisViewPreferences {
  const order = [...preferences.order];
  const index = order.indexOf(id);
  const next = index + delta;
  if (index < 0 || next < 0 || next >= order.length) return preferences;
  [order[index], order[next]] = [order[next], order[index]];
  return { ...preferences, order };
}
