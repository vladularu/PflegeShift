import { describe, expect, it } from "vitest";
import { history, shift as createShift } from "@/engine/remuneration-test-fixtures";
import type { DatedRemunerationProfile } from "./remuneration-profile";
import { validateOvertimeAllocation } from "./overtime-allocation";
import { isCurrentCaritasWorkDay, validateSavedCaritasWorkDay } from "./saved-caritas-work-day";
import {
  isCurrentCaritasMonthFacts,
  validateSavedCaritasMonthFacts,
} from "./saved-caritas-month-facts";
import { isCurrentCaritasOvertime, validateSavedCaritasOvertime } from "./saved-caritas-overtime";

const stamp = "2026-09-23T12:00:00Z";
const shift = createShift({
  date: "2026-09-19",
  startTime: "07:00",
  endTime: "15:00",
  overtimeMinutes: 60,
  tariffOvertimeConfirmed: true,
  updatedAt: stamp,
});
const profile: DatedRemunerationProfile = {
  ...history("2026-09-01"),
  data: {
    version: 1,
    weeklyMinutes: 2340,
    selection: {
      kind: "tariff",
      packageId: "avr-caritas-p-mitte",
      variant: "ANLAGE_31",
      region: "MITTE",
      group: "p7",
      level: "5",
      fullTimeWeeklyMinutes: 2340,
    },
  },
};
const allocation = validateOvertimeAllocation({
  shiftId: shift.id,
  shiftRevision: shift.revision,
  timeZone: "Europe/Berlin",
  allocations: [{ date: shift.date, minutes: 60 }],
  revision: 1,
  confirmedAt: stamp,
  updatedAt: stamp,
});
const workDay = validateSavedCaritasWorkDay({
  shiftId: shift.id,
  date: shift.date,
  shiftDate: shift.date,
  shiftRevision: shift.revision,
  shiftUpdatedAt: stamp,
  timeZone: "Europe/Berlin",
  origin: "confirmed",
  holidayTimeOff: null,
  shiftWork: null,
  revision: 1,
  confirmedAt: stamp,
  updatedAt: stamp,
});
const month = validateSavedCaritasMonthFacts({
  month: "2026-09",
  profileEffectiveFrom: profile.effectiveFrom,
  profileRevision: profile.revision,
  packageId: "avr-caritas-p-mitte",
  ruleVersionId: "2026-02-01-draft1",
  variantId: "ANLAGE_31",
  regionId: "MITTE",
  fullMonthEmploymentConfirmed: null,
  fullMonthlyBaseEntitlementConfirmed: false,
  fixedAllowanceClaim: "NOT_ENTITLED",
  careAllowanceClaim: "UNKNOWN",
  localAgreement: "UNKNOWN",
  revision: 1,
  confirmedAt: stamp,
  updatedAt: stamp,
});
const overtime = validateSavedCaritasOvertime({
  version: 1,
  shiftId: shift.id,
  shiftRevision: shift.revision,
  shiftUpdatedAt: stamp,
  timeZone: "Europe/Berlin",
  allocationRevision: allocation.revision,
  profileEffectiveFrom: profile.effectiveFrom,
  profileRevision: profile.revision,
  packageId: month.packageId,
  ruleVersionId: month.ruleVersionId,
  variantId: month.variantId,
  regionId: month.regionId,
  classification: "CONFIRMED_AVR_OVERTIME",
  classificationCase: "SHIFT_PLAN",
  employerOrderConfirmed: true,
  applicableRuleConfirmed: true,
  workSettlement: "CASH",
  premiumSettlement: "TIME",
  workPayoutMonth: null,
  premiumPayoutMonth: null,
  revision: 1,
  confirmedAt: stamp,
  updatedAt: stamp,
});

describe("saved Caritas confirmation boundaries", () => {
  it.each([true, false, null])(
    "keeps an explicit daily answer %s without deriving entitlement",
    (answer) => {
      const saved = validateSavedCaritasWorkDay({
        ...workDay,
        holidayTimeOff: answer,
        shiftWork: answer,
      });
      expect(saved.holidayTimeOff).toBe(answer);
      expect(saved.shiftWork).toBe(answer);
      expect(Object.isFrozen(saved)).toBe(true);
    },
  );

  it.each(["UNKNOWN", "NOT_ENTITLED", "ENTITLED"])(
    "preserves monthly claim %s and independent unknown answers",
    (claim) => {
      const saved = validateSavedCaritasMonthFacts({ ...month, careAllowanceClaim: claim });
      expect(saved.careAllowanceClaim).toBe(claim);
      expect(saved.fullMonthEmploymentConfirmed).toBeNull();
      expect(saved.fullMonthlyBaseEntitlementConfirmed).toBe(false);
      expect(saved.fixedAllowanceClaim).toBe("NOT_ENTITLED");
      expect(Object.isFrozen(saved)).toBe(true);
    },
  );

  it("rejects unexpected data, missing bindings and reversed confirmation times", () => {
    for (const [saved, validate] of [
      [workDay, validateSavedCaritasWorkDay],
      [month, validateSavedCaritasMonthFacts],
      [overtime, validateSavedCaritasOvertime],
    ] as const) {
      expect(() => validate({ ...saved, extra: true })).toThrow();
      const missing: Record<string, unknown> = { ...saved };
      delete missing.revision;
      expect(() => validate(missing)).toThrow();
      expect(() => validate({ ...saved, confirmedAt: "2026-09-24T00:00:00Z" })).toThrow();
    }
    expect(() => validateSavedCaritasOvertime({ ...overtime, version: 2 })).toThrow();
  });

  it("rejects impossible dates and offset-only or unknown timezones", () => {
    expect(() => validateSavedCaritasWorkDay({ ...workDay, date: "2026-02-30" })).toThrow();
    expect(() => validateSavedCaritasMonthFacts({ ...month, month: "2026-13" })).toThrow();
    for (const timeZone of ["+02:00", "Unknown/Place"]) {
      expect(() => validateSavedCaritasWorkDay({ ...workDay, timeZone })).toThrow();
      expect(() => validateSavedCaritasOvertime({ ...overtime, timeZone })).toThrow();
    }
  });

  it("invalidates daily facts when their service changes or is deleted", () => {
    expect(isCurrentCaritasWorkDay(workDay, shift, "Europe/Berlin")).toBe(true);
    for (const changed of [
      { ...shift, revision: shift.revision + 1 },
      { ...shift, date: "2026-09-20" },
      { ...shift, updatedAt: "2026-09-24T00:00:00Z" },
      { ...shift, deletedAt: stamp },
      { ...shift, type: "SICK" as const },
    ])
      expect(isCurrentCaritasWorkDay(workDay, changed, "Europe/Berlin")).toBe(false);
    expect(isCurrentCaritasWorkDay(workDay, shift, "UTC")).toBe(false);
  });

  it("binds monthly facts to the exact profile, tariff variant, region and rule version", () => {
    const current = (saved = month, selected = profile, ruleVersion = month.ruleVersionId) =>
      isCurrentCaritasMonthFacts(saved, selected, month.packageId, ruleVersion);
    expect(current()).toBe(true);
    expect(current(month, { ...profile, revision: profile.revision + 1 })).toBe(false);
    expect(current(month, { ...profile, effectiveFrom: "2026-08-01" })).toBe(false);
    expect(current(month, profile, "2027-01-01-draft1")).toBe(false);
    for (const change of [
      { packageId: "avr-caritas-p-bw" },
      { variantId: "ANLAGE_32" },
      { regionId: "BW" },
    ])
      expect(current(validateSavedCaritasMonthFacts({ ...month, ...change }))).toBe(false);
    expect(
      current(month, {
        ...profile,
        data: {
          version: 1,
          weeklyMinutes: 2340,
          selection: { kind: "own-monthly", monthlyGrossCents: 350000 },
        },
      }),
    ).toBe(false);
  });

  it.each(["STANDARD_WEEK", "WORK_CORRIDOR", "DAILY_FRAME", "SHIFT_PLAN"])(
    "retains externally confirmed classification %s",
    (classificationCase) => {
      const saved = validateSavedCaritasOvertime({ ...overtime, classificationCase });
      expect(saved.classificationCase).toBe(classificationCase);
      expect(Object.isFrozen(saved)).toBe(true);
    },
  );

  it("preserves separate cash and time settlement with unknown cash timing", () => {
    expect(overtime.workSettlement).toBe("CASH");
    expect(overtime.workPayoutMonth).toBeNull();
    expect(overtime.premiumSettlement).toBe("TIME");
    const cashPremium = validateSavedCaritasOvertime({
      ...overtime,
      premiumSettlement: "CASH",
      premiumPayoutMonth: "2026-11",
    });
    expect(cashPremium.premiumPayoutMonth).toBe("2026-11");
    expect(cashPremium.workPayoutMonth).toBeNull();
  });

  it("rejects unconfirmed classification and payout months for time settlement", () => {
    for (const change of [
      { employerOrderConfirmed: false },
      { applicableRuleConfirmed: false },
      { classification: "INFERRED" },
      { premiumPayoutMonth: "2026-11" },
      { workPayoutMonth: "2026-13" },
    ])
      expect(() => validateSavedCaritasOvertime({ ...overtime, ...change })).toThrow();
  });

  it("invalidates overtime when allocation, service, profile or rule confirmation becomes stale", () => {
    const current = (
      service = shift,
      allocated = allocation,
      selected = profile,
      ruleVersion = overtime.ruleVersionId,
    ) =>
      isCurrentCaritasOvertime(
        overtime,
        service,
        allocated,
        selected,
        ruleVersion,
        "Europe/Berlin",
      );
    expect(current()).toBe(true);
    expect(current(shift, { ...allocation, revision: allocation.revision + 1 })).toBe(false);
    expect(current(shift, { ...allocation, allocations: null })).toBe(false);
    expect(current({ ...shift, tariffOvertimeConfirmed: false })).toBe(false);
    expect(current({ ...shift, deletedAt: stamp })).toBe(false);
    expect(current({ ...shift, revision: shift.revision + 1 })).toBe(false);
    expect(current(shift, allocation, { ...profile, revision: profile.revision + 1 })).toBe(false);
    expect(current(shift, allocation, profile, "2027-01-01-draft1")).toBe(false);
  });
});
