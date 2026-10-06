import { withDataLoadFailureCode } from "@/domain/data-load-failure";
import { salaryBasisCount, unresolvedSalaryProfile } from "@/domain/salary-basis-conflict";
import { TVAL_PFLEGE_PREFERENCE_KEY, requireTvalPflegeTariff } from "@/domain/tval-pflege-tariff";
import { TVH_KR_PREFERENCE_KEY, requireTvhKrTariff } from "@/domain/tvh-kr-tariff";
import {
  TVUK_NURSING_PREFERENCE_KEY,
  requireTvUkNursingTariff,
} from "@/domain/tvuk-nursing-tariff";
import type { SQLiteDatabase } from "expo-sqlite";
import type { SaveProfileInput, UserProfile } from "@/domain/types";
import {
  NURSING_TRAINING_PREFERENCE_KEY,
  requireNursingTrainingTariff,
} from "@/domain/nursing-training";
import { TVL_KR_PREFERENCE_KEY, requireTvlKrSalaryTariff } from "@/domain/tvl-kr-tariff";
import { VKA_E_PREFERENCE_KEY, requireVkaETariff } from "@/domain/vka-e-tariff";

export async function loadSimpleSalaryForProfile(
  db: SQLiteDatabase,
  profile: UserProfile,
): Promise<UserProfile> {
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    "SELECT key,value FROM app_preferences WHERE key IN (?,?,?,?,?,?)",
    NURSING_TRAINING_PREFERENCE_KEY,
    VKA_E_PREFERENCE_KEY,
    TVL_KR_PREFERENCE_KEY,
    TVUK_NURSING_PREFERENCE_KEY,
    TVH_KR_PREFERENCE_KEY,
    TVAL_PFLEGE_PREFERENCE_KEY,
  );
  return withDataLoadFailureCode("PROFILE_SALARY_INVALID", () => {
    const training = rows.find((r) => r.key === NURSING_TRAINING_PREFERENCE_KEY);
    const e = rows.find((r) => r.key === VKA_E_PREFERENCE_KEY);
    const tvl = rows.find((r) => r.key === TVL_KR_PREFERENCE_KEY);
    const tval = rows.find((r) => r.key === TVAL_PFLEGE_PREFERENCE_KEY);
    const tvalPflegeTariff = tval ? requireTvalPflegeTariff(JSON.parse(tval.value)) : null;
    const h = rows.find((r) => r.key === TVH_KR_PREFERENCE_KEY);
    const tvhKrTariff = h ? requireTvhKrTariff(JSON.parse(h.value)) : null;
    const uk = rows.find((r) => r.key === TVUK_NURSING_PREFERENCE_KEY);
    const tvUkNursingTariff = uk ? requireTvUkNursingTariff(JSON.parse(uk.value)) : null;
    const nursingTrainingTariff = training
      ? requireNursingTrainingTariff(JSON.parse(training.value))
      : null;
    const vkaETariff = e ? requireVkaETariff(JSON.parse(e.value)) : null;
    const tvlKrTariff = tvl ? requireTvlKrSalaryTariff(JSON.parse(tvl.value)) : null;
    const loaded: UserProfile = {
      ...profile,
      ...(nursingTrainingTariff ? { nursingTrainingTariff } : {}),
      ...(vkaETariff ? { vkaETariff } : {}),
      ...(tvlKrTariff ? { tvlKrTariff } : {}),
      ...(tvUkNursingTariff ? { tvUkNursingTariff } : {}),
      ...(tvhKrTariff ? { tvhKrTariff } : {}),
      ...(tvalPflegeTariff ? { tvalPflegeTariff } : {}),
    };
    return salaryBasisCount(loaded) > 1 ? unresolvedSalaryProfile(loaded) : loaded;
  });
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
        ? other ||
          raw.tvalPflegeTariff != null ||
          raw.tvhKrTariff != null ||
          raw.tvUkNursingTariff != null ||
          raw.vkaETariff != null ||
          raw.tvlKrTariff != null
          ? null
          : (current?.nursingTrainingTariff ?? null)
        : raw.nursingTrainingTariff,
    vkaETariff:
      raw.vkaETariff === undefined
        ? other ||
          raw.tvalPflegeTariff != null ||
          raw.tvhKrTariff != null ||
          raw.tvUkNursingTariff != null ||
          raw.nursingTrainingTariff != null ||
          raw.tvlKrTariff != null
          ? null
          : (current?.vkaETariff ?? null)
        : raw.vkaETariff,
    tvlKrTariff:
      raw.tvlKrTariff === undefined
        ? other ||
          raw.tvalPflegeTariff != null ||
          raw.tvhKrTariff != null ||
          raw.tvUkNursingTariff != null ||
          raw.nursingTrainingTariff != null ||
          raw.vkaETariff != null
          ? null
          : (current?.tvlKrTariff ?? null)
        : raw.tvlKrTariff,
    tvUkNursingTariff:
      raw.tvUkNursingTariff === undefined
        ? other ||
          raw.tvalPflegeTariff != null ||
          raw.tvhKrTariff != null ||
          raw.nursingTrainingTariff != null ||
          raw.vkaETariff != null ||
          raw.tvlKrTariff != null
          ? null
          : (current?.tvUkNursingTariff ?? null)
        : raw.tvUkNursingTariff,
    tvhKrTariff:
      raw.tvhKrTariff === undefined
        ? other ||
          raw.tvalPflegeTariff != null ||
          raw.nursingTrainingTariff != null ||
          raw.vkaETariff != null ||
          raw.tvlKrTariff != null ||
          raw.tvUkNursingTariff != null
          ? null
          : (current?.tvhKrTariff ?? null)
        : raw.tvhKrTariff,
    tvalPflegeTariff:
      raw.tvalPflegeTariff === undefined
        ? other ||
          raw.nursingTrainingTariff != null ||
          raw.vkaETariff != null ||
          raw.tvlKrTariff != null ||
          raw.tvUkNursingTariff != null ||
          raw.tvhKrTariff != null
          ? null
          : (current?.tvalPflegeTariff ?? null)
        : raw.tvalPflegeTariff,
    manualMonthlyGrossCents:
      raw.manualMonthlyGrossCents === undefined
        ? raw.tvalPflegeTariff ||
          raw.tariff ||
          raw.nursingTrainingTariff ||
          raw.vkaETariff ||
          raw.tvlKrTariff ||
          raw.tvUkNursingTariff ||
          raw.tvhKrTariff
          ? null
          : (current?.manualMonthlyGrossCents ?? null)
        : raw.manualMonthlyGrossCents,
  };
}
/** All salary preferences participate in the profile writer's immediate transaction. */
export async function storeSimpleSalaryForProfile(
  db: SQLiteDatabase,
  input: SaveProfileInput,
  now: string,
): Promise<void> {
  for (const [key, value] of [
    [NURSING_TRAINING_PREFERENCE_KEY, input.nursingTrainingTariff],
    [VKA_E_PREFERENCE_KEY, input.vkaETariff],
    [TVL_KR_PREFERENCE_KEY, input.tvlKrTariff],
    [TVUK_NURSING_PREFERENCE_KEY, input.tvUkNursingTariff],
    [TVH_KR_PREFERENCE_KEY, input.tvhKrTariff],
    [TVAL_PFLEGE_PREFERENCE_KEY, input.tvalPflegeTariff],
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
