import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "../rules/contracts.generated";
import {
  calculateCaritasAnnualPaymentRegularBasis as calculate,
  type CaritasAnnualPaymentRegularBasisInput as Input,
} from "./caritas-annual-payment-regular-basis";

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
    paidMonths: [7, 8, 9].map((month, index) => ({
      month: `${year}-${String(month).padStart(2, "0")}`,
      personalPaidBasisCents: (index + 2) * 100000,
      basisRegionId,
      basisPayTableId,
      fullCalendarMonthEntgeltConfirmed: true,
      section16BasisConfirmed: true,
    })),
  };
}

function failure(value: Input, reason: string) {
  expect(calculate(value)).toEqual({ kind: "unavailable", reason });
}

describe("Caritas regular personal annual-payment basis", () => {
  it.each(["bw", "bayern", "mitte", "nord", "nrw", "ost"])(
    "covers both years, annexes and all P groups in %s",
    (region) => {
      const territories =
        region === "ost"
          ? ["OST_TARIF_OST", "OST_TARIF_WEST_BERLIN", "OST_TARIF_WEST_HAMBURG"]
          : [region.toUpperCase()];
      for (const year of [2025, 2026] as const)
        for (const annex of ["ANLAGE_31", "ANLAGE_32"])
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
              const value = {
                ...input(region, year, annex, territory),
                groupIdAtSeptember1: group,
              };
              const result = calculate(value);
              expect(result).toMatchObject({
                kind: "personal-annual-payment-regular-basis",
                draft: true,
                completeGross: false,
                entitlementYear: year,
                groupIdAtSeptember1: group,
                groupReferenceDate: `${year}-09-01`,
                meanMonthlyBasis: { numeratorCents: 900000, denominator: 3 },
                annualRule: {
                  variantId: annex,
                  regionId: territory,
                  basisRegionId:
                    year === 2025 && territory === "OST_TARIF_OST"
                      ? "OST_TARIF_WEST_HAMBURG"
                      : territory,
                  rateBasisPoints: ["p4", "p6", "p7", "p8"].includes(group) ? 8600 : 7600,
                  sourceIds: expect.arrayContaining([`caritas-avr-jsz-${year}`]),
                },
              });
              expect(result).not.toHaveProperty("amountCents");
              expect(result).not.toHaveProperty("annualAmountCents");
              expect(result).not.toHaveProperty("grossCents");
              expect(result).not.toHaveProperty("entitlementConfirmed");
            }
          }
    },
  );
  it("preserves a third of a cent and already personal changing-time amounts", () => {
    const value = input();
    Reflect.set(value.paidMonths[2]!, "personalPaidBasisCents", 400001);
    const result = calculate(value);
    expect(result).toMatchObject({ meanMonthlyBasis: { numeratorCents: 900001, denominator: 3 } });
    expect(result).not.toHaveProperty("roundedMeanMonthlyCents");
    expect(value.paidMonths.map((month) => month.personalPaidBasisCents)).toEqual([
      200000, 300000, 400001,
    ]);
  });
  it("returns exactly July through September when evidence arrives out of order", () => {
    const value = input();
    const result = calculate({
      ...value,
      paidMonths: [value.paidMonths[2]!, value.paidMonths[0]!, value.paidMonths[1]!],
    });
    expect(result).toMatchObject({
      paidMonths: [{ month: "2026-07" }, { month: "2026-08" }, { month: "2026-09" }],
    });
  });
  it.each([
    "PARTIAL_MONTHS",
    "SICK_PAY_SUPPLEMENT",
    "LATE_ENTRY",
    "PARENTAL_LEAVE",
    "EARLY_EXIT",
    "UNKNOWN",
  ] as const)("leaves %s to its own reference procedure", (referenceCase) => {
    failure({ ...input(), referenceCase }, "UNSUPPORTED_REFERENCE_CASE");
  });
  it.each([
    ["ordinaryReferencePeriodConfirmed", "REFERENCE_CASE_UNCONFIRMED"],
    ["septemberGroupConfirmed", "REFERENCE_GROUP_UNCONFIRMED"],
  ])("requires literal confirmation of %s", (field, reason) => {
    for (const flag of [false, undefined, "true"]) {
      const value = input();
      Reflect.set(value, field, flag);
      failure(value, reason);
    }
  });
  it.each([
    ["fullCalendarMonthEntgeltConfirmed", "REFERENCE_MONTH_INCOMPLETE"],
    ["section16BasisConfirmed", "MONTH_BASIS_UNCONFIRMED"],
  ])("requires every monthly %s confirmation", (field, reason) => {
    for (const index of [0, 1, 2])
      for (const flag of [false, undefined, "true"]) {
        const value = input();
        Reflect.set(value.paidMonths[index]!, field, flag);
        failure(value, reason);
      }
  });
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "10000"])(
    "rejects invalid personal month basis %s",
    (amount) => {
      const value = input();
      Reflect.set(value.paidMonths[1]!, "personalPaidBasisCents", amount);
      failure(value, "INVALID_MONTH_BASIS");
    },
  );
  it("rejects missing, extra, duplicate, foreign-year and noncanonical months", () => {
    const value = input();
    failure({ ...value, paidMonths: value.paidMonths.slice(1) }, "INVALID_REFERENCE_MONTHS");
    failure(
      { ...value, paidMonths: [...value.paidMonths, value.paidMonths[0]!] },
      "INVALID_REFERENCE_MONTHS",
    );
    failure(
      { ...value, paidMonths: [value.paidMonths[0]!, value.paidMonths[0]!, value.paidMonths[2]!] },
      "INVALID_REFERENCE_MONTHS",
    );
    for (const month of ["2025-08", "2026-06", "2026-8", "2026-08-01"]) {
      const changed = input();
      Reflect.set(changed.paidMonths[1]!, "month", month);
      failure(changed, "INVALID_REFERENCE_MONTHS");
    }
    for (const malformed of [undefined, null, "three months", [null, null, null]]) {
      const changed = input();
      Reflect.set(changed, "paidMonths", malformed);
      failure(changed, "INVALID_REFERENCE_MONTHS");
    }
  });
  it.each([2025, 2026] as const)("rejects wrong Ost basis identities in %s", (year) => {
    for (const field of ["basisRegionId", "basisPayTableId"] as const) {
      const value = input("ost", year);
      Reflect.set(
        value.paidMonths[1]!,
        field,
        field === "basisRegionId"
          ? year === 2025
            ? "OST_TARIF_OST"
            : "OST_TARIF_WEST_HAMBURG"
          : "caritas-ost-p-2025-annex32-east",
      );
      failure(value, "BASIS_IDENTITY_MISMATCH");
    }
  });
  it("blocks unsafe accumulation before precision can be lost", () => {
    const value = input();
    Reflect.set(value.paidMonths[0]!, "personalPaidBasisCents", Number.MAX_SAFE_INTEGER);
    failure(value, "AMOUNT_OVERFLOW");
  });
  it("keeps a safe integer numerator at the supported numeric boundary", () => {
    const value = input();
    [Number.MAX_SAFE_INTEGER - 2, 1, 1].forEach((amount, index) =>
      Reflect.set(value.paidMonths[index]!, "personalPaidBasisCents", amount),
    );
    expect(calculate(value)).toMatchObject({
      meanMonthlyBasis: { numeratorCents: Number.MAX_SAFE_INTEGER, denominator: 3 },
    });
  });
  it("preserves the unavailable result for a candidate without annual rules", () => {
    const value = input();
    delete value.pkg.rules.caritasAnnualPaymentRules;
    failure(value, "MISSING_ANNUAL_PAYMENT_RULE");
  });
  it("blocks missing normative evidence and a non-DRAFT package", () => {
    const missing = input();
    missing.pkg.rules.caritasAnnualPaymentRules![0].sourceIds = ["caritas-rk-bw-2025"];
    failure(missing, "INVALID_PACKAGE");
    const active = input();
    Reflect.set(active.pkg, "status", "REVIEWED");
    failure(active, "INVALID_PACKAGE");
  });
  it("uses the dated supported year, annex, territory and September group", () => {
    failure({ ...input(), entitlementYear: 2027 }, "OUTSIDE_ENTITLEMENT_YEAR");
    failure({ ...input(), variantId: "ANLAGE_33" }, "UNKNOWN_SELECTION");
    failure({ ...input(), regionId: "NRW" }, "UNKNOWN_SELECTION");
    failure({ ...input(), groupIdAtSeptember1: "p5" }, "UNKNOWN_PAY_GROUP");
  });
  it("does not mutate inputs and returns independent monthly and rule snapshots", () => {
    const value = input();
    const original = JSON.parse(JSON.stringify(value)) as Input;
    const result = calculate(value);
    expect(value).toEqual(original);
    expect(result.kind).toBe("personal-annual-payment-regular-basis");
    if (result.kind !== "personal-annual-payment-regular-basis") throw new Error("Expected basis");
    expect(result.paidMonths[0]).not.toBe(value.paidMonths[0]);
    Reflect.set(value.paidMonths[0]!, "personalPaidBasisCents", 777);
    expect(result.paidMonths[0]!.personalPaidBasisCents).toBe(200000);
    Reflect.set(result.annualRule.sourceIds, "0", "changed-result-source");
    expect(value.pkg.rules.caritasAnnualPaymentRules![0].sourceIds).toEqual(
      original.pkg.rules.caritasAnnualPaymentRules![0].sourceIds,
    );
  });
});
