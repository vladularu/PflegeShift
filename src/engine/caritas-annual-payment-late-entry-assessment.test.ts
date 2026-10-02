import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "../rules/contracts.generated";
import {
  assessCaritasAnnualPaymentLateEntry as assess,
  type CaritasAnnualPaymentLateEntryAssessmentInput as Input,
} from "./caritas-annual-payment-late-entry-assessment";

function input(
  region = "bw",
  year: 2025 | 2026 = 2026,
  annex = "ANLAGE_32",
  territory?: string,
  start = "10-15",
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
    .selection!.variants.find((variant) => variant.id === annex)!
    .regions.find((item) => item.id === basisRegionId)!.payTableId!;
  const startMonth = Number(start.slice(0, 2));
  const startDay = Number(start.slice(3, 5));
  const firstMonth = startDay === 1 ? startMonth : startMonth + 1;
  return {
    pkg,
    entitlementYear: year,
    variantId: annex,
    regionId,
    referenceCase: "LATE_ENTRY",
    lateEntryReferencePeriodConfirmed: true,
    employmentStartDate: `${year}-${start}`,
    employmentStartConfirmed: true,
    sameEmploymentConfirmed: true,
    employmentEndDate: null,
    singleEmploymentHistoryConfirmed: true,
    parentalLeavePartTimeBasis: "NOT_APPLICABLE",
    firstFullMonth: {
      month: `${year}-${String(firstMonth).padStart(2, "0")}`,
      personalPaidBasisCents: 287654,
      basisRegionId,
      basisPayTableId,
      fullCalendarMonthEntgeltConfirmed: true,
      section16BasisConfirmed: true,
    },
    months: Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
      return {
        month: `${year}-${String(month).padStart(2, "0")}`,
        entgeltOrContinuationDays:
          month < startMonth ? 0 : month === startMonth ? days - startDay + 1 : days,
        monthFactsConfirmed: true,
        reductionException: { kind: "NONE" },
      };
    }),
  };
}

function withMonth(value: Input, month: number, change: Partial<Input["months"][number]>): Input {
  return {
    ...value,
    months: value.months.map((item, index) =>
      index === month - 1 ? { ...item, ...change } : item,
    ),
  };
}

function failure(value: Input, reason: string) {
  expect(assess(value)).toEqual({ kind: "unavailable", reason });
}

const monthCases = [
  ["10-01", "10", 3],
  ["10-02", "11", 3],
  ["10-31", "11", 3],
  ["11-01", "11", 2],
  ["11-02", "12", 2],
  ["11-30", "12", 2],
  ["12-01", "12", 1],
] as const;

describe("Caritas late-entry annual basis and entitlement assessment", () => {
  it.each(["bw", "bayern", "mitte", "nord", "nrw", "ost"])(
    "joins 2025/2026 source cases in %s while withholding the annual amount",
    (region) => {
      const territories =
        region === "ost"
          ? ["OST_TARIF_OST", "OST_TARIF_WEST_BERLIN", "OST_TARIF_WEST_HAMBURG"]
          : [region.toUpperCase()];
      for (const year of [2025, 2026] as const)
        for (const annex of ["ANLAGE_31", "ANLAGE_32"])
          for (const territory of territories)
            for (const [start, firstMonth, retained] of monthCases) {
              const value = input(region, year, annex, territory, start);
              const result = assess(value);
              expect(result).toMatchObject({
                kind: "personal-annual-payment-late-entry-assessment",
                draft: true,
                completeGross: false,
                entitlementYear: year,
                parentalLeavePartTimeBasis: "NOT_APPLICABLE",
                basis: {
                  employmentStartDate: `${year}-${start}`,
                  firstFullMonth: {
                    month: `${year}-${firstMonth}`,
                    personalPaidBasisCents: 287654,
                  },
                  meanMonthlyBasis: { numeratorCents: 287654, denominator: 1 },
                  sourceBasis: {
                    packageId: value.pkg.packageId,
                    versionId: value.pkg.versionId,
                    entitlementYear: year,
                    variantId: annex,
                    regionId: territory,
                    basisRegionId: value.firstFullMonth.basisRegionId,
                    basisPayTableId: value.firstFullMonth.basisPayTableId,
                    basisTablePolicy:
                      year === 2025 && territory === "OST_TARIF_OST"
                        ? "RK_OST_WEST_TABLE_2025"
                        : "SELECTED_TERRITORY",
                    sourceIds: expect.arrayContaining([`caritas-avr-jsz-${year}`]),
                  },
                },
                entitlement: {
                  employmentStartDate: `${year}-${start}`,
                  eligibility: { eligible: true, reason: "EMPLOYED_ON_DECEMBER_1" },
                  retainedMonthCount: retained,
                  reducedMonthCount: 12 - retained,
                  reductionFactor: { numerator: retained, denominator: 12 },
                  sourcePolicy: {
                    packageId: value.pkg.packageId,
                    versionId: value.pkg.versionId,
                    entitlementYear: year,
                    variantId: annex,
                    regionId: territory,
                    sourceIds: expect.arrayContaining([`caritas-avr-jsz-${year}`]),
                  },
                },
                annualAmount: {
                  kind: "unavailable",
                  reason: "LATE_ENTRY_RATE_REFERENCE_UNRESOLVED",
                },
              });
              if (result.kind !== "personal-annual-payment-late-entry-assessment")
                throw new Error("Expected a coherent late-entry assessment");
              const rules = value.pkg.rules
                .caritasAnnualPaymentRules!.filter(
                  (rule) =>
                    rule.entitlementYear === year &&
                    rule.variantId === annex &&
                    rule.regionId === territory,
                )
                .map((rule) => rule.id);
              expect(result.basis.sourceBasis.basisRuleIds).toEqual(rules);
              expect(result.entitlement.sourcePolicy.ruleIds).toEqual(rules);
              for (const object of [
                result,
                result.basis,
                result.entitlement,
                result.annualAmount,
                result.basis.sourceBasis,
                result.entitlement.sourcePolicy,
              ])
                for (const field of [
                  "groupIdAtSeptember1",
                  "groupReferenceDate",
                  "annualRule",
                  "rateBasisPoints",
                  "annualAmountCents",
                  "amountCents",
                  "monthlyGrossCents",
                ])
                  expect(object).not.toHaveProperty(field);
            }
    },
  );

  it.each(["APPLICABLE", "UNKNOWN", undefined, null, false])(
    "requires explicit exclusion of the parental-leave special basis (%s)",
    (parentalLeavePartTimeBasis) => {
      failure({ ...input(), parentalLeavePartTimeBasis } as Input, "UNSUPPORTED_SPECIAL_BASIS");
    },
  );

  it.each([0, 1, 29])("rejects %i paid days conflicting with a full November basis", (days) => {
    failure(
      withMonth(input(), 11, { entgeltOrContinuationDays: days }),
      "REFERENCE_MONTH_FACTS_MISMATCH",
    );
  });

  it.each([
    { kind: "SICK_PAY_SUPPLEMENT", paidSupplementConfirmed: true },
    {
      kind: "MATERNITY_EMPLOYMENT_BAN",
      statutoryMaternityBanConfirmed: true,
      noTablePayDueToBanConfirmed: true,
    },
  ] as const)(
    "rejects a reduction exception as a full paid basis ($kind)",
    (reductionException) => {
      failure(
        withMonth(input(), 11, { entgeltOrContinuationDays: 0, reductionException }),
        "REFERENCE_MONTH_FACTS_MISMATCH",
      );
    },
  );

  it("keeps an unpaid entry month reduced and the later full basis unchanged", () => {
    expect(assess(withMonth(input(), 10, { entgeltOrContinuationDays: 0 }))).toMatchObject({
      kind: "personal-annual-payment-late-entry-assessment",
      basis: { meanMonthlyBasis: { numeratorCents: 287654, denominator: 1 } },
      entitlement: { retainedMonthCount: 2, reductionFactor: { numerator: 2, denominator: 12 } },
    });
  });

  it("retains the entry month with one confirmed entitlement day", () => {
    expect(assess(withMonth(input(), 10, { entgeltOrContinuationDays: 1 }))).toMatchObject({
      kind: "personal-annual-payment-late-entry-assessment",
      entitlement: { retainedMonthCount: 3, reductionFactor: { numerator: 3, denominator: 12 } },
    });
  });

  it("retains a confirmed sickness supplement exception outside the reference month", () => {
    expect(
      assess(
        withMonth(input(), 10, {
          entgeltOrContinuationDays: 0,
          reductionException: { kind: "SICK_PAY_SUPPLEMENT", paidSupplementConfirmed: true },
        }),
      ),
    ).toMatchObject({
      kind: "personal-annual-payment-late-entry-assessment",
      entitlement: {
        retainedMonthCount: 3,
        months: expect.arrayContaining([
          expect.objectContaining({ month: "2026-10", decision: "RETAINED_EXCEPTION" }),
        ]),
      },
    });
  });

  it.each([
    ["monthFactsConfirmed", false, "MONTH_FACTS_UNCONFIRMED"],
    ["entgeltOrContinuationDays", 31, "INVALID_ENTGELT_DAYS"],
    ["entgeltOrContinuationDays", -1, "INVALID_ENTGELT_DAYS"],
  ] as const)("propagates invalid reference facts (%s=%s)", (field, value, reason) => {
    failure(withMonth(input(), 11, { [field]: value }), reason);
  });

  it("rejects days before the actual entry instead of retaining pre-employment twelfths", () => {
    failure(withMonth(input(), 9, { entgeltOrContinuationDays: 1 }), "ENTGELT_OUTSIDE_EMPLOYMENT");
    failure(
      withMonth(input(), 10, { entgeltOrContinuationDays: 18 }),
      "ENTGELT_OUTSIDE_EMPLOYMENT",
    );
  });

  it.each(["ANLAGE_31", "ANLAGE_32"])("does not reuse the early-exit rules of %s", (annex) => {
    const value = input("bw", 2026, annex);
    failure(
      {
        ...withMonth(value, 12, { entgeltOrContinuationDays: 0 }),
        employmentEndDate: "2026-11-30",
      },
      "UNSUPPORTED_EMPLOYMENT_PERIOD",
    );
  });

  it("accepts a December 1 end only when the earlier full reference month is coherent", () => {
    const value = {
      ...withMonth(input(), 12, { entgeltOrContinuationDays: 1 }),
      employmentEndDate: "2026-12-01",
    };
    expect(assess(value)).toMatchObject({
      kind: "personal-annual-payment-late-entry-assessment",
      entitlement: { eligibility: { eligible: true }, retainedMonthCount: 3 },
    });
    failure({ ...value, months: input().months }, "ENTGELT_OUTSIDE_EMPLOYMENT");
  });

  it("rejects a December-only basis when employment ends on December 1", () => {
    const value = input("bw", 2026, "ANLAGE_32", undefined, "12-01");
    failure(
      {
        ...withMonth(value, 12, { entgeltOrContinuationDays: 1 }),
        employmentEndDate: "2026-12-01",
      },
      "REFERENCE_MONTH_FACTS_MISMATCH",
    );
  });

  it.each(["2026-12-02", "2026-12-31"])(
    "does not invent a basis in the following year after %s",
    (employmentStartDate) => {
      failure({ ...input(), employmentStartDate }, "FIRST_FULL_MONTH_OUTSIDE_YEAR");
    },
  );

  it("propagates a non-late entry and a wrong first full month", () => {
    failure({ ...input(), employmentStartDate: "2026-09-30" }, "NOT_LATE_ENTRY");
    const value = input();
    failure(
      { ...value, firstFullMonth: { ...value.firstFullMonth, month: "2026-10" } },
      "INVALID_REFERENCE_MONTH",
    );
  });

  it.each([
    ["lateEntryReferencePeriodConfirmed", "REFERENCE_CASE_UNCONFIRMED"],
    ["employmentStartConfirmed", "EMPLOYMENT_START_UNCONFIRMED"],
    ["sameEmploymentConfirmed", "EMPLOYMENT_IDENTITY_UNCONFIRMED"],
    ["singleEmploymentHistoryConfirmed", "EMPLOYMENT_HISTORY_UNCONFIRMED"],
  ] as const)("requires strict confirmation of %s", (field, reason) => {
    for (const flag of [false, undefined, 1, "true"])
      failure({ ...input(), [field]: flag } as Input, reason);
  });

  it.each([
    ["fullCalendarMonthEntgeltConfirmed", "REFERENCE_MONTH_INCOMPLETE"],
    ["section16BasisConfirmed", "MONTH_BASIS_UNCONFIRMED"],
  ] as const)("preserves the paid-basis confirmation %s", (field, reason) => {
    const value = input();
    failure({ ...value, firstFullMonth: { ...value.firstFullMonth, [field]: false } }, reason);
  });

  it.each(["basisRegionId", "basisPayTableId"] as const)(
    "does not join a different %s",
    (field) => {
      const value = input();
      failure(
        { ...value, firstFullMonth: { ...value.firstFullMonth, [field]: "OTHER" } },
        "BASIS_IDENTITY_MISMATCH",
      );
    },
  );

  it("rejects missing annual months and a discontinuous employment history", () => {
    const value = input();
    failure({ ...value, months: value.months.slice(1) }, "INVALID_MONTHS");
    failure(
      { ...value, singleEmploymentHistoryConfirmed: false },
      "EMPLOYMENT_HISTORY_UNCONFIRMED",
    );
    failure({ ...value, employmentEndDate: "2026-10-14" }, "INVALID_EMPLOYMENT_PERIOD");
  });

  it("rejects an invalid package and an unknown selection", () => {
    const value = input();
    failure({ ...value, pkg: { ...value.pkg, engineContractVersion: 11 } }, "INVALID_PACKAGE");
    failure({ ...value, regionId: "OTHER" }, "UNKNOWN_SELECTION");
  });

  it("copies confirmed facts and provenance without modifying inputs", () => {
    const value = input();
    const snapshot = structuredClone(value);
    const result = assess(value);
    expect(value).toEqual(snapshot);
    if (result.kind !== "personal-annual-payment-late-entry-assessment")
      throw new Error("Expected a coherent assessment");
    expect(result.basis.firstFullMonth).not.toBe(value.firstFullMonth);
    expect(result.entitlement.months[10]).not.toBe(value.months[10]);
    (value.firstFullMonth as { personalPaidBasisCents: number }).personalPaidBasisCents = 1;
    (value.months[10] as { entgeltOrContinuationDays: number }).entgeltOrContinuationDays = 0;
    expect(result.basis.meanMonthlyBasis.numeratorCents).toBe(287654);
    expect(result.entitlement.months[10].entgeltOrContinuationDays).toBe(30);
    expect(result.annualAmount).toEqual({
      kind: "unavailable",
      reason: "LATE_ENTRY_RATE_REFERENCE_UNRESOLVED",
    });
  });
});
