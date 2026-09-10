import { describe, expect, it } from "vitest";

import holiday2026Value from "../../../rules/packages/reviewed/de-holidays/2026.json";
import holiday2027Value from "../../../rules/packages/reviewed/de-holidays/2027.json";
import legalValue from "../../../rules/packages/reviewed/de-arbzg-care/2026-01.json";
import tariffValue from "../../../rules/packages/reviewed/tvoed-vka-bt-k/2026-05.json";
import type { CalendarEntry, ShiftEntry, UserProfile } from "@/domain/types";
import {
  buildAnnualAvailableReportSteps,
  createAnnualAvailableReportCache,
} from "@/features/analysis/annual-core-report";
import type {
  RuleHolidayPackage,
  RuleLegalPackage,
  RuleTariffPackage,
} from "@/rules/contracts.generated";
import { createRuleResolver } from "@/rules/rule-resolver";

const profile: UserProfile = {
  federalState: "NW",
  holidayRegion: "NONE",
  weeklyMinutes: 2_310,
  timeZone: "Europe/Berlin",
  regularRotatingNightWork: false,
  sundayHolidayWorkEligible: true,
  allEmploymentWorkRecorded: true,
  tariff: {
    payGroup: "P8",
    payLevel: 4,
    sector: "BT_K",
    tariffRegion: "OTHER",
    fullTimeWeeklyMinutes: 2_310,
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function shift(id: string, date: string, type: ShiftEntry["type"] = "DAY"): ShiftEntry {
  const absence = type === "VACATION" || type === "SICK" || type === "FREE";
  return {
    kind: "SHIFT",
    id,
    date,
    templateId: null,
    title: id,
    type,
    startTime: absence ? null : "08:00",
    endTime: absence ? null : "16:00",
    breakMinutes: absence ? 0 : 30,
    color: "#207A68",
    symbol: "D",
    note: null,
    overtimeMinutes: 0,
    holidayPremiumMode: "WITH_TIME_OFF",
    revision: 1,
    createdAt: "2027-01-01T00:00:00.000Z",
    updatedAt: "2027-01-01T00:00:00.000Z",
    deletedAt: null,
  };
}

function resolver({
  holiday = true,
  legal = true,
  tariff = true,
}: {
  readonly holiday?: boolean;
  readonly legal?: boolean;
  readonly tariff?: boolean;
}) {
  return createRuleResolver(
    {
      tariff: tariff ? [tariffValue as RuleTariffPackage] : [],
      legal: legal ? [legalValue as RuleLegalPackage] : [],
      holiday: holiday
        ? [holiday2026Value as RuleHolidayPackage, holiday2027Value as RuleHolidayPackage]
        : [holiday2026Value as RuleHolidayPackage],
    },
    { tariff: "tvoed-vka-bt-k", legal: "de-arbzg-care", holiday: "de-holidays" },
  );
}

function build(ruleResolver: ReturnType<typeof resolver>, activeProfile: UserProfile = profile) {
  const entries: readonly CalendarEntry[] = [
    shift("worked", "2027-01-03"),
    shift("vacation", "2027-01-04", "VACATION"),
  ];
  const steps = buildAnnualAvailableReportSteps(
    2027,
    entries,
    activeProfile,
    [],
    { workplaceCoverage: "UNKNOWN", assignment: "UNKNOWN", updatedAt: null },
    "2027-01-31",
    ruleResolver,
  );
  while (true) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

describe("available annual report", () => {
  it("retains category and informational counts for every fully calculated month", () => {
    const report = build(resolver({}));
    for (const month of report.months) {
      expect(month.checkCounts).toBeDefined();
      const { legal, planning } = month.checkCounts!;
      expect(legal.criticalCount + planning.criticalCount).toBe(month.criticalCount);
      expect(legal.warningCount + planning.warningCount).toBe(month.warningCount);
      expect(legal.infoCount + planning.infoCount).toBe(month.infoCount);
    }
  });
  it("yields current core data before touching any rule-bound calculation", () => {
    let core: { actualMinutes: number; entryCount: number } | undefined;
    const rules = resolver({});
    const steps = buildAnnualAvailableReportSteps(
      2027,
      [shift("work", "2027-05-02")],
      profile,
      [],
      { workplaceCoverage: "UNKNOWN", assignment: "UNKNOWN", updatedAt: null },
      "2027-05-03",
      {
        ...rules,
        resolveHoliday: () => {
          throw new Error("not yet");
        },
      },
      {
        onCore: (report) => {
          core = report;
        },
      },
    );
    expect(steps.next()).toEqual({ done: false, value: 0 });
    expect(core).toMatchObject({ actualMinutes: 450, entryCount: 1 });
    expect(() => steps.next()).toThrow("not yet");
  });

  it("recomputes dependency windows after same-revision edits, additions and deletions", () => {
    const rules = resolver({});
    const cache = createAnnualAvailableReportCache();
    const run = (
      entries: readonly CalendarEntry[],
      reuse = true,
      date = "2027-06-01",
      activeProfile = profile,
      activeRules = rules,
    ) => {
      const steps = buildAnnualAvailableReportSteps(
        2027,
        entries,
        activeProfile,
        [],
        { workplaceCoverage: "UNKNOWN", assignment: "UNKNOWN", updatedAt: null },
        date,
        activeRules,
        reuse ? { cache } : {},
      );
      for (;;) {
        const next = steps.next();
        if (next.done) return next.value;
      }
    };
    const initial = [shift("january", "2027-01-03"), shift("may", "2027-05-02")];
    const expected = run(initial);
    const january = { ...cache.get(rules)!.get("2027-01")! };
    const may = { ...cache.get(rules)!.get("2027-05")! };
    const december = { ...cache.get(rules)!.get("2027-12")! };
    const fresh = JSON.parse(JSON.stringify(initial)) as CalendarEntry[];
    expect(run(fresh)).toEqual(expected);
    expect(cache.get(rules)!.get("2027-01")!.compliance!.value).toBe(january.compliance!.value);
    const changed = [initial[0]!, { ...initial[1]!, endTime: "18:00" }];
    expect(run(changed)).toEqual(run(changed, false));
    expect(cache.get(rules)!.get("2027-01")!.summary!.value).toBe(january.summary!.value);
    expect(cache.get(rules)!.get("2027-05")!.summary!.value).not.toBe(may.summary!.value);
    // Legal annual coverage crosses month boundaries; December pay does not depend on May.
    expect(cache.get(rules)!.get("2027-01")!.compliance!.value).not.toBe(january.compliance!.value);
    expect(cache.get(rules)!.get("2027-12")!.pay!.value).toBe(december.pay!.value);
    for (const entries of [
      [...changed, shift("new", "2027-06-01")],
      [changed[0]!, { ...changed[1]!, deletedAt: "2027-06-01T00:00:00Z" }],
      [...initial, shift("boundary", "2026-12-31")],
    ])
      expect(run(entries)).toEqual(run(entries, false));
    for (const activeProfile of [
      { ...profile, weeklyMinutes: 1800 },
      { ...profile, timeZone: "UTC" },
    ]) {
      expect(run(initial, true, "2027-07-01", activeProfile)).toEqual(
        run(initial, false, "2027-07-01", activeProfile),
      );
    }
    const missing = resolver({ holiday: false });
    expect(run(initial, true, "2027-07-01", profile, missing)).toEqual(
      run(initial, false, "2027-07-01", profile, missing),
    );
  });

  it("keeps timed work and absence counts when holiday coverage is missing", () => {
    const report = build(resolver({ holiday: false }));

    expect(report).toMatchObject({
      actualMinutes: 450,
      vacationDays: 1,
      targetMinutes: null,
      balanceMinutes: null,
      worktimeCoverageComplete: false,
      complianceCoverageComplete: false,
    });
  });

  it("keeps holiday worktime and pay independent from missing legal rules", () => {
    const report = build(resolver({ legal: false }));

    expect(report.targetMinutes).not.toBeNull();
    expect(report.worktimeCoverageComplete).toBe(true);
    expect(report.complianceCoverageComplete).toBe(false);
    expect(report.availablePayMonthCount).toBe(3);
  });

  it("keeps worktime and compliance independent from missing tariff rules", () => {
    const report = build(resolver({ tariff: false }));

    expect(report.targetMinutes).not.toBeNull();
    expect(report.worktimeCoverageComplete).toBe(true);
    expect(report.complianceCoverageComplete).toBe(true);
    expect(report.availablePayMonthCount).toBe(0);
  });

  it("keeps a manual monthly gross independent from missing tariff rules", () => {
    const report = build(resolver({ tariff: false }), {
      ...profile,
      tariff: null,
      manualMonthlyGrossCents: 420_000,
    });

    expect(report.availablePayMonthCount).toBe(12);
    expect(report.estimatedGrossAmount).toBe(50_400);
    expect(report.premiumAmount).toBe(0);
    expect(report.overtimeAmount).toBe(0);
    expect(report.allowanceAmount).toBe(0);
  });
});
