import {
  calculateCaritasCareDraftBase as calculateDeliveredBase,
  type CaritasCareDraftBase,
} from "./caritas-care-draft-base";

export type { CaritasCareDraftBase };

/** Preserve the original personal path's one-hour input boundary and delivered source checks. */
export function calculateCaritasCareDraftBase(
  ...args: Parameters<typeof calculateDeliveredBase>
): CaritasCareDraftBase {
  const result = calculateDeliveredBase(...args);
  if (result.kind === "unavailable") return result;
  return args[6] < 60 ? { kind: "unavailable", reason: "INVALID_WEEKLY_TIME" } : result;
}
