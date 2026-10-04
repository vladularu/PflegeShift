import { describe, expect, it } from "vitest";
import type { OwnRemunerationConfiguration } from "@/domain/own-remuneration";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type { SavedOvertimeAllocation } from "@/domain/overtime-allocation";
import {
  calculateDatedShiftOvertime,
  calculateMonthlyDatedOvertime,
} from "./remuneration-overtime";
import { calculateDatedMonthlyRemuneration } from "./remuneration-month";
import { history, resolver, shift, work } from "./remuneration-test-fixtures";

const config: OwnRemunerationConfiguration = {
  base: { kind: "monthly", personalCents: 200000, partialMonth: "calendar-days" },
  percentageBasisHourlyCents: 2000,
  timePremiums: null,
  fixedAllowances: [],
  specialPayments: [],
  overtime: { basePayIncluded: false, premium: { kind: "percent", basisPoints: 2500 } },
};
function own(configuration = config, date = "2026-01-01"): DatedRemunerationProfile {
  return {
    ...history(date),
    data: { version: 2, weeklyMinutes: 1155, selection: { kind: "own-configured", configuration } },
  };
}
const entry = shift({
  overtimeMinutes: 60,
  tariffOvertimeConfirmed: true,
  startTime: "08:00",
  endTime: "10:00",
});
const run = (configuration = config) =>
  calculateDatedShiftOvertime(entry, work, [own(configuration)], resolver([]));

describe("own payable overtime", () => {
  it("adds personally confirmed base and percent premium without a second part-time factor", () => {
    const result = run();
    expect(result.totalCents).toBe(2500);
    expect(result.positions.map((p) => p.amountCents)).toEqual([2000, 500]);
    expect(result.positions.every((p) => p.source.packageId === null)).toBe(true);
    expect(result.positions[1].basis).toMatchObject({
      rateCents: 2000,
      percentageBasisPoints: 2500,
      minutes: 60,
    });
  });
  it("adds only the supplement when base pay is included", () => {
    expect(
      run({ ...config, overtime: { ...config.overtime!, basePayIncluded: true } }).totalCents,
    ).toBe(500);
  });
  it("handles fixed hourly premiums independently from an unknown monthly hourly basis", () => {
    const c = {
      ...config,
      percentageBasisHourlyCents: null,
      overtime: { basePayIncluded: true, premium: { kind: "hourly" as const, centsPerHour: 475 } },
    };
    expect(run(c).totalCents).toBe(475);
    const partial = run({ ...c, overtime: { ...c.overtime, basePayIncluded: false } });
    expect(partial.totalCents).toBeNull();
    expect(partial.knownSubtotalCents).toBe(475);
    expect(partial.positions[0].issue?.code).toBe("OVERTIME_RATE_MISSING");
  });
  it("distinguishes no premium, zero premium and missing positive percent basis", () => {
    expect(run({ ...config, overtime: { basePayIncluded: false, premium: null } }).totalCents).toBe(
      2000,
    );
    expect(
      run({
        ...config,
        percentageBasisHourlyCents: null,
        overtime: { basePayIncluded: true, premium: { kind: "percent", basisPoints: 0 } },
      }).totalCents,
    ).toBe(0);
    expect(
      run({
        ...config,
        percentageBasisHourlyCents: null,
        overtime: { basePayIncluded: true, premium: { kind: "percent", basisPoints: 2500 } },
      }).totalCents,
    ).toBeNull();
    expect(run({ ...config, overtime: null }).positions[0].issue?.code).toBe(
      "OWN_OVERTIME_UNCONFIGURED",
    );
  });
  it("never turns a balance or unconfirmed minutes into payout", () => {
    expect(
      calculateDatedShiftOvertime(
        { ...entry, tariffOvertimeConfirmed: false },
        work,
        [own()],
        resolver([]),
      ).positions,
    ).toEqual([]);
    expect(
      calculateDatedShiftOvertime({ ...entry, overtimeMinutes: 0 }, work, [own()], resolver([]))
        .positions,
    ).toEqual([]);
  });
  it("does not double hourly base pay in the real monthly result", () => {
    const c: OwnRemunerationConfiguration = {
      ...config,
      base: { kind: "hourly", centsPerHour: 2000 },
      percentageBasisHourlyCents: null,
      overtime: { basePayIncluded: true, premium: { kind: "percent", basisPoints: 2500 } },
    };
    const input = {
      month: "2026-09",
      shifts: [entry],
      workProfile: work,
      history: [own(c)],
      allowanceEntitlements: [],
      resolver: resolver([]),
    };
    const result = calculateDatedMonthlyRemuneration(input);
    expect(result.base.totalCents).toBe(4000);
    expect(result.overtime.totalCents).toBe(500);
    expect(result.estimatedGrossCents).toBe(4500);
    const contradictory = calculateDatedMonthlyRemuneration({
      ...input,
      history: [own({ ...c, overtime: { ...c.overtime!, basePayIncluded: false } })],
    });
    expect(contradictory.base.totalCents).toBe(4000);
    expect(contradictory.estimatedGrossCents).toBeNull();
    expect(contradictory.overtime.positions[0].issue?.message).toContain("nicht nochmals");
  });
  it("rounds once across midnight when the same own agreement applies", () => {
    const service = { ...entry, startTime: "23:59", endTime: "00:01", overtimeMinutes: 2 };
    const c = { ...config, percentageBasisHourlyCents: 101 };
    const profiles = [own(c)];
    const result = calculateDatedShiftOvertime(service, work, profiles, resolver([]), [
      { date: "2026-09-15", minutes: 1 },
      { date: "2026-09-16", minutes: 1 },
    ]);
    expect(result.positions.map((p) => p.amountCents)).toEqual([3, 1]);
    expect(result.totalCents).toBe(
      calculateDatedShiftOvertime(service, work, profiles, resolver([])).totalCents,
    );
  });
  it("requires an allocation at a dated rate change and uses each explicit portion", () => {
    const service = { ...entry, startTime: "23:00", endTime: "01:00" };
    const profiles = [own(), own({ ...config, percentageBasisHourlyCents: 3000 }, "2026-09-16")];
    expect(
      calculateDatedShiftOvertime(service, work, profiles, resolver([])).positions[0].issue?.code,
    ).toBe("OVERTIME_ALLOCATION_REQUIRED");
    const result = calculateDatedShiftOvertime(service, work, profiles, resolver([]), [
      { date: "2026-09-15", minutes: 15 },
      { date: "2026-09-16", minutes: 45 },
    ]);
    expect(result.positions.map((p) => p.amountCents)).toEqual([500, 125, 2250, 563]);
    expect(result.totalCents).toBe(3438);
  });
  it("pays each cross-month portion only in its assigned month", () => {
    const service = { ...entry, date: "2026-09-30", startTime: "23:00", endTime: "01:00" };
    const allocations = new Map([
      [
        service.id,
        [
          { date: "2026-09-30", minutes: 20 },
          { date: "2026-10-01", minutes: 40 },
        ],
      ],
    ]);
    expect(
      calculateMonthlyDatedOvertime("2026-09", [service], work, [own()], resolver([]), allocations)
        .totalCents,
    ).toBe(834);
    expect(
      calculateMonthlyDatedOvertime("2026-10", [service], work, [own()], resolver([]), allocations)
        .totalCents,
    ).toBe(1666);
  });
  it("uses actual elapsed DST time and refuses minutes beyond actual net time", () => {
    const service = {
      ...entry,
      date: "2026-10-25",
      startTime: "01:00",
      endTime: "04:00",
      overtimeMinutes: 240,
    };
    expect(calculateDatedShiftOvertime(service, work, [own()], resolver([])).totalCents).toBe(
      10000,
    );
    expect(
      calculateDatedShiftOvertime({ ...service, overtimeMinutes: 241 }, work, [own()], resolver([]))
        .totalCents,
    ).toBeNull();
  });
  it("retains saved allocation revision checks for own pay", () => {
    const saved: SavedOvertimeAllocation = {
      shiftId: entry.id,
      shiftRevision: 1,
      timeZone: work.timeZone,
      allocations: [{ date: entry.date, minutes: 60 }],
      revision: 1,
      confirmedAt: work.updatedAt,
      updatedAt: work.updatedAt,
    };
    expect(
      calculateMonthlyDatedOvertime("2026-09", [entry], work, [own()], resolver([]), undefined, [
        saved,
      ]).totalCents,
    ).toBe(2500);
    for (const record of [
      { ...saved, shiftRevision: 2 },
      { ...saved, allocations: null },
      { ...saved, timeZone: "Europe/London" },
    ]) {
      expect(
        calculateMonthlyDatedOvertime("2026-09", [entry], work, [own()], resolver([]), undefined, [
          record,
        ]).totalCents,
      ).toBeNull();
    }
  });
});
