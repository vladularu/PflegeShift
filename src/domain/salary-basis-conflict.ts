import type { SalaryBasisDrafts, UserProfile } from "./types";

export const EMPTY_SALARY_BASES = Object.freeze({
  tariff: null,
  manualMonthlyGrossCents: null,
  nursingTrainingTariff: null,
  vkaETariff: null,
  tvlKrTariff: null,
  tvUkNursingTariff: null,
  tvhKrTariff: null,
  tvalPflegeTariff: null,
});
const salaryBasisKeys = Object.keys(EMPTY_SALARY_BASES) as (keyof SalaryBasisDrafts)[];

export function salaryBasisCount(input: SalaryBasisDrafts): number {
  return salaryBasisKeys.filter((key) => input[key] != null).length;
}

/** Preserve stored choices as drafts, without selecting a winner or changing persisted data. */
export function unresolvedSalaryProfile(profile: UserProfile): UserProfile {
  const drafts =
    profile.salaryBasisConflict ??
    Object.freeze(
      Object.fromEntries(
        salaryBasisKeys.map((key) => [key, profile[key] ?? null]),
      ) as SalaryBasisDrafts,
    );
  return { ...profile, ...EMPTY_SALARY_BASES, salaryBasisConflict: drafts };
}
