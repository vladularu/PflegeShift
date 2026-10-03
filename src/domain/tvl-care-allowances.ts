import { UserFacingError } from "./errors";

export interface TvlCareAllowances {
  readonly paidEntitlement: boolean | null;
  readonly nursing: boolean | null;
  readonly instructor: boolean | null;
  readonly clinical:
    "NONE" | "DIRECT_LOWER" | "DIRECT_HIGHER" | "LEADER_LOWER" | "LEADER_HIGHER" | null;
  readonly leadershipAnnexFNumber: 2 | 3 | 4 | 5 | 6 | 7 | "NONE" | null;
  readonly burnCare: boolean | null;
  /** Missing in earlier unpublished v5 drafts; absence means unknown, never no claim. */
  readonly functionDuty?: "NONE" | "FUNCTION" | "LEADERSHIP" | null;
}
export const UNKNOWN_TVL_CARE: TvlCareAllowances = Object.freeze({
  paidEntitlement: null,
  nursing: null,
  instructor: null,
  clinical: null,
  leadershipAnnexFNumber: null,
  burnCare: null,
});

/** Personal confirmations, never tariff amounts; shared by form, persistence and backup. */
export function validateTvlCareAllowances(value: unknown): TvlCareAllowances | null {
  if (value === null) return null;
  const fail = () => {
    throw new UserFacingError("Bitte die TV-L-Zulagenangaben prüfen.");
  };
  if (typeof value !== "object" || Array.isArray(value)) return fail();
  const raw = value as Record<string, unknown>;
  const keys = Object.keys(UNKNOWN_TVL_CARE);
  if (Object.hasOwn(raw, "functionDuty")) {
    keys.push("functionDuty");
    if (![null, "NONE", "FUNCTION", "LEADERSHIP"].includes(raw.functionDuty as string | null))
      return fail();
  }
  if (Object.keys(raw).length !== keys.length || keys.some((key) => !Object.hasOwn(raw, key)))
    return fail();
  for (const key of ["paidEntitlement", "nursing", "instructor", "burnCare"])
    if (raw[key] !== null && typeof raw[key] !== "boolean") return fail();
  if (
    ![null, "NONE", "DIRECT_LOWER", "DIRECT_HIGHER", "LEADER_LOWER", "LEADER_HIGHER"].includes(
      raw.clinical as string | null,
    )
  )
    return fail();
  if (
    ![null, "NONE", 2, 3, 4, 5, 6, 7].includes(raw.leadershipAnnexFNumber as number | string | null)
  )
    return fail();
  return Object.freeze({ ...raw }) as unknown as TvlCareAllowances;
}
