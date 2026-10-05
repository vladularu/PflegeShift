import type { SQLiteDatabase } from "expo-sqlite";
import type { SaveProfileInput, UserProfile } from "@/domain/types";
import {
  NURSING_TRAINING_PREFERENCE_KEY,
  requireNursingTrainingTariff,
} from "@/domain/nursing-training";
import { VKA_E_PREFERENCE_KEY, requireVkaETariff } from "@/domain/vka-e-tariff";

export async function loadSimpleSalaryForProfile(
  db: SQLiteDatabase,
  profile: UserProfile,
): Promise<UserProfile> {
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    "SELECT key,value FROM app_preferences WHERE key IN (?,?)",
    NURSING_TRAINING_PREFERENCE_KEY,
    VKA_E_PREFERENCE_KEY,
  );
  const training = rows.find((r) => r.key === NURSING_TRAINING_PREFERENCE_KEY);
  const e = rows.find((r) => r.key === VKA_E_PREFERENCE_KEY);
  const nursingTrainingTariff = training
    ? requireNursingTrainingTariff(JSON.parse(training.value))
    : null;
  const vkaETariff = e ? requireVkaETariff(JSON.parse(e.value)) : null;
  if (
    [nursingTrainingTariff, vkaETariff, profile.tariff, profile.manualMonthlyGrossCents].filter(
      (v) => v != null,
    ).length > 1
  )
    throw new Error("Mehrere Gehaltsgrundlagen gespeichert.");
  return {
    ...profile,
    ...(nursingTrainingTariff ? { nursingTrainingTariff } : {}),
    ...(vkaETariff ? { vkaETariff } : {}),
  };
}
export function simpleSalaryProfileInput(
  raw: SaveProfileInput,
  current: UserProfile | null,
): SaveProfileInput {
  const other = raw.tariff != null || raw.manualMonthlyGrossCents != null;
  return {
    ...raw,
    nursingTrainingTariff:
      raw.nursingTrainingTariff === undefined
        ? other || raw.vkaETariff != null
          ? null
          : (current?.nursingTrainingTariff ?? null)
        : raw.nursingTrainingTariff,
    vkaETariff:
      raw.vkaETariff === undefined
        ? other || raw.nursingTrainingTariff != null
          ? null
          : (current?.vkaETariff ?? null)
        : raw.vkaETariff,
    manualMonthlyGrossCents:
      raw.manualMonthlyGrossCents === undefined
        ? raw.tariff || raw.nursingTrainingTariff || raw.vkaETariff
          ? null
          : (current?.manualMonthlyGrossCents ?? null)
        : raw.manualMonthlyGrossCents,
  };
}
/** Both preferences participate in the profile writer's immediate transaction. */
export async function storeSimpleSalaryForProfile(
  db: SQLiteDatabase,
  input: SaveProfileInput,
  now: string,
): Promise<void> {
  for (const [key, value] of [
    [NURSING_TRAINING_PREFERENCE_KEY, input.nursingTrainingTariff],
    [VKA_E_PREFERENCE_KEY, input.vkaETariff],
  ] as const) {
    if (value)
      await db.runAsync(
        "INSERT INTO app_preferences(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
        key,
        JSON.stringify(value),
        now,
      );
    else await db.runAsync("DELETE FROM app_preferences WHERE key = ?", key);
  }
}
