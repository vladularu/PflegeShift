import { describe, expect, it } from "vitest";
import oldValue from "../../rules/packages/reviewed/tvl-kr-tdl/2025-11.json";
import currentValue from "../../rules/packages/reviewed/tvl-kr-tdl/2026-04.json";
import type { DatedAllowanceEntitlement } from "@/domain/remuneration-supplement";
import type { ScopedAllowanceDecision } from "@/domain/remuneration-assessment";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import type { AllowanceStatus } from "@/domain/types";
import { calculateMonthlyDatedAllowances } from "./remuneration-allowances";
import { calculateAssessedMonthlyRemuneration } from "./remuneration-month";
import {
  buildAnnualAvailableReportSteps,
  createAnnualAvailableReportCache,
} from "@/features/analysis/annual-core-report";
import { tvlProfile } from "./tvl-shift-work-test-fixtures";
import { resolver, shift, work } from "./remuneration-test-fixtures";
import {
  allowanceConfirmationPeriods,
  prepareAllowanceConfirmation,
} from "@/features/analysis/allowance-confirmation-model";

const rules = resolver([oldValue, currentValue] as RuleTariffPackage[]);
const settings = {
  workplaceCoverage: "AROUND_THE_CLOCK",
  assignment: "PERMANENT",
  updatedAt: work.updatedAt,
} as const;
const profiles = [{ ...tvlProfile(), effectiveFrom: "2025-11-01" }];
function entitlement(month: string, status: AllowanceStatus): DatedAllowanceEntitlement {
  const last = month === "2026-06" ? "30" : "31";
  return {
    from: month + "-01",
    through: month + "-" + last,
    status,
    origin: "confirmed",
    revision: 1,
  };
}
function run(month: string, status: AllowanceStatus, weekly = 2310) {
  return calculateMonthlyDatedAllowances(
    month,
    [shift({ date: month + "-15", startTime: "08:00", endTime: "16:00" })],
    work,
    profiles.map((p) => ({ ...p, data: { ...p.data, weeklyMinutes: weekly } })),
    [entitlement(month, status)],
    rules,
  ).positions.filter((p) => p.id.startsWith("tvl-shift-allowance:"));
}
describe("confirmed TV-L shift allowances", () => {
  it("matches annual and monthly positions and invalidates a same-revision restored decision", () => {
    const cache = createAnnualAvailableReportCache();
    const annual = (status: AllowanceStatus) => {
      const steps = buildAnnualAvailableReportSteps(
        2026,
        [],
        work,
        [],
        settings,
        "2026-12-31",
        rules,
        {
          cache,
          remuneration: {
            status: "ready",
            profiles,
            shifts: [],
            paidAbsences: [],
            overtimeAllocations: [],
            allowanceDecisions: [
              {
                month: "2026-07",
                revision: 1,
                updatedAt: work.updatedAt,
                decisions: [
                  {
                    from: "2026-07-01",
                    through: "2026-07-31",
                    revision: 1,
                    updatedAt: work.updatedAt,
                    confirmedAt: work.updatedAt,
                    allowanceStatus: status,
                    tariff: { packageId: "tvl-kr-tdl", variant: "SECTION_43", region: "WEST_38_5" },
                  },
                ],
              },
            ],
          },
        },
      );
      for (;;) {
        const next = steps.next();
        if (next.done) return next.value.remuneration!;
      }
    };
    const before = annual("ALTERNATING_MONTHLY");
    expect(before.allowances.knownSubtotalCents).toBe(25000);
    expect(
      before.months
        .find((m) => m.month === "2026-07")
        ?.result?.allowances.positions.filter((p) => p.id.startsWith("tvl-shift-allowance:")),
    ).toEqual(run("2026-07", "ALTERNATING_MONTHLY"));
    expect(annual("NONE").allowances.knownSubtotalCents).toBe(0);
    expect(annual("SHIFT_MONTHLY").allowances.knownSubtotalCents).toBe(10000);
  });
  it.each([
    ["2026-06", "SHIFT_MONTHLY", 6000],
    ["2026-06", "ALTERNATING_MONTHLY", 15000],
    ["2026-06", "SHIFT_HOURLY", 192],
    ["2026-06", "ALTERNATING_HOURLY", 504],
    ["2026-07", "SHIFT_MONTHLY", 10000],
    ["2026-07", "ALTERNATING_MONTHLY", 25000],
    ["2026-07", "SHIFT_HOURLY", 480],
    ["2026-07", "ALTERNATING_HOURLY", 1192],
    ["2025-12", "SHIFT_MONTHLY", 6000],
    ["2025-12", "ALTERNATING_MONTHLY", 15000],
    ["2026-07", "NONE", 0],
  ] as const)("uses %s %s source amounts", (month, status, cents) => {
    const positions = run(month, status);
    expect(positions).toHaveLength(1);
    expect(positions[0].amountCents).toBe(cents);
    expect(positions[0].source.packageId).toBe("tvl-kr-tdl");
  });
  it("reduces monthly part-time amounts but not an already hourly amount", () => {
    expect(run("2026-07", "SHIFT_MONTHLY", 1155)[0].amountCents).toBe(5000);
    expect(run("2026-07", "ALTERNATING_MONTHLY", 1155)[0].amountCents).toBe(12500);
    expect(run("2026-07", "ALTERNATING_HOURLY", 1155)[0].amountCents).toBe(1192);
  });
  it("uses explicit sub-month periods and cent rounding, not daily rounded sums", () => {
    const result = calculateMonthlyDatedAllowances(
      "2026-07",
      [],
      work,
      profiles,
      [{ ...entitlement("2026-07", "ALTERNATING_MONTHLY"), from: "2026-07-17" }],
      rules,
    );
    const positions = result.positions.filter((p) => p.id.startsWith("tvl-shift-allowance:"));
    expect(positions.map((p) => p.amountCents)).toEqual([null, 12097]);
    expect(positions[1].basis).toMatchObject({
      calendarDays: 15,
      monthDays: 31,
      personalMonthlyCents: 25000,
    });
    expect(result.complete).toBe(false);
  });
  it("does not infer a TV-L claim from permanent workplace settings or an estimated entitlement", () => {
    const assessed = calculateAssessedMonthlyRemuneration({
      month: "2026-07",
      shifts: [],
      workProfile: work,
      history: profiles,
      settings,
      resolver: rules,
    });
    expect(assessed.allowanceAssessment.entitlements).toEqual([]);
    const estimated = calculateMonthlyDatedAllowances(
      "2026-07",
      [],
      work,
      profiles,
      [{ ...entitlement("2026-07", "SHIFT_MONTHLY"), origin: "estimated" }],
      rules,
    );
    expect(
      estimated.positions.find((p) => p.id.startsWith("tvl-shift-allowance:"))?.amountCents,
    ).toBeNull();
  });
  it("connects the existing form contract to assessed money, and rejects another tariff", () => {
    const month = "2026-07";
    expect(allowanceConfirmationPeriods(month, profiles, rules)[0]).toMatchObject({
      available: true,
    });
    expect(allowanceConfirmationPeriods(month, profiles, rules)[0].label).toContain("TV-L/KR");
    const input = prepareAllowanceConfirmation({
      month,
      from: month + "-01",
      through: month + "-31",
      status: "ALTERNATING_MONTHLY",
      history: profiles,
      current: { month, revision: 0, updatedAt: null, decisions: [] },
      resolver: rules,
    });
    const decisions: ScopedAllowanceDecision[] = input.decisions.map((d) => ({
      ...d,
      revision: 1,
      confirmedAt: work.updatedAt,
      updatedAt: work.updatedAt,
    }));
    const calculate = (values = decisions) =>
      calculateAssessedMonthlyRemuneration({
        month,
        shifts: [],
        workProfile: work,
        history: profiles,
        settings,
        decisions: values,
        resolver: rules,
      });
    expect(calculate().allowances.knownSubtotalCents).toBe(25000);
    expect(calculate().estimatedGrossCents).toBeNull();
    expect(
      calculate(
        decisions.map((d) => ({ ...d, tariff: { ...d.tariff, packageId: "tvoed-vka-bt-k" } })),
      ).allowanceAssessment.periods[0].issue?.code,
    ).toBe("ALLOWANCE_DECISION_TARIFF_MISMATCH");
    expect(calculate([]).allowances.knownSubtotalCents).toBe(0);
  });
  it("keeps older packages unavailable in the form without mislabelling them own pay", () => {
    const pkg = structuredClone(currentValue) as RuleTariffPackage;
    delete pkg.rules.tvlShiftAllowancePolicy;
    const catalog = resolver([pkg]);
    expect(allowanceConfirmationPeriods("2026-07", profiles, catalog)[0]).toMatchObject({
      available: false,
    });
    expect(allowanceConfirmationPeriods("2026-07", profiles, catalog)[0].label).toContain(
      "TV-L/KR",
    );
    expect(() =>
      prepareAllowanceConfirmation({
        month: "2026-07",
        from: "2026-07-01",
        through: "2026-07-31",
        status: "NONE",
        history: profiles,
        current: { month: "2026-07", revision: 0, updatedAt: null, decisions: [] },
        resolver: catalog,
      }),
    ).toThrow();
  });
  it("counts actual overnight minutes in the relevant allowance month, excluding absences", () => {
    const entry = shift({ date: "2026-06-30", startTime: "23:00", endTime: "01:00" });
    const values = calculateMonthlyDatedAllowances(
      "2026-07",
      [entry, shift({ type: "VACATION" })],
      work,
      profiles,
      [entitlement("2026-07", "ALTERNATING_HOURLY")],
      rules,
    );
    expect(values.positions.find((p) => p.id.startsWith("tvl-shift-allowance:"))?.amountCents).toBe(
      149,
    );
  });
});
