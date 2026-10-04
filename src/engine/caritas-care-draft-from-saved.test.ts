import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateSavedShiftTraining, type SavedShiftTraining } from "@/domain/training-data";
import { validateSavedCaritasWorkDay } from "@/domain/saved-caritas-work-day";
import { validateSavedCaritasMonthFacts } from "@/domain/saved-caritas-month-facts";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type { ShiftEntry } from "@/domain/types";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  calculateCaritasCareDraftMonthFromCatalog,
  calculateCaritasCareDraftMonthFromSaved,
  calculateCaritasCareDraftMonthFromPersisted,
  calculateCaritasCareDraftMonthFromStored,
  type CaritasCareDraftSavedMonthInput,
} from "./caritas-care-draft-from-saved";
import { calculateDatedMonthlyRemuneration } from "./remuneration-month";
import { resolver, shift, work } from "./remuneration-test-fixtures";

const pkg = JSON.parse(
  readFileSync(
    new URL(
      "../../rules/packages/reviewed/avr-caritas-p-bw/2026-02-01-draft1.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as RuleTariffPackage;

function pauses(
  parent: ShiftEntry,
  intervals: readonly { start: string; end: string }[],
): SavedShiftTraining {
  return validateSavedShiftTraining({
    shiftId: parent.id,
    shiftRevision: parent.revision,
    shiftDate: parent.date,
    shiftUpdatedAt: parent.updatedAt,
    timeZone: work.timeZone,
    data: { version: 1, pauses: intervals, school: null },
    revision: 1,
    updatedAt: parent.updatedAt,
  });
}

function input(
  shiftEntry: ShiftEntry,
  detail: SavedShiftTraining,
): CaritasCareDraftSavedMonthInput {
  return {
    pkg,
    month: "2026-09",
    variantId: "ANLAGE_31",
    regionId: "BW",
    groupId: "p6",
    stepId: "1",
    weeklyMinutes: 2340,
    fullMonthEmploymentConfirmed: true,
    fullMonthlyBaseEntitlementConfirmed: true,
    fixedAllowanceClaim: "NOT_ENTITLED",
    careAllowanceClaim: "NOT_ENTITLED",
    shiftEntitlements: [
      {
        from: "2026-09-01",
        through: "2026-09-30",
        status: "NONE",
        origin: "confirmed",
        revision: 1,
      },
    ],
    localAgreement: "NONE_CONFIRMED",
    workProfile: work,
    shifts: [shiftEntry],
    pauseDetails: [detail],
    entriesComplete: true,
    dayDecisions: [],
  };
}

function confirmedHoliday(parent: ShiftEntry) {
  return validateSavedCaritasWorkDay({
    shiftId: parent.id,
    date: parent.date,
    shiftRevision: parent.revision,
    shiftDate: parent.date,
    shiftUpdatedAt: parent.updatedAt,
    timeZone: work.timeZone,
    origin: "confirmed",
    holidayTimeOff: false,
    shiftWork: null,
    revision: 1,
    confirmedAt: parent.updatedAt,
    updatedAt: parent.updatedAt,
  });
}

const storedProfile: DatedRemunerationProfile = {
  effectiveFrom: "2026-09-01",
  revision: 1,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  data: {
    version: 1,
    weeklyMinutes: 2340,
    selection: {
      kind: "tariff",
      packageId: pkg.packageId,
      variant: "ANLAGE_31",
      region: "BW",
      group: "p6",
      level: "1",
      fullTimeWeeklyMinutes: 2340,
    },
  },
};

const storedFacts = validateSavedCaritasMonthFacts({
  month: "2026-09",
  profileEffectiveFrom: "2026-09-01",
  profileRevision: 1,
  packageId: pkg.packageId,
  ruleVersionId: pkg.versionId,
  variantId: "ANLAGE_31",
  regionId: "BW",
  fullMonthEmploymentConfirmed: true,
  fullMonthlyBaseEntitlementConfirmed: true,
  fixedAllowanceClaim: "NOT_ENTITLED",
  careAllowanceClaim: "NOT_ENTITLED",
  localAgreement: "NONE_CONFIRMED",
  revision: 1,
  confirmedAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
});

describe("Caritas candidate from stored shifts, pauses and confirmed facts", () => {
  it("derives pay choices and claims from the persisted profile and monthly facts", () => {
    const night = shift({
      date: "2026-09-21",
      startTime: "21:00",
      endTime: "23:00",
      breakMinutes: 30,
    });
    const saved = input(
      night,
      pauses(night, [{ start: "2026-09-21T19:30:00Z", end: "2026-09-21T20:00:00Z" }]),
    );
    const stored = {
      pkg,
      month: saved.month,
      shiftEntitlements: saved.shiftEntitlements,
      workProfile: saved.workProfile,
      shifts: saved.shifts,
      pauseDetails: saved.pauseDetails,
      entriesComplete: saved.entriesComplete,
      workDayConfirmations: [],
      remunerationProfiles: [storedProfile],
      monthFacts: [storedFacts],
    };
    expect(calculateCaritasCareDraftMonthFromStored(stored)).toMatchObject({
      kind: "draft-known-subtotal",
      knownSubtotalCents: 301844,
    });
    const catalogInput = {
      month: stored.month,
      shiftEntitlements: stored.shiftEntitlements,
      workProfile: stored.workProfile,
      shifts: stored.shifts,
      pauseDetails: stored.pauseDetails,
      entriesComplete: stored.entriesComplete,
      workDayConfirmations: stored.workDayConfirmations,
      remunerationProfiles: stored.remunerationProfiles,
      monthFacts: stored.monthFacts,
    };
    expect(
      calculateCaritasCareDraftMonthFromCatalog({ ...catalogInput, resolver: resolver([pkg]) }),
    ).toMatchObject({ kind: "draft-known-subtotal", knownSubtotalCents: 301844 });
    expect(
      calculateCaritasCareDraftMonthFromCatalog({ ...catalogInput, resolver: resolver([]) }),
    ).toMatchObject({
      kind: "unavailable",
      stage: "rule-catalog",
      reason: "RULE_PACKAGE_MISSING",
    });
    expect(
      calculateCaritasCareDraftMonthFromCatalog({
        ...catalogInput,
        resolver: resolver([pkg, structuredClone(pkg)]),
      }),
    ).toMatchObject({
      kind: "unavailable",
      stage: "rule-catalog",
      reason: "RULE_PACKAGE_AMBIGUOUS",
    });
    const invalid = structuredClone(pkg);
    invalid.rules.caritasAnnualPaymentPolicy!.rateBands[0].rateBasisPoints = 7600;
    expect(
      calculateCaritasCareDraftMonthFromCatalog({ ...catalogInput, resolver: resolver([invalid]) }),
    ).toMatchObject({
      kind: "unavailable",
      stage: "rule-catalog",
      reason: "RULE_PACKAGE_INVALID",
    });
    const newer = structuredClone(pkg);
    newer.versionId += "-r2";
    expect(
      calculateCaritasCareDraftMonthFromCatalog({ ...catalogInput, resolver: resolver([newer]) }),
    ).toMatchObject({
      kind: "unavailable",
      stage: "month-facts",
      reason: "MONTH_FACTS_MISSING_OR_STALE",
    });
    expect(
      calculateDatedMonthlyRemuneration({
        month: stored.month,
        shifts: stored.shifts,
        workProfile: work,
        history: stored.remunerationProfiles,
        allowanceEntitlements: [],
        resolver: resolver([pkg]),
      }),
    ).toMatchObject({
      complete: false,
      status: "unavailable",
      estimatedGrossCents: null,
      base: { positions: [{ issue: { code: "TARIFF_UNSUPPORTED" } }] },
    });
    expect(calculateCaritasCareDraftMonthFromStored({ ...stored, monthFacts: [] })).toMatchObject({
      kind: "unavailable",
      stage: "month-facts",
      reason: "MONTH_FACTS_MISSING_OR_STALE",
    });
    expect(
      calculateCaritasCareDraftMonthFromStored({
        ...stored,
        monthFacts: [{ ...storedFacts, fullMonthEmploymentConfirmed: null }],
      }),
    ).toMatchObject({ kind: "unavailable", reason: "EMPLOYMENT_UNKNOWN" });
    expect(
      calculateCaritasCareDraftMonthFromStored({
        ...stored,
        remunerationProfiles: [{ ...storedProfile, revision: 2 }],
      }),
    ).toMatchObject({ kind: "unavailable", reason: "MONTH_FACTS_MISSING_OR_STALE" });
    expect(
      calculateCaritasCareDraftMonthFromStored({
        ...stored,
        remunerationProfiles: [storedProfile, { ...storedProfile, effectiveFrom: "2026-09-15" }],
      }),
    ).toMatchObject({ kind: "unavailable", reason: "PROFILE_MISSING_OR_SPLIT" });
  });
  it("uses the exact saved pause and resolves the ordinary-day night premium", () => {
    const night = shift({
      date: "2026-09-21",
      startTime: "21:00",
      endTime: "23:00",
      breakMinutes: 30,
    });
    const result = calculateCaritasCareDraftMonthFromSaved(
      input(night, pauses(night, [{ start: "2026-09-21T19:30:00Z", end: "2026-09-21T20:00:00Z" }])),
    );
    expect(result).toMatchObject({
      kind: "draft-known-subtotal",
      knownSubtotalCents: 301844,
      positions: [
        { component: "base", amountCents: 301249 },
        { component: "shift-allowance", amountCents: 0 },
        { component: "time-premiums", amountCents: 595 },
      ],
    });
  });

  it("does not silently substitute estimated pauses or holiday compensation", () => {
    const ordinary = shift({ date: "2026-09-21", startTime: "21:00", endTime: "22:00" });
    const saved = input(ordinary, pauses(ordinary, []));
    expect(calculateCaritasCareDraftMonthFromSaved({ ...saved, pauseDetails: [] })).toMatchObject({
      kind: "unavailable",
      stage: "work-slices",
      reason: "PAUSES_MISSING_OR_STALE",
    });
    const christmas = shift({ date: "2026-12-25", startTime: "07:00", endTime: "08:00" });
    const holiday = {
      ...input(christmas, pauses(christmas, [])),
      month: "2026-12",
      shiftEntitlements: [
        {
          from: "2026-12-01",
          through: "2026-12-31",
          status: "NONE" as const,
          origin: "confirmed" as const,
          revision: 1,
        },
      ],
    };
    expect(calculateCaritasCareDraftMonthFromSaved(holiday)).toMatchObject({
      kind: "unavailable",
      stage: "holiday-facts",
      reason: "HOLIDAY_TIME_OFF_UNCONFIRMED",
    });
    expect(
      calculateCaritasCareDraftMonthFromSaved({
        ...holiday,
        dayDecisions: [
          {
            shiftId: christmas.id,
            date: "2026-12-25",
            origin: "confirmed",
            holidayTimeOff: false,
            shiftWork: null,
          },
        ],
      }),
    ).toMatchObject({ kind: "draft-known-subtotal", knownSubtotalCents: 303927 });
  });

  it("keeps unresolved personal allowance entitlement out of a gross-pay claim", () => {
    const ordinary = shift({ date: "2026-09-21", startTime: "21:00", endTime: "22:00" });
    const result = calculateCaritasCareDraftMonthFromSaved({
      ...input(ordinary, pauses(ordinary, [])),
      careAllowanceClaim: "UNKNOWN",
    });
    expect(result).toMatchObject({
      kind: "unavailable",
      stage: "pay",
      reason: "ALLOWANCE_CLAIM_UNKNOWN",
    });
  });

  it("uses a current persisted holiday confirmation instead of a shift default", () => {
    const christmas = shift({ date: "2026-12-25", startTime: "07:00", endTime: "08:00" });
    const persisted = {
      ...input(christmas, pauses(christmas, [])),
      month: "2026-12",
      shiftEntitlements: [
        {
          from: "2026-12-01",
          through: "2026-12-31",
          status: "NONE" as const,
          origin: "confirmed" as const,
          revision: 1,
        },
      ],
      workDayConfirmations: [confirmedHoliday(christmas)],
    };
    expect(calculateCaritasCareDraftMonthFromPersisted(persisted)).toMatchObject({
      kind: "draft-known-subtotal",
      knownSubtotalCents: 303927,
    });
  });

  it("ignores stale shift and timezone confirmations, requiring fresh holiday facts", () => {
    const christmas = shift({ date: "2026-12-25", startTime: "07:00", endTime: "08:00" });
    const edited = {
      ...christmas,
      revision: christmas.revision + 1,
      updatedAt: "2026-12-26T00:00:00Z",
    };
    const persisted = {
      ...input(edited, pauses(edited, [])),
      month: "2026-12",
      shiftEntitlements: [
        {
          from: "2026-12-01",
          through: "2026-12-31",
          status: "NONE" as const,
          origin: "confirmed" as const,
          revision: 1,
        },
      ],
      workDayConfirmations: [confirmedHoliday(christmas)],
    };
    expect(calculateCaritasCareDraftMonthFromPersisted(persisted)).toMatchObject({
      kind: "unavailable",
      stage: "holiday-facts",
      reason: "HOLIDAY_TIME_OFF_UNCONFIRMED",
    });
    const utcPauses = validateSavedShiftTraining({
      ...pauses(christmas, []),
      timeZone: "UTC",
    });
    expect(
      calculateCaritasCareDraftMonthFromPersisted({
        ...persisted,
        shifts: [christmas],
        pauseDetails: [utcPauses],
        workProfile: { ...work, timeZone: "UTC" },
      }),
    ).toMatchObject({
      kind: "unavailable",
      stage: "holiday-facts",
      reason: "HOLIDAY_TIME_OFF_UNCONFIRMED",
    });
  });
});
