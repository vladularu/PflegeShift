import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "../rules/contracts.generated";
import {
  assessCaritasAnnualPaymentEntitlement as assess,
  type CaritasAnnualPaymentEntitlementInput as Input,
  type CaritasAnnualPaymentEntitlementMonth as Month,
  type CaritasAnnualPaymentReductionException as Exception,
} from "./caritas-annual-payment-entitlement";

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
  return {
    pkg,
    entitlementYear: year,
    variantId: annex,
    regionId: territory ?? (region === "ost" ? "OST_TARIF_OST" : region.toUpperCase()),
    employmentStartDate: `${year - 1}-01-01`,
    employmentEndDate: null,
    singleEmploymentHistoryConfirmed: true,
    months: Array.from({ length: 12 }, (_, index) => ({
      month: `${year}-${String(index + 1).padStart(2, "0")}`,
      entgeltOrContinuationDays: 1,
      monthFactsConfirmed: true,
      reductionException: { kind: "NONE" },
    })),
  };
}

function changeMonth(value: Input, index: number, change: Partial<Month>): Input {
  return {
    ...value,
    months: value.months.map((month, position) =>
      position === index ? { ...month, ...change } : month,
    ),
  };
}

function failure(value: Input, reason: string) {
  expect(assess(value)).toEqual({ kind: "unavailable", reason });
}

function exceptions(year: number): Exception[] {
  return [
    {
      kind: "MILITARY_OR_CIVILIAN_SERVICE",
      noTablePayDueToServiceConfirmed: true,
      serviceEndDate: `${year}-05-31`,
      immediateWorkResumptionConfirmed: true,
    },
    {
      kind: "MATERNITY_EMPLOYMENT_BAN",
      statutoryMaternityBanConfirmed: true,
      noTablePayDueToBanConfirmed: true,
    },
    {
      kind: "PARENTAL_LEAVE_BIRTH_YEAR",
      noTablePayDueToBeegLeaveConfirmed: true,
      birthDate: `${year}-03-15`,
      payClaimBeforeLeaveConfirmed: true,
    },
    { kind: "SICK_PAY_SUPPLEMENT", paidSupplementConfirmed: true },
    { kind: "SICK_PAY_SUPPLEMENT_AMOUNT_BLOCKED", onlySicknessBenefitAmountBlockedConfirmed: true },
  ];
}

const scenarios = [
  {
    start: "PREVIOUS",
    end: null,
    paid: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    eligible: [true, true],
    reason: ["EMPLOYED_ON_DECEMBER_1", "EMPLOYED_ON_DECEMBER_1"],
  },
  {
    start: "01-01",
    end: "11-30",
    paid: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    eligible: [true, false],
    reason: ["ANLAGE_31_EARLY_EXIT", "DECEMBER_1_REQUIREMENT_NOT_MET"],
  },
  {
    start: "12-01",
    end: "12-01",
    paid: [12],
    eligible: [true, true],
    reason: ["EMPLOYED_ON_DECEMBER_1", "EMPLOYED_ON_DECEMBER_1"],
  },
  {
    start: "11-30",
    end: "11-30",
    paid: [11],
    eligible: [true, false],
    reason: ["ANLAGE_31_EARLY_EXIT", "DECEMBER_1_REQUIREMENT_NOT_MET"],
  },
  {
    start: "12-02",
    end: null,
    paid: [12],
    eligible: [false, false],
    reason: ["DECEMBER_1_REQUIREMENT_NOT_MET", "DECEMBER_1_REQUIREMENT_NOT_MET"],
  },
  {
    start: "PREVIOUS",
    end: "PREVIOUS",
    paid: [],
    eligible: [false, false],
    reason: ["NOT_EMPLOYED_IN_YEAR", "NOT_EMPLOYED_IN_YEAR"],
  },
  {
    start: "NEXT",
    end: null,
    paid: [],
    eligible: [false, false],
    reason: ["NOT_EMPLOYED_IN_YEAR", "NOT_EMPLOYED_IN_YEAR"],
  },
  {
    start: "01-02",
    end: "01-15",
    paid: [1],
    eligible: [true, false],
    reason: ["ANLAGE_31_EARLY_EXIT", "DECEMBER_1_REQUIREMENT_NOT_MET"],
  },
] as const;

describe("Caritas sourced personal annual entitlement and twelfths", () => {
  it.each(["bw", "bayern", "mitte", "nord", "nrw", "ost"])(
    "covers both years, both annexes, claim boundaries and exceptions in %s",
    (region) => {
      const territories =
        region === "ost"
          ? ["OST_TARIF_OST", "OST_TARIF_WEST_BERLIN", "OST_TARIF_WEST_HAMBURG"]
          : [region.toUpperCase()];
      for (const year of [2025, 2026] as const)
        for (const annex of ["ANLAGE_31", "ANLAGE_32"])
          for (const territory of territories) {
            const base = input(region, year, annex, territory);
            for (const scenario of scenarios) {
              const annexIndex = annex === "ANLAGE_31" ? 0 : 1;
              const result = assess({
                ...base,
                employmentStartDate:
                  scenario.start === "PREVIOUS"
                    ? `${year - 1}-01-01`
                    : scenario.start === "NEXT"
                      ? `${year + 1}-01-01`
                      : `${year}-${scenario.start}`,
                employmentEndDate:
                  scenario.end === null
                    ? null
                    : scenario.end === "PREVIOUS"
                      ? `${year - 1}-12-31`
                      : `${year}-${scenario.end}`,
                months: base.months.map((month, index) => ({
                  ...month,
                  entgeltOrContinuationDays: (scenario.paid as readonly number[]).includes(
                    index + 1,
                  )
                    ? 1
                    : 0,
                })),
              });
              expect(result).toMatchObject({
                kind: "personal-annual-payment-entitlement",
                draft: true,
                completeGross: false,
                entitlementYear: year,
                eligibility: {
                  eligible: scenario.eligible[annexIndex],
                  reason: scenario.reason[annexIndex],
                },
                retainedMonthCount: scenario.paid.length,
                reducedMonthCount: 12 - scenario.paid.length,
                reductionFactor: { numerator: scenario.paid.length, denominator: 12 },
                sourcePolicy: {
                  packageId: base.pkg.packageId,
                  versionId: base.pkg.versionId,
                  variantId: annex,
                  regionId: territory,
                  eligibilityPolicy:
                    annex === "ANLAGE_31"
                      ? "ANLAGE_31_SECTION_16_1_AND_6"
                      : "ANLAGE_32_SECTION_16_1",
                  reductionPolicy: "ANLAGE_31_32_SECTION_16_4_WITH_EXCEPTIONS",
                  sourceIds: expect.arrayContaining([`caritas-avr-jsz-${year}`]),
                },
              });
              if (result.kind !== "personal-annual-payment-entitlement")
                throw new Error("Expected assessment");
              expect(result.sourcePolicy.ruleIds).toEqual(
                base.pkg.rules
                  .caritasAnnualPaymentRules!.filter(
                    (rule) =>
                      rule.entitlementYear === year &&
                      rule.variantId === annex &&
                      rule.regionId === territory,
                  )
                  .map((rule) => rule.id),
              );
              for (const field of [
                "rateBasisPoints",
                "groupReferenceDate",
                "groupIdAtSeptember1",
                "annualAmountCents",
                "monthlyGrossCents",
                "amountCents",
              ])
                expect(result).not.toHaveProperty(field);
            }
            for (const reductionException of exceptions(year)) {
              expect(
                assess(changeMonth(base, 4, { entgeltOrContinuationDays: 0, reductionException })),
              ).toMatchObject({
                eligibility: { eligible: true },
                reductionFactor: { numerator: 12, denominator: 12 },
                months: expect.arrayContaining([
                  expect.objectContaining({ month: `${year}-05`, decision: "RETAINED_EXCEPTION" }),
                ]),
              });
            }
          }
    },
  );

  it("keeps the month factor separate from a failed December-1 requirement", () => {
    const value = input();
    const result = assess({
      ...value,
      employmentStartDate: "2026-12-02",
      months: value.months.map((month, index) => ({
        ...month,
        entgeltOrContinuationDays: index === 11 ? 1 : 0,
      })),
    });
    expect(result).toMatchObject({
      eligibility: { eligible: false },
      reductionFactor: { numerator: 1, denominator: 12 },
    });
    expect(result).not.toHaveProperty("annualAmountCents");
  });

  it("preserves each possible exact month factor without rounding", () => {
    const value = input();
    for (let kept = 0; kept <= 12; kept++) {
      expect(
        assess({
          ...value,
          months: value.months.map((month, index) => ({
            ...month,
            entgeltOrContinuationDays: index < kept ? 1 : 0,
          })),
        }),
      ).toMatchObject({
        eligibility: { eligible: true },
        retainedMonthCount: kept,
        reducedMonthCount: 12 - kept,
        reductionFactor: { numerator: kept, denominator: 12 },
      });
    }
  });

  it("orders months canonically and uses one confirmed claim day to retain a partial month", () => {
    const value = input();
    expect(assess({ ...value, months: [...value.months].reverse() })).toEqual(assess(value));
    expect(assess(value)).toMatchObject({ reducedMonthCount: 0 });
  });

  it.each([false, undefined, 1, "true"])(
    "requires strict employment-history confirmation %s",
    (flag) => {
      failure(
        { ...input(), singleEmploymentHistoryConfirmed: flag } as Input,
        "EMPLOYMENT_HISTORY_UNCONFIRMED",
      );
    },
  );

  it.each([false, undefined, 1, "true"])("requires strict monthly confirmation %s", (flag) => {
    failure(
      changeMonth(input(), 0, { monthFactsConfirmed: flag } as Partial<Month>),
      "MONTH_FACTS_UNCONFIRMED",
    );
  });

  it.each([
    "2026-02-29",
    "2026-04-31",
    "2026-00-01",
    "2026-13-01",
    "2026-01-00",
    "2026-1-01",
    "2026-01-1",
    "1899-12-31",
    "2026-01-01T00:00:00Z",
    " 2026-01-01",
  ])("rejects an invalid employment date %s", (date) => {
    for (const field of ["employmentStartDate", "employmentEndDate"] as const)
      failure({ ...input(), [field]: date }, "INVALID_EMPLOYMENT_PERIOD");
  });

  it("rejects a reversed or unconfirmed end instead of treating it as open", () => {
    failure(
      { ...input(), employmentStartDate: "2026-06-01", employmentEndDate: "2026-05-31" },
      "INVALID_EMPLOYMENT_PERIOD",
    );
    failure(
      { ...input(), employmentEndDate: undefined } as unknown as Input,
      "INVALID_EMPLOYMENT_PERIOD",
    );
    failure(
      { ...input(), employmentStartDate: 20260101 } as unknown as Input,
      "INVALID_EMPLOYMENT_PERIOD",
    );
  });

  it.each([2025, 2026] as const)("accepts a real prior leap day for %s history", (year) => {
    expect(assess({ ...input("bw", year), employmentStartDate: "2024-02-29" })).toMatchObject({
      eligibility: { eligible: true },
    });
  });

  it("rejects missing, duplicate, extra, wrong-year or malformed months", () => {
    const value = input();
    failure({ ...value, months: value.months.slice(1) }, "INVALID_MONTHS");
    failure({ ...value, months: [...value.months, value.months[0]] }, "INVALID_MONTHS");
    failure(
      { ...value, months: [value.months[0], ...value.months.slice(0, 11)] },
      "INVALID_MONTHS",
    );
    for (const month of ["2025-01", "2026-1", "2026-13", "2026-01-01"])
      failure(changeMonth(value, 0, { month }), "INVALID_MONTHS");
    failure({ ...value, months: undefined } as unknown as Input, "INVALID_MONTHS");
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER])(
    "rejects invalid claim-day count %s",
    (entgeltOrContinuationDays) => {
      failure(changeMonth(input(), 0, { entgeltOrContinuationDays }), "INVALID_ENTGELT_DAYS");
    },
  );

  it("uses actual calendar month lengths", () => {
    const value = input();
    expect(assess(changeMonth(value, 1, { entgeltOrContinuationDays: 28 }))).toMatchObject({
      retainedMonthCount: 12,
    });
    failure(changeMonth(value, 1, { entgeltOrContinuationDays: 29 }), "INVALID_ENTGELT_DAYS");
    failure(changeMonth(value, 3, { entgeltOrContinuationDays: 31 }), "INVALID_ENTGELT_DAYS");
    expect(assess(changeMonth(value, 0, { entgeltOrContinuationDays: 31 }))).toMatchObject({
      retainedMonthCount: 12,
    });
  });

  it("limits claim days to the inclusive employment interval", () => {
    const value = input();
    const base = {
      ...value,
      employmentStartDate: "2026-01-15",
      employmentEndDate: "2026-01-31",
      months: value.months.map((month, index) => ({
        ...month,
        entgeltOrContinuationDays: index === 0 ? 17 : 0,
      })),
    };
    expect(assess(base)).toMatchObject({ retainedMonthCount: 1 });
    failure(changeMonth(base, 0, { entgeltOrContinuationDays: 18 }), "ENTGELT_OUTSIDE_EMPLOYMENT");
    failure(changeMonth(base, 1, { entgeltOrContinuationDays: 1 }), "ENTGELT_OUTSIDE_EMPLOYMENT");
  });

  it("requires an explicit supported exception instead of guessing", () => {
    for (const reductionException of [undefined, { kind: "UNKNOWN" }, { kind: "PARENTAL_LEAVE" }])
      failure(
        changeMonth(input(), 4, {
          entgeltOrContinuationDays: 0,
          reductionException,
        } as Partial<Month>),
        "UNKNOWN_REDUCTION_EXCEPTION",
      );
  });

  it.each(exceptions(2026).map((exception) => ({ kind: exception.kind, exception })))(
    "requires every explicit prerequisite of $kind",
    ({ exception }) => {
      const flagNames = Object.keys(exception).filter((key) => key.endsWith("Confirmed"));
      for (const field of flagNames)
        for (const flag of [false, undefined, 1, "true"])
          failure(
            changeMonth(input(), 4, {
              entgeltOrContinuationDays: 0,
              reductionException: { ...exception, [field]: flag } as Exception,
            }),
            "EXCEPTION_UNCONFIRMED",
          );
    },
  );

  it("does not accept an unnecessary exception on a month already retained by claim days", () => {
    failure(
      changeMonth(input(), 4, { reductionException: exceptions(2026)[3] }),
      "EXCEPTION_WITH_ENTGELT_DAYS",
    );
  });

  it("does not claim exceptions outside the confirmed employment", () => {
    const value = input();
    const base = {
      ...value,
      employmentStartDate: "2026-06-01",
      months: value.months.map((month, index) => ({
        ...month,
        entgeltOrContinuationDays: index < 5 ? 0 : 1,
      })),
    };
    failure(
      changeMonth(base, 4, { reductionException: exceptions(2026)[3] }),
      "EXCEPTION_OUTSIDE_EMPLOYMENT",
    );
  });

  it.each(["2026-12-01", "2026-12-31", "2027-01-01", "2026-04-30", "2025-11-30", "2026-11-31"])(
    "rejects a non-applicable service end %s",
    (serviceEndDate) => {
      const exception = { ...exceptions(2026)[0], serviceEndDate } as Exception;
      failure(
        changeMonth(input(), 4, { entgeltOrContinuationDays: 0, reductionException: exception }),
        "EXCEPTION_NOT_APPLICABLE",
      );
    },
  );

  it("accepts service ending on November 30 with immediate return confirmed", () => {
    expect(
      assess(
        changeMonth(input(), 10, {
          entgeltOrContinuationDays: 0,
          reductionException: { ...exceptions(2026)[0], serviceEndDate: "2026-11-30" } as Exception,
        }),
      ),
    ).toMatchObject({ reductionFactor: { numerator: 12, denominator: 12 } });
  });

  it.each(["2025-05-15", "2027-05-15", "2026-06-01", "2026-02-29", "2026-05-32"])(
    "rejects a non-applicable birth date %s",
    (birthDate) => {
      failure(
        changeMonth(input(), 4, {
          entgeltOrContinuationDays: 0,
          reductionException: { ...exceptions(2026)[2], birthDate } as Exception,
        }),
        "EXCEPTION_NOT_APPLICABLE",
      );
    },
  );

  it("allows a birth on the first day with a confirmed preceding pay claim outside the zero-claim month", () => {
    expect(
      assess(
        changeMonth(input(), 4, {
          entgeltOrContinuationDays: 0,
          reductionException: { ...exceptions(2026)[2], birthDate: "2026-05-01" } as Exception,
        }),
      ),
    ).toMatchObject({ retainedMonthCount: 12 });
    for (const birthDate of ["2026-05-02", "2026-05-31"])
      failure(
        changeMonth(input(), 4, {
          entgeltOrContinuationDays: 0,
          reductionException: { ...exceptions(2026)[2], birthDate } as Exception,
        }),
        "EXCEPTION_NOT_APPLICABLE",
      );
  });

  it("keeps qualifying parental leave only through the birth year", () => {
    const value = input();
    expect(
      assess(
        changeMonth(value, 11, {
          entgeltOrContinuationDays: 0,
          reductionException: { ...exceptions(2026)[2], birthDate: "2026-05-15" } as Exception,
        }),
      ),
    ).toMatchObject({ retainedMonthCount: 12 });
  });

  it.each([2024, 2027, 2026.5, Number.NaN])("rejects unsupported year %s", (entitlementYear) => {
    failure({ ...input(), entitlementYear }, "OUTSIDE_ENTITLEMENT_YEAR");
  });

  it("does not use a different annual package year", () => {
    failure({ ...input(), entitlementYear: 2025 }, "OUTSIDE_ENTITLEMENT_YEAR");
  });

  it.each(["variantId", "regionId"] as const)("rejects unknown %s", (field) => {
    failure({ ...input(), [field]: "UNKNOWN" }, "UNKNOWN_SELECTION");
  });

  it("requires the norm source and annual rule coverage", () => {
    const value = input();
    const index = value.pkg.sources.findIndex((source) => source.id === "caritas-avr-jsz-2026");
    expect(index).toBeGreaterThanOrEqual(0);
    value.pkg.sources.splice(index, 1);
    failure(value, "INVALID_PACKAGE");
    const noRules = input();
    delete noRules.pkg.rules.caritasAnnualPaymentRules;
    failure(noRules, "MISSING_ANNUAL_PAYMENT_RULE");
    const missingBand = input();
    missingBand.pkg.rules.caritasAnnualPaymentRules!.pop();
    failure(missingBand, "INVALID_PACKAGE");
  });

  it.each(["old-contract", "activated", "wrong-eligibility", "wrong-reduction"])(
    "rejects %s contract drift",
    (caseName) => {
      const value = input();
      if (caseName === "old-contract") value.pkg.engineContractVersion = 11;
      if (caseName === "activated")
        Object.assign(value.pkg.rules.selection!.capabilities, { annualPayment: "SUPPORTED" });
      if (caseName === "wrong-eligibility")
        value.pkg.rules.caritasAnnualPaymentRules!.find(
          (rule) => rule.variantId === value.variantId,
        )!.eligibilityPolicy = "ANLAGE_31_SECTION_16_1_AND_6";
      if (caseName === "wrong-reduction")
        Object.assign(value.pkg.rules.caritasAnnualPaymentRules![0], { reductionPolicy: "OTHER" });
      failure(value, "INVALID_PACKAGE");
    },
  );

  it("rejects a service end before the confirmed employment start in the same month", () => {
    const value = input();
    const base = {
      ...value,
      employmentStartDate: "2026-05-15",
      months: value.months.map((month, index) => ({
        ...month,
        entgeltOrContinuationDays: index <= 4 ? 0 : 1,
      })),
    };
    const result = assess(
      changeMonth(base, 4, {
        reductionException: {
          ...exceptions(2026)[0],
          serviceEndDate: "2026-05-14",
        } as Exception,
      }),
    );
    expect(result.kind).toBe("unavailable");
    if (result.kind === "unavailable") expect(result.reason).toBe("EXCEPTION_NOT_APPLICABLE");
  });

  it("rejects birth after the last employment day in the same month", () => {
    const value = input();
    const base = {
      ...value,
      employmentEndDate: "2026-05-14",
      months: value.months.map((month, index) => ({
        ...month,
        entgeltOrContinuationDays: index >= 4 ? 0 : 1,
      })),
    };
    const result = assess(
      changeMonth(base, 4, {
        reductionException: {
          ...exceptions(2026)[2],
          birthDate: "2026-05-15",
        } as Exception,
      }),
    );
    expect(result.kind).toBe("unavailable");
    if (result.kind === "unavailable") expect(result.reason).toBe("EXCEPTION_NOT_APPLICABLE");
  });

  it("rejects a service end after the confirmed employment ended", () => {
    const value = input();
    const base = {
      ...value,
      employmentEndDate: "2026-05-31",
      months: value.months.map((month, index) => ({
        ...month,
        entgeltOrContinuationDays: index >= 4 ? 0 : 1,
      })),
    };
    failure(
      changeMonth(base, 4, {
        reductionException: {
          ...exceptions(2026)[0],
          serviceEndDate: "2026-11-30",
        } as Exception,
      }),
      "EXCEPTION_NOT_APPLICABLE",
    );
  });

  it("copies monthly facts, nested exceptions and provenance, dropping unknown money fields", () => {
    const value = changeMonth(input(), 4, {
      entgeltOrContinuationDays: 0,
      reductionException: exceptions(2026)[2],
    });
    Object.assign(value.months[4], { annualAmountCents: 999 });
    Object.assign(value.months[4].reductionException, { rateBasisPoints: 8600 });
    const before = JSON.stringify(value);
    const result = assess(value);
    expect(JSON.stringify(value)).toBe(before);
    if (result.kind !== "personal-annual-payment-entitlement")
      throw new Error("Expected assessment");
    expect(result.months[4]).not.toBe(value.months[4]);
    expect(result.months[4].reductionException).not.toBe(value.months[4].reductionException);
    expect(result.months[4]).not.toHaveProperty("annualAmountCents");
    expect(result.months[4].reductionException).not.toHaveProperty("rateBasisPoints");
    const snapshot = JSON.stringify(result);
    Object.assign(value.months[4], { entgeltOrContinuationDays: 5 });
    Object.assign(value.months[4].reductionException, { birthDate: "2025-01-01" });
    value.pkg.rules.caritasAnnualPaymentRules![0].sourceIds.push("input-only");
    expect(JSON.stringify(result)).toBe(snapshot);
    (result.sourcePolicy.sourceIds as string[]).push("output-only");
    (result.sourcePolicy.ruleIds as string[]).push("output-only");
    expect(JSON.stringify(value)).not.toContain("output-only");
  });
});
