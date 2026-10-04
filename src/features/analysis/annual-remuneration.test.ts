import { describe, expect, it, vi } from "vitest";
import { Temporal } from "@js-temporal/polyfill";
import annexAValue from "../../../rules/packages/reviewed/tvoed-vka-anlage-a/2026-05-01-draft1.json";
import type { MonthlyAllowanceDecisions } from "@/domain/allowance-decisions";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type { SavedOvertimeAllocation } from "@/domain/overtime-allocation";
import { validateSavedShiftTraining } from "@/domain/training-data";
import {
  tvoedAnnexAShiftBinding,
  validateSavedTvoedAnnexAPremiumFacts,
} from "@/domain/saved-tvoed-annex-a-premium-facts";
import { validateSavedTvoedAnnexAMonthConfirmation } from "@/domain/saved-tvoed-annex-a-month-confirmation";
import type { ShiftEntry } from "@/domain/types";
import { history, resolver, shift, work } from "@/engine/remuneration-test-fixtures";
import * as monthly from "@/engine/remuneration-month";
import * as legacy from "@/engine/pay";
import { bundledRuleResolver, type RuleResolver } from "@/rules/rule-resolver";
import { createRuleResolver } from "@/rules/rule-resolver";
import { BUNDLED_HOLIDAY_RULES, BUNDLED_LEGAL_RULES } from "@/rules/bundled-rules";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { summarizeAnnualRemuneration, type AnnualRemunerationInput } from "./annual-remuneration";
import {
  buildAnnualAvailableReportSteps,
  createAnnualAvailableReportCache,
} from "./annual-core-report";

const settings = { workplaceCoverage: "UNKNOWN", assignment: "UNKNOWN", updatedAt: null } as const;
function decisions(): readonly MonthlyAllowanceDecisions[] {
  return Array.from({ length: 12 }, (_, i) => {
    const from = Temporal.PlainDate.from({ year: 2026, month: i + 1, day: 1 });
    return {
      month: from.toString().slice(0, 7),
      revision: 1,
      updatedAt: work.updatedAt,
      decisions: [
        {
          from: from.toString(),
          through: from.with({ day: from.daysInMonth }).toString(),
          allowanceStatus: "NONE",
          tariff: { packageId: "tvoed-vka-bt-k", variant: "BT_K", region: "OTHER" },
          revision: 1,
          confirmedAt: work.updatedAt,
          updatedAt: work.updatedAt,
        },
      ],
    };
  });
}
function input(change: Partial<AnnualRemunerationInput> = {}): AnnualRemunerationInput {
  return {
    status: "ready",
    profiles: [history()],
    allowanceDecisions: decisions(),
    overtimeAllocations: [],
    paidAbsences: [],
    shifts: [],
    ...change,
  };
}
function calculate(
  data = input(),
  rules: RuleResolver = bundledRuleResolver,
  cache = createAnnualAvailableReportCache(),
) {
  const steps = buildAnnualAvailableReportSteps(
    2026,
    data.shifts,
    work,
    [],
    settings,
    "2026-12-31",
    rules,
    { remuneration: data, cache },
  );
  for (;;) {
    const next = steps.next();
    if (next.done) return next.value;
  }
}
function direct(data: AnnualRemunerationInput, month: string, rules = bundledRuleResolver) {
  return monthly.calculateAssessedMonthlyRemuneration({
    month,
    shifts: data.shifts,
    workProfile: work,
    history: data.profiles,
    savedOvertimeAllocations: data.overtimeAllocations,
    paidAbsences: data.paidAbsences,
    settings,
    decisions: data.allowanceDecisions.find((x) => x.month === month)?.decisions,
    resolver: rules,
  });
}
describe("dated annual remuneration", () => {
  it("counts a current Annex A draft premium once and invalidates same-revision fact changes", () => {
    const rules = createRuleResolver({
      tariff: [annexAValue as RuleTariffPackage],
      legal: BUNDLED_LEGAL_RULES,
      holiday: BUNDLED_HOLIDAY_RULES,
    });
    const profile: DatedRemunerationProfile = {
      ...history("2026-05-01"),
      data: {
        version: 1,
        weeklyMinutes: 2340,
        selection: {
          kind: "tariff",
          packageId: "tvoed-vka-anlage-a",
          variant: "BT_K",
          region: "VKA",
          group: "EG9B",
          level: "3",
          fullTimeWeeklyMinutes: 2340,
        },
      },
    };
    const service = shift({
      id: "annex-sunday",
      date: "2026-09-20",
      type: "NIGHT",
      startTime: "21:00",
      endTime: "23:00",
      breakMinutes: 0,
    });
    const common = {
      month: "2026-09",
      profileEffectiveFrom: profile.effectiveFrom,
      profileRevision: profile.revision,
      packageId: "tvoed-vka-anlage-a",
      ruleVersionId: annexAValue.versionId,
      variantId: "BT_K",
      regionId: "VKA",
      groupId: "eg9b",
      stepId: "s3",
      contractedWeeklyMinutes: 2340,
      comparableFullTimeWeeklyMinutes: 2340,
      revision: 1,
      confirmedAt: "2026-09-24T09:00:00.000Z",
      updatedAt: "2026-09-24T09:00:00.000Z",
    } as const;
    const savedConfirmation = validateSavedTvoedAnnexAMonthConfirmation({
      ...common,
      applicabilityConfirmed: true,
      comparableFullTimeConfirmed: true,
      fullMonthBaseEntitlementConfirmed: true,
      fullMonthSameContractConfirmed: true,
    });
    const facts = validateSavedTvoedAnnexAPremiumFacts({
      ...common,
      timeZoneId: work.timeZone,
      cashPaymentConfirmed: true,
      localAgreement: "NONE_CONFIRMED",
      dayDecisions: [
        {
          shiftId: service.id,
          date: service.date,
          origin: "confirmed",
          shiftBinding: tvoedAnnexAShiftBinding(service, work.timeZone),
          workKind: "REGULAR_ACTIVE",
          holidayTimeOff: null,
          shiftWork: null,
          legacyAngestellteClass: null,
        },
      ],
    });
    const pause = validateSavedShiftTraining({
      shiftId: service.id,
      shiftRevision: service.revision,
      shiftDate: service.date,
      shiftUpdatedAt: service.updatedAt,
      timeZone: work.timeZone,
      data: { version: 1, pauses: [], school: null },
      revision: 1,
      updatedAt: service.updatedAt,
    });
    const data = input({
      profiles: [profile],
      shifts: [service],
      allowanceDecisions: [],
      savedAnnexAConfirmations: [savedConfirmation],
      savedAnnexAPremiumFacts: [facts],
      annexAPauseDetails: [pause],
      annexAPauseDetailsComplete: true,
    });
    const cache = createAnnualAvailableReportCache();
    const before = calculate(data, rules, cache).remuneration!;
    expect(before.months[8].result?.timePremiums.knownSubtotalCents).toBe(2232);
    expect(before.timePremiums.knownSubtotalCents).toBe(2232);
    expect(before.estimatedGrossCents).toBeNull();
    const cached = cache.get(rules)!.get("2026-09")!.remuneration!.value;
    const after = calculate(
      { ...data, savedAnnexAPremiumFacts: [{ ...facts, cashPaymentConfirmed: null }] },
      rules,
      cache,
    ).remuneration!;
    expect(after.months[8].result?.timePremiums.knownSubtotalCents).toBe(0);
    expect(after.timePremiums.knownSubtotalCents).toBe(0);
    expect(cache.get(rules)!.get("2026-09")!.remuneration!.value).not.toBe(cached);
  });
  it("recomputes same-revision overtime restores and reuses equal contents without changing work time", () => {
    const service = shift({
      date: "2026-09-30",
      overtimeMinutes: 60,
      tariffOvertimeConfirmed: true,
    });
    const saved: SavedOvertimeAllocation = {
      shiftId: service.id,
      shiftRevision: service.revision,
      timeZone: work.timeZone,
      allocations: [
        { date: "2026-09-30", minutes: 20 },
        { date: "2026-10-01", minutes: 40 },
      ],
      revision: 1,
      confirmedAt: work.updatedAt,
      updatedAt: work.updatedAt,
    };
    const data = input({ shifts: [service], overtimeAllocations: [saved] });
    const cache = createAnnualAvailableReportCache();
    const initial = calculate(data, bundledRuleResolver, cache).remuneration!;
    expect(initial.months[8].result?.overtime.totalCents).toBe(771);
    expect(initial.months[9].result?.overtime.totalCents).toBe(1542);
    expect(initial.overtime.totalCents).toBe(2313);
    const september = cache.get(bundledRuleResolver)!.get("2026-09")!;
    const previous = september.remuneration!.value;
    const worktime = september.summary!.value;
    calculate(
      JSON.parse(JSON.stringify(data)) as AnnualRemunerationInput,
      bundledRuleResolver,
      cache,
    );
    expect(september.remuneration!.value).toBe(previous);
    const changed = input({
      shifts: [service],
      overtimeAllocations: [
        {
          ...saved,
          allocations: [
            { date: "2026-09-30", minutes: 40 },
            { date: "2026-10-01", minutes: 20 },
          ],
        },
      ],
    });
    const after = calculate(changed, bundledRuleResolver, cache).remuneration!;
    expect(after.months[8].result?.overtime.totalCents).toBe(1542);
    expect(after.months[9].result?.overtime.totalCents).toBe(771);
    expect(after.overtime.totalCents).toBe(2313);
    expect(after).toEqual(calculate(changed).remuneration);
    expect(september.remuneration!.value).not.toBe(previous);
    expect(september.summary!.value).toBe(worktime);
    for (const record of [
      { ...saved, allocations: null },
      { ...saved, shiftRevision: 2 },
    ]) {
      const incomplete = calculate(
        { ...data, overtimeAllocations: [record] },
        bundledRuleResolver,
        cache,
      ).remuneration!;
      expect(incomplete.estimatedGrossCents).toBeNull();
      expect(incomplete.overtime.totalCents).toBeNull();
      expect(incomplete.overtime.completeMonthCount).toBe(10);
      expect(incomplete.base.totalCents).toBe(initial.base.totalCents);
    }
  });

  it("includes only the current-year portion of a stored prior-year service", () => {
    const service = shift({
      date: "2025-12-31",
      overtimeMinutes: 60,
      tariffOvertimeConfirmed: true,
    });
    const record: SavedOvertimeAllocation = {
      shiftId: service.id,
      shiftRevision: service.revision,
      timeZone: work.timeZone,
      allocations: [
        { date: "2025-12-31", minutes: 20 },
        { date: "2026-01-01", minutes: 40 },
      ],
      revision: 1,
      confirmedAt: work.updatedAt,
      updatedAt: work.updatedAt,
    };
    const data = input({
      profiles: [history("2025-01-01")],
      shifts: [service],
      overtimeAllocations: [record],
    });
    const report = calculate(data).remuneration!;
    expect(report.overtime.totalCents).toBe(direct(data, "2026-01").overtime.totalCents);
    expect(report.months[0].result?.overtime.positions[0].basis.minutes).toBe(40);
    expect(report.months.slice(1).every((month) => month.result?.overtime.totalCents === 0)).toBe(
      true,
    );
    expect(calculate({ ...data, shifts: [] }).remuneration?.overtime.totalCents).toBe(0);
  });

  it("totals the same twelve monthly results exactly once in integer cents", () => {
    const data = input();
    const report = calculate(data);
    const pay = report.remuneration!;
    expect(pay.completeMonthCount).toBe(12);
    expect(pay.months).toHaveLength(12);
    const expected = pay.months.map((item) => direct(data, item.month));
    expect(pay.months.map((item) => item.result)).toEqual(expected);
    expect(pay.estimatedGrossCents).toBe(
      expected.reduce((total, item) => total + item.estimatedGrossCents!, 0),
    );
    expect(pay.knownSubtotalCents).toBe(pay.estimatedGrossCents);
  });
  it("does not execute the legacy salary engine on the dated path", () => {
    const old = vi.spyOn(legacy, "calculateMonthlyPayEstimate").mockImplementation(() => {
      throw new Error("Legacy salary must not run");
    });
    try {
      expect(calculate().remuneration?.completeMonthCount).toBe(12);
      expect(old).not.toHaveBeenCalled();
    } finally {
      old.mockRestore();
    }
  });
  it("does not present eight supported base months or a missing November payment as a full year", () => {
    const pay = calculate(input(), resolver()).remuneration!;
    expect(pay.base.completeMonthCount).toBe(8);
    expect(pay.completeMonthCount).toBe(7);
    const november = pay.months.find((item) => item.month === "2026-11")!.result!;
    expect(november.base.complete).toBe(true);
    expect(november.annualPayments.complete).toBe(false);
    expect(november.annualPayments.totalCents).toBeNull();
    expect(
      november.annualPayments.positions.some(
        (position) => position.issue?.code === "ANNUAL_INPUT_MISSING",
      ),
    ).toBe(true);
    expect(pay.estimatedGrossCents).toBeNull();
    expect(pay.base.totalCents).toBeNull();
    expect(pay.knownSubtotalCents).toBeGreaterThan(0);
    expect(pay.months[0].result?.base.totalCents).toBeNull();
  });
  it("retains known base and premium components without claiming full gross when allowances are unknown", () => {
    const data = input({ allowanceDecisions: [], shifts: [shift()] });
    const pay = calculate(data).remuneration!;
    expect(pay.completeMonthCount).toBe(0);
    expect(pay.estimatedGrossCents).toBeNull();
    expect(pay.base.completeMonthCount).toBe(12);
    expect(pay.timePremiums.completeMonthCount).toBe(12);
    expect(pay.timePremiums.totalCents).toBeGreaterThan(0);
    expect(pay.knownSubtotalCents).toBeGreaterThan(pay.base.totalCents!);
  });
  it("preserves undated history and own-pay uncertainty instead of borrowing the work profile", () => {
    const undated = calculate(
      input({ profiles: [{ ...history(), effectiveFrom: null }] }),
    ).remuneration!;
    expect(undated.estimatedGrossCents).toBeNull();
    expect(undated.base.totalCents).toBeNull();
    const own: DatedRemunerationProfile = {
      ...history(),
      data: {
        version: 1,
        weeklyMinutes: 1200,
        selection: { kind: "own-monthly", monthlyGrossCents: 234567 },
      },
    };
    const pay = calculate(input({ profiles: [own] }), resolver([])).remuneration!;
    expect(pay.base.totalCents).toBe(234567 * 12);
    expect(pay.estimatedGrossCents).toBeNull();
  });
  it.each(["loading", "error"] as const)(
    "clears cached salary but retains work-time results when the snapshot is %s",
    (status) => {
      const cache = createAnnualAvailableReportCache();
      const data = input({ shifts: [shift()] });
      const before = calculate(data, bundledRuleResolver, cache);
      const after = calculate({ ...data, status }, bundledRuleResolver, cache);
      expect(after.remuneration?.knownSubtotalCents).toBe(0);
      expect(after.remuneration?.estimatedGrossCents).toBeNull();
      expect(after.remuneration?.months.every((item) => item.result === null)).toBe(true);
      expect(after.actualMinutes).toBe(before.actualMinutes);
      expect(after.complianceCoverageComplete).toBe(before.complianceCoverageComplete);
    },
  );
  it("reuses equal snapshot content and invalidates equal-revision profile restores without invalidating work time", () => {
    const cache = createAnnualAvailableReportCache();
    const data = input();
    calculate(data, bundledRuleResolver, cache);
    const september = cache.get(bundledRuleResolver)!.get("2026-09")!;
    const previous = { summary: september.summary!.value, pay: september.remuneration!.value };
    const clone = JSON.parse(JSON.stringify(data)) as AnnualRemunerationInput;
    calculate(clone, bundledRuleResolver, cache);
    expect(september.remuneration!.value).toBe(previous.pay);
    const changed = { ...clone, profiles: [history("2026-01-01", "P6")] };
    const updated = calculate(changed, bundledRuleResolver, cache);
    expect(updated.remuneration).toEqual(calculate(changed).remuneration);
    expect(september.remuneration!.value).not.toBe(previous.pay);
    expect(september.summary!.value).toBe(previous.summary);
  });
  it("invalidates the specific allowance month even when its revision did not change", () => {
    const cache = createAnnualAvailableReportCache();
    const data = input();
    calculate(data, bundledRuleResolver, cache);
    const original = cache.get(bundledRuleResolver)!.get("2026-09")!.remuneration!.value;
    const unaffected = cache.get(bundledRuleResolver)!.get("2026-08")!.remuneration!.value;
    const changed = input({
      allowanceDecisions: data.allowanceDecisions.filter((item) => item.month !== "2026-09"),
    });
    calculate(changed, bundledRuleResolver, cache);
    expect(cache.get(bundledRuleResolver)!.get("2026-09")!.remuneration!.value).not.toBe(original);
    expect(cache.get(bundledRuleResolver)!.get("2026-08")!.remuneration!.value).toBe(unaffected);
  });
  it("handles tariff changes and replacement catalogs without borrowing prior rules", () => {
    const cache = createAnnualAvailableReportCache();
    const data = input({ profiles: [history(), history("2026-09-16", "P6")] });
    expect(calculate(data, bundledRuleResolver, cache).remuneration).toEqual(
      calculate(data).remuneration,
    );
    const missing = resolver([]);
    const pay = calculate(data, missing, cache).remuneration!;
    expect(pay.estimatedGrossCents).toBeNull();
    expect(pay.base.totalCents).toBeNull();
  });
  it("retains previous-year carry-in shifts and recomputes after deletions", () => {
    const shifts: readonly ShiftEntry[] = [shift({ date: "2025-12-31" }), shift()];
    const cache = createAnnualAvailableReportCache();
    const before = calculate(input({ shifts }), bundledRuleResolver, cache).remuneration!;
    expect(before.months[0].result?.timePremiums.totalCents).toBeGreaterThan(0);
    const data = input({ shifts: [shifts[1]] });
    const after = calculate(data, bundledRuleResolver, cache).remuneration!;
    expect(after).toEqual(calculate(data).remuneration);
    expect(after.months[0].result?.timePremiums.totalCents).toBe(0);
  });
  it("rejects duplicate, mismatched and out-of-year monthly aggregates", () => {
    const row = { month: "2026-09", result: direct(input(), "2026-09") };
    expect(() => summarizeAnnualRemuneration(2026, "ready", [row, row])).toThrow("Doppelter");
    expect(() =>
      summarizeAnnualRemuneration(2026, "ready", [{ ...row, month: "2025-09" }]),
    ).toThrow("außerhalb");
    expect(() =>
      summarizeAnnualRemuneration(2026, "ready", [{ ...row, month: "2026-08" }]),
    ).toThrow("Abweichender");
    const partial = summarizeAnnualRemuneration(2026, "ready", [row]);
    expect(partial.completeMonthCount).toBe(1);
    expect(partial.estimatedGrossCents).toBeNull();
  });
});
