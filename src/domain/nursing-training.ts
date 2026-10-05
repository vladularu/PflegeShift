import { UserFacingError } from "./errors";
import type { NursingTrainingTariff } from "./types";

export const NURSING_TRAINING_PREFERENCE_KEY = "salary_nursing_training";

export function requireNursingTrainingTariff(value: unknown): NursingTrainingTariff | null {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value))
    throw new UserFacingError("Bitte einen gültigen Pflege-Ausbildungstarif wählen.");
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).sort().join(",") !== "sector,tariffRegion,trainingYear" ||
    ![1, 2, 3].includes(data.trainingYear as number) ||
    !["BT_K", "BT_B"].includes(data.sector as string) ||
    !["OTHER", "KAV_BW"].includes(data.tariffRegion as string)
  )
    throw new UserFacingError("Bitte Ausbildungsjahr 1–3 und einen gültigen Tarifbereich wählen.");
  return {
    trainingYear: data.trainingYear as 1 | 2 | 3,
    sector: data.sector as NursingTrainingTariff["sector"],
    tariffRegion: data.tariffRegion as NursingTrainingTariff["tariffRegion"],
  };
}
