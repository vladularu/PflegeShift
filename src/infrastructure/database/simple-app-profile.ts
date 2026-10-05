import { Temporal } from "@js-temporal/polyfill";
import type { SQLiteDatabase } from "expo-sqlite";
import { resolveRemunerationProfile } from "@/domain/remuneration-profile";
import {
  PAY_GROUPS,
  payLevelsForGroup,
  type PayGroup,
  type PayLevel,
  type UserProfile,
} from "@/domain/types";
import { listRemunerationProfiles } from "./remuneration-profile-repository";

/** Read-only compatibility for Build-32 edits. Work hours and all dated rows stay intact. */
export async function projectStoredSimpleProfile(
  db: SQLiteDatabase,
  profile: UserProfile | null,
  date?: string,
): Promise<UserProfile | null> {
  if (profile === null) return null;
  if (profile.nursingTrainingTariff || profile.vkaETariff) return profile;
  const selected = resolveRemunerationProfile(
    await listRemunerationProfiles(db),
    date ?? Temporal.Now.plainDateISO(profile.timeZone).toString(),
  ).profile;
  if (selected === null || Date.parse(selected.updatedAt) <= Date.parse(profile.updatedAt))
    return profile;
  const { selection } = selected.data;
  if (selection.kind === "own-monthly")
    return {
      ...profile,
      tariff: null,
      manualMonthlyGrossCents: selection.monthlyGrossCents,
      updatedAt: selected.updatedAt,
    };
  if (selection.kind !== "tariff" || selection.packageId !== "tvoed-vka-bt-k") return profile;
  if (
    (selection.variant !== "BT_K" && selection.variant !== "BT_B") ||
    (selection.region !== "OTHER" && selection.region !== "KAV_BW") ||
    !PAY_GROUPS.includes(selection.group as PayGroup)
  )
    return profile;
  const group = selection.group as PayGroup;
  const level = Number(selection.level);
  if (!payLevelsForGroup(group).includes(level as PayLevel)) return profile;
  return {
    ...profile,
    tariff: {
      payGroup: group,
      payLevel: level as PayLevel,
      sector: selection.variant,
      tariffRegion: selection.region,
      fullTimeWeeklyMinutes: selection.fullTimeWeeklyMinutes,
    },
    manualMonthlyGrossCents: null,
    updatedAt: selected.updatedAt,
  };
}
