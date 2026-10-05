import { UserFacingError } from "./errors";

export const TVUK_NURSING_GROUPS = [
  "PUK5",
  "PUK6",
  "PUK7",
  "PUK8",
  "PUK9",
  "PUK9L",
  "PUK10",
  "PUK11",
  "PUK12",
  "PUK13",
  "PUK14",
  "PUK15",
] as const;
export type TvUkNursingGroup = (typeof TVUK_NURSING_GROUPS)[number];
export type TvUkPayLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export interface TvUkNursingTariff {
  readonly payGroup: TvUkNursingGroup;
  readonly payLevel: TvUkPayLevel;
}
export function tvUkLevelsForGroup(group: TvUkNursingGroup): readonly TvUkPayLevel[] {
  switch (group) {
    case "PUK5":
    case "PUK6":
      return [1, 2, 3, 4, 5, 6];
    case "PUK7":
    case "PUK8":
      return [2, 3, 4, 5, 6, 7];
    case "PUK9":
      return [3, 4, 5, 6, 7];
    case "PUK10":
      return [3, 4, 5, 6];
    default:
      return [2, 3, 4, 5, 6];
  }
}
export function requireTvUkNursingTariff(value: unknown): TvUkNursingTariff | null {
  if (value == null) return null;
  const data = value as Record<string, unknown>;
  if (
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(data).sort().join(",") !== "payGroup,payLevel" ||
    !TVUK_NURSING_GROUPS.includes(data.payGroup as TvUkNursingGroup) ||
    !tvUkLevelsForGroup(data.payGroup as TvUkNursingGroup).includes(data.payLevel as TvUkPayLevel)
  )
    throw new UserFacingError("Bitte eine gültige TV-UK-Pflegegruppe und Stufe wählen.");
  return { payGroup: data.payGroup as TvUkNursingGroup, payLevel: data.payLevel as TvUkPayLevel };
}
