import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "../rules/contracts.generated";
import {
  calculateCaritasAnnualPaymentRegularAmount as calculate,
  type CaritasAnnualPaymentRegularAmountInput as Input,
} from "./caritas-annual-payment-regular-amount";
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
    .selection!.variants.find((variant) => variant.id === annex)!
    .regions.find((item) => item.id === basisRegionId)!.payTableId!;
  return {
    pkg,
    entitlementYear: year,
    variantId: annex,
    regionId,
    groupIdAtSeptember1: "p6",
    septemberGroupConfirmed: true,
    referenceCase: "ORDINARY_FULL_MONTHS",
    ordinaryReferencePeriodConfirmed: true,
    parentalLeavePartTimeBasis: "NOT_APPLICABLE",
    employmentStartDate: `${year - 1}-01-01`,
    employmentEndDate: null,
    singleEmploymentHistoryConfirmed: true,
    paidMonths: [7, 8, 9].map((month, index) => ({
      month: `${year}-${String(month).padStart(2, "0")}`,
      personalPaidBasisCents: (index + 2) * 100000,
      basisRegionId,
      basisPayTableId,
      fullCalendarMonthEntgeltConfirmed: true,
      section16BasisConfirmed: true,
    })),
    months: Array.from({ length: 12 }, (_, index) => ({
      month: `${year}-${String(index + 1).padStart(2, "0")}`,
      entgeltOrContinuationDays: new Date(Date.UTC(year, index + 1, 0)).getUTCDate(),
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
  expect(calculate(value)).toEqual({ kind: "unavailable", reason });
}
function reduced(value: Input, indices: number[]): Input {
  return {
    ...value,
    months: value.months.map((month, index) =>
      indices.includes(index) ? { ...month, entgeltOrContinuationDays: 0 } : month,
    ),
  };
}
function deepFreeze(value: object) {
  for (const child of Object.values(value))
    if (child && typeof child === "object") deepFreeze(child);
  Object.freeze(value);
}

describe("Caritas regular annual component", () => {
  it("returns the independently fixed EUR 2,580 reference with complete provenance and DRAFT guards", () => {
    const value = input();
    const result = calculate(value);
    expect(result.kind).toBe("personal-annual-payment-regular-amount");
    if (result.kind !== "personal-annual-payment-regular-amount")
      throw Error("Expected annual amount");
    expect(result).toMatchObject({
      amountCents: 258000,
      entitlementYear: 2026,
      rateBasisPoints: 8600,
      draft: true,
      completeGross: false,
      exactAmountCents: { numerator: "92880000000", denominator: "360000" },
      parentalLeavePartTimeBasis: "NOT_APPLICABLE",
      basis: {
        groupIdAtSeptember1: "p6",
        groupReferenceDate: "2026-09-01",
        meanMonthlyBasis: { numeratorCents: 900000, denominator: 3 },
      },
      entitlement: {
        eligibility: { eligible: true, reason: "EMPLOYED_ON_DECEMBER_1" },
        reductionFactor: { numerator: 12, denominator: 12 },
      },
      roundingEvidence: {
        policy: "AVR_ANLAGE_1_X_E_HALF_UP_FINAL_CENT",
        sourceId: "caritas-avr-jsz-2026",
        sourceSection: "Anlage 1 Abschnitt X Absatz e",
      },
    });
    expect(result.entitlement.sourcePolicy.ruleIds).toContain(result.basis.annualRule.id);
    expect(result.basis.annualRule.packageId).toBe(value.pkg.packageId);
    expect(result.basis.annualRule.versionId).toBe(value.pkg.versionId);
    expect(
      value.pkg.sources.find((source) => source.id === result.roundingEvidence.sourceId)?.sha256,
    ).toBe(result.roundingEvidence.sourceSha256);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("keeps personal part-time amounts exactly as entered, without a second reduction", () => {
    const value = input();
    expect(
      calculate({
        ...value,
        paidMonths: value.paidMonths.map((month) => ({
          ...month,
          personalPaidBasisCents: month.personalPaidBasisCents / 2,
        })),
      }),
    ).toMatchObject({ amountCents: 129000 });
  });

  it("selects the 76 percent band with an independently fixed EUR 2,280 amount", () => {
    expect(calculate({ ...input(), groupIdAtSeptember1: "p9" })).toMatchObject({
      amountCents: 228000,
      rateBasisPoints: 7600,
    });
  });

  it.each([
    [1, 236500],
    [2, 215000],
    [3, 193500],
  ] as const)("reduces %i confirmed months outside July-September", (count, amountCents) => {
    expect(
      calculate(
        reduced(
          input(),
          Array.from({ length: count }, (_, index) => index),
        ),
      ),
    ).toMatchObject({ amountCents, entitlement: { reducedMonthCount: count } });
  });

  it("accepts entry on July 1 with six retained months, and no invented prior wage claims", () => {
    const value = reduced({ ...input(), employmentStartDate: "2026-07-01" }, [0, 1, 2, 3, 4, 5]);
    expect(calculate(value)).toMatchObject({
      amountCents: 129000,
      entitlement: { retainedMonthCount: 6 },
    });
  });

  it("counts any wage claim day outside the reference period as one retained month", () => {
    const value = changeMonth(input(), 0, { entgeltOrContinuationDays: 1 });
    expect(calculate(value)).toMatchObject({ amountCents: 258000 });
  });

  it("accepts the inclusive December 1 end without reducing the remaining December days", () => {
    const value = changeMonth({ ...input(), employmentEndDate: "2026-12-01" }, 11, {
      entgeltOrContinuationDays: 1,
    });
    expect(calculate(value)).toMatchObject({
      amountCents: 258000,
      entitlement: { employmentEndDate: "2026-12-01" },
    });
  });

  it.each([
    {
      kind: "MILITARY_OR_CIVILIAN_SERVICE",
      noTablePayDueToServiceConfirmed: true,
      serviceEndDate: "2026-05-31",
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
      birthDate: "2026-04-15",
      payClaimBeforeLeaveConfirmed: true,
    },
    { kind: "SICK_PAY_SUPPLEMENT", paidSupplementConfirmed: true },
    { kind: "SICK_PAY_SUPPLEMENT_AMOUNT_BLOCKED", onlySicknessBenefitAmountBlockedConfirmed: true },
  ] satisfies Month["reductionException"][])(
    "retains a confirmed $kind exception outside the basis period",
    (reductionException) => {
      const value = changeMonth(input(), 4, { entgeltOrContinuationDays: 0, reductionException });
      expect(calculate(value)).toMatchObject({
        amountCents: 258000,
        entitlement: { retainedMonthCount: 12 },
      });
    },
  );

  it.each([
    [299, 21],
    [300, 22],
    [301, 22],
  ] as const)(
    "rounds a %i-cent total with three retained months only at the final cent",
    (sum, amountCents) => {
      const value = reduced(input(), [0, 1, 2, 3, 4, 5, 9, 10, 11]);
      expect(
        calculate({
          ...value,
          paidMonths: value.paidMonths.map((month, index) => ({
            ...month,
            personalPaidBasisCents: index === 0 ? sum - 200 : 100,
          })),
        }),
      ).toMatchObject({ amountCents });
    },
  );

  it("does not round the reference mean prematurely: EUR 1,935.0043 ends at EUR 1,935.00", () => {
    const value = reduced(input(), [0, 1, 2]);
    expect(
      calculate({
        ...value,
        paidMonths: value.paidMonths.map((month, index) => ({
          ...month,
          personalPaidBasisCents: month.personalPaidBasisCents + (index === 2 ? 2 : 0),
        })),
      }),
    ).toMatchObject({
      amountCents: 193500,
      exactAmountCents: { numerator: "69660154800", denominator: "360000" },
    });
  });

  it("avoids floating-point loss when the exact intermediate numerator exceeds safe Number range", () => {
    const value = input();
    expect(
      calculate({
        ...value,
        paidMonths: value.paidMonths.map((month) => ({
          ...month,
          personalPaidBasisCents: 2000000000000001,
        })),
      }),
    ).toMatchObject({ amountCents: 1720000000000001 });
  });

  it("does not mutate frozen inputs or expose mutable aliases to reference months", () => {
    const value = input();
    const before = JSON.stringify(value);
    deepFreeze(value);
    const result = calculate(value);
    expect(result.kind).toBe("personal-annual-payment-regular-amount");
    if (result.kind !== "personal-annual-payment-regular-amount") throw Error("Expected amount");
    (result.basis.paidMonths[0] as { personalPaidBasisCents: number }).personalPaidBasisCents = 7;
    (result.entitlement.months[0].reductionException as { kind: string }).kind = "changed";
    expect(JSON.stringify(value)).toBe(before);
  });

  it.each(["bw", "bayern", "mitte", "nrw", "nord", "ost"])(
    "checks every year/annex/territory/P-group combination in %s against fixed 86/76 percent references",
    (region) => {
      let combinations = 0;
      for (const year of [2025, 2026] as const) {
        for (const annex of ["ANLAGE_31", "ANLAGE_32"]) {
          const territories = input(region, year, annex).pkg.rules.selection!.variants.find(
            (variant) => variant.id === annex,
          )!.regions;
          for (const territory of territories) {
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
              const result = calculate({
                ...input(region, year, annex, territory.id),
                groupIdAtSeptember1: group,
              });
              expect(result).toMatchObject({
                amountCents: ["p4", "p6", "p7", "p8"].includes(group) ? 258000 : 228000,
                draft: true,
                completeGross: false,
              });
              if (result.kind !== "personal-annual-payment-regular-amount")
                throw Error("Expected source-bound amount");
              expect(result.basis.annualRule.regionId).toBe(territory.id);
              expect(result.basis.annualRule.basisRegionId).toBe(
                year === 2025 && territory.id === "OST_TARIF_OST"
                  ? "OST_TARIF_WEST_HAMBURG"
                  : territory.id,
              );
              combinations++;
            }
          }
        }
      }
      expect(combinations).toBe(region === "ost" ? 144 : 48);
    },
  );

  it("preserves the exceptional 2025 RK-Ost West basis and switches to its own basis in 2026", () => {
    for (const year of [2025, 2026] as const) {
      const result = calculate(input("ost", year));
      expect(result).toMatchObject({
        amountCents: 258000,
        basis: {
          annualRule: {
            basisTablePolicy: year === 2025 ? "RK_OST_WEST_TABLE_2025" : "SELECTED_TERRITORY",
          },
        },
      });
      if (result.kind !== "personal-annual-payment-regular-amount") throw Error("Expected amount");
      expect(result.roundingEvidence.sourceId).toBe(`caritas-avr-jsz-${year}`);
    }
  });

  it.each(["APPLICABLE", "UNKNOWN", undefined, null, true, "other"])(
    "blocks special/unknown parental reference basis %s",
    (value) => {
      failure(
        { ...input(), parentalLeavePartTimeBasis: value } as unknown as Input,
        "UNSUPPORTED_SPECIAL_BASIS",
      );
    },
  );

  it.each([
    "PARTIAL_MONTHS",
    "SICK_PAY_SUPPLEMENT",
    "LATE_ENTRY",
    "PARENTAL_LEAVE",
    "EARLY_EXIT",
    "UNKNOWN",
  ] as const)("blocks the unsupported %s reference case", (referenceCase) => {
    failure({ ...input(), referenceCase }, "UNSUPPORTED_REFERENCE_CASE");
  });

  it.each(["ANLAGE_31", "ANLAGE_32"])(
    "does not apply the regular basis to a pre-December exit under %s",
    (annex) => {
      const value = changeMonth(
        { ...input("bw", 2026, annex), employmentEndDate: "2026-11-30" },
        11,
        { entgeltOrContinuationDays: 0 },
      );
      failure(value, "UNSUPPORTED_EMPLOYMENT_PERIOD");
    },
  );

  it("rejects later entry even when the caller confirms contradictory full reference wages", () => {
    const value = { ...input(), employmentStartDate: "2026-07-02" };
    failure(value, "ENTGELT_OUTSIDE_EMPLOYMENT");
  });

  it.each([0, 1, 30])(
    "rejects only %i July wage claim days alongside a full-month paid basis",
    (entgeltOrContinuationDays) => {
      failure(
        changeMonth(input(), 6, { entgeltOrContinuationDays }),
        "REFERENCE_MONTH_FACTS_MISMATCH",
      );
    },
  );

  it("rejects a sick-pay exception in a purported full reference wage month", () => {
    failure(
      changeMonth(input(), 6, {
        entgeltOrContinuationDays: 0,
        reductionException: { kind: "SICK_PAY_SUPPLEMENT", paidSupplementConfirmed: true },
      }),
      "REFERENCE_MONTH_FACTS_MISMATCH",
    );
  });

  it("propagates an unconfirmed ordinary period", () =>
    failure({ ...input(), ordinaryReferencePeriodConfirmed: false }, "REFERENCE_CASE_UNCONFIRMED"));
  it("propagates an unconfirmed September group", () =>
    failure({ ...input(), septemberGroupConfirmed: false }, "REFERENCE_GROUP_UNCONFIRMED"));
  it("propagates an unconfirmed single employment history", () =>
    failure(
      { ...input(), singleEmploymentHistoryConfirmed: false },
      "EMPLOYMENT_HISTORY_UNCONFIRMED",
    ));
  it("propagates an unconfirmed month fact", () =>
    failure(changeMonth(input(), 0, { monthFactsConfirmed: false }), "MONTH_FACTS_UNCONFIRMED"));
  it("propagates an unconfirmed reduction exception", () =>
    failure(
      changeMonth(input(), 0, {
        entgeltOrContinuationDays: 0,
        reductionException: { kind: "SICK_PAY_SUPPLEMENT", paidSupplementConfirmed: false },
      }),
      "EXCEPTION_UNCONFIRMED",
    ));
  it("rejects a duplicate/missing month in the year", () => {
    const value = input();
    failure(
      { ...value, months: [...value.months.slice(0, 11), value.months[0]] },
      "INVALID_MONTHS",
    );
  });
  it("rejects a duplicate/missing paid reference month", () => {
    const value = input();
    failure(
      { ...value, paidMonths: [value.paidMonths[0], value.paidMonths[0], value.paidMonths[2]] },
      "INVALID_REFERENCE_MONTHS",
    );
  });
  it("rejects a paid reference month from another year", () => {
    const value = input();
    failure(
      {
        ...value,
        paidMonths: value.paidMonths.map((month, index) =>
          index === 0 ? { ...month, month: "2025-07" } : month,
        ),
      },
      "INVALID_REFERENCE_MONTHS",
    );
  });
  it("rejects an unconfirmed full-calendar wage month", () => {
    const value = input();
    failure(
      {
        ...value,
        paidMonths: value.paidMonths.map((month, index) =>
          index === 0 ? { ...month, fullCalendarMonthEntgeltConfirmed: false } : month,
        ),
      },
      "REFERENCE_MONTH_INCOMPLETE",
    );
  });
  it("rejects an unconfirmed section-16 amount", () => {
    const value = input();
    failure(
      {
        ...value,
        paidMonths: value.paidMonths.map((month, index) =>
          index === 0 ? { ...month, section16BasisConfirmed: false } : month,
        ),
      },
      "MONTH_BASIS_UNCONFIRMED",
    );
  });
  it("rejects a mismatched basis region/table", () => {
    const value = input();
    failure(
      {
        ...value,
        paidMonths: value.paidMonths.map((month, index) =>
          index === 0 ? { ...month, basisRegionId: "NORD" } : month,
        ),
      },
      "BASIS_IDENTITY_MISMATCH",
    );
  });
  it.each([0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid personal reference cents %s",
    (personalPaidBasisCents) => {
      const value = input();
      failure(
        {
          ...value,
          paidMonths: value.paidMonths.map((month, index) =>
            index === 0 ? { ...month, personalPaidBasisCents } : month,
          ),
        },
        "INVALID_MONTH_BASIS",
      );
    },
  );
  it("rejects unsafe total basis sums", () => {
    const value = input();
    failure(
      {
        ...value,
        paidMonths: value.paidMonths.map((month) => ({
          ...month,
          personalPaidBasisCents: Number.MAX_SAFE_INTEGER,
        })),
      },
      "AMOUNT_OVERFLOW",
    );
  });
  it("rejects unknown pay groups instead of substituting a percentage", () =>
    failure({ ...input(), groupIdAtSeptember1: "p5" }, "UNKNOWN_PAY_GROUP"));
  it("rejects an out-of-period year", () =>
    failure({ ...input(), entitlementYear: 2025 }, "OUTSIDE_ENTITLEMENT_YEAR"));
  it("rejects an old contract package", () => {
    const value = input();
    failure(
      {
        ...value,
        pkg: { ...value.pkg, engineContractVersion: 13 } as unknown as RuleTariffPackage,
      },
      "INVALID_PACKAGE",
    );
  });
  it("rejects missing annual rules", () => {
    const value = input();
    delete value.pkg.rules.caritasAnnualPaymentRules;
    failure(value, "MISSING_ANNUAL_PAYMENT_RULE");
  });
  it("rejects a changed AVR snapshot hash for the new rounding evidence", () => {
    const value = input();
    value.pkg.sources.find((source) => source.id === "caritas-avr-jsz-2026")!.sha256 = "0".repeat(
      64,
    );
    failure(value, "ROUNDING_SOURCE_MISSING");
  });
});

it.each(["url", "documentDate"] as const)(
  "rejects changed %s metadata even with a known document hash",
  (field) => {
    const value = input();
    const source = value.pkg.sources.find((item) => item.id === "caritas-avr-jsz-2026")!;
    source[field] = field === "url" ? "https://example.invalid/other.pdf" : "2026-03-18";
    failure(value, "ROUNDING_SOURCE_MISSING");
  },
);

it("distinguishes entitlement year from the regional AVR snapshot date for 2025", () => {
  const west = calculate(input("bw", 2025));
  const east = calculate(input("ost", 2025));
  expect(west).toMatchObject({
    entitlementYear: 2025,
    roundingEvidence: {
      sourceSha256: "cb6fc32981eb120d5c05e68d6563725436001409e9bc728bc47d52d08d705aa7",
    },
  });
  expect(east).toMatchObject({
    entitlementYear: 2025,
    roundingEvidence: {
      sourceSha256: "a4f8dea02fb84ba4f203a753bd362d82dec8ad8953f3befed99ac65e65ec2637",
    },
  });
});
