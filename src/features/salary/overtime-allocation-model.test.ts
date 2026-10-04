import { describe, expect, it } from "vitest";
import type { SavedOvertimeAllocation } from "@/domain/overtime-allocation";
import { shift, work } from "@/engine/remuneration-test-fixtures";
import {
  overtimeAllocationFields,
  overtimeAllocationShifts,
  prepareOvertimeAllocation,
} from "./overtime-allocation-model";

const service = shift({ date: "2026-09-30", overtimeMinutes: 60, tariffOvertimeConfirmed: true });
const values = { "2026-09-30": "20", "2026-10-01": "40" };
const saved: SavedOvertimeAllocation = {
  shiftId: service.id,
  shiftRevision: service.revision,
  timeZone: work.timeZone,
  allocations: [
    { date: "2026-09-30", minutes: 20 },
    { date: "2026-10-01", minutes: 40 },
  ],
  revision: 3,
  confirmedAt: work.updatedAt,
  updatedAt: work.updatedAt,
};
describe("overtime allocation input", () => {
  it("retains carry-in days but excludes unrelated, deleted and unconfirmed shifts", () => {
    expect(
      overtimeAllocationShifts(
        "2026-10",
        [
          service,
          shift({ id: "none" }),
          { ...service, id: "deleted", deletedAt: work.updatedAt },
          { ...service, id: "absence", type: "VACATION", allDay: true },
          { ...service, id: "unconfirmed", tariffOvertimeConfirmed: false },
          { ...service, id: "previous", endTime: "23:30" },
        ],
        work.timeZone,
      ),
    ).toEqual([service]);
    expect(() => overtimeAllocationShifts("invalid", [], work.timeZone)).toThrow();
  });
  it("does not invent a distribution across midnight and prefills only current confirmations", () => {
    expect(
      overtimeAllocationFields(service, work.timeZone, null).map((field) => field.value),
    ).toEqual(["", ""]);
    expect(
      overtimeAllocationFields(service, work.timeZone, saved).map((field) => field.value),
    ).toEqual(["20", "40"]);
    for (const record of [
      { ...saved, shiftRevision: 2 },
      { ...saved, allocations: null },
      { ...saved, timeZone: "Europe/London" },
    ]) {
      expect(
        overtimeAllocationFields(service, work.timeZone, record).map((field) => field.value),
      ).toEqual(["", ""]);
    }
    const single = { ...service, startTime: "08:00", endTime: "16:00" };
    expect(overtimeAllocationFields(single, work.timeZone, null)[0].value).toBe("60");
  });
  it("preserves both revision contracts and exact zero-minute sides", () => {
    expect(prepareOvertimeAllocation(service, work.timeZone, saved, values)).toEqual({
      shiftId: service.id,
      expectedShiftRevision: 1,
      expectedRevision: 3,
      timeZone: work.timeZone,
      allocations: saved.allocations,
    });
    expect(
      prepareOvertimeAllocation(service, work.timeZone, null, {
        "2026-09-30": "0",
        "2026-10-01": "60",
      }).allocations?.[0].minutes,
    ).toBe(0);
  });
  it.each(["", "-1", "+1", "1.5", "1,5", "1e1", "Infinity", "abc", "99999"])(
    "rejects ambiguous minute input %j",
    (raw) => {
      expect(() =>
        prepareOvertimeAllocation(service, work.timeZone, null, { ...values, "2026-09-30": raw }),
      ).toThrow("ganze Minuten");
    },
  );
  it("rejects stale date fields, unequal totals, excessive day shares and insufficient net time", () => {
    expect(() =>
      prepareOvertimeAllocation(service, work.timeZone, null, { "2026-09-30": "60" }),
    ).toThrow("Diensttage");
    expect(() =>
      prepareOvertimeAllocation(service, work.timeZone, null, { ...values, "2026-09-30": "30" }),
    ).toThrow("genau 60");
    expect(() =>
      prepareOvertimeAllocation(service, work.timeZone, null, { ...values, "2026-09-30": "61" }),
    ).toThrow("tatsächliche Dienstzeit");
    expect(() =>
      prepareOvertimeAllocation({ ...service, breakMinutes: 90 }, work.timeZone, null, values),
    ).toThrow("abzüglich Pause");
    expect(() =>
      prepareOvertimeAllocation(
        { ...service, tariffOvertimeConfirmed: false },
        work.timeZone,
        null,
        values,
      ),
    ).toThrow("keine bestätigten");
    expect(() =>
      prepareOvertimeAllocation(service, work.timeZone, { ...saved, shiftId: "other" }, values),
    ).toThrow("anderen Dienst");
  });
  it.each([
    ["2026-03-29", 120],
    ["2026-10-25", 240],
  ] as const)("uses elapsed DST capacity on %s", (date, minutes) => {
    const entry = {
      ...service,
      date,
      startTime: "01:00",
      endTime: "04:00",
      overtimeMinutes: minutes,
    };
    expect(overtimeAllocationFields(entry, work.timeZone, null)[0].maximumMinutes).toBe(minutes);
    expect(
      prepareOvertimeAllocation(entry, work.timeZone, null, { [date]: String(minutes) })
        .allocations,
    ).toEqual([{ date, minutes }]);
  });
});
