import { describe, expect, it } from "vitest";

import holiday2026Value from "../../../rules/packages/reviewed/de-holidays/2026.json";
import holiday2027Value from "../../../rules/packages/reviewed/de-holidays/2027.json";
import legalValue from "../../../rules/packages/reviewed/de-arbzg-care/2026-01.json";
import tariffValue from "../../../rules/packages/reviewed/tvoed-vka-bt-k/2026-05.json";
import type { CalendarEntry, ShiftEntry, UserProfile } from "@/domain/types";
import { buildAnnualAvailableReportSteps } from "@/features/analysis/annual-core-report";
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

function build(ruleResolver: ReturnType<typeof resolver>) {
  const entries: readonly CalendarEntry[] = [
    shift("worked", "2027-01-03"),
    shift("vacation", "2027-01-04", "VACATION"),
  ];
  const steps = buildAnnualAvailableReportSteps(
    2027,
    entries,
    profile,
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
});
