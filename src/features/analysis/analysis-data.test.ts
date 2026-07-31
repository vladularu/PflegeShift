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
  it("keeps the selected month small while preserving the compliance lookback", () => {
    const result = selectAnalysisEntryWindow([
      shift("outside", "2026-06-22"),
      shift("lookback", "2026-06-23"),
      shift("month", "2026-07-15"),
      shift("after", "2026-08-01"),
    ], "2026-07");

    expect(result.monthEntries.map((entry) => entry.id)).toEqual(["month"]);
    expect(result.monthShifts.map((entry) => entry.id)).toEqual(["month"]);
    expect(result.complianceShifts.map((entry) => entry.id)).toEqual(["lookback", "month"]);
    expect(result.allowanceShifts.map((entry) => entry.id)).toEqual([
      "outside",
      "lookback",
      "month",
    ]);
  });
});
