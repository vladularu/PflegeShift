import { UserFacingError } from "./errors";
export const TVAL_PFLEGE_PREFERENCE_KEY = "salary_tval_pflege";
export interface TvalPflegeTariff {
  readonly trainingYear: 1 | 2 | 3;
  readonly universityRegion: "WEST" | "EAST";
}
export function requireTvalPflegeTariff(value: unknown): TvalPflegeTariff | null {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value))
    throw new UserFacingError("Bitte einen g\u00fcltigen TVA-L-Pflegetarif w\u00e4hlen.");
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).sort().join(",") !== "trainingYear,universityRegion" ||
    ![1, 2, 3].includes(row.trainingYear as number) ||
    (row.universityRegion !== "WEST" && row.universityRegion !== "EAST")
  )
    throw new UserFacingError(
      "Bitte Ausbildungsjahr 1\u20133 und Tarifgebiet West oder Ost w\u00e4hlen.",
    );
  return { trainingYear: row.trainingYear as 1 | 2 | 3, universityRegion: row.universityRegion };
}
