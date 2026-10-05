import { UserFacingError } from "./errors";
import type { PayLevel, VkaETariff } from "./types";
export const VKA_E_PREFERENCE_KEY = "salary_vka_e";
export const VKA_E_GROUPS: readonly VkaETariff["payGroup"][] = [
  "E1",
  "E2",
  "E3",
  "E4",
  "E5",
  "E6",
  "E7",
  "E8",
  "E9a",
  "E9b",
  "E9c",
  "E10",
  "E11",
  "E12",
  "E13",
  "E14",
  "E15",
];
export function ePayLevels(group: VkaETariff["payGroup"]): readonly PayLevel[] {
  return group === "E1" ? [2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6];
}
export function requireVkaETariff(value: unknown): VkaETariff | null {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value))
    throw new UserFacingError("Bitte einen gültigen TVöD-E-Tarif wählen.");
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).sort().join(",") !== "payGroup,payLevel,sector,tariffRegion" ||
    !VKA_E_GROUPS.includes(data.payGroup as VkaETariff["payGroup"]) ||
    !ePayLevels(data.payGroup as VkaETariff["payGroup"]).includes(data.payLevel as PayLevel) ||
    !["BT_K", "BT_B"].includes(data.sector as string) ||
    !["OTHER", "KAV_BW"].includes(data.tariffRegion as string)
  )
    throw new UserFacingError(
      "Bitte eine gültige Entgeltgruppe und Stufe aus deinem Arbeitsvertrag wählen.",
    );
  return {
    payGroup: data.payGroup as VkaETariff["payGroup"],
    payLevel: data.payLevel as PayLevel,
    sector: data.sector as VkaETariff["sector"],
    tariffRegion: data.tariffRegion as VkaETariff["tariffRegion"],
  };
}
