import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "../rules/contracts.generated";
import type { CaritasAnnualPaymentEntitlementMonth as Month } from "./caritas-annual-payment-entitlement";
import {
  calculateCaritasAnnualPaymentPartialAmount as calculate,
  type CaritasAnnualPaymentPartialAmountInput as Input,
} from "./caritas-annual-payment-partial-amount";

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
    referenceCase: "PARTIAL_MONTHS",
    partialReferencePeriodConfirmed: true,
    parentalLeavePartTimeBasis: "NOT_APPLICABLE",
    employmentStartDate: `${year - 1}-01-01`,
    employmentEndDate: null,
    singleEmploymentHistoryConfirmed: true,
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
    months: Array.from({ length: 12 }, (_, index) => ({
      month: `${year}-${String(index + 1).padStart(2, "0")}`,
      entgeltOrContinuationDays:
        index >= 6 && index <= 8 ? 20 : new Date(Date.UTC(year, index + 1, 0)).getUTCDate(),
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
function reference(
  value: Input,
  days: readonly number[],
  amounts: readonly number[],
  supplement = [0, 0, 0],
): Input {
  return {
    ...value,
    referenceCase: supplement.some((day) => day > 0) ? "SICK_PAY_SUPPLEMENT" : "PARTIAL_MONTHS",
    paidMonths: value.paidMonths.map((month, index) => ({
      ...month,
      entgeltCalendarDays: days[index],
      personalPaidBasisCents: amounts[index],
      sickPaySupplementCalendarDays: supplement[index],
      noEntgeltCalendarDays: (index === 2 ? 30 : 31) - days[index] - supplement[index],
    })),
    months: value.months.map((month, index) =>
      index >= 6 && index <= 8
        ? {
            ...month,
            entgeltOrContinuationDays: days[index - 6],
            reductionException:
              days[index - 6] === 0 && supplement[index - 6] > 0
                ? { kind: "SICK_PAY_SUPPLEMENT", paidSupplementConfirmed: true }
                : { kind: "NONE" },
          }
        : month,
    ),
  };
}
function failure(value: Input, reason: string) {
  expect(calculate(value)).toEqual({ kind: "unavailable", reason });
}
function deepFreeze(value: object) {
  for (const child of Object.values(value))
    if (child && typeof child === "object") deepFreeze(child);
  Object.freeze(value);
}

describe("Caritas partial-reference annual amount", () => {
  it.each(["bw", "bayern", "mitte", "nord", "nrw", "ost"])(
    "matches fixed 2025/2026 amounts in both annexes and every supported P group in %s",
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
              const lowerBand = ["p4", "p6", "p7", "p8"].includes(group);
              expect(calculate(value)).toMatchObject({
                kind: "personal-annual-payment-partial-amount",
                draft: true,
                completeGross: false,
                entitlementYear: year,
                amountCents: lowerBand ? 395643 : 349638,
                rateBasisPoints: lowerBand ? 8600 : 7600,
                exactAmountCents: {
                  numerator: lowerBand ? "47477160000" : "41956560000",
                  denominator: "120000",
                },
                parentalLeavePartTimeBasis: "NOT_APPLICABLE",
                basis: {
                  meanMonthlyBasis: { numeratorCents: 460050, denominator: 1 },
                  entgeltCalendarDays: 60,
                  paidBasisTotalCents: 900000,
                  annualRule: {
                    basisRegionId: value.paidMonths[0].basisRegionId,
                    basisPayTableId: value.paidMonths[0].basisPayTableId,
                  },
                },
                entitlement: {
                  retainedMonthCount: 12,
                  reducedMonthCount: 0,
                  eligibility: { eligible: true, reason: "EMPLOYED_ON_DECEMBER_1" },
                },
                roundingEvidence: {
                  policy: "AVR_ANLAGE_1_X_E_HALF_UP_FINAL_CENT",
                  sourceId: `caritas-avr-jsz-${year}`,
                  sourceSection: "Anlage 1 Abschnitt X Absatz e",
                  sourceSha256:
                    year === 2025 && region === "ost"
                      ? "a4f8dea02fb84ba4f203a753bd362d82dec8ad8953f3befed99ac65e65ec2637"
                      : "cb6fc32981eb120d5c05e68d6563725436001409e9bc728bc47d52d08d705aa7",
                },
              });
            }
    },
  );
  it("keeps paid supplement outside the basis but retains its annual twelfth", () => {
    const value = reference(input(), [20, 0, 30], [200000, 0, 400000], [11, 31, 0]);
    expect(calculate(value)).toMatchObject({
      amountCents: 316514,
      exactAmountCents: { numerator: "37981728000", denominator: "120000" },
      basis: {
        meanMonthlyBasis: { numeratorCents: 368040, denominator: 1 },
        excludedSickPaySupplementCalendarDays: 42,
      },
      entitlement: {
        retainedMonthCount: 12,
        months: expect.arrayContaining([{ ...value.months[7], decision: "RETAINED_EXCEPTION" }]),
      },
    });
  });
  it("allows paid supplement and ordinary entitlement in the same reference month", () => {
    const value = reference(input(), [20, 20, 20], [200000, 300000, 400000], [11, 11, 10]);
    expect(calculate(value)).toMatchObject({
      amountCents: 395643,
      basis: { excludedSickPaySupplementCalendarDays: 32 },
      entitlement: { retainedMonthCount: 12 },
    });
  });
  it("retains an unpaid amount-blocked supplement month without inventing paid supplement days", () => {
    const value = reference(input(), [20, 0, 30], [200000, 0, 400000], [11, 0, 0]);
    expect(
      calculate(
        changeMonth(value, 7, {
          reductionException: {
            kind: "SICK_PAY_SUPPLEMENT_AMOUNT_BLOCKED",
            onlySicknessBenefitAmountBlockedConfirmed: true,
          },
        }),
      ),
    ).toMatchObject({
      amountCents: 316514,
      basis: { excludedSickPaySupplementCalendarDays: 11 },
      entitlement: { retainedMonthCount: 12 },
    });
  });
  it("reduces an unpaid unprotected reference month", () => {
    const value = reference(input(), [20, 0, 30], [200000, 0, 400000], [11, 0, 0]);
    expect(calculate(value)).toMatchObject({
      amountCents: 290138,
      entitlement: { retainedMonthCount: 11, reducedMonthCount: 1 },
    });
  });
  it("retains a confirmed maternity-ban reference month with no paid supplement", () => {
    const value = reference(input(), [20, 0, 30], [200000, 0, 400000]);
    expect(
      calculate(
        changeMonth(value, 7, {
          reductionException: {
            kind: "MATERNITY_EMPLOYMENT_BAN",
            statutoryMaternityBanConfirmed: true,
            noTablePayDueToBanConfirmed: true,
          },
        }),
      ),
    ).toMatchObject({ amountCents: 316514, entitlement: { retainedMonthCount: 12 } });
  });
  it("reduces a non-reference month only once, without reducing the basis again", () => {
    const value = changeMonth(input(), 0, { entgeltOrContinuationDays: 0 });
    expect(calculate(value)).toMatchObject({
      amountCents: 362673,
      exactAmountCents: { numerator: "43520730000", denominator: "120000" },
      basis: { meanMonthlyBasis: { numeratorCents: 460050, denominator: 1 } },
      entitlement: { reductionFactor: { numerator: 11, denominator: 12 } },
    });
  });
  it.each([
    { total: 149999, expected: 65940 },
    { total: 150000, expected: 65941 },
    { total: 150001, expected: 65941 },
  ])("rounds final half-cent boundaries for a reference sum of $total", ({ total, expected }) => {
    expect(
      calculate(reference(input(), [20, 20, 20], [50000, 50000, total - 100000])),
    ).toMatchObject({ amountCents: expected });
  });
  it("keeps the exact 30.67 basis and rounds only the final amount", () => {
    expect(calculate(reference(input(), [20, 20, 19], [1, 1, 99]))).toMatchObject({
      amountCents: 45,
      basis: { meanMonthlyBasis: { numeratorCents: 309767, denominator: 5900 } },
      exactAmountCents: { numerator: "31967954400", denominator: "708000000" },
    });
  });
  it("preserves multiplication above Number.MAX_SAFE_INTEGER using exact integer arithmetic", () => {
    expect(
      calculate(reference(input(), [20, 20, 20], [200000000000, 300000000000, 400000000000])),
    ).toMatchObject({
      amountCents: 395643000000,
      exactAmountCents: { numerator: "47477160000000000", denominator: "120000" },
    });
  });
  it("accepts July entry with confirmed September group and six retained months", () => {
    let value = reference(input(), [17, 31, 30], [170000, 310000, 300000]);
    value = {
      ...value,
      employmentStartDate: "2026-07-15",
      months: value.months.map((month, i) =>
        i < 6 ? { ...month, entgeltOrContinuationDays: 0 } : month,
      ),
    };
    expect(calculate(value)).toMatchObject({
      amountCents: 131881,
      basis: { entgeltCalendarDays: 78 },
      entitlement: { retainedMonthCount: 6, reducedMonthCount: 6 },
    });
  });
  it("accepts exactly September 1 entry and the 30-day lower boundary", () => {
    let value = reference(input(), [0, 0, 30], [0, 0, 300000]);
    value = {
      ...value,
      employmentStartDate: "2026-09-01",
      months: value.months.map((month, i) =>
        i < 8 ? { ...month, entgeltOrContinuationDays: 0 } : month,
      ),
    };
    expect(calculate(value)).toMatchObject({
      amountCents: 87921,
      basis: { entgeltCalendarDays: 30 },
      entitlement: { retainedMonthCount: 4 },
    });
  });
  it("accepts 91 paid reference days without falling into the full-month formula", () => {
    expect(calculate(reference(input(), [31, 31, 29], [310000, 310000, 290000]))).toMatchObject({
      amountCents: 263762,
      basis: { entgeltCalendarDays: 91 },
    });
  });
  it("passes fewer than 30 days to the separate fallback contract", () =>
    failure(reference(input(), [0, 0, 29], [0, 0, 290000]), "FALLBACK_REFERENCE_MONTH_REQUIRED"));
  it("rejects 92 paid days as the regular reference case", () =>
    failure(reference(input(), [31, 31, 30], [310000, 310000, 300000]), "REFERENCE_CASE_MISMATCH"));
  it.each(["APPLICABLE", "UNKNOWN", undefined] as const)(
    "requires confirmed exclusion of special parental basis (%s)",
    (value) =>
      failure(
        { ...input(), parentalLeavePartTimeBasis: value } as Input,
        "UNSUPPORTED_SPECIAL_BASIS",
      ),
  );
  it.each([
    "ORDINARY_FULL_MONTHS",
    "FALLBACK_LAST_FULL_MONTH",
    "ENTRY_AFTER_SEPTEMBER",
    "PARENTAL_LEAVE_PART_TIME",
  ] as const)("does not substitute the partial formula for %s", (referenceCase) =>
    failure({ ...input(), referenceCase } as Input, "UNSUPPORTED_REFERENCE_CASE"),
  );
  it.each(["septemberGroupConfirmed", "partialReferencePeriodConfirmed"] as const)(
    "requires %s",
    (field) =>
      failure(
        { ...input(), [field]: false },
        field === "septemberGroupConfirmed"
          ? "REFERENCE_GROUP_UNCONFIRMED"
          : "REFERENCE_CASE_UNCONFIRMED",
      ),
  );
  it.each(["calendarDayBreakdownConfirmed", "section16BasisConfirmed"] as const)(
    "requires confirmed reference %s",
    (field) => {
      const value = input();
      failure(
        {
          ...value,
          paidMonths: value.paidMonths.map((m, i) => (i === 1 ? { ...m, [field]: false } : m)),
        },
        field === "calendarDayBreakdownConfirmed"
          ? "CALENDAR_DAYS_UNCONFIRMED"
          : "MONTH_BASIS_UNCONFIRMED",
      );
    },
  );
  it.each([6, 7, 8])("rejects disagreement in reference month %s", (index) =>
    failure(
      changeMonth(input(), index, { entgeltOrContinuationDays: 19 }),
      "REFERENCE_MONTH_FACTS_MISMATCH",
    ),
  );
  it("rejects paid supplement days with a NONE exception in a zero-entgelt reference month", () => {
    const value = reference(input(), [20, 0, 30], [200000, 0, 400000], [11, 31, 0]);
    failure(
      changeMonth(value, 7, { reductionException: { kind: "NONE" } }),
      "REFERENCE_MONTH_FACTS_MISMATCH",
    );
  });
  it.each([
    { kind: "SICK_PAY_SUPPLEMENT_AMOUNT_BLOCKED", onlySicknessBenefitAmountBlockedConfirmed: true },
    {
      kind: "MATERNITY_EMPLOYMENT_BAN",
      statutoryMaternityBanConfirmed: true,
      noTablePayDueToBanConfirmed: true,
    },
  ] satisfies Month["reductionException"][])(
    "rejects paid supplement contradicted by $kind",
    (reductionException) => {
      const value = reference(input(), [20, 0, 30], [200000, 0, 400000], [11, 31, 0]);
      failure(changeMonth(value, 7, { reductionException }), "REFERENCE_MONTH_FACTS_MISMATCH");
    },
  );
  it("rejects a paid-supplement exception without paid supplement days", () => {
    const value = reference(input(), [20, 0, 30], [200000, 0, 400000]);
    failure(
      changeMonth(value, 7, {
        reductionException: { kind: "SICK_PAY_SUPPLEMENT", paidSupplementConfirmed: true },
      }),
      "REFERENCE_MONTH_FACTS_MISMATCH",
    );
  });
  it("does not infer an unconfirmed supplement exception", () => {
    const value = reference(input(), [20, 0, 30], [200000, 0, 400000], [11, 31, 0]);
    failure(
      changeMonth(value, 7, {
        reductionException: { kind: "SICK_PAY_SUPPLEMENT", paidSupplementConfirmed: false },
      }),
      "EXCEPTION_UNCONFIRMED",
    );
  });
  it("rejects reference pay and supplement days exceeding the actual employment period", () => {
    let value = reference(input(), [17, 31, 30], [170000, 310000, 300000], [14, 0, 0]);
    value = {
      ...value,
      employmentStartDate: "2026-07-15",
      months: value.months.map((m, i) => (i < 6 ? { ...m, entgeltOrContinuationDays: 0 } : m)),
    };
    failure(value, "REFERENCE_MONTH_FACTS_MISMATCH");
  });
  it.each(["ANLAGE_31", "ANLAGE_32"])(
    "requires Dec 1 employment in this basis contract (%s)",
    (annex) => {
      const value = input("bw", 2026, annex);
      failure(
        {
          ...value,
          employmentEndDate: "2026-11-30",
          months: value.months.map((m, i) =>
            i === 11 ? { ...m, entgeltOrContinuationDays: 0 } : m,
          ),
        },
        "UNSUPPORTED_EMPLOYMENT_PERIOD",
      );
    },
  );
  it("accepts Dec 1 as the inclusive last employment day", () => {
    const value = changeMonth(input(), 11, { entgeltOrContinuationDays: 1 });
    expect(calculate({ ...value, employmentEndDate: "2026-12-01" })).toMatchObject({
      amountCents: 395643,
    });
  });
  it("rejects reference entitlement outside actual employment", () => {
    const value = input();
    failure(
      {
        ...value,
        employmentStartDate: "2026-08-01",
        months: value.months.map((m, i) => (i < 6 ? { ...m, entgeltOrContinuationDays: 0 } : m)),
      },
      "ENTGELT_OUTSIDE_EMPLOYMENT",
    );
  });
  it("requires confirmed single employment history", () =>
    failure(
      { ...input(), singleEmploymentHistoryConfirmed: false },
      "EMPLOYMENT_HISTORY_UNCONFIRMED",
    ));
  it("requires every annual month to be confirmed", () =>
    failure(changeMonth(input(), 0, { monthFactsConfirmed: false }), "MONTH_FACTS_UNCONFIRMED"));
  it("rejects missing annual months", () => {
    const value = input();
    failure({ ...value, months: value.months.slice(1) }, "INVALID_MONTHS");
  });
  it("rejects duplicate reference months", () => {
    const value = input();
    failure(
      { ...value, paidMonths: [value.paidMonths[0], value.paidMonths[0], value.paidMonths[2]] },
      "INVALID_REFERENCE_MONTHS",
    );
  });
  it("rejects fabricated RK Ost 2025 Eastern basis identity", () => {
    const value = input("ost", 2025);
    failure(
      {
        ...value,
        paidMonths: value.paidMonths.map((m) => ({ ...m, basisRegionId: "OST_TARIF_OST" })),
      },
      "BASIS_IDENTITY_MISMATCH",
    );
  });
  it("rejects a substitute pay table", () => {
    const value = input();
    failure(
      { ...value, paidMonths: value.paidMonths.map((m) => ({ ...m, basisPayTableId: "OTHER" })) },
      "BASIS_IDENTITY_MISMATCH",
    );
  });
  it("rejects P5 instead of assigning a guessed percentage", () =>
    failure({ ...input(), groupIdAtSeptember1: "p5" }, "UNKNOWN_PAY_GROUP"));
  it("rejects a year outside the package", () =>
    failure({ ...input(), entitlementYear: 2025 }, "OUTSIDE_ENTITLEMENT_YEAR"));
  it.each(["sha256", "url", "documentDate"] as const)(
    "rejects changed AVR %s evidence",
    (field) => {
      const value = input();
      const source = value.pkg.sources.find((item) => item.id === "caritas-avr-jsz-2026")!;
      source[field] =
        field === "sha256"
          ? "0".repeat(64)
          : field === "url"
            ? "https://example.invalid/other.pdf"
            : "2026-03-18";
      failure(value, "ROUNDING_SOURCE_MISSING");
    },
  );
  it("rejects a borrowed 2025 AVR source for a 2026 entitlement", () => {
    const value = input();
    const old = input("ost", 2025).pkg.sources.find((item) => item.id === "caritas-avr-jsz-2025")!;
    Object.assign(
      value.pkg.sources.find((item) => item.id === "caritas-avr-jsz-2026")!,
      { sha256: old.sha256, url: old.url, documentDate: old.documentDate },
    );
    failure(value, "ROUNDING_SOURCE_MISSING");
  });
  it("requires the AVR rounding source in the selected annual rule", () => {
    const value = input();
    const replacement = value.pkg.sources.find(
      (item) => !item.id.startsWith("caritas-avr-jsz-"),
    )!.id;
    for (const rule of value.pkg.rules.caritasAnnualPaymentRules!) rule.sourceIds = [replacement];
    failure(value, "INVALID_PACKAGE");
  });
  it("rejects an unrepresentable normalized basis", () =>
    failure(
      reference(input(), [20, 20, 20], [Number.MAX_SAFE_INTEGER - 2, 1, 1]),
      "AMOUNT_OVERFLOW",
    ));
  it("does not mutate or alias confirmed reference and annual month inputs", () => {
    const value = input();
    const snapshot = JSON.stringify(value);
    deepFreeze(value);
    const result = calculate(value);
    expect(JSON.stringify(value)).toBe(snapshot);
    if (result.kind !== "personal-annual-payment-partial-amount")
      throw new Error("Expected amount");
    expect(result.basis.paidMonths).not.toBe(value.paidMonths);
    expect(result.entitlement.months).not.toBe(value.months);
    expect(result.basis.paidMonths[0]).not.toBe(value.paidMonths[0]);
    expect(result.entitlement.months[0].reductionException).not.toBe(
      value.months[0].reductionException,
    );
  });
  it("canonicalizes both shuffled sets without changing the amount", () => {
    const value = input();
    expect(
      calculate({
        ...value,
        months: [...value.months].reverse(),
        paidMonths: [...value.paidMonths].reverse(),
      }),
    ).toEqual(calculate(value));
  });
});
