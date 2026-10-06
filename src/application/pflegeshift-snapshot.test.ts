import { DataLoadFailure, dataLoadFailureMessage } from "@/domain/data-load-failure";
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

describe("application snapshot loading", () => {
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
  it.each([
    ["loadProfile", "LOAD_PROFILE_FAILED"],
    ["listTemplates", "LOAD_TEMPLATES_FAILED"],
    ["listCalendarEntries", "LOAD_CALENDAR_FAILED"],
    ["listMonthlyTariffDecisions", "LOAD_TARIFF_DECISIONS_FAILED"],
    ["loadTvoedWorkPatternSettings", "LOAD_WORK_PATTERN_FAILED"],
  ] as const)(
    "identifies a failed %s read without exposing its raw error",
    async (method, code) => {
      const repository: PflegeShiftSnapshotRepository = {
        loadProfile: vi.fn(async () => null),
        listTemplates: vi.fn(async () => []),
        listCalendarEntries: vi.fn(async () => []),
        listMonthlyTariffDecisions: vi.fn(async () => []),
        loadTvoedWorkPatternSettings: vi.fn(async () => workPatternSettings),
      };
      vi.mocked(repository[method]).mockRejectedValue(new Error("private-calendar-value"));
      const failure = await loadPflegeShiftSnapshot(
        repository,
        entryRangeForActiveMonth("2026-08"),
      ).catch((error) => error);
      expect(failure).toMatchObject({ code });
      expect(dataLoadFailureMessage(failure)).toContain("Fehlercode: " + code);
      expect(dataLoadFailureMessage(failure)).not.toContain("private-calendar-value");
    },
  );

  it("preserves a specific profile salary conflict through the complete snapshot", async () => {
    const conflict = new DataLoadFailure("PROFILE_SALARY_CONFLICT");
    const repository: PflegeShiftSnapshotRepository = {
      loadProfile: vi.fn(async () => {
        throw conflict;
      }),
      listTemplates: vi.fn(async () => []),
      listCalendarEntries: vi.fn(async () => []),
      listMonthlyTariffDecisions: vi.fn(async () => []),
      loadTvoedWorkPatternSettings: vi.fn(async () => workPatternSettings),
    };
    await expect(
      loadPflegeShiftSnapshot(repository, entryRangeForActiveMonth("2026-08")),
    ).rejects.toBe(conflict);
  });
});
