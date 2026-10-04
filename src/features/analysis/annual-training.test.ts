import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";
import { at, service, youthFacts, youthInput, youthProfile } from "@/engine/youth-test-fixtures";
import type { ShiftEntry } from "@/domain/types";
import {
  buildAnnualAvailableReportSteps,
  createAnnualAvailableReportCache,
} from "./annual-core-report";
import { trainingCompliance, type TrainingComplianceData } from "./training-compliance";
import { classifyChecks, selectAnnualCheckDisplay } from "./check-visibility";

const { effectiveFrom: _date, ...context } = youthFacts;
const data: TrainingComplianceData = {
  status: "ready",
  error: null,
  shifts: [],
  profiles: [{ ...youthProfile, data: { ...youthProfile.data, version: 2, youth: context } }],
};
const base = youthInput();
function scenario() {
  const cache = createAnnualAvailableReportCache();
  return (training: TrainingComplianceData, shifts: readonly ShiftEntry[] = []) => {
    const steps = buildAnnualAvailableReportSteps(
      2026,
      shifts,
      base.profile,
      [],
      { workplaceCoverage: "UNKNOWN", assignment: "UNKNOWN", updatedAt: null },
      "2026-12-31",
      base.ruleResolver,
      { cache, training: { data: training, shifts } },
    );
    for (;;) {
      const step = steps.next();
      if (step.done) return step.value;
    }
  };
}

describe("annual training compliance", () => {
  it("carries the same school-day credit into the year without adding it to actual hours", () => {
    const school = service("2026-09-15", "08:00", "12:00", [], true);
    const schoolDetails = {
      ...school.details,
      data: {
        ...school.details.data,
        school: {
          lessons: [{ start: at("2026-09-15", "08:00"), end: at("2026-09-15", "12:00") }],
          travelToWorkMinutes: 0,
          travelFromWorkMinutes: 0,
          block: null,
        },
      },
    };
    const training = { ...data, shifts: [schoolDetails] };
    const annual = scenario()(training, [school.entry]);
    const monthly = trainingCompliance({
      ...base,
      adult: null,
      training,
      shifts: [school.entry],
    })!;
    const withoutTraining = scenario()({ ...data, profiles: [], shifts: [] }, [school.entry]);
    expect(annual.months[8].trainingTimeDays).toEqual(monthly.trainingTimeDays);
    expect(annual.months[8].trainingTimeDays).toEqual([
      { date: "2026-09-15", basis: "JARBSCHG", minutes: 240 },
    ]);
    expect(annual.actualMinutes).toBe(withoutTraining.actualMinutes);
    expect(annual.estimatedGrossAmount).toBe(withoutTraining.estimatedGrossAmount);
  });
  it("rechecks annual age dependencies after restoring a birthday with unchanged revisions", () => {
    const services = Array.from({ length: 365 }, (_, index) =>
      Temporal.PlainDate.from("2026-01-01").add({ days: index }),
    )
      .filter((date) => date.dayOfWeek === 7)
      .map((date) => service(date.toString()));
    const run = scenario();
    const training = (birthDate: string): TrainingComplianceData => ({
      ...data,
      shifts: services.map((s) => s.details),
      profiles: [{ ...data.profiles[0], data: { ...data.profiles[0].data, birthDate } }],
    });
    const shifts = services.map((s) => s.entry);
    const adult = run(training("1990-01-01"), shifts);
    const mixed = run(training("2008-09-15"), shifts);
    expect(adult.months[11].checkCounts!.legal.criticalCount).toBeGreaterThan(
      mixed.months[11].checkCounts!.legal.criticalCount,
    );
    expect(mixed.months[11].checkCounts!.legal.infoCount).toBeGreaterThan(
      adult.months[11].checkCounts!.legal.infoCount,
    );
    expect(mixed.complianceCoverageComplete).toBe(false);
    expect(run(training("1990-01-01"), shifts).months[11]).toEqual(adult.months[11]);
  });
  it("preserves adult service violations in a mixed-age month, including with planning hidden", () => {
    const s = service("2026-09-16", "07:00", "20:00");
    const training = {
      ...data,
      shifts: [s.details],
      profiles: [
        { ...data.profiles[0], data: { ...data.profiles[0].data, birthDate: "2008-09-15" } },
      ],
    };
    const annual = scenario()(training, [s.entry]);
    expect(annual.months[8].checkCounts!.legal.criticalCount).toBeGreaterThan(0);
    expect(selectAnnualCheckDisplay(annual, false).months[8].criticalCount).toBeGreaterThan(0);
    expect(annual.complianceCoverageComplete).toBe(false);
  });
  it("uses the same legal findings as the month and does not hide them with planning", () => {
    const s = service("2026-09-15", "08:00", "17:30");
    const training = { ...data, shifts: [s.details] };
    const annual = scenario()(training, [s.entry]);
    const monthly = trainingCompliance({ ...base, adult: null, training, shifts: [s.entry] })!;
    const expected = classifyChecks(monthly.issues).legal;
    expect(expected.warningCount).toBeGreaterThan(0);
    expect(annual.months[8].checkCounts?.legal).toEqual(expected);
    expect(selectAnnualCheckDisplay(annual, false).months[8].warningCount).toBe(
      expected.warningCount,
    );
    expect(annual.warningCount).toBe(annual.months.reduce((n, m) => n + m.warningCount, 0));
  });
  it("recomputes same-revision restored pauses even when raw adult results are cached", () => {
    const s = service("2026-09-15", "08:00", "17:30");
    const run = scenario();
    const before = run({ ...data, shifts: [s.details] }, [s.entry]);
    const after = run(
      { ...data, shifts: [{ ...s.details, data: { ...s.details.data, pauses: null } }] },
      [s.entry],
    );
    expect(after.months[8].checkCounts?.legal.infoCount).toBeGreaterThan(
      before.months[8].checkCounts!.legal.infoCount,
    );
    expect(after.complianceCoverageComplete).toBe(false);
    expect(run({ ...data, shifts: [s.details] }, [s.entry]).months[8]).toEqual(before.months[8]);
  });
  it("keeps salary/worktime results while failed or loading training data prevents clear coverage", () => {
    const run = scenario();
    const empty = { ...data, profiles: [] };
    const ready = run(empty);
    const failed = run({ ...empty, status: "error", error: "Lesefehler" });
    const loading = run({ ...empty, status: "loading" });
    expect(failed.complianceCoverageComplete).toBe(false);
    expect(loading.complianceCoverageComplete).toBe(false);
    expect(failed.months.every((m) => m.checkCounts?.legal.infoCount === 1)).toBe(true);
    expect(failed.actualMinutes).toBe(ready.actualMinutes);
    expect(failed.estimatedGrossAmount).toBe(ready.estimatedGrossAmount);
  });
  it("marks mixed-age periods incomplete instead of claiming a fully checked year", () => {
    const training = {
      ...data,
      profiles: [
        {
          ...data.profiles[0],
          data: {
            ...data.profiles[0].data,
            birthDate: "2008-09-15",
          },
        },
      ],
    };
    const annual = scenario()(training);
    expect(annual.complianceCoverageComplete).toBe(false);
    expect(annual.months[8].checkCounts!.legal.infoCount).toBeGreaterThan(0);
  });
});
