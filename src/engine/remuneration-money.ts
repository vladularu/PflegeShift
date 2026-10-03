/** Exact positive HALF_UP division, avoiding floating-point half-cent errors. */
export function roundRemunerationCents(numerator: number, denominator: number): number {
  if (
    !Number.isSafeInteger(numerator) ||
    numerator < 0 ||
    !Number.isSafeInteger(denominator) ||
    denominator <= 0
  )
    throw new Error("Ungültige Berechnungsgrundlage.");
  return Number((2n * BigInt(numerator) + BigInt(denominator)) / (2n * BigInt(denominator)));
}
