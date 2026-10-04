import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "../rules/contracts.generated";
import type { CaritasAnnualPaymentEntitlementMonth as Month } from "./caritas-annual-payment-entitlement";
import {
  calculateCaritasAnnualPaymentFallbackAmount as calculate,
  type CaritasAnnualPaymentFallbackAmountInput as Input,
} from "./caritas-annual-payment-fallback-amount";

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
    employmentStartDate: `${year - 2}-01-01`,
    employmentEndDate: null,
    singleEmploymentHistoryConfirmed: true,
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
    months: Array.from({ length: 12 }, (_, index) => ({
      month: `${year}-${String(index + 1).padStart(2, "0")}`,
      entgeltOrContinuationDays:
        index === 6 || index === 7
          ? 0
          : index === 8
            ? 20
            : new Date(Date.UTC(year, index + 1, 0)).getUTCDate(),
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
function historical(value: Input): Input {
  return {
    ...value,
    replacementMonth: { ...value.replacementMonth, month: `${value.entitlementYear - 1}-06` },
    months: value.months.map((month, index) =>
      index < 6 ? { ...month, entgeltOrContinuationDays: 0 } : month,
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

describe("Caritas historical replacement annual amount", () => {
  const annualCases = ["bw", "bayern", "mitte", "nord", "nrw", "ost"].flatMap((region) =>
    ([2025, 2026] as const).flatMap((year) =>
      ["ANLAGE_31", "ANLAGE_32"].flatMap((annex) =>
        (region === "ost"
          ? ["OST_TARIF_OST", "OST_TARIF_WEST_BERLIN", "OST_TARIF_WEST_HAMBURG"]
          : [region.toUpperCase()]
        ).map((territory) => ({ region, year, annex, territory })),
      ),
    ),
  );
  it.each(annualCases)(
    "matches fixed annual amounts for $region / $year / $annex / $territory across P groups",
    ({ region, year, annex, territory }) => {
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
          kind: "personal-annual-payment-fallback-amount",
          draft: true,
          completeGross: false,
          entitlementYear: year,
          amountCents: lowerBand ? 215001 : 190001,
          rateBasisPoints: lowerBand ? 8600 : 7600,
          exactAmountCents: {
            numerator: lowerBand ? "25800086000" : "22800076000",
            denominator: "120000",
          },
          parentalLeavePartTimeBasis: "NOT_APPLICABLE",
          basis: {
            meanMonthlyBasis: { numeratorCents: 300001, denominator: 1 },
            referenceEntgeltCalendarDays: 20,
            referencePaidBasisTotalCents: 200000,
            replacementMonth: value.replacementMonth,
            annualRule: {
              basisRegionId: value.replacementMonth.basisRegionId,
              basisPayTableId: value.paidMonths[0].basisPayTableId,
            },
          },
          entitlement: {
            retainedMonthCount: 10,
            reducedMonthCount: 2,
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
  it("uses a confirmed prior-year amount without requiring a current historical pay table", () => {
    expect(calculate(historical(input()))).toMatchObject({
      amountCents: 86000,
      basis: {
        meanMonthlyBasis: { numeratorCents: 300001, denominator: 1 },
        replacementMonth: { month: "2025-06" },
      },
      entitlement: { retainedMonthCount: 4 },
    });
  });
  it("keeps the historical amount when current paid reference sums change", () => {
    const a = input();
    const b = reference(a, [0, 0, 20], [0, 0, 12345]);
    expect(calculate(b)).toMatchObject({
      amountCents: 215001,
      basis: { meanMonthlyBasis: { numeratorCents: 300001, denominator: 1 } },
    });
  });
  it("retains supplement months while replacing rather than normalizing their basis", () => {
    const value = reference(input(), [0, 0, 20], [0, 0, 200000], [31, 31, 10]);
    expect(calculate(value)).toMatchObject({
      amountCents: 258001,
      exactAmountCents: { numerator: "30960103200", denominator: "120000" },
      basis: {
        referenceExcludedSickPaySupplementCalendarDays: 72,
        meanMonthlyBasis: { numeratorCents: 300001, denominator: 1 },
      },
      entitlement: { retainedMonthCount: 12 },
    });
  });
  it("keeps a confirmed amount-blocked supplement month without inventing paid days", () => {
    const value = changeMonth(input(), 6, {
      reductionException: {
        kind: "SICK_PAY_SUPPLEMENT_AMOUNT_BLOCKED",
        onlySicknessBenefitAmountBlockedConfirmed: true,
      },
    });
    expect(calculate(value)).toMatchObject({
      amountCents: 236501,
      entitlement: { retainedMonthCount: 11 },
    });
  });
  it.each([
    [0, 0],
    [1, 21500],
    [2, 43000],
    [3, 64500],
    [4, 86000],
    [5, 107500],
    [6, 129000],
    [7, 150501],
    [8, 172001],
    [9, 193501],
    [10, 215001],
    [11, 236501],
    [12, 258001],
  ])("matches a fixed amount for %i retained twelfths", (retained, expected) => {
    let value = historical(input());
    value = {
      ...value,
      paidMonths: value.paidMonths.map((month, index) => {
        const paid = index + 6 < retained ? 1 : 0;
        return {
          ...month,
          entgeltCalendarDays: paid,
          personalPaidBasisCents: paid * 10000,
          noEntgeltCalendarDays: (index === 2 ? 30 : 31) - paid,
        };
      }),
      months: value.months.map((month, index) => ({
        ...month,
        entgeltOrContinuationDays: index < retained ? 1 : 0,
      })),
    };
    expect(calculate(value)).toMatchObject({
      amountCents: expected,
      entitlement: {
        retainedMonthCount: retained,
        reductionFactor: { numerator: retained, denominator: 12 },
      },
    });
  });
  it.each([
    { amount: 300024, expected: 258021 },
    { amount: 300025, expected: 258022 },
    { amount: 300026, expected: 258022 },
  ])("rounds only the final cent for a historical basis of $amount", ({ amount, expected }) => {
    const value = reference(input(), [0, 0, 20], [0, 0, 200000], [31, 31, 10]);
    expect(
      calculate({
        ...value,
        replacementMonth: { ...value.replacementMonth, personalMonthlyBasisCents: amount },
      }),
    ).toMatchObject({ amountCents: expected });
  });
  it("preserves exact products above Number.MAX_SAFE_INTEGER", () => {
    const value = input();
    expect(
      calculate({
        ...value,
        replacementMonth: {
          ...value.replacementMonth,
          personalMonthlyBasisCents: Number.MAX_SAFE_INTEGER,
        },
      }),
    ).toMatchObject({
      amountCents: 6455159465897710,
      exactAmountCents: { numerator: "774619135907725226000", denominator: "120000" },
    });
  });
  it.each([0, 29])("uses the fallback at %i reference entgelt days", (days) => {
    expect(calculate(reference(input(), [0, 0, days], [0, 0, days * 10000]))).toMatchObject({
      amountCents: days === 0 ? 193501 : 215001,
      basis: { referenceEntgeltCalendarDays: days },
    });
  });
  it("rejects the replacement at exactly 30 entgelt days", () =>
    failure(reference(input(), [0, 0, 30], [0, 0, 300000]), "FALLBACK_NOT_REQUIRED"));
  it("accepts a February replacement with its actual 28 entitlement days", () => {
    const base = input("bw", 2025);
    const value = {
      ...base,
      replacementMonth: { ...base.replacementMonth, month: "2025-02" },
      months: base.months.map((month, index) =>
        index >= 2 && index <= 5 ? { ...month, entgeltOrContinuationDays: 0 } : month,
      ),
    };
    expect(calculate(value)).toMatchObject({
      amountCents: 129000,
      entitlement: { retainedMonthCount: 6 },
    });
  });
  it("allows a later partial claim month without treating it as a full replacement month", () => {
    const base = input("bw", 2025);
    let value: Input = {
      ...base,
      replacementMonth: { ...base.replacementMonth, month: "2025-02" },
      months: base.months.map((month, index) =>
        index >= 2 && index <= 5 ? { ...month, entgeltOrContinuationDays: 0 } : month,
      ),
    };
    value = changeMonth(value, 2, { entgeltOrContinuationDays: 29 });
    expect(calculate(value)).toMatchObject({
      amountCents: 150501,
      entitlement: { retainedMonthCount: 7 },
    });
  });
  it("accepts a leap-year historical February within the employment period", () => {
    const value = historical(input("bw", 2025));
    expect(
      calculate({
        ...value,
        employmentStartDate: "2024-02-01",
        replacementMonth: { ...value.replacementMonth, month: "2024-02" },
      }),
    ).toMatchObject({ amountCents: 86000 });
  });
  it("rejects a replacement beginning before the employment started", () => {
    const value = historical(input("bw", 2025));
    failure(
      {
        ...value,
        employmentStartDate: "2024-02-02",
        replacementMonth: { ...value.replacementMonth, month: "2024-02" },
      },
      "REPLACEMENT_OUTSIDE_EMPLOYMENT",
    );
  });
  it("accepts employment starting exactly on the replacement month first day", () => {
    const value = input();
    expect(
      calculate({
        ...value,
        employmentStartDate: "2026-06-01",
        months: value.months.map((m, i) => (i < 5 ? { ...m, entgeltOrContinuationDays: 0 } : m)),
      }),
    ).toMatchObject({ amountCents: 107500, entitlement: { retainedMonthCount: 5 } });
  });
  it("rejects a current-year replacement month with only partial entitlement", () =>
    failure(
      changeMonth(input(), 5, { entgeltOrContinuationDays: 29 }),
      "REPLACEMENT_MONTH_FACTS_MISMATCH",
    ));
  it("does not treat an exception-retained replacement month as full entgelt", () => {
    const value = changeMonth(input(), 5, {
      entgeltOrContinuationDays: 0,
      reductionException: { kind: "SICK_PAY_SUPPLEMENT", paidSupplementConfirmed: true },
    });
    failure(value, "REPLACEMENT_MONTH_FACTS_MISMATCH");
  });
  it.each([0, 1, 2, 3, 4, 5])(
    "rejects a prior-year replacement contradicted by current full month %i",
    (index) => {
      const value = historical(input());
      failure(
        changeMonth(value, index, {
          entgeltOrContinuationDays: new Date(Date.UTC(2026, index + 1, 0)).getUTCDate(),
        }),
        "REPLACEMENT_MONTH_FACTS_MISMATCH",
      );
    },
  );
  it("rejects an older same-year replacement when June is fully entitled", () => {
    const value = input();
    failure(
      { ...value, replacementMonth: { ...value.replacementMonth, month: "2026-05" } },
      "REPLACEMENT_MONTH_FACTS_MISMATCH",
    );
  });
  it.each([6, 7, 8])("rejects disagreement with reference claim days in month %i", (index) =>
    failure(
      changeMonth(input(), index, { entgeltOrContinuationDays: index === 8 ? 19 : 1 }),
      "REFERENCE_MONTH_FACTS_MISMATCH",
    ),
  );
  it("rejects supplement days in a zero-entgelt month with a NONE exception", () => {
    const value = reference(input(), [0, 0, 20], [0, 0, 200000], [31, 31, 10]);
    failure(
      changeMonth(value, 6, { reductionException: { kind: "NONE" } }),
      "REFERENCE_MONTH_FACTS_MISMATCH",
    );
  });
  it("rejects a paid supplement exception without any paid supplement day", () =>
    failure(
      changeMonth(input(), 6, {
        reductionException: { kind: "SICK_PAY_SUPPLEMENT", paidSupplementConfirmed: true },
      }),
      "REFERENCE_MONTH_FACTS_MISMATCH",
    ));
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
      const value = reference(input(), [0, 0, 20], [0, 0, 200000], [31, 31, 10]);
      failure(changeMonth(value, 6, { reductionException }), "REFERENCE_MONTH_FACTS_MISMATCH");
    },
  );
  it("does not invent an unconfirmed supplement exception", () => {
    const value = reference(input(), [0, 0, 20], [0, 0, 200000], [31, 31, 10]);
    failure(
      changeMonth(value, 6, {
        reductionException: { kind: "SICK_PAY_SUPPLEMENT", paidSupplementConfirmed: false },
      }),
      "EXCEPTION_UNCONFIRMED",
    );
  });
  it.each(["APPLICABLE", "UNKNOWN", undefined] as const)(
    "requires exclusion of special parental basis (%s)",
    (parentalLeavePartTimeBasis) =>
      failure({ ...input(), parentalLeavePartTimeBasis } as Input, "UNSUPPORTED_SPECIAL_BASIS"),
  );
  it.each(["ANLAGE_31", "ANLAGE_32"])(
    "requires December 1 employment for this replacement contract (%s)",
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
  it("accepts December 1 as inclusive last service day", () => {
    const value = changeMonth(input(), 11, { entgeltOrContinuationDays: 1 });
    expect(calculate({ ...value, employmentEndDate: "2026-12-01" })).toMatchObject({
      amountCents: 215001,
    });
  });
  it.each([
    ["fullCalendarMonthEntgeltConfirmed", "REPLACEMENT_FULL_MONTH_UNCONFIRMED"],
    ["historicalSection16BasisConfirmed", "HISTORICAL_BASIS_UNCONFIRMED"],
    ["sameEmploymentConfirmed", "EMPLOYMENT_IDENTITY_UNCONFIRMED"],
    ["lastApplicableFullMonthConfirmed", "LAST_FULL_MONTH_UNCONFIRMED"],
  ] as const)("requires replacement %s", (field, reason) => {
    const value = input();
    failure({ ...value, replacementMonth: { ...value.replacementMonth, [field]: false } }, reason);
  });
  it.each(["2026-07", "2026-13", "2026-2", "1899-12"])(
    "rejects invalid or late replacement %s",
    (month) => {
      const value = input();
      failure(
        { ...value, replacementMonth: { ...value.replacementMonth, month } },
        "INVALID_REPLACEMENT_MONTH",
      );
    },
  );
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN])(
    "rejects invalid historical cents %s",
    (personalMonthlyBasisCents) => {
      const value = input();
      failure(
        { ...value, replacementMonth: { ...value.replacementMonth, personalMonthlyBasisCents } },
        "INVALID_MONTH_BASIS",
      );
    },
  );
  it("rejects unknown P5 without a guessed percentage", () =>
    failure({ ...input(), groupIdAtSeptember1: "p5" }, "UNKNOWN_PAY_GROUP"));
  it("requires the confirmed September group", () =>
    failure({ ...input(), septemberGroupConfirmed: false }, "REFERENCE_GROUP_UNCONFIRMED"));
  it("rejects a wrong RK Ost 2025 replacement region", () => {
    const value = input("ost", 2025);
    failure(
      { ...value, replacementMonth: { ...value.replacementMonth, basisRegionId: "OST_TARIF_OST" } },
      "BASIS_IDENTITY_MISMATCH",
    );
  });
  it("requires a single confirmed employment history", () =>
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
  it.each(["calendarDayBreakdownConfirmed", "section16BasisConfirmed"] as const)(
    "requires reference %s",
    (field) => {
      const value = input();
      failure(
        {
          ...value,
          paidMonths: value.paidMonths.map((m, i) => (i === 0 ? { ...m, [field]: false } : m)),
        },
        field === "calendarDayBreakdownConfirmed"
          ? "CALENDAR_DAYS_UNCONFIRMED"
          : "MONTH_BASIS_UNCONFIRMED",
      );
    },
  );
  it.each(["sha256", "url", "documentDate"] as const)(
    "rejects changed rounding source %s",
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
  it("does not mutate or alias the replacement, reference months or annual decisions", () => {
    const value = input(),
      snapshot = JSON.stringify(value);
    deepFreeze(value);
    const result = calculate(value);
    expect(JSON.stringify(value)).toBe(snapshot);
    if (result.kind !== "personal-annual-payment-fallback-amount")
      throw new Error("Expected annual amount");
    expect(result.basis.replacementMonth).not.toBe(value.replacementMonth);
    expect(result.basis.referenceMonths).not.toBe(value.paidMonths);
    expect(result.basis.referenceMonths[0]).not.toBe(value.paidMonths[0]);
    expect(result.entitlement.months).not.toBe(value.months);
    expect(result.entitlement.months[0].reductionException).not.toBe(
      value.months[0].reductionException,
    );
  });
  it("canonicalizes shuffled reference and annual month inputs", () => {
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
