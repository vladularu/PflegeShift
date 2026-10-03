import { describe, expect, it } from "vitest";
import type { SavedOvertimeAllocation } from "@/domain/overtime-allocation";
import type { ShiftEntry } from "@/domain/types";
import {
  calculateDatedShiftOvertime,
  calculateMonthlyDatedOvertime,
} from "./remuneration-overtime";
import {
  calculateDatedMonthlyRemuneration,
  calculateAssessedMonthlyRemuneration,
} from "./remuneration-month";
import { history, resolver, shift, work } from "./remuneration-test-fixtures";

const entry = shift({ overtimeMinutes: 60, tariffOvertimeConfirmed: true });
function saved(
  changes: Partial<SavedOvertimeAllocation> = {},
  service: ShiftEntry = entry,
): SavedOvertimeAllocation {
  return {
    shiftId: service.id,
    shiftRevision: service.revision,
    timeZone: work.timeZone,
    allocations: [{ date: service.date, minutes: service.overtimeMinutes }],
    revision: 1,
    confirmedAt: "2026-09-22T00:00:00Z",
    updatedAt: "2026-09-22T00:00:00Z",
    ...changes,
  };
}
const monthly = (
  records: readonly SavedOvertimeAllocation[],
  services: readonly ShiftEntry[] = [entry],
  month = "2026-09",
) =>
  calculateMonthlyDatedOvertime(month, services, work, [history()], resolver(), undefined, records);

describe("saved overtime calculation boundary", () => {
  it("uses a current saved allocation without changing existing rates or rounding", () => {
    const result = monthly([saved()]);
    expect(result).toMatchObject({ complete: true, totalCents: 2314 });
    expect(
      result.positions.map((position) => [position.amountCents, position.basis.minutes]),
    ).toEqual([
      [1737, 60],
      [577, 60],
    ]);
    expect(result.totalCents).toBe(monthly([]).totalCents);
    expect(result.positions.every((position) => position.through === entry.date)).toBe(true);
  });

  it.each([
    ["changed service revision", { shiftRevision: 2 }],
    ["changed timezone", { timeZone: "Europe/London" }],
    ["explicitly cleared allocation", { allocations: null }],
  ] as const)("requires reconfirmation for %s even with the same hourly basis", (_name, change) => {
    const result = monthly([saved(change)]);
    expect(result).toMatchObject({
      complete: false,
      totalCents: null,
      knownSubtotalCents: 0,
      status: "unavailable",
    });
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0].issue?.code).toBe("OVERTIME_ALLOCATION_REQUIRED");
    expect(result.positions[0].issue?.message).toContain("erneut");
  });

  it("requires reconfirmation after changing a service, then uses its new revision", () => {
    const changed = { ...entry, revision: 2 };
    expect(monthly([saved()], [changed]).complete).toBe(false);
    expect(monthly([saved({ revision: 2 }, changed)], [changed]).totalCents).toBe(2314);
  });

  it("rejects a saved allocation for a different service at the single-service boundary", () => {
    const result = calculateDatedShiftOvertime(
      entry,
      work,
      [history()],
      resolver(),
      undefined,
      "2026-09",
      saved({ shiftId: "another-service" }),
    );
    expect(result.totalCents).toBeNull();
    expect(result.positions[0].issue?.code).toBe("OVERTIME_ALLOCATION_REQUIRED");
  });

  it.each([
    { tariffOvertimeConfirmed: false },
    { overtimeMinutes: 0 },
    { deletedAt: work.updatedAt },
    { type: "VACATION" as const, allDay: true },
  ])("never revives removed overtime from an old saved record: %j", (change) => {
    expect(monthly([saved()], [{ ...entry, ...change, revision: 2 }])).toMatchObject({
      complete: true,
      totalCents: 0,
      positions: [],
    });
  });

  it("rejects duplicate records instead of silently taking the last revision", () => {
    expect(() => monthly([saved(), saved({ revision: 2 })])).toThrow("mehrfach");
  });

  it("rejects malformed stored data instead of silently ignoring it", () => {
    expect(() => monthly([saved({ revision: 0 })])).toThrow();
    expect(() => monthly([saved({ allocations: [] })])).toThrow();
  });

  it("does not combine versioned records and unversioned draft allocations", () => {
    const days = saved().allocations!;
    expect(() =>
      calculateDatedShiftOvertime(entry, work, [history()], resolver(), days, "2026-09", saved()),
    ).toThrow("nicht gemischt");
    expect(() =>
      calculateMonthlyDatedOvertime(
        "2026-09",
        [entry],
        work,
        [history()],
        resolver(),
        new Map([[entry.id, days]]),
        [saved()],
      ),
    ).toThrow("nicht gemischt");
  });

  it.each(["2026-09-30", "2026-12-31"])(
    "assigns a carry-in service on %s exactly once to each included month",
    (date) => {
      const nextDate = date === "2026-09-30" ? "2026-10-01" : "2027-01-01";
      const service = { ...entry, date };
      const record = saved(
        {
          allocations: [
            { date, minutes: 20 },
            { date: nextDate, minutes: 40 },
          ],
        },
        service,
      );
      const first = monthly([record], [service], date.slice(0, 7));
      const next = monthly([record], [service], nextDate.slice(0, 7));
      expect(first.totalCents).toBe(771);
      expect(next.totalCents).toBe(1542);
      expect(first.positions[0].basis.minutes + next.positions[0].basis.minutes).toBe(60);
      expect(monthly([record], [service], "2026-08").positions).toEqual([]);
      expect(
        monthly([record], [{ ...service, revision: 2 }], nextDate.slice(0, 7)).totalCents,
      ).toBeNull();
    },
  );

  it("allows an explicit zero-minute side without treating it as missing", () => {
    const service = { ...entry, date: "2026-09-30" };
    const record = saved(
      {
        allocations: [
          { date: "2026-09-30", minutes: 0 },
          { date: "2026-10-01", minutes: 60 },
        ],
      },
      service,
    );
    expect(monthly([record], [service], "2026-09")).toMatchObject({
      complete: true,
      totalCents: 0,
      positions: [],
    });
    expect(monthly([record], [service], "2026-10").totalCents).toBe(2314);
  });

  it("uses the corresponding dated profile for each stored day", () => {
    const result = calculateMonthlyDatedOvertime(
      "2026-09",
      [entry],
      work,
      [history(), history("2026-09-16", "P6")],
      resolver(),
      undefined,
      [
        saved({
          allocations: [
            { date: "2026-09-15", minutes: 30 },
            { date: "2026-09-16", minutes: 30 },
          ],
        }),
      ],
    );
    expect(result.totalCents).toBe(2358);
    expect(result.positions.map((position) => position.amountCents)).toEqual([869, 288, 900, 301]);
  });

  it.each([
    ["2026-03-29", 120, false],
    ["2026-10-25", 240, true],
  ] as const)("validates actual DST minutes on %s", (date, minutes, supported) => {
    const service = {
      ...entry,
      date,
      startTime: "01:00",
      endTime: "04:00",
      overtimeMinutes: minutes,
    };
    const result = monthly([saved({}, service)], [service], date.slice(0, 7));
    // The candidate starts in May; the March case must not fabricate prior coverage.
    expect(result.complete).toBe(supported);
    expect(result.positions[0].basis.minutes).toBe(minutes);
    if (supported) expect(result.totalCents).toBe(9254);
    const invalid = { ...service, overtimeMinutes: minutes + 1 };
    expect(
      monthly([saved({}, invalid)], [invalid], date.slice(0, 7)).positions[0].issue?.code,
    ).toBe("OVERTIME_MINUTES_INVALID");
  });

  it("rejects impossible minutes even when saved revision and timezone match", () => {
    expect(() => monthly([saved({ allocations: [{ date: entry.date, minutes: 30 }] })])).toThrow(
      "Tagesaufteilung",
    );
    expect(() => monthly([saved({ allocations: [{ date: "2026-09-17", minutes: 60 }] })])).toThrow(
      "Tagesaufteilung",
    );
  });

  it("propagates reconfirmation into monthly completeness while preserving unrelated components", () => {
    const data = {
      month: "2026-09",
      shifts: [entry],
      workProfile: work,
      history: [history()],
      resolver: resolver(),
      allowanceEntitlements: [
        {
          from: "2026-09-01",
          through: "2026-09-30",
          status: "NONE" as const,
          origin: "confirmed" as const,
          revision: 1,
        },
      ],
    };
    const before = calculateDatedMonthlyRemuneration({
      ...data,
      savedOvertimeAllocations: [saved()],
    });
    const after = calculateDatedMonthlyRemuneration({
      ...data,
      savedOvertimeAllocations: [saved({ allocations: null, revision: 2 })],
    });
    expect(before.complete).toBe(true);
    expect(after.complete).toBe(false);
    expect(after.estimatedGrossCents).toBeNull();
    expect(after.base).toEqual(before.base);
    expect(after.timePremiums).toEqual(before.timePremiums);
    expect(after.allowances).toEqual(before.allowances);
    expect(after.knownSubtotalCents).toBe(before.knownSubtotalCents - 2314);
    const assessed = calculateAssessedMonthlyRemuneration({
      ...data,
      settings: { workplaceCoverage: "UNKNOWN", assignment: "UNKNOWN", updatedAt: null },
      savedOvertimeAllocations: [saved({ allocations: null })],
    });
    expect(assessed.overtime).toEqual(after.overtime);
  });
});
