/** Progress is linear toward MONTH, and retains the existing eased clock toward YEAR. */
export function calendarMorphPhases(progress: number, toMonth: boolean) {
  "worklet";
  const p = Math.max(0, Math.min(1, progress));
  if (!toMonth) {
    return {
      travel: p,
      monthOpacity: Math.max(0, (p - 0.65) / 0.35),
      glyphOpacity: Math.min(1, (1 - p) / 0.35),
      yearOpacity: 1,
      realGlyphOpacity: 1,
    };
  }
  // Reveal entries during travel, but keep the real date glyphs hidden until
  // their moving counterparts have reached exactly the same rectangle.
  const handoff = Math.max(0, (p - 0.75) / 0.25);
  const blend = handoff * handoff * (3 - 2 * handoff);
  const departure = Math.min(1, p / 0.25);
  const content = Math.max(0, Math.min(1, (p - 0.25) / 0.4));
  return {
    travel: Math.min(1, p / 0.75),
    monthOpacity: content * content * (3 - 2 * content),
    // Source-over alpha is not additive: two 50% layers yield only 75%.
    // Keep the upper glyph opaque until its stationary replacement is opaque,
    // then fade the upper glyph. Never expose the canvas during the handoff.
    realGlyphOpacity: Math.min(1, blend * 2),
    glyphOpacity: Math.min(1, (1 - blend) * 2),
    yearOpacity: 1 - departure * departure * (3 - 2 * departure),
  };
}
