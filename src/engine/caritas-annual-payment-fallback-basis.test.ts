import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "../rules/contracts.generated";
import type { CaritasAnnualPaymentPartialMonth } from "./caritas-annual-payment-partial-basis";
import {
  calculateCaritasAnnualPaymentFallbackBasis as calculate,
  type CaritasAnnualPaymentFallbackBasisInput as Input,
} from "./caritas-annual-payment-fallback-basis";

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
      personalPaidBasisCents: index === 2 ? 200000 : 0,
      basisRegionId,
      basisPayTableId,
      entgeltCalendarDays: index === 2 ? 20 : 0,
      sickPaySupplementCalendarDays: 0,
      noEntgeltCalendarDays: index === 2 ? 10 : 31,
      calendarDayBreakdownConfirmed: true,
      section16BasisConfirmed: true,
    })),
    replacementMonth: {
      month: `${year}-06`,
      personalMonthlyBasisCents: 300001,
      basisRegionId,
      fullCalendarMonthEntgeltConfirmed: true,
      historicalSection16BasisConfirmed: true,
      sameEmploymentConfirmed: true,
      lastApplicableFullMonthConfirmed: true,
    },
  };
}

function failure(value: Input, reason: string) {
  expect(calculate(value)).toEqual({ kind: "unavailable", reason });
}

function withDays(value: Input, days: number, sick = false): Input {
  let remaining = days;
  return {
    ...value,
    referenceCase: sick ? "SICK_PAY_SUPPLEMENT" : "PARTIAL_MONTHS",
    paidMonths: value.paidMonths.map((month, index) => {
      const calendarDays = index === 2 ? 30 : 31;
      const entgeltCalendarDays = Math.min(remaining, calendarDays);
      remaining -= entgeltCalendarDays;
      return {
        ...month,
        entgeltCalendarDays,
        personalPaidBasisCents: entgeltCalendarDays * 10000,
        sickPaySupplementCalendarDays: sick ? calendarDays - entgeltCalendarDays : 0,
        noEntgeltCalendarDays: sick ? 0 : calendarDays - entgeltCalendarDays,
      };
    }),
  };
}

describe("Caritas historical full-month fallback annual-payment basis", () => {
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
              expect(calculate(value)).toMatchObject({
                kind: "personal-annual-payment-fallback-basis",
                draft: true,
                completeGross: false,
                entitlementYear: year,
                groupIdAtSeptember1: group,
                groupReferenceDate: `${year}-09-01`,
                septemberGroupConfirmed: true,
                referenceCase: "PARTIAL_MONTHS",
                partialReferencePeriodConfirmed: true,
                referenceEntgeltCalendarDays: 20,
                referenceExcludedSickPaySupplementCalendarDays: 0,
                referencePaidBasisTotalCents: 200000,
                replacementMonth: {
                  month: `${year}-06`,
                  personalMonthlyBasisCents: 300001,
                  basisRegionId: value.replacementMonth.basisRegionId,
                  fullCalendarMonthEntgeltConfirmed: true,
                  historicalSection16BasisConfirmed: true,
                  sameEmploymentConfirmed: true,
                  lastApplicableFullMonthConfirmed: true,
                },
                meanMonthlyBasis: { numeratorCents: 300001, denominator: 1 },
                annualRule: {
                  entitlementYear: year,
                  variantId: annex,
                  regionId: territory,
                  basisRegionId: value.replacementMonth.basisRegionId,
                  basisPayTableId: value.paidMonths[0].basisPayTableId,
                  rateBasisPoints: ["p4", "p6", "p7", "p8"].includes(group) ? 8600 : 7600,
                  sourceIds: expect.arrayContaining([`caritas-avr-jsz-${year}`]),
                },
              });
            }
    },
  );

  it.each([0, 1, 29])(
    "uses the replacement amount without averaging or adding %i reference days",
    (days) => {
      expect(calculate(withDays(input(), days))).toMatchObject({
        referenceEntgeltCalendarDays: days,
        referencePaidBasisTotalCents: days * 10000,
        meanMonthlyBasis: { numeratorCents: 300001, denominator: 1 },
      });
    },
  );

  it.each([30, 60, 91])("rejects fallback for %i entgelt days", (days) => {
    failure(withDays(input(), days), "FALLBACK_NOT_REQUIRED");
  });

  it("keeps complete reference periods outside the fallback case", () => {
    failure(withDays(input(), 92), "REFERENCE_CASE_MISMATCH");
  });

  it("uses the same guarded fallback for excluded sick-supplement periods", () => {
    expect(calculate(withDays(input(), 29, true))).toMatchObject({
      referenceCase: "SICK_PAY_SUPPLEMENT",
      referenceEntgeltCalendarDays: 29,
      referenceExcludedSickPaySupplementCalendarDays: 63,
      meanMonthlyBasis: { numeratorCents: 300001, denominator: 1 },
    });
  });

  it("accepts a confirmed earlier-year full month, including leap February, without a current table claim", () => {
    const value = input("bw", 2025);
    const result = calculate({
      ...value,
      replacementMonth: { ...value.replacementMonth, month: "2024-02" },
    });
    expect(result).toMatchObject({
      replacementMonth: { month: "2024-02" },
      meanMonthlyBasis: { numeratorCents: 300001, denominator: 1 },
    });
    if (result.kind === "unavailable") throw new Error("Expected a historical basis");
    expect(result.replacementMonth).not.toHaveProperty("basisPayTableId");
    expect(result.replacementMonth).not.toHaveProperty("packageId");
    expect(result.replacementMonth).not.toHaveProperty("sourceIds");
    for (const field of [
      "amountCents",
      "annualAmountCents",
      "grossCents",
      "entitlementConfirmed",
      "normalizationFactor",
    ])
      expect(result).not.toHaveProperty(field);
  });

  it.each([
    ["fullCalendarMonthEntgeltConfirmed", "REPLACEMENT_FULL_MONTH_UNCONFIRMED"],
    ["historicalSection16BasisConfirmed", "HISTORICAL_BASIS_UNCONFIRMED"],
    ["sameEmploymentConfirmed", "EMPLOYMENT_IDENTITY_UNCONFIRMED"],
    ["lastApplicableFullMonthConfirmed", "LAST_FULL_MONTH_UNCONFIRMED"],
  ] as const)("requires strict replacement-month confirmation of %s", (field, reason) => {
    const value = input();
    for (const flag of [false, undefined, "true"])
      failure(
        { ...value, replacementMonth: { ...value.replacementMonth, [field]: flag as boolean } },
        reason,
      );
  });

  it("rejects missing, malformed, future and reference-period replacement months", () => {
    const value = input();
    for (const replacementMonth of [undefined, null, "month", {}])
      failure(
        { ...value, replacementMonth: replacementMonth as Input["replacementMonth"] },
        "INVALID_REPLACEMENT_MONTH",
      );
    for (const month of [
      "1899-12",
      "2026-6",
      "2026-00",
      "2026-13",
      "2026-06-01",
      "2026-07",
      "2026-09",
      "2026-10",
      "2027-01",
    ])
      failure(
        { ...value, replacementMonth: { ...value.replacementMonth, month } },
        "INVALID_REPLACEMENT_MONTH",
      );
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "300001"])(
    "rejects unsafe or invalid replacement amounts: %s",
    (amount) => {
      const value = input();
      failure(
        {
          ...value,
          replacementMonth: {
            ...value.replacementMonth,
            personalMonthlyBasisCents: amount as number,
          },
        },
        "INVALID_MONTH_BASIS",
      );
    },
  );

  it("retains a safe maximum and already personal amounts without a second part-time reduction", () => {
    const value = input();
    for (const amount of [1, 175001, Number.MAX_SAFE_INTEGER])
      expect(
        calculate({
          ...value,
          replacementMonth: { ...value.replacementMonth, personalMonthlyBasisCents: amount },
        }),
      ).toMatchObject({ meanMonthlyBasis: { numeratorCents: amount, denominator: 1 } });
  });

  it("requires the dated annual basis region independently of historical amount confirmation", () => {
    for (const year of [2025, 2026] as const) {
      const value = input("ost", year);
      for (const basisRegionId of [
        "foreign",
        year === 2025 ? "OST_TARIF_OST" : "OST_TARIF_WEST_HAMBURG",
      ])
        failure(
          { ...value, replacementMonth: { ...value.replacementMonth, basisRegionId } },
          "BASIS_IDENTITY_MISMATCH",
        );
    }
  });

  it.each([
    "ORDINARY_FULL_MONTHS",
    "LATE_ENTRY",
    "PARENTAL_LEAVE",
    "EARLY_EXIT",
    "UNKNOWN",
  ] as const)("keeps other reference cases unavailable: %s", (referenceCase) => {
    failure({ ...input(), referenceCase }, "UNSUPPORTED_REFERENCE_CASE");
  });

  it.each(["partialReferencePeriodConfirmed", "septemberGroupConfirmed"] as const)(
    "preserves the root confirmation guard for %s",
    (field) => {
      for (const flag of [false, undefined, "true"])
        failure(
          { ...input(), [field]: flag as boolean },
          field === "septemberGroupConfirmed"
            ? "REFERENCE_GROUP_UNCONFIRMED"
            : "REFERENCE_CASE_UNCONFIRMED",
        );
    },
  );

  it.each(["calendarDayBreakdownConfirmed", "section16BasisConfirmed"] as const)(
    "preserves all three monthly confirmation guards for %s",
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

  it("cannot bypass invalid reference day counts, amounts, identities or sick-period classification", () => {
    const value = input();
    const cases: [Partial<CaritasAnnualPaymentPartialMonth>, string][] = [
      [{ entgeltCalendarDays: -1 }, "INVALID_CALENDAR_DAYS"],
      [{ entgeltCalendarDays: 20.5 }, "INVALID_CALENDAR_DAYS"],
      [{ noEntgeltCalendarDays: 11 }, "INVALID_CALENDAR_DAYS"],
      [{ noEntgeltCalendarDays: 9 }, "INVALID_CALENDAR_DAYS"],
      [{ personalPaidBasisCents: 0 }, "INVALID_MONTH_BASIS"],
      [{ personalPaidBasisCents: 1.5 }, "INVALID_MONTH_BASIS"],
      [{ basisRegionId: "foreign" }, "BASIS_IDENTITY_MISMATCH"],
      [{ basisPayTableId: "foreign" }, "BASIS_IDENTITY_MISMATCH"],
      [{ sickPaySupplementCalendarDays: 1, noEntgeltCalendarDays: 9 }, "REFERENCE_CASE_MISMATCH"],
    ];
    for (const [patch, reason] of cases)
      failure(
        {
          ...value,
          paidMonths: value.paidMonths.map((month, index) =>
            index === 2 ? { ...month, ...patch } : month,
          ),
        },
        reason,
      );
    failure({ ...value, referenceCase: "SICK_PAY_SUPPLEMENT" }, "REFERENCE_CASE_MISMATCH");
  });

  it("cannot bypass malformed, duplicate, missing or foreign reference months", () => {
    const value = input();
    for (const paidMonths of [
      undefined,
      null,
      "months",
      [null, null, null],
      value.paidMonths.slice(1),
      [...value.paidMonths, value.paidMonths[0]],
      [value.paidMonths[0], value.paidMonths[0], value.paidMonths[2]],
      value.paidMonths.map((month, index) =>
        index === 0 ? { ...month, month: "2025-07" } : month,
      ),
    ])
      failure(
        { ...value, paidMonths: paidMonths as Input["paidMonths"] },
        "INVALID_REFERENCE_MONTHS",
      );
  });

  it("rejects overflow in the reference proof even though that sum is not the replacement basis", () => {
    const value = withDays(input(), 3);
    failure(
      {
        ...value,
        paidMonths: value.paidMonths.map((month, index) => ({
          ...month,
          entgeltCalendarDays: 1,
          noEntgeltCalendarDays: index === 2 ? 29 : 30,
          personalPaidBasisCents: index === 0 ? Number.MAX_SAFE_INTEGER : 1,
        })),
      },
      "AMOUNT_OVERFLOW",
    );
  });

  it("preserves package, source, selection and group guards", () => {
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

  it("returns ordered independent reference, replacement and source snapshots", () => {
    const value = input();
    const reordered = { ...value, paidMonths: [...value.paidMonths].reverse() };
    const before = structuredClone(reordered);
    const result = calculate(reordered);
    expect(reordered).toEqual(before);
    expect(result).toMatchObject({
      referenceMonths: [
        expect.objectContaining({ month: "2026-07" }),
        expect.objectContaining({ month: "2026-08" }),
        expect.objectContaining({ month: "2026-09" }),
      ],
    });
    if (result.kind === "unavailable") throw new Error("Expected a historical basis");
    expect(result.replacementMonth).not.toBe(value.replacementMonth);
    expect(result.referenceMonths[0]).not.toBe(value.paidMonths[0]);
    (result.referenceMonths[0] as { noEntgeltCalendarDays: number }).noEntgeltCalendarDays = 0;
    (result.replacementMonth as { personalMonthlyBasisCents: number }).personalMonthlyBasisCents =
      1;
    (result.annualRule.sourceIds as string[]).push("result-only-source");
    expect(value.paidMonths[0].noEntgeltCalendarDays).toBe(31);
    expect(value.replacementMonth.personalMonthlyBasisCents).toBe(300001);
    expect(
      value.pkg.rules.caritasAnnualPaymentRules!.some((rule) =>
        rule.sourceIds.includes("result-only-source"),
      ),
    ).toBe(false);
  });
});
