import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  validateSavedCaritasOvertime,
  type SavedCaritasOvertime,
} from "@/domain/saved-caritas-overtime";
import {
  validateOvertimeAllocation,
  type SavedOvertimeAllocation,
} from "@/domain/overtime-allocation";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  calculateCaritasDraftOvertimePayoutMonth,
  type CaritasDraftOvertimePayoutInput,
} from "./caritas-care-draft-overtime-payout";
import { history, resolver, shift } from "./remuneration-test-fixtures";

const pkg = JSON.parse(
  readFileSync(
    new URL(
      "../../rules/packages/reviewed/avr-caritas-p-mitte/2026-02-01-draft1.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as RuleTariffPackage;

const regionalPackages = [
  "avr-caritas-p-bw/2026-02-01-draft1.json",
  "avr-caritas-p-bayern/2026-02-01-draft1.json",
  "avr-caritas-p-mitte/2026-02-01-draft1.json",
  "avr-caritas-p-nord/2026-02-01-draft1.json",
  "avr-caritas-p-nrw/2026-02-01-draft1.json",
  "avr-caritas-p-ost/2026-01-draft1.json",
].map(
  (path) =>
    JSON.parse(
      readFileSync(new URL(`../../rules/packages/reviewed/${path}`, import.meta.url), "utf8"),
    ) as RuleTariffPackage,
);

const profile: DatedRemunerationProfile = {
  effectiveFrom: "2026-02-01",
  revision: 1,
  createdAt: "2026-02-01T00:00:00Z",
  updatedAt: "2026-02-01T00:00:00Z",
  data: {
    version: 1,
    weeklyMinutes: 2340,
    selection: {
      kind: "tariff",
      packageId: pkg.packageId,
      variant: "ANLAGE_31",
      region: "MITTE",
      group: "p7",
      level: "5",
      fullTimeWeeklyMinutes: 2340,
    },
  },
};

function fixture(overrides: Partial<CaritasDraftOvertimePayoutInput> = {}) {
  const entry = shift({
    id: "caritas-overtime",
    date: "2026-09-19",
    startTime: "07:00",
    endTime: "09:00",
    overtimeMinutes: 60,
    tariffOvertimeConfirmed: true,
  });
  const allocation = validateOvertimeAllocation({
    shiftId: entry.id,
    shiftRevision: entry.revision,
    timeZone: "Europe/Berlin",
    allocations: [{ date: entry.date, minutes: 60 }],
    revision: 1,
    confirmedAt: "2026-09-20T00:00:00Z",
    updatedAt: "2026-09-20T00:00:00Z",
  });
  const confirmation = validateSavedCaritasOvertime({
    version: 1,
    shiftId: entry.id,
    shiftRevision: entry.revision,
    shiftUpdatedAt: entry.updatedAt,
    timeZone: "Europe/Berlin",
    allocationRevision: allocation.revision,
    profileEffectiveFrom: profile.effectiveFrom,
    profileRevision: profile.revision,
    packageId: pkg.packageId,
    ruleVersionId: pkg.versionId,
    variantId: "ANLAGE_31",
    regionId: "MITTE",
    classification: "CONFIRMED_AVR_OVERTIME",
    classificationCase: "SHIFT_PLAN",
    employerOrderConfirmed: true,
    applicableRuleConfirmed: true,
    workSettlement: "CASH",
    premiumSettlement: "CASH",
    workPayoutMonth: "2026-10",
    premiumPayoutMonth: "2026-11",
    revision: 1,
    confirmedAt: "2026-09-20T00:00:00Z",
    updatedAt: "2026-09-20T00:00:00Z",
  });
  const input: CaritasDraftOvertimePayoutInput = {
    month: "2026-10",
    timeZone: "Europe/Berlin",
    historyComplete: true,
    shifts: [entry],
    allocations: [allocation],
    confirmations: [confirmation],
    profiles: [profile],
    resolver: resolver([pkg]),
    ...overrides,
  };
  return { input, entry, allocation, confirmation };
}

function editedConfirmation(
  value: SavedCaritasOvertime,
  changes: Partial<SavedCaritasOvertime>,
): SavedCaritasOvertime {
  return validateSavedCaritasOvertime({ ...value, ...changes });
}

describe("Caritas candidate overtime in the confirmed payout month", () => {
  it("ignores overtime under another tariff but retains later Caritas payouts after a tariff switch", () => {
    const { input, confirmation } = fixture();
    const prior = shift({
      id: "prior-tvoed-overtime",
      date: "2026-01-19",
      startTime: "07:00",
      endTime: "09:00",
      overtimeMinutes: 60,
      tariffOvertimeConfirmed: true,
    });
    const earlierTariff = history("2026-01-01");
    expect(
      calculateCaritasDraftOvertimePayoutMonth({
        ...input,
        shifts: [prior, ...input.shifts],
        profiles: [earlierTariff, profile],
      }),
    ).toMatchObject({ kind: "draft-confirmed-payouts", cashSubtotalCents: 2358 });
    expect(
      calculateCaritasDraftOvertimePayoutMonth({
        ...input,
        profiles: [profile, history("2026-10-01")],
      }),
    ).toMatchObject({ kind: "draft-confirmed-payouts", cashSubtotalCents: 2358 });
    expect(
      calculateCaritasDraftOvertimePayoutMonth({
        ...input,
        shifts: [prior],
        allocations: [],
        profiles: [earlierTariff, profile],
        confirmations: [editedConfirmation(confirmation, { shiftId: prior.id })],
      }),
    ).toMatchObject({ kind: "unavailable", reason: "CONFIRMATION_MISSING_OR_STALE" });
  });

  it("resolves every supported 2026 regional commission, care annex and subregion", () => {
    const { input, confirmation } = fixture();
    const covered = new Set<string>();
    for (const regionalPkg of regionalPackages) {
      for (const rule of regionalPkg.rules.employmentWorkingTimeRules ?? []) {
        if (rule.validFrom > "2026-09-19" || rule.validTo === null || rule.validTo < "2026-09-19")
          continue;
        covered.add(regionalPkg.packageId);
        const regionalProfile: DatedRemunerationProfile = {
          ...profile,
          data: {
            version: 1,
            weeklyMinutes: rule.fullTimeWeeklyMinutes,
            selection: {
              kind: "tariff",
              packageId: regionalPkg.packageId,
              variant: rule.variantId,
              region: rule.regionId,
              group: "p7",
              level: "5",
              fullTimeWeeklyMinutes: rule.fullTimeWeeklyMinutes,
            },
          },
        };
        const regionalConfirmation = editedConfirmation(confirmation, {
          packageId: regionalPkg.packageId,
          ruleVersionId: regionalPkg.versionId,
          variantId: rule.variantId,
          regionId: rule.regionId,
        });
        const result = calculateCaritasDraftOvertimePayoutMonth({
          ...input,
          profiles: [regionalProfile],
          confirmations: [regionalConfirmation],
          resolver: resolver([regionalPkg]),
        });
        expect(result, `${regionalPkg.packageId}/${rule.variantId}/${rule.regionId}`).toMatchObject(
          {
            kind: "draft-confirmed-payouts",
            status: "estimated",
          },
        );
        if (result.kind === "draft-confirmed-payouts")
          expect(result.cashSubtotalCents).toBeGreaterThan(0);
      }
    }
    expect(covered.size).toBe(6);
  });

  it("pays work and premium in their separate months exactly once", () => {
    const { input } = fixture();
    expect(calculateCaritasDraftOvertimePayoutMonth({ ...input, month: "2026-09" })).toMatchObject({
      kind: "draft-confirmed-payouts",
      cashSubtotalCents: 0,
      positions: [],
    });
    expect(calculateCaritasDraftOvertimePayoutMonth(input)).toMatchObject({
      kind: "draft-confirmed-payouts",
      status: "estimated",
      cashSubtotalCents: 2358,
      positions: [
        {
          workDate: "2026-09-19",
          payoutMonth: "2026-10",
          component: "WORK_HOURS",
          amountCents: 2358,
          sourceIds: expect.arrayContaining(["caritas-avr-text-2026-03"]),
        },
      ],
    });
    expect(calculateCaritasDraftOvertimePayoutMonth({ ...input, month: "2026-11" })).toMatchObject({
      kind: "draft-confirmed-payouts",
      cashSubtotalCents: 655,
      positions: [{ component: "OVERTIME_PREMIUM", amountCents: 655 }],
    });
  });

  it("keeps time settlement out of cash even when work is paid later", () => {
    const { input, confirmation } = fixture();
    const settled = editedConfirmation(confirmation, {
      premiumSettlement: "TIME",
      premiumPayoutMonth: null,
    });
    expect(
      calculateCaritasDraftOvertimePayoutMonth({
        ...input,
        month: "2026-11",
        confirmations: [settled],
      }),
    ).toMatchObject({ kind: "draft-confirmed-payouts", cashSubtotalCents: 0, positions: [] });
  });

  it("uses both local work dates of a cross-midnight shift, not its start month", () => {
    const { input, entry, allocation, confirmation } = fixture();
    const cross = {
      ...entry,
      date: "2026-09-30",
      startTime: "23:00",
      endTime: "01:00",
      overtimeMinutes: 120,
    };
    const split: SavedOvertimeAllocation = validateOvertimeAllocation({
      ...allocation,
      allocations: [
        { date: "2026-09-30", minutes: 60 },
        { date: "2026-10-01", minutes: 60 },
      ],
    });
    const paid = editedConfirmation(confirmation, {
      workPayoutMonth: "2026-11",
      premiumSettlement: "TIME",
      premiumPayoutMonth: null,
    });
    const result = calculateCaritasDraftOvertimePayoutMonth({
      ...input,
      month: "2026-11",
      shifts: [cross],
      allocations: [split],
      confirmations: [paid],
    });
    expect(result).toMatchObject({ kind: "draft-confirmed-payouts", cashSubtotalCents: 4716 });
    if (result.kind !== "draft-confirmed-payouts") return;
    expect(result.positions.map((item) => item.workDate)).toEqual(["2026-09-30", "2026-10-01"]);
    expect(
      calculateCaritasDraftOvertimePayoutMonth({
        ...input,
        month: "2026-09",
        shifts: [cross],
        allocations: [split],
        confirmations: [],
      }),
    ).toMatchObject({ kind: "draft-confirmed-payouts", cashSubtotalCents: 0 });
  });

  it("does not turn incomplete classification, payout timing or history into zero", () => {
    const { input, confirmation } = fixture();
    expect(calculateCaritasDraftOvertimePayoutMonth({ ...input, historyComplete: false })).toEqual({
      kind: "unavailable",
      reason: "HISTORY_INCOMPLETE",
    });
    expect(calculateCaritasDraftOvertimePayoutMonth({ ...input, confirmations: [] })).toMatchObject(
      {
        kind: "unavailable",
        reason: "CONFIRMATION_MISSING_OR_STALE",
      },
    );
    expect(
      calculateCaritasDraftOvertimePayoutMonth({
        ...input,
        confirmations: [editedConfirmation(confirmation, { workPayoutMonth: null })],
      }),
    ).toMatchObject({ kind: "unavailable", reason: "PAYOUT_MONTH_UNKNOWN" });
    expect(calculateCaritasDraftOvertimePayoutMonth({ ...input, allocations: [] })).toMatchObject({
      kind: "unavailable",
      reason: "ALLOCATION_MISSING_OR_STALE",
    });
    expect(
      calculateCaritasDraftOvertimePayoutMonth({
        ...input,
        shifts: [{ ...input.shifts[0], tariffOvertimeConfirmed: false }],
      }),
    ).toMatchObject({ kind: "unavailable", reason: "CONFIRMATION_MISSING_OR_STALE" });
    expect(
      calculateCaritasDraftOvertimePayoutMonth({
        ...input,
        confirmations: [],
        shifts: [{ ...input.shifts[0], tariffOvertimeConfirmed: false }],
      }),
    ).toMatchObject({ kind: "unavailable", reason: "CLASSIFICATION_UNCONFIRMED" });
  });

  it("rejects stale records, changed tariff versions and malformed periods", () => {
    const { input, entry, allocation, confirmation } = fixture();
    expect(
      calculateCaritasDraftOvertimePayoutMonth({
        ...input,
        shifts: [{ ...entry, revision: entry.revision + 1 }],
      }),
    ).toMatchObject({ kind: "unavailable", reason: "ALLOCATION_MISSING_OR_STALE" });
    expect(
      calculateCaritasDraftOvertimePayoutMonth({
        ...input,
        allocations: [{ ...allocation, revision: allocation.revision + 1 }],
      }),
    ).toMatchObject({ kind: "unavailable", reason: "CONFIRMATION_MISSING_OR_STALE" });
    expect(
      calculateCaritasDraftOvertimePayoutMonth({
        ...input,
        profiles: [{ ...profile, revision: profile.revision + 1 }],
      }),
    ).toMatchObject({ kind: "unavailable", reason: "CONFIRMATION_MISSING_OR_STALE" });
    expect(
      calculateCaritasDraftOvertimePayoutMonth({
        ...input,
        confirmations: [editedConfirmation(confirmation, { ruleVersionId: "other" })],
      }),
    ).toMatchObject({ kind: "unavailable", reason: "RULE_PACKAGE_MISSING_OR_CHANGED" });
    expect(calculateCaritasDraftOvertimePayoutMonth({ ...input, month: "2026-13" })).toEqual({
      kind: "unavailable",
      reason: "INVALID_MONTH",
    });
    expect(
      calculateCaritasDraftOvertimePayoutMonth({
        ...input,
        confirmations: [confirmation, confirmation],
      }),
    ).toEqual({ kind: "unavailable", reason: "DUPLICATE_RECORD" });
    expect(calculateCaritasDraftOvertimePayoutMonth({ ...input, shifts: [] })).toEqual({
      kind: "unavailable",
      reason: "ORPHAN_RECORD",
    });
    expect(
      calculateCaritasDraftOvertimePayoutMonth({
        ...input,
        shifts: [{ ...entry, overtimeMinutes: 0 }],
      }),
    ).toMatchObject({ kind: "unavailable", reason: "CONFIRMATION_MISSING_OR_STALE" });
  });
});
