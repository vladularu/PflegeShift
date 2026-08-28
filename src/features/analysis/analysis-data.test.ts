import { describe, expect, it } from "vitest";

import type { ShiftEntry } from "@/domain/types";
import { selectAnalysisEntryWindow } from "@/features/analysis/analysis-data";

function shift(id: string, date: string): ShiftEntry {
  return {
    id,
    kind: "SHIFT",
    date,
    templateId: null,
    title: "Dienst",
    type: "DAY",
    startTime: "08:00",
    endTime: "16:00",
    breakMinutes: 30,
    color: "#207A68",
    symbol: "D",
    note: "",
    overtimeMinutes: 0,
    holidayPremiumMode: "WITH_TIME_OFF",
    revision: 1,
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    deletedAt: null,
  };
}

describe("selectAnalysisEntryWindow", () => {
  it("keeps the selected month small while loading the legal qualification year", () => {
    const result = selectAnalysisEntryWindow(
      [
        shift("previous-year", "2025-12-31"),
        shift("year-start", "2026-01-01"),
        shift("too-old", "2026-04-30"),
        shift("two-month-lookback", "2026-05-01"),
        shift("outside", "2026-06-22"),
        shift("lookback", "2026-06-23"),
        shift("month", "2026-07-15"),
        shift("after", "2026-08-01"),
        shift("after-window", "2026-08-29"),
        shift("year-end", "2026-12-31"),
        shift("next-year", "2027-01-01"),
      ],
      "2026-07",
    );

    expect(result.monthEntries.map((entry) => entry.id)).toEqual(["month"]);
    expect(result.monthShifts.map((entry) => entry.id)).toEqual(["month"]);
    expect(result.complianceShifts.map((entry) => entry.id)).toEqual([
      "year-start",
      "too-old",
      "two-month-lookback",
      "outside",
      "lookback",
      "month",
      "after",
      "after-window",
      "year-end",
    ]);
    expect(result.allowanceShifts.map((entry) => entry.id)).toEqual([
      "two-month-lookback",
      "outside",
      "lookback",
      "month",
    ]);
  });
});
