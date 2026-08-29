import { describe, expect, it, vi } from "vitest";

import {
  entryRangeForActiveMonth,
  loadPflegeShiftSnapshot,
  type PflegeShiftSnapshotRepository,
} from "@/application/pflegeshift-snapshot";

const workPatternSettings = {
  workplaceCoverage: "UNKNOWN" as const,
  assignment: "UNKNOWN" as const,
  updatedAt: null,
};

describe("PflegeShift snapshot loading", () => {
  it("uses the bounded annual analysis and adjacent-calendar window", () => {
    expect(entryRangeForActiveMonth("2026-08")).toEqual({
      startDate: "2025-01-01",
      endDate: "2027-12-31",
    });
    expect(entryRangeForActiveMonth("2027-01")).toEqual({
      startDate: "2026-01-01",
      endDate: "2028-12-31",
    });
  });

  it("loads independent snapshot data concurrently through the repository port", async () => {
    const repository: PflegeShiftSnapshotRepository = {
      loadProfile: vi.fn(async () => null),
      listTemplates: vi.fn(async () => []),
      listCalendarEntries: vi.fn(async () => []),
      listMonthlyTariffDecisions: vi.fn(async () => []),
      loadTvoedWorkPatternSettings: vi.fn(async () => workPatternSettings),
    };
    const range = entryRangeForActiveMonth("2026-08");

    await expect(loadPflegeShiftSnapshot(repository, range)).resolves.toEqual({
      profile: null,
      templates: [],
      entries: [],
      tariffDecisions: [],
      workPatternSettings,
    });
    expect(repository.listCalendarEntries).toHaveBeenCalledWith("2025-01-01", "2027-12-31");
  });
});
