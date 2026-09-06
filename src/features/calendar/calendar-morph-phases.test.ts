import { describe, expect, it } from "vitest";
import { calendarMorphPhases } from "./calendar-morph-phases";

describe("calendar morph handoff", () => {
  it("reveals entries during travel but never shows displaced duplicate dates", () => {
    for (let frame = 0; frame <= 120; frame += 1) {
      const phase = calendarMorphPhases(frame / 120, true);
      if (phase.travel < 1) expect(phase.realGlyphOpacity).toBe(0);
      if (phase.monthOpacity > 0) {
        expect(phase.yearOpacity).toBe(0);
      }
      if (phase.realGlyphOpacity > 0) {
        expect(phase.travel).toBe(1);
        expect(phase.monthOpacity).toBe(1);
      }
      const effectiveAlpha = phase.glyphOpacity + (1 - phase.glyphOpacity) * phase.realGlyphOpacity;
      expect(effectiveAlpha).toBeCloseTo(1);
    }
    expect(calendarMorphPhases(0.5, true).monthOpacity).toBeGreaterThan(0);
    expect(calendarMorphPhases(0.5, true).travel).toBeLessThan(1);
  });

  it("crossfades only stationary dates and ends without residual layers", () => {
    expect(calendarMorphPhases(0.75, true)).toEqual({
      travel: 1,
      monthOpacity: 1,
      realGlyphOpacity: 0,
      glyphOpacity: 1,
      yearOpacity: 0,
    });
    expect(calendarMorphPhases(0.875, true)).toEqual({
      travel: 1,
      monthOpacity: 1,
      realGlyphOpacity: 1,
      glyphOpacity: 1,
      yearOpacity: 0,
    });
    expect(calendarMorphPhases(1, true)).toEqual({
      travel: 1,
      monthOpacity: 1,
      realGlyphOpacity: 1,
      glyphOpacity: 0,
      yearOpacity: 0,
    });
  });

  it("keeps an opaque backing layer throughout the stationary handoff", () => {
    for (let frame = 0; frame <= 600; frame += 1) {
      const p = frame / 600;
      const phase = calendarMorphPhases(p, true);
      if (phase.realGlyphOpacity < 1) expect(phase.glyphOpacity).toBe(1);
      if (phase.glyphOpacity < 1) expect(phase.realGlyphOpacity).toBe(1);
      expect(phase.realGlyphOpacity).toBeGreaterThanOrEqual(0);
      expect(phase.realGlyphOpacity).toBeLessThanOrEqual(1);
      expect(phase.glyphOpacity).toBeGreaterThanOrEqual(0);
      expect(phase.glyphOpacity).toBeLessThanOrEqual(1);
      // Travel, entry reveal and year departure stay identical to the prior OTA.
      const content = Math.max(0, Math.min(1, (p - 0.25) / 0.4));
      const departure = Math.min(1, p / 0.25);
      expect(phase.travel).toBe(Math.min(1, p / 0.75));
      expect(phase.monthOpacity).toBe(content * content * (3 - 2 * content));
      expect(phase.yearOpacity).toBe(1 - departure * departure * (3 - 2 * departure));
    }
  });

  it("preserves the accepted month-to-year formulas at every sampled frame", () => {
    for (let frame = 120; frame >= 0; frame -= 1) {
      const p = frame / 120;
      expect(calendarMorphPhases(p, false)).toEqual({
        travel: p,
        monthOpacity: Math.max(0, (p - 0.65) / 0.35),
        glyphOpacity: Math.min(1, (1 - p) / 0.35),
        yearOpacity: 1,
        realGlyphOpacity: 1,
      });
    }
  });
});
