import { UserFacingError } from "./errors";

/** Dated personal facts, not a tariff amount or an inferred professional qualification. */
export interface TvalCareAllowances {
  readonly paidEntitlement: boolean | null;
  readonly clinical: "NONE" | "LOWER" | "HIGHER" | null;
  readonly burnCare: boolean | null;
}

export const UNKNOWN_TVAL_CARE: TvalCareAllowances = Object.freeze({
  paidEntitlement: null,
  clinical: null,
  burnCare: null,
});

export function validateTvalCareAllowances(value: unknown): TvalCareAllowances | null {
  if (value === null) return null;
  const fail = () => {
    throw new UserFacingError("Bitte die TVA-L-Tätigkeitszulagen prüfen.");
  };
  if (typeof value !== "object" || Array.isArray(value)) return fail();
  const raw = value as Record<string, unknown>;
  const keys = Object.keys(UNKNOWN_TVAL_CARE);
  if (Object.keys(raw).length !== keys.length || keys.some((key) => !Object.hasOwn(raw, key)))
    return fail();
  if (![null, "NONE", "LOWER", "HIGHER"].includes(raw.clinical as string | null)) return fail();
  for (const key of ["paidEntitlement", "burnCare"])
    if (raw[key] !== null && typeof raw[key] !== "boolean") return fail();
  return Object.freeze({ ...raw }) as unknown as TvalCareAllowances;
}
