import type { SQLiteDatabase } from "expo-sqlite";
import type { SaveProfileInput, UserProfile } from "@/domain/types";
import {
  NURSING_TRAINING_PREFERENCE_KEY,
  requireNursingTrainingTariff,
} from "@/domain/nursing-training";

export async function loadNursingTrainingForProfile(
  db: SQLiteDatabase,
  profile: UserProfile,
): Promise<UserProfile> {
  const stored = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_preferences WHERE key = ?",
    NURSING_TRAINING_PREFERENCE_KEY,
  );
  const nursingTrainingTariff = stored
    ? requireNursingTrainingTariff(JSON.parse(stored.value))
    : null;
  if (nursingTrainingTariff && (profile.tariff || profile.manualMonthlyGrossCents != null))
    throw new Error("Mehrere Gehaltsgrundlagen gespeichert.");
  return nursingTrainingTariff ? { ...profile, nursingTrainingTariff } : profile;
}

export function nursingTrainingProfileInput(
  raw: SaveProfileInput,
  current: UserProfile | null,
): SaveProfileInput {
  return {
    ...raw,
    nursingTrainingTariff:
      raw.nursingTrainingTariff === undefined
        ? raw.tariff != null || raw.manualMonthlyGrossCents != null
          ? null
          : (current?.nursingTrainingTariff ?? null)
        : raw.nursingTrainingTariff,
    manualMonthlyGrossCents:
      raw.manualMonthlyGrossCents === undefined
        ? raw.nursingTrainingTariff
          ? null
          : (current?.manualMonthlyGrossCents ?? null)
        : raw.manualMonthlyGrossCents,
  };
}

/** Called inside the profile writer's transaction on the unlocked connection. */
export async function storeNursingTrainingForProfile(
  db: SQLiteDatabase,
  input: SaveProfileInput,
  now: string,
): Promise<void> {
  if (input.nursingTrainingTariff) {
    await db.runAsync(
      "INSERT INTO app_preferences(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
      NURSING_TRAINING_PREFERENCE_KEY,
      JSON.stringify(input.nursingTrainingTariff),
      now,
    );
  } else {
    await db.runAsync("DELETE FROM app_preferences WHERE key = ?", NURSING_TRAINING_PREFERENCE_KEY);
  }
}
