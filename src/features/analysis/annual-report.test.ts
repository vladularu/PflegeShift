import { describe, expect, it } from "vitest";

import type {
  Appointment,
  CalendarEntry,
  ShiftEntry,
  ShiftType,
  UserProfile,
} from "@/domain/types";
import { calculateMonthlySummary } from "@/engine/monthly-summary";
import {
  buildAnnualReport,
  buildAnnualReportSteps,
  createAnnualReportComputationCache,
  type AnnualReportComputationCache,
} from "@/features/analysis/annual-report";
import { bundledRuleResolver, type RuleResolver } from "@/rules/rule-resolver";

const profile: UserProfile = {
  federalState: "NW",
  weeklyMinutes: 2_310,
  timeZone: "Europe/Berlin",
  tariff: {
    payGroup: "P8",
    payLevel: 4,
    sector: "BT_K",
    fullTimeWeeklyMinutes: 2_310,
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function shift(
  id: string,
  date: string,
  type: ShiftType = "DAY",
  overrides: Partial<ShiftEntry> = {},
): ShiftEntry {
  const absence = type === "VACATION" || type === "SICK" || type === "FREE";
  return {
    id,
    kind: "SHIFT",
    date,
    templateId: null,
    title: type,
    type,
    startTime: absence ? null : "08:00",
    endTime: absence ? null : "16:12",
    breakMinutes: absence ? 0 : 30,
    color: "#207A68",
    symbol: "D",
    note: null,
    overtimeMinutes: 0,
    holidayPremiumMode: "WITH_TIME_OFF",
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

function appointment(id: string, date: string): Appointment {
  return {
    id,
    kind: "APPOINTMENT",
    date,
    title: "Termin",
    allDay: true,
    startTime: null,
    endTime: null,
    color: "#0891B2",
    note: null,
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  };
}

function alternateRuleResolver(): RuleResolver {
  return Object.freeze({
    resolveTariff: (effectiveDate: string) => {
      const resolved = bundledRuleResolver.resolveTariff(effectiveDate);
      if (!resolved.ok) return resolved;
      return {
        ok: true as const,
        value: {
          ...resolved.value,
          rules: {
            ...resolved.value.rules,
            payTables: resolved.value.rules.payTables.map((table) => ({
              ...table,
              entries: table.entries.map((entry) => ({
                ...entry,
                monthlyCents: entry.monthlyCents + 10_000,
              })),
            })) as typeof resolved.value.rules.payTables,
          },
        },
      };
    },
    resolveLegal: (effectiveDate: string) => {
      const resolved = bundledRuleResolver.resolveLegal(effectiveDate);
      if (!resolved.ok) return resolved;
      return {
        ok: true as const,
        value: {
          ...resolved.value,
          rules: {
            ...resolved.value.rules,
            workingTime: {
              ...resolved.value.rules.workingTime,
              maxDailyMinutes: 1_440,
            },
          },
        },
      };
    },
    resolveHoliday: (effectiveDate: string) => {
      const resolved = bundledRuleResolver.resolveHoliday(effectiveDate);
      if (!resolved.ok) return resolved;
      return {
        ok: true as const,
        value: {
          ...resolved.value,
          rules: {
            ...resolved.value.rules,
            holidays: resolved.value.rules.holidays.filter(
              (holiday) => holiday.id !== "new-year",
            ) as typeof resolved.value.rules.holidays,
          },
        },
      };
    },
  });
}

function drainAnnualReport(
  entries: readonly CalendarEntry[],
  cache: AnnualReportComputationCache,
  referenceDate = "2026-08-04",
  ruleResolver: RuleResolver = bundledRuleResolver,
): { readonly report: ReturnType<typeof buildAnnualReport>; readonly yields: number } {
  const steps = buildAnnualReportSteps(
    2026,
    entries,
    profile,
    [],
    undefined,
    cache,
    referenceDate,
    ruleResolver,
  );
  let yields = 0;
  while (true) {
    const step = steps.next();
    if (step.done) return { report: step.value, yields };
    yields += 1;
  }
}

describe("buildAnnualReport", () => {
  it("aggregates all twelve monthly reports without counting appointments as work", () => {
    const entries: CalendarEntry[] = [
      shift("work", "2026-01-05"),
      shift("training", "2026-02-03", "TRAINING"),
      shift("vacation", "2026-03-04", "VACATION"),
      shift("sick", "2026-04-06", "SICK"),
      shift("free", "2026-05-07", "FREE"),
      appointment("appointment", "2026-06-08"),
    ];
    const report = buildAnnualReport(2026, entries, profile, []);
    const expectedActual = Array.from({ length: 12 }, (_, index) => {
      const month = `2026-${String(index + 1).padStart(2, "0")}`;
      return calculateMonthlySummary(
        month,
        entries.filter((entry): entry is ShiftEntry => entry.kind === "SHIFT"),
        profile,
      ).actualMinutes;
    }).reduce((sum, minutes) => sum + minutes, 0);

    expect(report.months).toHaveLength(12);
    expect(report.actualMinutes).toBe(expectedActual);
    expect(report.entryCount).toBe(6);
    expect(report.activeMonthCount).toBe(6);
    expect(report.vacationDays).toBe(1);
    expect(report.sickDays).toBe(1);
    expect(report.freeDays).toBe(1);
    expect(report.distribution.get("DAY")).toBe(1);
    expect(report.distribution.get("TRAINING")).toBe(1);
  });

  it("aggregates tariff availability, premiums and compliance issues", () => {
    const entries = [
      shift("night", "2026-01-04", "NIGHT", {
        startTime: "21:00",
        endTime: "07:30",
        breakMinutes: 60,
        overtimeMinutes: 60,
      }),
      shift("long", "2026-02-02", "DAY", {
        startTime: "06:00",
        endTime: "18:30",
        breakMinutes: 30,
      }),
    ];
    const report = buildAnnualReport(2026, entries, profile, []);

    expect(report.availablePayMonthCount).toBe(12);
    expect(report.estimatedGrossAmount).toBeGreaterThan(0);
    expect(report.premiumAmount + report.overtimeAmount).toBeGreaterThan(0);
    expect(report.criticalCount).toBeGreaterThan(0);
  });

  it("does not silently extrapolate tariff data beyond the supported period", () => {
    const report = buildAnnualReport(2027, [], profile, []);
    expect(report.availablePayMonthCount).toBe(3);
    expect(report.months.slice(3).every((item) => item.estimatedGrossAmount === null)).toBe(true);
  });

  it("rejects invalid report years", () => {
    expect(() => buildAnnualReport(1899, [], profile, [])).toThrow("Ungültiges Berichtsjahr.");
  });

  it("reuses completed months and invalidates only affected windows", () => {
    const cache = createAnnualReportComputationCache();
    const january = shift("january", "2026-01-10");
    const july = shift("july", "2026-07-10");
    const first = drainAnnualReport([january, july], cache);
    const unchanged = drainAnnualReport([january, july], cache);
    const appointmentChange = drainAnnualReport(
      [january, appointment("appointment", "2026-04-12"), july],
      cache,
    );
    const shiftChange = drainAnnualReport(
      [
        { ...january, endTime: "17:12", revision: 2 },
        appointment("appointment", "2026-04-12"),
        july,
      ],
      cache,
    );

    expect(unchanged.report).toEqual(first.report);
    expect(unchanged.yields).toBe(12);
    expect(appointmentChange.yields).toBe(unchanged.yields);
    expect(appointmentChange.report.entryCount).toBe(first.report.entryCount + 1);
    expect(shiftChange.yields).toBeGreaterThan(appointmentChange.yields);
  });

  it("invalidates cached compliance when the local reference day changes", () => {
    const cache = createAnnualReportComputationCache();
    const shifts = [
      shift("late", "2026-01-01", "LATE", { startTime: "14:00", endTime: "23:00" }),
      shift("early", "2026-01-02", "EARLY", { startTime: "09:00", endTime: "17:00" }),
    ];
    const open = drainAnnualReport(shifts, cache, "2026-01-10");
    const expired = drainAnnualReport(shifts, cache, "2026-03-10");

    expect(open.report.warningCount).toBeGreaterThan(0);
    expect(expired.report.criticalCount).toBeGreaterThan(open.report.criticalCount);
    expect(expired.yields).toBeGreaterThan(12);
  });

  it("isolates every annual calculation cache by resolver identity", () => {
    const cache = createAnnualReportComputationCache();
    const entries = [
      shift("new-year-vacation", "2026-01-01", "VACATION"),
      shift("long", "2026-01-02", "DAY", {
        startTime: "06:00",
        endTime: "18:30",
        breakMinutes: 30,
      }),
    ];
    const legacy = drainAnnualReport(entries, cache);
    const alternate = drainAnnualReport(entries, cache, "2026-08-04", alternateRuleResolver());

    expect(alternate.report.targetMinutes).toBeGreaterThan(legacy.report.targetMinutes);
    expect(alternate.report.estimatedGrossAmount).toBeGreaterThan(
      legacy.report.estimatedGrossAmount,
    );
    expect(alternate.report.criticalCount).toBeLessThan(legacy.report.criticalCount);
    expect(alternate.yields).toBeGreaterThan(12);
  });
});
