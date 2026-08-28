import { describe, expect, it } from "vitest";

import type { CalendarEntry, MonthlyTariffDecision } from "@/domain/types";
import { selectAnnualReportInputs } from "@/features/analysis/annual-report-inputs";

function appointment(id: string, date: string): CalendarEntry {
  return {
    id,
    kind: "APPOINTMENT",
    date,
    title: id,
    allDay: true,
    startTime: null,
    endTime: null,
    color: "#2F80ED",
    note: null,
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  };
}

function decision(month: string): MonthlyTariffDecision {
  return {
    month,
    allowanceStatus: "NONE",
    revision: 1,
    confirmedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("annual report input selection", () => {
  it("keeps stable identities when unrelated years change", () => {
    const relevant = appointment("relevant", "2026-06-01");
    const first = selectAnnualReportInputs(null, 2026, [relevant], [decision("2026-06")]);
    const second = selectAnnualReportInputs(
      first,
      2026,
      [relevant, appointment("outside", "2030-01-01")],
      [first.tariffDecisions[0], decision("2030-01")],
    );

    expect(second.entries).toBe(first.entries);
    expect(second.tariffDecisions).toBe(first.tariffDecisions);
    expect(second).toBe(first);
  });

  it("invalidates entries inside allowance and compliance boundary windows", () => {
    const first = selectAnnualReportInputs(null, 2026, [], []);
    expect(first).toMatchObject({
      rangeStart: "2025-11-01",
      rangeEnd: "2027-06-30",
    });
    const withAllowanceLookback = selectAnnualReportInputs(
      first,
      2026,
      [appointment("lookback", "2025-11-01")],
      [],
    );
    const withComplianceTail = selectAnnualReportInputs(
      withAllowanceLookback,
      2026,
      [withAllowanceLookback.entries[0], appointment("tail", "2027-06-30")],
      [],
    );

    expect(withAllowanceLookback.entries).not.toBe(first.entries);
    expect(withComplianceTail.entries).not.toBe(withAllowanceLookback.entries);
  });
});
