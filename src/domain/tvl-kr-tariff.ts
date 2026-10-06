import { UserFacingError } from "./errors";
import type { PayLevel } from "./types";

export const TVL_KR_PREFERENCE_KEY = "salary_tvl_kr";

export const TVL_KR_GROUPS = [
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
  "KR17",
] as const;
export type TvlKrGroup = (typeof TVL_KR_GROUPS)[number];
export interface TvlKrTariff {
  readonly payGroup: TvlKrGroup;
  readonly payLevel: PayLevel;
}
export type TvlKrUniversityRegion = "WEST" | "EAST";

export function tvlKrLevelsForGroup(group: TvlKrGroup): readonly PayLevel[] {
  return group === "KR5" || group === "KR6" ? [1, 2, 3, 4, 5, 6] : [2, 3, 4, 5, 6];
}

export function requireTvlKrTariff(value: unknown): TvlKrTariff | null {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value))
    throw new UserFacingError("Bitte eine gültige TV-L-Pflegegruppe und Stufe wählen.");
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).sort().join(",") !== "payGroup,payLevel" ||
    !TVL_KR_GROUPS.includes(data.payGroup as TvlKrGroup) ||
    !tvlKrLevelsForGroup(data.payGroup as TvlKrGroup).includes(data.payLevel as PayLevel)
  )
    throw new UserFacingError("Bitte eine gültige TV-L-Pflegegruppe und Stufe wählen.");
  return { payGroup: data.payGroup as TvlKrGroup, payLevel: data.payLevel as PayLevel };
}

export interface TvlKrSalaryTariff extends TvlKrTariff {
  readonly universityRegion: TvlKrUniversityRegion;
}

export function requireTvlKrSalaryTariff(value: unknown): TvlKrSalaryTariff | null {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value))
    throw new UserFacingError(
      "Bitte eine gültige TV-L-Pflegegruppe, Stufe und ein Tarifgebiet wählen.",
    );
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).sort().join(",") !== "payGroup,payLevel,universityRegion" ||
    (row.universityRegion !== "WEST" && row.universityRegion !== "EAST")
  )
    throw new UserFacingError("Bitte das TV-L-Tarifgebiet West oder Ost wählen.");
  const selection = requireTvlKrTariff({ payGroup: row.payGroup, payLevel: row.payLevel })!;
  return { ...selection, universityRegion: row.universityRegion };
}
