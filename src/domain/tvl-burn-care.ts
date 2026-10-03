/** Actual working intervals, excluding breaks; elapsed minutes relative to shift start. */
export interface TvlBurnCareInterval {
  readonly from: number;
  readonly until: number;
}
export function validateTvlBurnCareIntervals(
  value: unknown,
): readonly TvlBurnCareInterval[] | null {
  if (value === null) return null;
  const fail = () => {
    throw new Error("Bitte die tatsächlichen Schwerbrandpflegezeiten prüfen.");
  };
  if (!Array.isArray(value) || value.length > 96) return fail();
  let end = 0;
  return Object.freeze(
    value.map((item) => {
      if (
        !item ||
        typeof item !== "object" ||
        Array.isArray(item) ||
        Object.keys(item).length !== 2 ||
        !Object.hasOwn(item, "from") ||
        !Object.hasOwn(item, "until") ||
        !Number.isSafeInteger(item.from) ||
        !Number.isSafeInteger(item.until) ||
        item.from < end ||
        item.until <= item.from ||
        item.until > 1500
      )
        return fail();
      end = item.until;
      return Object.freeze({ from: item.from as number, until: item.until as number });
    }),
  );
}
