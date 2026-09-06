import { describe, expect, it } from "vitest";
import { calendarMorphPhases } from "./calendar-morph-phases";

describe("calendar morph handoff", () => {
  it("never shows the real month while date geometry is still moving", () => {
    for (let frame = 0; frame <= 120; frame += 1) {
      const phase = calendarMorphPhases(frame / 120, true);
      if (phase.travel < 1) expect(phase.monthOpacity).toBe(0);
      if (phase.monthOpacity > 0) {
        expect(phase.travel).toBe(1);
        expect(phase.yearOpacity).toBe(0);
      }
      expect(phase.glyphOpacity + phase.monthOpacity).toBeCloseTo(1);
    }
  });

  it("crossfades only stationary dates and ends without residual layers", () => {
    expect(calendarMorphPhases(0.75, true)).toEqual({
      travel: 1,
      monthOpacity: 0,
      glyphOpacity: 1,
      yearOpacity: 0,
    });
    expect(calendarMorphPhases(0.875, true)).toEqual({
      travel: 1,
      monthOpacity: 0.5,
      glyphOpacity: 0.5,
      yearOpacity: 0,
    });
    expect(calendarMorphPhases(1, true)).toEqual({
      travel: 1,
      monthOpacity: 1,
      glyphOpacity: 0,
      yearOpacity: 0,
    });
  });

  it("preserves the accepted month-to-year formulas at every sampled frame", () => {
    for (let frame = 120; frame >= 0; frame -= 1) {
      const p = frame / 120;
      expect(calendarMorphPhases(p, false)).toEqual({
        travel: p,
        monthOpacity: Math.max(0, (p - 0.65) / 0.35),
        glyphOpacity: Math.min(1, (1 - p) / 0.35),
        yearOpacity: 1,
      });
    }
  });
});
