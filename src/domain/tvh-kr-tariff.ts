import { UserFacingError } from "./errors";

export const TVH_KR_GROUPS = [
  "KR5",
  "KR6",
  "KR7",
  "KR8",
  "KR9",
  "KR10",
  "KR11",
  "KR12",
  "KR13",
  "KR14",
  "KR15",
  "KR16",
] as const;
export type TvhKrGroup = (typeof TVH_KR_GROUPS)[number];
export type TvhKrPayLevel = "1a" | "1b" | 2 | 3 | 4 | 5 | 6;
export interface TvhKrTariff {
  readonly payGroup: TvhKrGroup;
  readonly payLevel: TvhKrPayLevel;
  readonly fullTimeWeeklyMinutes: 2310 | 2400;
}
export function tvhKrLevelsForGroup(group: TvhKrGroup): readonly TvhKrPayLevel[] {
  return group === "KR5" || group === "KR6" ? ["1a", "1b", 2, 3, 4, 5, 6] : [2, 3, 4, 5, 6];
}
export function requireTvhKrTariff(value: unknown): TvhKrTariff | null {
  if (value == null) return null;
  const data = value as Record<string, unknown>;
  if (
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(data).sort().join(",") !== "fullTimeWeeklyMinutes,payGroup,payLevel" ||
    !TVH_KR_GROUPS.includes(data.payGroup as TvhKrGroup) ||
    !tvhKrLevelsForGroup(data.payGroup as TvhKrGroup).includes(data.payLevel as TvhKrPayLevel) ||
    (data.fullTimeWeeklyMinutes !== 2310 && data.fullTimeWeeklyMinutes !== 2400)
  )
    throw new UserFacingError(
      "Bitte eine gültige TV-H-Pflegegruppe, Stufe und tarifliche Vollzeit wählen.",
    );
  return {
    payGroup: data.payGroup as TvhKrGroup,
    payLevel: data.payLevel as TvhKrPayLevel,
    fullTimeWeeklyMinutes: data.fullTimeWeeklyMinutes,
  };
}

export const TVH_KR_PREFERENCE_KEY = "simpleSalary.tvhKr";
