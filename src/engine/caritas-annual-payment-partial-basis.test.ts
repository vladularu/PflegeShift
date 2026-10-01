import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "../rules/contracts.generated";
import {
  calculateCaritasAnnualPaymentPartialBasis as calculate,
  type CaritasAnnualPaymentPartialBasisInput as Input,
} from "./caritas-annual-payment-partial-basis";

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
    .selection!.variants.find((variant) => variant.id === annex)!
    .regions.find((item) => item.id === basisRegionId)!.payTableId!;
  return {
    pkg,
    entitlementYear: year,
    variantId: annex,
    regionId,
    groupIdAtSeptember1: "p6",
    septemberGroupConfirmed: true,
    referenceCase: "PARTIAL_MONTHS",
    partialReferencePeriodConfirmed: true,
    paidMonths: [7, 8, 9].map((month, index) => ({
      month: `${year}-${String(month).padStart(2, "0")}`,
      personalPaidBasisCents: (index + 2) * 100000,
      basisRegionId,
      basisPayTableId,
      entgeltCalendarDays: 20,
      sickPaySupplementCalendarDays: 0,
      noEntgeltCalendarDays: index === 2 ? 10 : 11,
      calendarDayBreakdownConfirmed: true,
      section16BasisConfirmed: true,
    })),
  };
}

function failure(value: Input, reason: string) {
  expect(calculate(value)).toEqual({ kind: "unavailable", reason });
}

function septemberOnly(days: number, amount = days * 10000): Input {
  const value = input();
  return {
    ...value,
    paidMonths: value.paidMonths.map((month, index) => ({
      ...month,
      entgeltCalendarDays: index === 2 ? days : 0,
      noEntgeltCalendarDays: index === 2 ? 30 - days : 31,
      personalPaidBasisCents: index === 2 ? amount : 0,
    })),
  };
}

describe("Caritas partial personal annual-payment basis", () => {
  it.each(["bw", "bayern", "mitte", "nord", "nrw", "ost"])(
    "covers both years, annexes and all P groups in %s",
    (region) => {
      const territories =
        region === "ost"
          ? ["OST_TARIF_OST", "OST_TARIF_WEST_BERLIN", "OST_TARIF_WEST_HAMBURG"]
          : [region.toUpperCase()];
      for (const year of [2025, 2026] as const)
        for (const annex of ["ANLAGE_31", "ANLAGE_32"])
          for (const territory of territories)
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
              const value = {
                ...input(region, year, annex, territory),
                groupIdAtSeptember1: group,
              };
              const result = calculate(value);
              expect(result).toMatchObject({
                kind: "personal-annual-payment-partial-basis",
                draft: true,
                completeGross: false,
                entitlementYear: year,
                groupIdAtSeptember1: group,
                groupReferenceDate: `${year}-09-01`,
                septemberGroupConfirmed: true,
                referenceCase: "PARTIAL_MONTHS",
                partialReferencePeriodConfirmed: true,
                paidBasisTotalCents: 900000,
                entgeltCalendarDays: 60,
                excludedSickPaySupplementCalendarDays: 0,
                noEntgeltCalendarDays: 32,
                normalizationFactor: { numerator: 3067, denominator: 100 },
                meanMonthlyBasis: { numeratorCents: 460050, denominator: 1 },
                annualRule: {
                  variantId: annex,
                  regionId: territory,
                  entitlementYear: year,
                  basisRegionId: value.paidMonths[0].basisRegionId,
                  basisPayTableId: value.paidMonths[0].basisPayTableId,
                  rateBasisPoints: ["p4", "p6", "p7", "p8"].includes(group) ? 8600 : 7600,
                  sourceIds: expect.arrayContaining([`caritas-avr-jsz-${year}`]),
                },
              });
              for (const field of [
                "amountCents",
                "annualAmountCents",
                "grossCents",
                "entitlementConfirmed",
              ])
                expect(result).not.toHaveProperty(field);
            }
    },
  );

  it("keeps fractional cents exact and preserves already personal changing-month amounts", () => {
    const value = input();
    const result = calculate({
      ...value,
      paidMonths: value.paidMonths.map((month, index) => ({
        ...month,
        personalPaidBasisCents: month.personalPaidBasisCents + (index === 0 ? 1 : 0),
      })),
    });
    expect(result).toMatchObject({
      paidBasisTotalCents: 900001,
      meanMonthlyBasis: { numeratorCents: 2760303067, denominator: 6000 },
    });
  });

  it("excludes a full sick-supplement month and an additional supplement day", () => {
    const value = input();
    const result = calculate({
      ...value,
      referenceCase: "SICK_PAY_SUPPLEMENT",
      paidMonths: value.paidMonths.map((month, index) => ({
        ...month,
        personalPaidBasisCents: index === 0 ? 0 : month.personalPaidBasisCents,
        entgeltCalendarDays: index === 0 ? 0 : 30,
        sickPaySupplementCalendarDays: index === 0 ? 31 : index === 1 ? 1 : 0,
        noEntgeltCalendarDays: 0,
      })),
    });
    expect(result).toMatchObject({
      referenceCase: "SICK_PAY_SUPPLEMENT",
      paidBasisTotalCents: 700000,
      entgeltCalendarDays: 60,
      excludedSickPaySupplementCalendarDays: 32,
      noEntgeltCalendarDays: 0,
      meanMonthlyBasis: { numeratorCents: 1073450, denominator: 3 },
    });
  });

  it("accepts a zero-amount month without entgelt days and exactly 30 reference days", () => {
    expect(calculate(septemberOnly(30))).toMatchObject({
      paidBasisTotalCents: 300000,
      entgeltCalendarDays: 30,
      noEntgeltCalendarDays: 62,
      meanMonthlyBasis: { numeratorCents: 306700, denominator: 1 },
    });
  });

  it.each([0, 1, 29])("requires a separate fallback month below 30 days (%i)", (days) => {
    failure(septemberOnly(days), "FALLBACK_REFERENCE_MONTH_REQUIRED");
  });

  it("handles 91 paid days but rejects ordinary complete 92-day reference periods", () => {
    const value = input();
    const paidMonths = value.paidMonths.map((month, index) => ({
      ...month,
      entgeltCalendarDays: index === 2 ? 29 : 31,
      noEntgeltCalendarDays: index === 2 ? 1 : 0,
      personalPaidBasisCents: index === 2 ? 290000 : 310000,
    }));
    expect(calculate({ ...value, paidMonths })).toMatchObject({
      entgeltCalendarDays: 91,
      meanMonthlyBasis: { numeratorCents: 306700, denominator: 1 },
    });
    failure(
      {
        ...value,
        paidMonths: paidMonths.map((month, index) =>
          index === 2
            ? {
                ...month,
                entgeltCalendarDays: 30,
                noEntgeltCalendarDays: 0,
                personalPaidBasisCents: 300000,
              }
            : month,
        ),
      },
      "REFERENCE_CASE_MISMATCH",
    );
  });

  it("normalizes arbitrary month order without changing the input", () => {
    const value = input();
    const reordered = { ...value, paidMonths: [...value.paidMonths].reverse() };
    const before = structuredClone(reordered);
    const result = calculate(reordered);
    expect(result).toMatchObject({
      paidMonths: [
        expect.objectContaining({ month: "2026-07" }),
        expect.objectContaining({ month: "2026-08" }),
        expect.objectContaining({ month: "2026-09" }),
      ],
    });
    expect(reordered).toEqual(before);
    if (result.kind === "unavailable") throw new Error("Expected a partial basis");
    expect(result.paidMonths[0]).not.toBe(reordered.paidMonths[2]);
    expect(result.annualRule.sourceIds).not.toBe(
      value.pkg.rules.caritasAnnualPaymentRules![0].sourceIds,
    );
    value.pkg.sources[0].title = "Changed only in the original package";
    (result.paidMonths[0] as { personalPaidBasisCents: number }).personalPaidBasisCents = 1;
    (result.annualRule.sourceIds as string[]).push("result-only-source");
    expect(value.paidMonths[0].personalPaidBasisCents).toBe(200000);
    expect(
      value.pkg.rules.caritasAnnualPaymentRules!.some((rule) =>
        rule.sourceIds.includes("result-only-source"),
      ),
    ).toBe(false);
  });

  it.each([
    "ORDINARY_FULL_MONTHS",
    "LATE_ENTRY",
    "PARENTAL_LEAVE",
    "EARLY_EXIT",
    "UNKNOWN",
  ] as const)("rejects other reference cases: %s", (referenceCase) =>
    failure({ ...input(), referenceCase }, "UNSUPPORTED_REFERENCE_CASE"),
  );

  it.each(["partialReferencePeriodConfirmed", "septemberGroupConfirmed"] as const)(
    "requires strict confirmation of %s",
    (field) => {
      for (const value of [false, undefined, "true"])
        failure(
          { ...input(), [field]: value as boolean },
          field === "septemberGroupConfirmed"
            ? "REFERENCE_GROUP_UNCONFIRMED"
            : "REFERENCE_CASE_UNCONFIRMED",
        );
    },
  );

  it.each(["calendarDayBreakdownConfirmed", "section16BasisConfirmed"] as const)(
    "requires strict monthly confirmation of %s",
    (field) => {
      const value = input();
      for (let index = 0; index < 3; index++)
        for (const flag of [false, undefined, "true"])
          failure(
            {
              ...value,
              paidMonths: value.paidMonths.map((month, monthIndex) =>
                monthIndex === index ? { ...month, [field]: flag as boolean } : month,
              ),
            },
            field === "calendarDayBreakdownConfirmed"
              ? "CALENDAR_DAYS_UNCONFIRMED"
              : "MONTH_BASIS_UNCONFIRMED",
          );
    },
  );

  it.each([
    "entgeltCalendarDays",
    "sickPaySupplementCalendarDays",
    "noEntgeltCalendarDays",
  ] as const)("rejects malformed day counts in %s", (field) => {
    const value = input();
    for (const days of [-1, 0.5, NaN, Infinity, 33, Number.MAX_SAFE_INTEGER + 1, "20", undefined])
      for (let index = 0; index < 3; index++)
        failure(
          {
            ...value,
            paidMonths: value.paidMonths.map((month, monthIndex) =>
              index === monthIndex ? { ...month, [field]: days as number } : month,
            ),
          },
          "INVALID_CALENDAR_DAYS",
        );
  });

  it("rejects missing or overcounted days for each actual calendar month", () => {
    const value = input();
    for (let index = 0; index < 3; index++)
      for (const difference of [-1, 1])
        failure(
          {
            ...value,
            paidMonths: value.paidMonths.map((month, monthIndex) =>
              monthIndex === index
                ? {
                    ...month,
                    noEntgeltCalendarDays: month.noEntgeltCalendarDays + difference,
                  }
                : month,
            ),
          },
          "INVALID_CALENDAR_DAYS",
        );
  });

  it("requires the case to match whether sick-supplement periods were excluded", () => {
    const value = input();
    failure({ ...value, referenceCase: "SICK_PAY_SUPPLEMENT" }, "REFERENCE_CASE_MISMATCH");
    failure(
      {
        ...value,
        paidMonths: value.paidMonths.map((month, index) =>
          index === 0
            ? {
                ...month,
                sickPaySupplementCalendarDays: 1,
                noEntgeltCalendarDays: 10,
              }
            : month,
        ),
      },
      "REFERENCE_CASE_MISMATCH",
    );
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "10000"])(
    "rejects invalid paid-month amounts: %s",
    (amount) => {
      const value = input();
      failure(
        {
          ...value,
          paidMonths: value.paidMonths.map((month, index) =>
            index === 0 ? { ...month, personalPaidBasisCents: amount as number } : month,
          ),
        },
        "INVALID_MONTH_BASIS",
      );
    },
  );

  it("rejects a nonzero amount in a month with only supplement or no-entgelt days", () => {
    const value = septemberOnly(30);
    failure(
      {
        ...value,
        paidMonths: value.paidMonths.map((month, index) =>
          index === 0 ? { ...month, personalPaidBasisCents: 1 } : month,
        ),
      },
      "INVALID_MONTH_BASIS",
    );
    failure(
      {
        ...value,
        referenceCase: "SICK_PAY_SUPPLEMENT",
        paidMonths: value.paidMonths.map((month, index) =>
          index === 0
            ? {
                ...month,
                noEntgeltCalendarDays: 0,
                sickPaySupplementCalendarDays: 31,
                personalPaidBasisCents: 10000,
              }
            : month,
        ),
      },
      "INVALID_MONTH_BASIS",
    );
  });

  it("rejects malformed, duplicate, missing and foreign reference months", () => {
    const value = input();
    for (const paidMonths of [
      undefined,
      null,
      "months",
      [null, null, null],
      value.paidMonths.slice(1),
      [...value.paidMonths, value.paidMonths[0]],
      [value.paidMonths[0], value.paidMonths[0], value.paidMonths[2]],
      ...["2025-07", "2026-7", "2026-06", "2026-07-01"].map((month) =>
        value.paidMonths.map((item, index) => (index === 0 ? { ...item, month } : item)),
      ),
    ])
      failure(
        { ...value, paidMonths: paidMonths as Input["paidMonths"] },
        "INVALID_REFERENCE_MONTHS",
      );
  });

  it("requires exact annual-basis table and region identities in every month", () => {
    for (const year of [2025, 2026] as const) {
      const value = input("ost", year);
      for (const field of ["basisRegionId", "basisPayTableId"] as const)
        for (let index = 0; index < 3; index++)
          failure(
            {
              ...value,
              paidMonths: value.paidMonths.map((month, monthIndex) =>
                monthIndex === index ? { ...month, [field]: "foreign-basis" } : month,
              ),
            },
            "BASIS_IDENTITY_MISMATCH",
          );
      const wrongBasis = year === 2025 ? "OST_TARIF_OST" : "OST_TARIF_WEST_HAMBURG";
      failure(
        {
          ...value,
          paidMonths: value.paidMonths.map((month) => ({
            ...month,
            basisRegionId: wrongBasis,
          })),
        },
        "BASIS_IDENTITY_MISMATCH",
      );
    }
  });

  it("rejects summation overflow and an unrepresentable reduced rational numerator", () => {
    const value = input();
    for (const first of [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 2])
      failure(
        {
          ...value,
          paidMonths: value.paidMonths.map((month, index) => ({
            ...month,
            personalPaidBasisCents: index === 0 ? first : 1,
          })),
        },
        "AMOUNT_OVERFLOW",
      );
  });

  it("cancels before multiplication so a safe exact result survives a large raw product", () => {
    const value = input();
    const units = Math.floor(Number.MAX_SAFE_INTEGER / 6000);
    expect(
      calculate({
        ...value,
        paidMonths: value.paidMonths.map((month, index) => ({
          ...month,
          personalPaidBasisCents: index === 0 ? units * 6000 - 2 : 1,
        })),
      }),
    ).toMatchObject({
      meanMonthlyBasis: { numeratorCents: units * 3067, denominator: 1 },
    });
  });

  it("retains the largest safe normalized integer and rejects the next one", () => {
    const units = Math.floor(Number.MAX_SAFE_INTEGER / 3067);
    expect(calculate(septemberOnly(30, units * 3000))).toMatchObject({
      meanMonthlyBasis: { numeratorCents: units * 3067, denominator: 1 },
    });
    failure(septemberOnly(30, (units + 1) * 3000), "AMOUNT_OVERFLOW");
  });

  it("propagates unavailable annual rules, invalid packages and unknown selections", () => {
    const value = input();
    const missingRules = structuredClone(value.pkg);
    delete missingRules.rules.caritasAnnualPaymentRules;
    failure({ ...value, pkg: missingRules }, "MISSING_ANNUAL_PAYMENT_RULE");
    const missingSource = structuredClone(value.pkg);
    const sourceIndex = missingSource.sources.findIndex(
      (source) => source.id === "caritas-avr-jsz-2026",
    );
    expect(sourceIndex).toBeGreaterThanOrEqual(0);
    missingSource.sources.splice(sourceIndex, 1);
    failure({ ...value, pkg: missingSource }, "INVALID_PACKAGE");
    failure({ ...value, pkg: { ...value.pkg, status: "REVIEWED" } }, "INVALID_PACKAGE");
    failure({ ...value, entitlementYear: 2027 }, "OUTSIDE_ENTITLEMENT_YEAR");
    failure({ ...value, variantId: "ANLAGE_33" }, "UNKNOWN_SELECTION");
    failure({ ...value, regionId: "foreign" }, "UNKNOWN_SELECTION");
    failure({ ...value, groupIdAtSeptember1: "p5" }, "UNKNOWN_PAY_GROUP");
  });
});
