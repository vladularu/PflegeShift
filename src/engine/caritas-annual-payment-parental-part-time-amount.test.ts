import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "../rules/contracts.generated";
import {
  calculateCaritasAnnualPaymentParentalPartTimeAmount as calculate,
  type CaritasAnnualPaymentParentalPartTimeAmountInput as Input,
  type CaritasParentalPartTimeAdjustedMonth as AdjustedMonth,
} from "./caritas-annual-payment-parental-part-time-amount";
import type { CaritasAnnualPaymentEntitlementMonth as Month } from "./caritas-annual-payment-entitlement";

function input(
  region = "bw",
  year: 2025 | 2026 = 2026,
  annex = "ANLAGE_32",
  territory?: string,
): Input {
  const version = region === "ost" ? `${year}-01` : year === 2025 ? "2025-07-01" : "2026-02-01";
  const pkg = JSON.parse(
    readFileSync(
      new URL(
        `../../rules/packages/reviewed/avr-caritas-p-${region}/${version}-draft1.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  ) as RuleTariffPackage;
  const regionId = territory ?? (region === "ost" ? "OST_TARIF_OST" : region.toUpperCase());
  const basisRegionId =
    year === 2025 && regionId === "OST_TARIF_OST" ? "OST_TARIF_WEST_HAMBURG" : regionId;
  const basisPayTableId = pkg.rules
    .selection!.variants.find((item) => item.id === annex)!
    .regions.find((item) => item.id === basisRegionId)!.payTableId!;
  return {
    pkg,
    entitlementYear: year,
    variantId: annex,
    regionId,
    groupIdAtSeptember1: "p6",
    septemberGroupConfirmed: true,
    referenceCase: "PARENTAL_LEAVE",
    parentalLeavePartTimeBasis: "APPLICABLE",
    parentalReferencePeriodConfirmed: true,
    employmentStartDate: `${year - 1}-01-01`,
    employmentEndDate: null,
    singleEmploymentHistoryConfirmed: true,
    parentalLeave: {
      birthDate: `${year}-04-10`,
      startDate: `${year}-07-01`,
      endDate: `${year}-09-30`,
      singlePeriodConfirmed: true,
    },
    beforeLeaveScope: {
      referenceDate: `${year}-06-30`,
      numerator: 1,
      denominator: 1,
      historicalScopeConfirmed: true,
      sameEmploymentConfirmed: true,
    },
    referencePartTime: {
      startDate: `${year}-07-01`,
      endDate: `${year}-09-30`,
      numerator: 1,
      denominator: 2,
      benefitPreservingConfirmed: true,
      singleScopePeriodConfirmed: true,
    },
    adjustedMonths: [7, 8, 9].map((month) => ({
      month: `${year}-${String(month).padStart(2, "0")}`,
      personalBasisAtPreLeaveScopeCents: 300000,
      preLeaveScope: { numerator: 1, denominator: 1 },
      basisRegionId,
      basisPayTableId,
      fullCalendarMonthEntgeltConfirmed: true,
      section16BasisConfirmed: true,
      preLeaveScopeAppliedConfirmed: true,
    })),
    months: Array.from({ length: 12 }, (_, index) => ({
      month: `${year}-${String(index + 1).padStart(2, "0")}`,
      entgeltOrContinuationDays: new Date(Date.UTC(year, index + 1, 0)).getUTCDate(),
      monthFactsConfirmed: true,
      reductionException: { kind: "NONE" },
    })),
  };
}
function failure(value: Input, reason: string) {
  expect(calculate(value)).toEqual({ kind: "unavailable", reason });
}
function month(value: Input, index: number, change: Partial<AdjustedMonth>): Input {
  return {
    ...value,
    adjustedMonths: value.adjustedMonths.map((item, position) =>
      position === index ? { ...item, ...change } : item,
    ),
  };
}
function facts(value: Input, index: number, change: Partial<Month>): Input {
  return {
    ...value,
    months: value.months.map((item, position) =>
      position === index ? { ...item, ...change } : item,
    ),
  };
}
function reduced(value: Input, indices: number[]): Input {
  return {
    ...value,
    months: value.months.map((item, index) =>
      indices.includes(index) ? { ...item, entgeltOrContinuationDays: 0 } : item,
    ),
  };
}
function deepFreeze(value: object) {
  for (const child of Object.values(value))
    if (child && typeof child === "object") deepFreeze(child);
  Object.freeze(value);
}

describe("Caritas birth-year parental part-time annual component", () => {
  it("returns a fixed EUR 2,580 at the confirmed pre-leave scope with complete provenance", () => {
    const value = input(),
      result = calculate(value);
    expect(result).toMatchObject({
      kind: "personal-annual-payment-parental-part-time-amount",
      amountCents: 258000,
      draft: true,
      completeGross: false,
      parentalLeavePartTimeBasis: "APPLICABLE",
      exactAmountCents: { numerator: "92880000000", denominator: "360000" },
      basis: {
        groupReferenceDate: "2026-09-01",
        referenceCase: "PARENTAL_LEAVE",
        beforeLeaveScope: { referenceDate: "2026-06-30", numerator: 1, denominator: 1 },
        meanMonthlyBasis: { numeratorCents: 900000, denominator: 3 },
      },
      entitlement: {
        eligibility: { eligible: true, reason: "EMPLOYED_ON_DECEMBER_1" },
        reductionFactor: { numerator: 12, denominator: 12 },
      },
      specialBasisEvidence: {
        sourceId: "caritas-avr-jsz-2026",
        sourceSection: "Anlage 32 § 16 Absatz 2 Satz 4",
      },
    });
    if (result.kind === "unavailable") throw Error("Expected amount");
    expect(result.specialBasisEvidence.sourceSha256).toBe(result.roundingEvidence.sourceSha256);
    expect(result.entitlement.sourcePolicy.ruleIds).toContain(result.basis.annualRule.id);
    expect(result.basis.annualRule.packageId).toBe(value.pkg.packageId);
    expect(result.basis.annualRule.versionId).toBe(value.pkg.versionId);
    expect(result.basis).not.toHaveProperty("paidMonths");
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
  it("preserves already adjusted personal half-time amounts without a second part-time factor", () => {
    const value = input();
    expect(
      calculate({
        ...value,
        beforeLeaveScope: { ...value.beforeLeaveScope, numerator: 1, denominator: 2 },
        referencePartTime: { ...value.referencePartTime, numerator: 1, denominator: 4 },
        adjustedMonths: value.adjustedMonths.map((item) => ({
          ...item,
          preLeaveScope: { numerator: 50, denominator: 100 },
          personalBasisAtPreLeaveScopeCents: 150000,
        })),
      }),
    ).toMatchObject({
      amountCents: 129000,
      basis: { meanMonthlyBasis: { numeratorCents: 450000, denominator: 3 } },
    });
  });
  it("does not require the qualifying reference scope to be lower than the historical scope", () => {
    const value = input();
    expect(
      calculate({
        ...value,
        beforeLeaveScope: { ...value.beforeLeaveScope, numerator: 1, denominator: 2 },
        referencePartTime: { ...value.referencePartTime, numerator: 3, denominator: 4 },
        adjustedMonths: value.adjustedMonths.map((item) => ({
          ...item,
          preLeaveScope: { numerator: 1, denominator: 2 },
          personalBasisAtPreLeaveScopeCents: 150000,
        })),
      }),
    ).toMatchObject({ amountCents: 129000 });
  });
  it("uses the fixed 76-percent band", () => {
    expect(calculate({ ...input(), groupIdAtSeptember1: "p9" })).toMatchObject({
      amountCents: 228000,
      rateBasisPoints: 7600,
    });
  });
  it.each([
    [1, 236500],
    [2, 215000],
    [3, 193500],
    [9, 64500],
  ] as const)("reduces %i confirmed unpaid months outside the reference", (count, amountCents) => {
    const indices = [0, 1, 2, 3, 4, 5, 9, 10, 11].slice(0, count);
    expect(calculate(reduced(input(), indices))).toMatchObject({
      amountCents,
      entitlement: { reductionFactor: { numerator: 12 - count, denominator: 12 } },
    });
  });
  it("retains confirmed unpaid parental-leave months for the same child in the birth year", () => {
    let value = input();
    value = { ...value, parentalLeave: { ...value.parentalLeave, endDate: "2026-12-31" } };
    for (const index of [9, 10, 11])
      value = facts(value, index, {
        entgeltOrContinuationDays: 0,
        reductionException: {
          kind: "PARENTAL_LEAVE_BIRTH_YEAR",
          birthDate: value.parentalLeave.birthDate,
          noTablePayDueToBeegLeaveConfirmed: true,
          payClaimBeforeLeaveConfirmed: true,
        },
      });
    expect(calculate(value)).toMatchObject({
      amountCents: 258000,
      entitlement: { reductionFactor: { numerator: 12, denominator: 12 } },
    });
  });
  it("does not grant the birth-year retention exception from special-basis applicability alone", () => {
    const value = {
      ...input(),
      parentalLeave: { ...input().parentalLeave, endDate: "2026-12-31" },
    };
    expect(calculate(reduced(value, [9, 10, 11]))).toMatchObject({ amountCents: 193500 });
  });
  it.each([99, 100, 101] as const)(
    "rounds the exact final half-cent neighborhood at sum %i",
    (sum) => {
      const value = reduced(input(), [0, 1, 2]);
      expect(
        calculate({
          ...value,
          adjustedMonths: value.adjustedMonths.map((item, index) => ({
            ...item,
            personalBasisAtPreLeaveScopeCents: index === 0 ? sum - 2 : 1,
          })),
        }),
      ).toMatchObject({
        amountCents: sum === 99 ? 21 : 22,
        exactAmountCents: { numerator: String(sum * 8600 * 9), denominator: "360000" },
      });
    },
  );
  it("never rounds the mean before the annual final cent", () => {
    const value = input();
    expect(
      calculate({
        ...value,
        adjustedMonths: value.adjustedMonths.map((item, index) => ({
          ...item,
          personalBasisAtPreLeaveScopeCents: index === 0 ? 1 : 2,
        })),
      }),
    ).toMatchObject({
      amountCents: 1,
      basis: { meanMonthlyBasis: { numeratorCents: 5, denominator: 3 } },
    });
  });
  it("orders exactly July-August-September", () => {
    const value = input(),
      result = calculate({
        ...value,
        adjustedMonths: [...value.adjustedMonths].reverse(),
        months: [...value.months].reverse(),
      });
    if (result.kind === "unavailable") throw Error("Expected amount");
    expect(result.basis.adjustedMonths.map((item) => item.month)).toEqual([
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
  });

  for (const year of [2025, 2026] as const)
    for (const annex of ["ANLAGE_31", "ANLAGE_32"]) {
      it(`matches all regional fixed references for ${year} ${annex}`, () => {
        const selections = [
          ["bw", undefined],
          ["bayern", undefined],
          ["nord", undefined],
          ["nrw", undefined],
          ["mitte", undefined],
          ["ost", "OST_TARIF_OST"],
          ["ost", "OST_TARIF_WEST_HAMBURG"],
          ["ost", "OST_TARIF_WEST_BERLIN"],
        ] as const;
        for (const [region, territory] of selections)
          for (const group of [
            "p4",
            "p6",
            "p7",
            "p8",
            "p9",
            "p10",
            "p11",
            "p12",
            "p13",
            "p14",
            "p15",
            "p16",
          ]) {
            const value = { ...input(region, year, annex, territory), groupIdAtSeptember1: group };
            const result = calculate(value),
              lowBand = ["p4", "p6", "p7", "p8"].includes(group);
            expect(result).toMatchObject({
              amountCents: lowBand ? 258000 : 228000,
              rateBasisPoints: lowBand ? 8600 : 7600,
            });
            if (result.kind === "unavailable") throw Error("Expected regional amount");
            expect(result.specialBasisEvidence.sourceSection).toBe(
              `Anlage ${annex === "ANLAGE_31" ? 31 : 32} § 16 Absatz 2 Satz 4`,
            );
            expect(result.basis.adjustedMonths[0].basisRegionId).toBe(
              year === 2025 && territory === "OST_TARIF_OST"
                ? "OST_TARIF_WEST_HAMBURG"
                : value.regionId,
            );
          }
      });
    }
  it.each([
    "ORDINARY_FULL_MONTHS",
    "PARTIAL_MONTHS",
    "SICK_PAY_SUPPLEMENT",
    "LATE_ENTRY",
    "EARLY_EXIT",
    "UNKNOWN",
  ] as const)("rejects reference case %s", (referenceCase) =>
    failure({ ...input(), referenceCase }, "UNSUPPORTED_REFERENCE_CASE"),
  );
  it.each(["NOT_APPLICABLE", "UNKNOWN", true] as const)(
    "requires confirmed special applicability %s",
    (flag) =>
      failure(
        { ...input(), parentalLeavePartTimeBasis: flag as Input["parentalLeavePartTimeBasis"] },
        "SPECIAL_BASIS_UNCONFIRMED",
      ),
  );
  it.each([false, undefined, "true"] as const)(
    "requires strict reference and September confirmations %s",
    (flag) => {
      failure(
        { ...input(), parentalReferencePeriodConfirmed: flag as boolean },
        "SPECIAL_BASIS_UNCONFIRMED",
      );
      failure(
        { ...input(), septemberGroupConfirmed: flag as boolean },
        "REFERENCE_GROUP_UNCONFIRMED",
      );
    },
  );
  it("requires a single parental-leave history", () => {
    const value = input();
    failure(
      { ...value, parentalLeave: { ...value.parentalLeave, singlePeriodConfirmed: false } },
      "PARENTAL_PERIOD_UNCONFIRMED",
    );
  });
  it.each(["2026-02-30", "2026-4-10", "not-a-date"] as const)(
    "rejects invalid child birth date %s",
    (birthDate) => {
      const value = input();
      failure(
        { ...value, parentalLeave: { ...value.parentalLeave, birthDate } },
        "INVALID_PARENTAL_PERIOD",
      );
    },
  );
  it("requires the child's actual birth year", () => {
    const value = input();
    failure(
      { ...value, parentalLeave: { ...value.parentalLeave, birthDate: "2025-04-10" } },
      "PARENTAL_BIRTH_YEAR_MISMATCH",
    );
  });
  it("rejects leave beginning before birth", () => {
    const value = input();
    failure(
      { ...value, parentalLeave: { ...value.parentalLeave, startDate: "2026-03-01" } },
      "INVALID_PARENTAL_PERIOD",
    );
  });
  it.each([{ startDate: "2026-02-30" }, { endDate: "2026-09-31" }, { endDate: "2026-06-30" }])(
    "rejects invalid or reversed leave dates %j",
    (change) => {
      const value = input();
      failure(
        { ...value, parentalLeave: { ...value.parentalLeave, ...change } },
        "INVALID_PARENTAL_PERIOD",
      );
    },
  );
  it.each([{ startDate: "2026-07-02" }, { endDate: "2026-09-29" }])(
    "requires full reference coverage by leave %j",
    (change) => {
      const value = input();
      failure(
        { ...value, parentalLeave: { ...value.parentalLeave, ...change } },
        "UNSUPPORTED_PARENTAL_REFERENCE_PERIOD",
      );
    },
  );
  it("requires the pre-leave day within the same employment", () =>
    failure(
      { ...reduced(input(), [0, 1, 2, 3, 4, 5]), employmentStartDate: "2026-07-01" },
      "UNSUPPORTED_PARENTAL_REFERENCE_PERIOD",
    ));
  it("rejects leave exceeding a known service end", () => {
    const value = facts(input(), 11, { entgeltOrContinuationDays: 15 });
    failure(
      {
        ...value,
        employmentEndDate: "2026-12-15",
        parentalLeave: { ...value.parentalLeave, endDate: null },
      },
      "UNSUPPORTED_PARENTAL_REFERENCE_PERIOD",
    );
  });
  it.each(["2026-07-01", "2026-06-29", "2026-6-30"] as const)(
    "requires the exact UTC day before leave %s",
    (referenceDate) => {
      const value = input();
      failure(
        { ...value, beforeLeaveScope: { ...value.beforeLeaveScope, referenceDate } },
        "PRE_LEAVE_SCOPE_DATE_MISMATCH",
      );
    },
  );
  it("handles the previous-year boundary for leave on January 1", () => {
    const value = input();
    expect(
      calculate({
        ...value,
        parentalLeave: { ...value.parentalLeave, birthDate: "2026-01-01", startDate: "2026-01-01" },
        beforeLeaveScope: { ...value.beforeLeaveScope, referenceDate: "2025-12-31" },
      }),
    ).toMatchObject({ amountCents: 258000 });
  });
  it.each(["historicalScopeConfirmed", "sameEmploymentConfirmed"] as const)(
    "requires pre-leave confirmation %s",
    (key) => {
      const value = input();
      failure(
        { ...value, beforeLeaveScope: { ...value.beforeLeaveScope, [key]: false } },
        "PRE_LEAVE_SCOPE_UNCONFIRMED",
      );
    },
  );
  it.each([
    { numerator: 0, denominator: 1 },
    { numerator: -1, denominator: 2 },
    { numerator: 1.5, denominator: 2 },
    { numerator: 1, denominator: 0 },
    { numerator: 3, denominator: 2 },
    { numerator: Infinity, denominator: Infinity },
    { numerator: 1, denominator: Number.MAX_SAFE_INTEGER + 1 },
  ])("rejects invalid scope %j", (scope) => {
    const value = input();
    failure(
      { ...value, beforeLeaveScope: { ...value.beforeLeaveScope, ...scope } },
      "INVALID_EMPLOYMENT_SCOPE",
    );
    failure(
      { ...value, referencePartTime: { ...value.referencePartTime, ...scope } },
      "INVALID_EMPLOYMENT_SCOPE",
    );
  });
  it("accepts equivalent safe-integer scopes even when cross-products exceed number precision", () => {
    const value = input(),
      scope = { numerator: Number.MAX_SAFE_INTEGER, denominator: Number.MAX_SAFE_INTEGER };
    expect(
      calculate({
        ...value,
        beforeLeaveScope: { ...value.beforeLeaveScope, ...scope },
        adjustedMonths: value.adjustedMonths.map((item) => ({ ...item, preLeaveScope: scope })),
      }),
    ).toMatchObject({ amountCents: 258000 });
  });
  it("rejects almost-equal scopes using exact integer comparison", () => {
    const value = input(),
      max = Number.MAX_SAFE_INTEGER;
    failure(
      {
        ...value,
        beforeLeaveScope: { ...value.beforeLeaveScope, numerator: max - 1, denominator: max },
        adjustedMonths: value.adjustedMonths.map((item) => ({
          ...item,
          preLeaveScope: { numerator: max - 2, denominator: max },
        })),
      },
      "BASIS_SCOPE_MISMATCH",
    );
  });
  it("requires real part-time scope", () => {
    const value = input();
    failure(
      { ...value, referencePartTime: { ...value.referencePartTime, numerator: 1, denominator: 1 } },
      "INVALID_EMPLOYMENT_SCOPE",
    );
  });
  it.each(["benefitPreservingConfirmed", "singleScopePeriodConfirmed"] as const)(
    "requires qualifying part-time confirmation %s",
    (key) => {
      const value = input();
      failure(
        { ...value, referencePartTime: { ...value.referencePartTime, [key]: false } },
        "PART_TIME_UNCONFIRMED",
      );
    },
  );
  it.each([{ startDate: "2026-07-02" }, { endDate: "2026-09-29" }])(
    "requires full coverage by part-time %j",
    (change) => {
      const value = input();
      failure(
        { ...value, referencePartTime: { ...value.referencePartTime, ...change } },
        "UNSUPPORTED_PARENTAL_REFERENCE_PERIOD",
      );
    },
  );
  it.each([
    { startDate: "2026-06-30" },
    { endDate: "2026-10-01" },
    { endDate: "2026-06-30" },
    { startDate: "2026-02-30" },
  ])("rejects part-time outside leave or invalid dates %j", (change) => {
    const value = input();
    failure(
      { ...value, referencePartTime: { ...value.referencePartTime, ...change } },
      "INVALID_PART_TIME_PERIOD",
    );
  });
  it("supports explicitly open leave and part-time periods in open employment", () => {
    const value = input();
    expect(
      calculate({
        ...value,
        parentalLeave: { ...value.parentalLeave, endDate: null },
        referencePartTime: { ...value.referencePartTime, endDate: null },
      }),
    ).toMatchObject({ amountCents: 258000 });
  });
  it("rejects missing, duplicated, extra and wrong-year adjusted months", () => {
    const value = input();
    for (const adjustedMonths of [
      [],
      value.adjustedMonths.slice(1),
      [...value.adjustedMonths, value.adjustedMonths[0]],
      [value.adjustedMonths[0], value.adjustedMonths[0], value.adjustedMonths[2]],
      value.adjustedMonths.map((item) => ({ ...item, month: item.month.replace("2026", "2025") })),
    ])
      failure({ ...value, adjustedMonths }, "INVALID_REFERENCE_MONTHS");
  });
  it.each([
    ["fullCalendarMonthEntgeltConfirmed", "REFERENCE_MONTH_INCOMPLETE"],
    ["section16BasisConfirmed", "MONTH_BASIS_UNCONFIRMED"],
    ["preLeaveScopeAppliedConfirmed", "PRE_LEAVE_MONTH_BASIS_UNCONFIRMED"],
  ] as const)("requires all monthly confirmations %s", (key, reason) => {
    for (const index of [0, 1, 2])
      for (const flag of [false, undefined, "true"])
        failure(month(input(), index, { [key]: flag } as Partial<AdjustedMonth>), reason);
  });
  it("rejects wrong historical scope and unconfirmed monthly amount semantics", () => {
    failure(
      month(input(), 1, { preLeaveScope: { numerator: 1, denominator: 2 } }),
      "BASIS_SCOPE_MISMATCH",
    );
    failure(
      month(input(), 1, { preLeaveScope: { numerator: 0, denominator: 1 } }),
      "BASIS_SCOPE_MISMATCH",
    );
  });
  it.each(["basisRegionId", "basisPayTableId"] as const)(
    "rejects altered annual-basis identity %s",
    (key) => {
      for (const index of [0, 1, 2])
        failure(month(input(), index, { [key]: "OTHER" }), "BASIS_IDENTITY_MISMATCH");
    },
  );
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid adjusted cents %s",
    (amount) =>
      failure(
        month(input(), 0, { personalBasisAtPreLeaveScopeCents: amount }),
        "INVALID_MONTH_BASIS",
      ),
  );
  it("rejects sum overflow", () =>
    failure(
      month(input(), 0, { personalBasisAtPreLeaveScopeCents: Number.MAX_SAFE_INTEGER }),
      "AMOUNT_OVERFLOW",
    ));
  it.each([6, 7, 8])("requires matching actual full-month annual facts at index %i", (index) => {
    failure(
      facts(input(), index, { entgeltOrContinuationDays: 1 }),
      "REFERENCE_MONTH_FACTS_MISMATCH",
    );
    failure(
      facts(input(), index, { entgeltOrContinuationDays: 0 }),
      "REFERENCE_MONTH_FACTS_MISMATCH",
    );
  });
  it("rejects a parental retention exception for another child", () => {
    const value = {
      ...input(),
      parentalLeave: { ...input().parentalLeave, endDate: "2026-12-31" },
    };
    failure(
      facts(value, 9, {
        entgeltOrContinuationDays: 0,
        reductionException: {
          kind: "PARENTAL_LEAVE_BIRTH_YEAR",
          birthDate: "2026-04-11",
          noTablePayDueToBeegLeaveConfirmed: true,
          payClaimBeforeLeaveConfirmed: true,
        },
      }),
      "PARENTAL_MONTH_FACTS_MISMATCH",
    );
  });
  it("rejects a parental retention month outside the confirmed leave", () => {
    const value = input();
    failure(
      facts(value, 5, {
        entgeltOrContinuationDays: 0,
        reductionException: {
          kind: "PARENTAL_LEAVE_BIRTH_YEAR",
          birthDate: value.parentalLeave.birthDate,
          noTablePayDueToBeegLeaveConfirmed: true,
          payClaimBeforeLeaveConfirmed: true,
        },
      }),
      "PARENTAL_MONTH_FACTS_MISMATCH",
    );
  });
  it("keeps unconfirmed parental retention blocked independently of the adjusted basis", () => {
    const value = {
      ...input(),
      parentalLeave: { ...input().parentalLeave, endDate: "2026-12-31" },
    };
    failure(
      facts(value, 9, {
        entgeltOrContinuationDays: 0,
        reductionException: {
          kind: "PARENTAL_LEAVE_BIRTH_YEAR",
          birthDate: value.parentalLeave.birthDate,
          noTablePayDueToBeegLeaveConfirmed: true,
          payClaimBeforeLeaveConfirmed: false,
        },
      }),
      "EXCEPTION_UNCONFIRMED",
    );
  });
  it.each(["ANLAGE_31", "ANLAGE_32"])("rejects early exit for annex %s", (variantId) =>
    failure(
      { ...reduced(input("bw", 2026, variantId), [11]), employmentEndDate: "2026-11-30" },
      "UNSUPPORTED_EMPLOYMENT_PERIOD",
    ),
  );
  it("requires coherent employment and all twelve annual months", () => {
    failure(
      { ...input(), singleEmploymentHistoryConfirmed: false },
      "EMPLOYMENT_HISTORY_UNCONFIRMED",
    );
    failure({ ...input(), employmentEndDate: "2026-02-30" }, "INVALID_EMPLOYMENT_PERIOD");
    failure({ ...input(), months: input().months.slice(1) }, "INVALID_MONTHS");
    failure(facts(input(), 0, { monthFactsConfirmed: false }), "MONTH_FACTS_UNCONFIRMED");
    failure({ ...input(), employmentStartDate: "2026-08-01" }, "ENTGELT_OUTSIDE_EMPLOYMENT");
  });
  it("rejects unsupported years, groups and tariff selections", () => {
    failure({ ...input(), entitlementYear: 2027 }, "OUTSIDE_ENTITLEMENT_YEAR");
    failure({ ...input(), groupIdAtSeptember1: "UNKNOWN" }, "UNKNOWN_PAY_GROUP");
    failure({ ...input(), regionId: "UNKNOWN" }, "UNKNOWN_SELECTION");
  });
  it("requires the exact verified original document for the special calculation and final rounding", () => {
    const value = input(),
      source = value.pkg.sources.find((item) => item.id === "caritas-avr-jsz-2026")!;
    const pkg = {
      ...value.pkg,
      sources: value.pkg.sources.map((item) =>
        item.id === source.id ? { ...item, sha256: "0".repeat(64) } : item,
      ) as RuleTariffPackage["sources"],
    };
    failure({ ...value, pkg }, "ROUNDING_SOURCE_MISSING");
  });
  it("requires contract 14", () => {
    const value = input();
    failure({ ...value, pkg: { ...value.pkg, engineContractVersion: 11 } }, "INVALID_PACKAGE");
  });
  it("copies personal evidence, ignores unrelated pay fields and never mutates frozen input", () => {
    const value = input();
    deepFreeze(value);
    const before = JSON.stringify(value);
    expect(calculate(value)).toMatchObject({ amountCents: 258000 });
    expect(JSON.stringify(value)).toBe(before);
    const mutable = input(),
      result = calculate(mutable);
    if (result.kind === "unavailable") throw Error("Expected amount");
    (mutable.adjustedMonths[0].preLeaveScope as { numerator: number }).numerator = 2;
    expect(result.basis.adjustedMonths[0].preLeaveScope.numerator).toBe(1);
    const enriched = {
      ...input(),
      adjustedMonths: input().adjustedMonths.map((item) => ({
        ...item,
        personalPaidBasisCents: 100000,
        performanceBonusCents: 999999,
        overtimeCents: 999999,
      })),
    };
    const guarded = calculate(enriched);
    expect(guarded).toMatchObject({ amountCents: 258000 });
    if (guarded.kind === "unavailable") throw Error("Expected amount");
    expect(guarded.basis.adjustedMonths[0]).not.toHaveProperty("personalPaidBasisCents");
    expect(guarded.basis.adjustedMonths[0]).not.toHaveProperty("performanceBonusCents");
  });
});
