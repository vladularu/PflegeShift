import { describe, expect, it } from "vitest";
import { validateOvertimeAllocation, isCurrentOvertimeAllocation } from "./overtime-allocation";
import {
  validateSavedActualOwnAnnualPayment,
  validateSavedActualOwnAnnualPayments,
  activeActualOwnAnnualPayments,
} from "./saved-annual-payment";
import {
  validateSavedTariffAnnualClaim,
  validateSavedTariffAnnualClaims,
  validateActualTariffAnnualPayment,
} from "./saved-tariff-annual-claim";
import { validateScopedAllowanceDecisions } from "./allowance-decisions";
import { ALLOWANCE_STATUSES } from "./types";
import { shift, work, tariffAnnualFixture } from "./confirmation-test-fixtures";

const instant = "2026-09-22T00:00:00Z";
const overtime = {
  shiftId: "shift",
  shiftRevision: 1,
  timeZone: work.timeZone,
  allocations: [{ date: "2026-09-15", minutes: 15 }],
  revision: 1,
  confirmedAt: instant,
  updatedAt: instant,
};
const payment = {
  version: 1,
  paymentId: "bonus",
  entitlementYear: 2026,
  payoutMonth: "2027-01",
  title: "Sonderzahlung",
  grossCents: 0,
  revision: 1,
};

describe("saved remuneration confirmations", () => {
  it("preserves explicit overtime revocation and returns detached frozen day allocations", () => {
    const raw = {
      ...overtime,
      allocations: [
        { date: "2026-09-16", minutes: 0 },
        { date: "2026-09-15", minutes: 15 },
      ],
    };
    const result = validateOvertimeAllocation(raw);
    raw.allocations[1].minutes = 500;
    expect(result.allocations).toEqual([
      { date: "2026-09-15", minutes: 15 },
      { date: "2026-09-16", minutes: 0 },
    ]);
    expect(Object.isFrozen(result.allocations![0])).toBe(true);
    expect(validateOvertimeAllocation({ ...overtime, allocations: null }).allocations).toBeNull();
  });
  it.each([
    { allocations: [] },
    { allocations: [{ date: "2026-09-15", minutes: 0 }] },
    {
      allocations: [
        { date: "2026-09-15", minutes: 1 },
        { date: "2026-09-15", minutes: 2 },
      ],
    },
    { allocations: [{ date: "2026-02-30", minutes: 1 }] },
    { allocations: [{ date: "2026-09-15", minutes: -1 }] },
    { allocations: [{ date: "2026-09-15", minutes: 1501 }] },
    { allocations: [{ date: "2026-09-15", minutes: 1.5 }] },
    { allocations: [{ date: "2026-09-15", minutes: 1, inferred: true }] },
    { revision: 0 },
    { shiftRevision: Number.MAX_SAFE_INTEGER + 1 },
    { timeZone: "+01:00" },
    { confirmedAt: "2026-09-23T00:00:00Z" },
    { extra: true },
  ])("rejects invalid overtime confirmation %#", (change) => {
    expect(() => validateOvertimeAllocation({ ...overtime, ...change })).toThrow();
  });
  it("requires reconfirmation after shift revision, zone, deletion or confirmed-hours changes", () => {
    const value = validateOvertimeAllocation(overtime);
    const entry = shift({ overtimeMinutes: 15, tariffOvertimeConfirmed: true });
    expect(isCurrentOvertimeAllocation(value, entry, work.timeZone)).toBe(true);
    for (const change of [
      { revision: 2 },
      { id: "other" },
      { deletedAt: instant },
      { tariffOvertimeConfirmed: false },
      { overtimeMinutes: 0 },
    ]) {
      expect(isCurrentOvertimeAllocation(value, { ...entry, ...change }, work.timeZone)).toBe(
        false,
      );
    }
    expect(isCurrentOvertimeAllocation(value, entry, "UTC")).toBe(false);
    expect(
      isCurrentOvertimeAllocation(
        validateOvertimeAllocation({ ...overtime, allocations: null }),
        entry,
        work.timeZone,
      ),
    ).toBe(false);
  });
  it("keeps actual zero payout, entitlement year and revocation separate", () => {
    const current = validateSavedActualOwnAnnualPayment({
      payment,
      revoked: false,
      updatedAt: instant,
    });
    const withdrawn = validateSavedActualOwnAnnualPayment({
      payment: { ...payment, entitlementYear: 2025 },
      revoked: true,
      updatedAt: instant,
    });
    expect(current.payment.grossCents).toBe(0);
    expect(current.payment.entitlementYear).toBe(2026);
    expect(current.payment.payoutMonth).toBe("2027-01");
    expect(activeActualOwnAnnualPayments([current, withdrawn])).toEqual([payment]);
    expect(Object.isFrozen(current)).toBe(true);
    expect(() =>
      validateSavedActualOwnAnnualPayments([current, { ...current, revoked: true }]),
    ).toThrow();
  });
  it.each([
    { revoked: null },
    { updatedAt: "invalid" },
    { extra: true },
    { payment: { ...payment, grossCents: -1 } },
  ])("rejects malformed actual own payment %#", (change) => {
    expect(() =>
      validateSavedActualOwnAnnualPayment({
        payment,
        revoked: false,
        updatedAt: instant,
        ...change,
      }),
    ).toThrow();
  });
  it("stores an incomplete tariff claim without inventing an actual payment", () => {
    const { claim } = tariffAnnualFixture();
    claim.employment.confirmed = false;
    claim.employment.start = null;
    claim.entitlements.forEach((row) => {
      row.reason = "UNKNOWN";
    });
    const record = { claim, actualPayment: null, revoked: false, revision: 1, updatedAt: instant };
    const result = validateSavedTariffAnnualClaim(record);
    expect(result.claim.employment.start).toBeNull();
    expect(result.actualPayment).toBeNull();
    expect(Object.isFrozen(result.claim)).toBe(true);
    expect(() => validateSavedTariffAnnualClaims([record, record])).toThrow();
    expect(
      validateSavedTariffAnnualClaims([record, { ...record, claim: { ...claim, year: 2027 } }]),
    ).toHaveLength(2);
    expect(validateActualTariffAnnualPayment({ grossCents: 0, payoutMonth: "2027-01" })).toEqual({
      grossCents: 0,
      payoutMonth: "2027-01",
    });
  });
  it.each([
    { revision: 0 },
    { revoked: "yes" },
    { extra: true },
    { actualPayment: { grossCents: -1, payoutMonth: "2026-11" } },
  ])("rejects malformed saved tariff claim %#", (change) => {
    expect(() =>
      validateSavedTariffAnnualClaim({
        claim: tariffAnnualFixture().claim,
        actualPayment: null,
        revoked: false,
        revision: 1,
        updatedAt: instant,
        ...change,
      }),
    ).toThrow();
  });
  it("binds allowance decisions to explicit tariff identity and rejects overlapping periods", () => {
    const row = {
      from: "2026-09-01",
      through: "2026-09-15",
      tariff: { packageId: "tvoed-vka-bt-k", variant: "BT_K", region: "OTHER" },
      allowanceStatus: ALLOWANCE_STATUSES[0],
      revision: 1,
      confirmedAt: instant,
      updatedAt: instant,
    };
    const result = validateScopedAllowanceDecisions([row]);
    expect(result[0].tariff).toEqual(row.tariff);
    expect(Object.isFrozen(result[0].tariff)).toBe(true);
    expect(() =>
      validateScopedAllowanceDecisions([
        row,
        { ...row, from: "2026-09-15", through: "2026-09-30" },
      ]),
    ).toThrow();
    expect(() =>
      validateScopedAllowanceDecisions([{ ...row, tariff: { ...row.tariff, region: "" } }]),
    ).toThrow();
    expect(() => validateScopedAllowanceDecisions([{ ...row, through: "2026-08-31" }])).toThrow();
    expect(() =>
      validateScopedAllowanceDecisions([{ ...row, confirmedAt: "2026-09-23T00:00:00Z" }]),
    ).toThrow();
    expect(() => validateScopedAllowanceDecisions([{ ...row, inferred: true }])).toThrow();
  });
});
