import { describe, expect, it, vi } from "vitest";
import type { OwnRemunerationConfiguration } from "@/domain/own-remuneration";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import { ownRemunerationFixture } from "@/domain/own-remuneration-test-fixtures";
import { remunerationBasis } from "@/features/salary/remuneration-presentation";
import {
  buildAnnualAvailableReportSteps,
  createAnnualAvailableReportCache,
} from "@/features/analysis/annual-core-report";
import { calculateAssessedMonthlyRemuneration } from "./remuneration-month";
import { calculateMonthlyBaseRemuneration } from "./remuneration-base";
import { resolveRemunerationMonth } from "./remuneration-context";
import { history, resolver, shift, work } from "./remuneration-test-fixtures";

const config: OwnRemunerationConfiguration = {
  base: { kind: "monthly", personalCents: 200000, partialMonth: "unconfirmed" },
  percentageBasisHourlyCents: null,
  timePremiums: null,
  overtime: null,
  fixedAllowances: [],
  specialPayments: [],
};
function own(
  configuration = config,
  date = "2026-01-01",
  weeklyMinutes = 1155,
): DatedRemunerationProfile {
  return {
    ...history(date),
    data: { version: 2, weeklyMinutes, selection: { kind: "own-configured", configuration } },
  };
}
const fixed = {
  id: "personal",
  title: "Zusatzaufgabe",
  monthlyCents: 10001,
  partialMonth: "calendar-days" as const,
  validFrom: "2020-01-01",
  validTo: null,
};
function monthly(profiles = [own()], month = "2026-09", shifts = [shift()]) {
  return calculateAssessedMonthlyRemuneration({
    month,
    shifts,
    history: profiles,
    workProfile: work,
    resolver: resolver([]),
    settings: { workplaceCoverage: "UNKNOWN", assignment: "UNKNOWN", updatedAt: null },
  });
}

describe("own monthly pay and personal fixed allowances", () => {
  it("feeds all twelve annual months and invalidates same-revision restored personal amounts", () => {
    const cache = createAnnualAvailableReportCache();
    const rules = resolver([]);
    function annual(configuration: OwnRemunerationConfiguration) {
      const steps = buildAnnualAvailableReportSteps(
        2026,
        [],
        work,
        [],
        { workplaceCoverage: "UNKNOWN", assignment: "UNKNOWN", updatedAt: null },
        "2026-12-31",
        rules,
        {
          cache,
          remuneration: {
            status: "ready",
            profiles: [own(configuration)],
            allowanceDecisions: [],
            overtimeAllocations: [],
            paidAbsences: [],
            shifts: [],
          },
        },
      );
      for (;;) {
        const next = steps.next();
        if (next.done) return next.value.remuneration!;
      }
    }
    const initial = annual({ ...config, fixedAllowances: [fixed] });
    expect(initial.completeMonthCount).toBe(12);
    expect(initial.base.totalCents).toBe(2400000);
    expect(initial.allowances.totalCents).toBe(120012);
    expect(initial.estimatedGrossCents).toBe(2520012);
    const restored = annual({ ...config, fixedAllowances: [{ ...fixed, monthlyCents: 15001 }] });
    expect(restored.estimatedGrossCents).toBe(2580012);
    expect(restored.months.every((month) => month.result?.allowances.totalCents === 15001)).toBe(
      true,
    );
  });
  it.each([60, 1155, 2310, 4800])(
    "never applies a second part-time factor at %i weekly minutes",
    (minutes) => {
      const result = monthly([own({ ...config, fixedAllowances: [fixed] }, undefined, minutes)]);
      expect(result.complete).toBe(true);
      expect(result.base.totalCents).toBe(200000);
      expect(result.allowances.totalCents).toBe(10001);
      expect(result.estimatedGrossCents).toBe(210001);
      expect(
        result.positions.every(
          (line) => line.source.kind === "profile" && line.source.packageId === null,
        ),
      ).toBe(true);
      expect(result.allowanceAssessment.periods[0].issue?.code).toBe("OWN_ASSESSMENT_UNSUPPORTED");
    },
  );
  it("groups all days of the same configured profile without any tariff lookup", () => {
    const existing = resolver([]);
    const lookup = vi.fn(existing.resolveTariff);
    const catalog = { ...existing, resolveTariff: lookup };
    const periods = resolveRemunerationMonth("2026-09", [own()], catalog);
    expect(periods).toHaveLength(1);
    expect(periods[0]).toMatchObject({
      from: "2026-09-01",
      through: "2026-09-30",
      context: { kind: "own-configured" },
    });
    expect(lookup).not.toHaveBeenCalled();
  });
  it("keeps a confirmed personal monthly amount even with no worked shifts", () => {
    expect(monthly([own()], "2026-09", []).estimatedGrossCents).toBe(200000);
  });
  it("leaves an unconfirmed partial month unknown instead of using the TVöD divisor", () => {
    const result = monthly([own(config, "2026-09-16")]);
    expect(result.base.positions[0].issue?.code).toBe("PROFILE_MISSING");
    expect(result.base.positions[1].issue?.code).toBe("OWN_PRORATION_UNCONFIRMED");
    expect(result.base.totalCents).toBeNull();
    expect(result.estimatedGrossCents).toBeNull();
  });
  it("calculates two explicitly confirmed personal pay periods independently", () => {
    const first = own({
      ...config,
      base: { kind: "monthly", personalCents: 200001, partialMonth: "calendar-days" },
    });
    const second = own(
      {
        ...config,
        base: { kind: "monthly", personalCents: 300001, partialMonth: "calendar-days" },
      },
      "2026-09-16",
    );
    const result = monthly([first, second]);
    expect(result.base.positions.map((p) => p.amountCents)).toEqual([100001, 150001]);
    expect(result.estimatedGrossCents).toBe(250002);
    expect(result.base.positions.map((p) => p.source.profileEffectiveFrom)).toEqual([
      "2026-01-01",
      "2026-09-16",
    ]);
  });
  it("uses actual leap-month calendar days and rounds once per allowance period", () => {
    const result = monthly(
      [
        own(
          {
            ...config,
            fixedAllowances: [{ ...fixed, validFrom: "2024-02-15", validTo: "2024-02-29" }],
          },
          "2024-01-01",
        ),
      ],
      "2024-02",
      [],
    );
    // 10001 cents * 15 / 29 = 5172.931... cents.
    expect(result.allowances.totalCents).toBe(5173);
    expect(result.allowances.positions).toHaveLength(1);
    expect(result.allowances.positions[0].basis).toMatchObject({
      calendarDays: 15,
      monthDays: 29,
      proration: "calendar-days",
    });
  });
  it("leaves a partial allowance unknown and renders that uncertainty accurately", () => {
    const result = monthly([
      own({
        ...config,
        fixedAllowances: [{ ...fixed, validFrom: "2026-09-16", partialMonth: "unconfirmed" }],
      }),
    ]);
    const line = result.allowances.positions[0];
    expect(line).toMatchObject({
      amountCents: null,
      issue: { code: "OWN_PRORATION_UNCONFIRMED" },
      basis: { proration: "unconfirmed" },
    });
    expect(remunerationBasis(line)).toContain("Zeitanteil noch nicht bestätigt.");
    expect(result.knownSubtotalCents).toBe(200000);
    expect(result.estimatedGrossCents).toBeNull();
  });
  it("pays an unconfirmed-proration allowance in full when its entire month is covered", () => {
    expect(
      monthly([own({ ...config, fixedAllowances: [{ ...fixed, partialMonth: "unconfirmed" }] })])
        .allowances.totalCents,
    ).toBe(10001);
  });
  it("intersects allowance validity with the active profile period", () => {
    const configured = { ...config, fixedAllowances: [fixed] };
    const result = monthly([own(configured), own(config, "2026-09-16")]);
    expect(result.allowances.totalCents).toBe(5001);
    expect(result.allowances.positions[0]).toMatchObject({
      from: "2026-09-01",
      through: "2026-09-15",
    });
  });
  it("ignores expired and future allowances but preserves an explicit zero position", () => {
    const result = monthly([
      own({
        ...config,
        fixedAllowances: [
          { ...fixed, id: "past", validTo: "2026-08-31" },
          { ...fixed, id: "future", validFrom: "2026-10-01" },
          { ...fixed, id: "zero", monthlyCents: 0 },
        ],
      }),
    ]);
    expect(result.allowances.positions).toHaveLength(1);
    expect(result.allowances.positions[0]).toMatchObject({
      amountCents: 0,
      basis: { ruleId: "zero" },
    });
    expect(result.estimatedGrossCents).toBe(200000);
  });
  it("keeps multiple personal allowances distinct without a tariff precedence rule", () => {
    const result = monthly([
      own({ ...config, fixedAllowances: [fixed, { ...fixed, id: "second", monthlyCents: 12345 }] }),
    ]);
    expect(result.allowances.totalCents).toBe(22346);
    expect(new Set(result.positions.map((p) => p.id)).size).toBe(result.positions.length);
  });
  it("does not silently treat an hourly profile as a monthly one", () => {
    const result = monthly([own({ ...config, base: { kind: "hourly", centsPerHour: 2500 } })]);
    expect(result.base.totalCents).toBe(5000);
    expect(result.base.positions[0].basis.hourly).toMatchObject({
      rateCents: 2500,
      paidMinutes: 120,
    });
  });
  it("does not claim positive percentage premiums are zero when their basis is missing", () => {
    const result = monthly([
      own({ ...config, timePremiums: ownRemunerationFixture().timePremiums }),
    ]);
    expect(result.timePremiums.totalCents).toBeNull();
    expect(result.estimatedGrossCents).toBeNull();
  });
  it("keeps explicitly confirmed overtime unavailable without personal payout parameters", () => {
    const result = monthly([own()], "2026-09", [
      shift({
        overtimeMinutes: 60,
        tariffOvertimeConfirmed: true,
        startTime: "08:00",
        endTime: "10:00",
      }),
    ]);
    expect(result.overtime.totalCents).toBeNull();
    expect(result.estimatedGrossCents).toBeNull();
  });
  it("includes an own special payment only within its valid payout month", () => {
    const configured = { ...config, specialPayments: ownRemunerationFixture().specialPayments };
    expect(monthly([own(configured)], "2026-09", []).estimatedGrossCents).toBe(200000);
    const november = monthly([own(configured)], "2026-11", []);
    expect(november.annualPayments.totalCents).toBe(75000);
    expect(november.estimatedGrossCents).toBe(275000);
    const expired = {
      ...configured,
      specialPayments: configured.specialPayments.map((p) => ({ ...p, validTo: "2026-10-31" })),
    };
    expect(monthly([own(expired)], "2026-11", []).estimatedGrossCents).toBe(200000);
  });
  it("leaves legacy monthly amounts and unconfirmed partial months unchanged", () => {
    const legacy: DatedRemunerationProfile = {
      ...history(),
      data: {
        version: 1,
        weeklyMinutes: 1155,
        selection: { kind: "own-monthly", monthlyGrossCents: 190000 },
      },
    };
    expect(calculateMonthlyBaseRemuneration("2026-09", [legacy]).totalCents).toBe(190000);
    const mixed = calculateMonthlyBaseRemuneration("2026-09", [legacy, own(config, "2026-09-16")]);
    expect(mixed.positions.map((p) => p.issue?.code)).toEqual([
      "OWN_PRORATION_UNCONFIRMED",
      "OWN_PRORATION_UNCONFIRMED",
    ]);
  });
});
