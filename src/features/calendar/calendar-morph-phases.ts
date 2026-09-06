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
    };
  }
  // Finish all geometry BEFORE the real month becomes visible. During the
  // handoff, both copies of each date occupy the exact same measured rectangle.
  const handoff = Math.max(0, (p - 0.75) / 0.25);
  const blend = handoff * handoff * (3 - 2 * handoff);
  const departure = Math.min(1, p / 0.65);
  return {
    travel: Math.min(1, p / 0.75),
    monthOpacity: blend,
    glyphOpacity: 1 - blend,
    yearOpacity: 1 - departure * departure * (3 - 2 * departure),
  };
}
