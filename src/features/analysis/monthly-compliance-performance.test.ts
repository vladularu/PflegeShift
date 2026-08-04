import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";

import type { CalendarEntry, ShiftEntry } from "@/domain/types";
import { calculateMonthlyCompliance, calculateMonthlyComplianceSteps } from "@/engine/compliance";
import { generateTestPlan } from "@/engine/test-data-generator";
import { selectAnalysisEntryWindow } from "@/features/analysis/analysis-data";

function persistedShift(
  input: ReturnType<typeof generateTestPlan>["shifts"][number],
  index: number,
): ShiftEntry {
  return {
    ...input,
    kind: "SHIFT",
    id: `stress-${index}`,
    templateId: input.templateId ?? null,
    note: input.note ?? null,
    startTime: input.startTime ?? null,
    endTime: input.endTime ?? null,
    breakMinutes: input.breakMinutes ?? 0,
    overtimeMinutes: input.overtimeMinutes ?? 0,
    holidayPremiumMode: input.holidayPremiumMode ?? "WITH_TIME_OFF",
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  };
}

describe("monthly compliance performance", () => {
  it("keeps progressive stress-data chunks bounded and result-identical", () => {
    const plan = generateTestPlan(
      { startMonth: "2026-01", range: 12, scenario: "UI_STRESS" },
      "NW",
    );
    const entries: readonly CalendarEntry[] = plan.shifts.map(persistedShift);
    const shifts = selectAnalysisEntryWindow(entries, "2026-07").complianceShifts;
    const steps = calculateMonthlyComplianceSteps("2026-07", shifts, "Europe/Berlin", {
      federalState: "NW",
      weeklyMinutes: 2_400,
      referenceDate: "2026-08-04",
    });
    const chunkDurations: number[] = [];
    let progressiveResult;
    while (true) {
      const startedAt = performance.now();
      const step = steps.next();
      chunkDurations.push(performance.now() - startedAt);
      if (step.done) {
        progressiveResult = step.value;
        break;
      }
    }

    expect(shifts.length).toBeGreaterThan(150);
    expect(Math.max(...chunkDurations)).toBeLessThan(250);
    expect(progressiveResult).toEqual(
      calculateMonthlyCompliance("2026-07", shifts, "Europe/Berlin", {
        federalState: "NW",
        weeklyMinutes: 2_400,
        referenceDate: "2026-08-04",
      }),
    );
  });
});
