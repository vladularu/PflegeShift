import { describe, expect, it } from "vitest";
import source from "../../rules/packages/reviewed/tvoed-vka-bt-k/2026-05-r4.json";
import type { ShiftEntry, UserProfile } from "@/domain/types";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { BUNDLED_HOLIDAY_RULES, BUNDLED_LEGAL_RULES } from "@/rules/bundled-rules";
import { bundledRuleResolver, createRuleResolver, type RuleResolver } from "@/rules/rule-resolver";
import { validateRulePackage } from "@/rules/validation";
import {
  buildAnnualAvailableReportSteps,
  createAnnualAvailableReportCache,
} from "@/features/analysis/annual-core-report";
import {
  calculateMonthlyPayEstimate,
  calculateShiftPremiumBreakdown,
  DEFAULT_TVOED_WORK_PATTERN_SETTINGS,
} from "./simple-pay";
import {
  overlaySimpleTariffPackage,
  selectSimpleTariffTable,
  type SimpleTariffFamily,
} from "./simple-tariff-table-overlay";

const carrier = source as RuleTariffPackage;
function resolver(pkg = carrier): RuleResolver {
  const checked = validateRulePackage(pkg);
  if (!checked.ok) throw new Error(JSON.stringify(checked.issues));
  return createRuleResolver({
    tariff: [pkg],
    legal: BUNDLED_LEGAL_RULES,
    holiday: BUNDLED_HOLIDAY_RULES,
  });
}
const work: UserProfile = {
  federalState: "NW",
  holidayRegion: "NONE",
  weeklyMinutes: 2310,
  timeZone: "Europe/Berlin",
  regularRotatingNightWork: false,
  sundayHolidayWorkEligible: true,
  allEmploymentWorkRecorded: true,
  tariff: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};
function profile(family: SimpleTariffFamily, group: string, step: string): UserProfile {
  switch (family) {
    case "TVOED_VKA_E":
      return {
        ...work,
        vkaETariff: {
          payGroup: group.replace("eg", "E") as "E9b",
          payLevel: Number(step.slice(1)) as 4,
          sector: "BT_K",
          tariffRegion: "OTHER",
        },
      };
    case "TVAOED_PFLEGE":
      return {
        ...work,
        nursingTrainingTariff: {
          trainingYear: Number(step.slice(1)) as 1,
          sector: "BT_K",
          tariffRegion: "OTHER",
        },
      };
    case "TVL_KR":
      return {
        ...work,
        tvlKrTariff: {
          payGroup: group.toUpperCase() as "KR8",
          payLevel: Number(step) as 4,
          universityRegion: "WEST",
        },
      };
    case "TVAL_PFLEGE":
      return {
        ...work,
        tvalPflegeTariff: { trainingYear: Number(step) as 1, universityRegion: "WEST" },
      };
    case "TVH_KR":
      return {
        ...work,
        federalState: "HE",
        tvhKrTariff: {
          payGroup: group as "KR8",
          payLevel: (step === "1a" || step === "1b" ? step : Number(step)) as 4,
          fullTimeWeeklyMinutes: 2310,
        },
      };
    case "TVUK_PUK":
      return {
        ...work,
        federalState: "BW",
        tvUkNursingTariff: { payGroup: group as "PUK8", payLevel: Number(step) as 4 },
      };
  }
}
const night: ShiftEntry = {
  kind: "SHIFT",
  id: "remote-night",
  date: "2026-10-05",
  templateId: null,
  title: "Nacht",
  type: "NIGHT",
  startTime: "21:00",
  endTime: "07:00",
  breakMinutes: 60,
  color: "#EA5B55",
  symbol: "N",
  note: null,
  overtimeMinutes: 60,
  tariffOvertimeConfirmed: true,
  holidayPremiumMode: "WITH_TIME_OFF",
  revision: 1,
  createdAt: work.createdAt,
  updatedAt: work.updatedAt,
  deletedAt: null,
};
const examples: [SimpleTariffFamily, string, string][] = [
  ["TVOED_VKA_E", "eg9b", "s4"],
  ["TVAOED_PFLEGE", "b", "s1"],
  ["TVL_KR", "kr8", "4"],
  ["TVAL_PFLEGE", "regular", "1"],
  ["TVH_KR", "KR8", "4"],
  ["TVUK_PUK", "PUK8", "4"],
];
function month(month: string, p: UserProfile, r: RuleResolver, shifts: ShiftEntry[] = []) {
  return calculateMonthlyPayEstimate(
    month,
    shifts,
    p,
    null,
    shifts,
    DEFAULT_TVOED_WORK_PATTERN_SETTINGS,
    r,
  );
}
function updated(family: SimpleTariffFamily) {
  const pkg = structuredClone(carrier);
  for (const table of pkg.rules.simpleTariffTables!.tables) {
    if (table.tariffId === family) for (const row of table.entries) row.monthlyCents += 10000;
  }
  return resolver(pkg);
}
function annual(
  p: UserProfile,
  r: RuleResolver,
  cache: ReturnType<typeof createAnnualAvailableReportCache>,
) {
  const steps = buildAnnualAvailableReportSteps(
    2026,
    [],
    p,
    [],
    DEFAULT_TVOED_WORK_PATTERN_SETTINGS,
    "2026-10-06",
    r,
    { cache },
  );
  let next = steps.next();
  while (!next.done) next = steps.next();
  return next.value;
}

describe("reviewed remote tables in the accepted simple salary flow", () => {
  const remote = resolver();
  it.each(carrier.rules.simpleTariffTables!.tables)(
    "preserves every cell of $tariffId from $validFrom",
    (table) => {
      const key = table.validFrom.slice(0, 7);
      for (const row of table.entries) {
        const p = profile(table.tariffId, row.groupId, row.stepId);
        const local = month(key, p, bundledRuleResolver);
        const downloaded = month(key, p, remote);
        expect(downloaded.available, `${table.tariffId}/${row.groupId}/${row.stepId}`).toBe(true);
        expect(downloaded).toEqual(local);
        expect(downloaded.fullTimeTableAmount).toBe(row.monthlyCents / 100);
      }
    },
  );
  it.each(examples)(
    "updates %s base, premium and overtime without stale caches",
    (family, group, step) => {
      const p = profile(family, group, step);
      const next = updated(family);
      const initial = month("2026-10", p, remote, [night]);
      expect(month("2026-10", p, remote, [night])).toBe(initial);
      const changed = month("2026-10", p, next, [night]);
      expect(changed.personalBaseAmount).toBe(initial.personalBaseAmount! + 100);
      expect(changed.timePremiumAmount).toBeGreaterThan(initial.timePremiumAmount);
      const firstShift = calculateShiftPremiumBreakdown(night, p, remote);
      const nextShift = calculateShiftPremiumBreakdown(night, p, next);
      expect(nextShift.overtimeBaseAmount).toBeGreaterThan(firstShift.overtimeBaseAmount);
      const partTime = month("2026-10", { ...p, weeklyMinutes: 1155 }, next);
      expect(partTime.personalBaseAmount).toBe(Math.round(changed.fullTimeTableAmount! * 50) / 100);
      const cache = createAnnualAvailableReportCache();
      const before = annual(p, remote, cache);
      const after = annual(p, next, cache);
      expect(after.estimatedGrossAmount).toBe(before.estimatedGrossAmount! + 1200);
      expect(annual(p, remote, cache)).toEqual(before);
      expect(month("2026-10", p, remote, [night])).toBe(initial);
    },
  );
  it("applies a new table from midnight without changing the preceding day", () => {
    const pkg = structuredClone(carrier);
    for (const table of pkg.rules.simpleTariffTables!.tables) {
      if (table.tariffId === "TVAOED_PFLEGE" && table.validFrom === "2026-05-01")
        for (const row of table.entries) row.monthlyCents += 10000;
    }
    const next = resolver(pkg);
    const p = profile("TVAOED_PFLEGE", "b", "s1");
    const crossing = { ...night, date: "2026-04-30" };
    const earlier = { ...night, date: "2026-04-29" };
    expect(calculateShiftPremiumBreakdown(earlier, p, next)).toEqual(
      calculateShiftPremiumBreakdown(earlier, p, remote),
    );
    expect(calculateShiftPremiumBreakdown(crossing, p, next).totalAmount).toBeGreaterThan(
      calculateShiftPremiumBreakdown(crossing, p, remote).totalAmount,
    );
    expect(month("2026-04", p, next)).toEqual(month("2026-04", p, remote));
    expect(month("2026-05", p, next).personalBaseAmount).toBe(
      month("2026-05", p, remote).personalBaseAmount! + 100,
    );
  });

  it("keeps the bundled fallback, source packages and verified snapshots unchanged", () => {
    const before = JSON.stringify(carrier);
    expect(selectSimpleTariffTable(bundledRuleResolver, "TVL_KR", "2026-10-01")).toBeNull();
    expect(selectSimpleTariffTable(remote, "TVL_KR", "1900-01-01")).toBeNull();
    const table = selectSimpleTariffTable(remote, "TVL_KR", "2026-10-01")!;
    const clone = overlaySimpleTariffPackage(carrier, table, remote);
    expect(clone).not.toBe(carrier);
    expect(clone.sources.some((s) => s.id === table.sourceIds[0])).toBe(true);
    expect(JSON.stringify(carrier)).toBe(before);
  });
  it("selects one complete latest snapshot and refuses ambiguous table periods", () => {
    const newer = structuredClone(carrier);
    newer.versionId = "2027-04-r1";
    newer.validFrom = "2027-04-01";
    newer.validTo = null;
    newer.rules.simpleTariffTables!.tables[0].entries[0].monthlyCents += 100;
    const r = createRuleResolver({
      tariff: [carrier, newer],
      legal: BUNDLED_LEGAL_RULES,
      holiday: BUNDLED_HOLIDAY_RULES,
    });
    expect(r.simpleTariffData!.tables).toBe(newer.rules.simpleTariffTables!.tables);
    const table = r.simpleTariffData!.tables[0];
    expect(() =>
      selectSimpleTariffTable(
        {
          ...r,
          simpleTariffData: {
            ...r.simpleTariffData!,
            tables: [table, table, table, table, table, table],
          },
        },
        table.tariffId,
        table.validFrom,
      ),
    ).toThrow("Mehrdeutige");
  });
});
