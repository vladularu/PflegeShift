import { describe, expect, it } from "vitest";
import { roundRemunerationCents } from "./remuneration-money";

describe("exact positive remuneration rounding", () => {
  it.each([
    [0, 1, 0],
    [1, 2, 1],
    [49, 100, 0],
    [50, 100, 1],
    [51, 100, 1],
    [149, 100, 1],
    [150, 100, 2],
    [151, 100, 2],
    [900000, 3, 300000],
    [Number.MAX_SAFE_INTEGER, 1, Number.MAX_SAFE_INTEGER],
    [Number.MAX_SAFE_INTEGER, 2, 4503599627370496],
    [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 1],
  ])("rounds %s / %s to fixed cents %s", (numerator, denominator, expected) => {
    expect(roundRemunerationCents(numerator, denominator)).toBe(expected);
  });
  it.each([
    [-1, 1],
    [0.5, 1],
    [Infinity, 1],
    [NaN, 1],
    [Number.MAX_SAFE_INTEGER + 1, 1],
    [1, 0],
    [1, -1],
    [1, 0.5],
    [1, Infinity],
    [1, NaN],
    [1, Number.MAX_SAFE_INTEGER + 1],
  ])("rejects invalid arithmetic inputs %s / %s", (numerator, denominator) => {
    expect(() => roundRemunerationCents(numerator, denominator)).toThrow(
      "Ungültige Berechnungsgrundlage.",
    );
  });
});
