import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "../rules/contracts.generated";
import {
  calculateCaritasAnnualPaymentLateEntryBasis as calculate,
  type CaritasAnnualPaymentLateEntryBasisInput as Input,
} from "./caritas-annual-payment-late-entry-basis";

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
    referenceCase: "LATE_ENTRY",
    lateEntryReferencePeriodConfirmed: true,
    employmentStartDate: `${year}-10-15`,
    employmentStartConfirmed: true,
    sameEmploymentConfirmed: true,
    firstFullMonth: {
      month: `${year}-11`,
      personalPaidBasisCents: 287654,
      basisRegionId,
      basisPayTableId,
      fullCalendarMonthEntgeltConfirmed: true,
      section16BasisConfirmed: true,
    },
  };
}

function failure(value: Input, reason: string) {
  expect(calculate(value)).toEqual({ kind: "unavailable", reason });
}

const monthCases = [
  ["10-01", "10"],
  ["10-02", "11"],
  ["10-31", "11"],
  ["11-01", "11"],
  ["11-02", "12"],
  ["11-30", "12"],
  ["12-01", "12"],
] as const;

describe("Caritas late-entry personal annual-payment basis", () => {
  it.each(["bw", "bayern", "mitte", "nord", "nrw", "ost"])(
    "checks the 2025/2026 sources and first full months in %s",
    (region) => {
      const territories =
        region === "ost"
          ? ["OST_TARIF_OST", "OST_TARIF_WEST_BERLIN", "OST_TARIF_WEST_HAMBURG"]
          : [region.toUpperCase()];
      for (const year of [2025, 2026] as const)
        for (const annex of ["ANLAGE_31", "ANLAGE_32"])
          for (const territory of territories)
            for (const [start, month] of monthCases) {
              const value = input(region, year, annex, territory);
              const result = calculate({
                ...value,
                employmentStartDate: `${year}-${start}`,
                firstFullMonth: { ...value.firstFullMonth, month: `${year}-${month}` },
              });
              expect(result).toMatchObject({
                kind: "personal-annual-payment-late-entry-basis",
                draft: true,
                completeGross: false,
                entitlementYear: year,
                employmentStartDate: `${year}-${start}`,
                firstFullMonth: { month: `${year}-${month}`, personalPaidBasisCents: 287654 },
                meanMonthlyBasis: { numeratorCents: 287654, denominator: 1 },
                sourceBasis: {
                  packageId: value.pkg.packageId,
                  versionId: value.pkg.versionId,
                  variantId: annex,
                  regionId: territory,
                  basisRegionId: value.firstFullMonth.basisRegionId,
                  basisPayTableId: value.firstFullMonth.basisPayTableId,
                  basisPolicy: "ANLAGE_31_32_SECTION_16_2_WITH_EXCEPTIONS",
                  basisTablePolicy:
                    year === 2025 && territory === "OST_TARIF_OST"
                      ? "RK_OST_WEST_TABLE_2025"
                      : "SELECTED_TERRITORY",
                  sourceIds: expect.arrayContaining([`caritas-avr-jsz-${year}`]),
                },
              });
              if (result.kind !== "personal-annual-payment-late-entry-basis")
                throw new Error("Expected a confirmed late-entry basis");
              expect(result.sourceBasis.basisRuleIds).toEqual(
                value.pkg.rules
                  .caritasAnnualPaymentRules!.filter(
                    (rule) =>
                      rule.entitlementYear === year &&
                      rule.variantId === annex &&
                      rule.regionId === territory,
                  )
                  .map((rule) => rule.id),
              );
              for (const field of [
                "groupIdAtSeptember1",
                "groupReferenceDate",
                "annualRule",
                "rateBasisPoints",
                "annualAmountCents",
                "amountCents",
                "entitlementConfirmed",
                "monthlyGrossCents",
              ]) {
                expect(result).not.toHaveProperty(field);
                expect(result.sourceBasis).not.toHaveProperty(field);
              }
            }
    },
  );

  it.each([
    "ORDINARY_FULL_MONTHS",
    "PARTIAL_MONTHS",
    "SICK_PAY_SUPPLEMENT",
    "PARENTAL_LEAVE",
    "EARLY_EXIT",
    "UNKNOWN",
  ] as const)("rejects the %s reference case", (referenceCase) => {
    failure({ ...input(), referenceCase }, "UNSUPPORTED_REFERENCE_CASE");
  });

  it.each([
    ["lateEntryReferencePeriodConfirmed", "REFERENCE_CASE_UNCONFIRMED"],
    ["employmentStartConfirmed", "EMPLOYMENT_START_UNCONFIRMED"],
    ["sameEmploymentConfirmed", "EMPLOYMENT_IDENTITY_UNCONFIRMED"],
  ] as const)("requires the strict root confirmation %s", (field, reason) => {
    for (const flag of [false, undefined, 1, "true"])
      failure({ ...input(), [field]: flag } as Input, reason);
  });

  it.each([
    ["fullCalendarMonthEntgeltConfirmed", "REFERENCE_MONTH_INCOMPLETE"],
    ["section16BasisConfirmed", "MONTH_BASIS_UNCONFIRMED"],
  ] as const)("requires the strict monthly confirmation %s", (field, reason) => {
    for (const flag of [false, undefined, 1, "true"]) {
      const value = input();
      failure(
        { ...value, firstFullMonth: { ...value.firstFullMonth, [field]: flag } } as Input,
        reason,
      );
    }
  });

  it.each([
    "2026-1-01",
    "2026-10-1",
    "2026-10-00",
    "2026-10-32",
    "2026-11-31",
    "2026-02-29",
    "2026-13-01",
    "2026-00-15",
    "2025-10-01",
    "2027-10-01",
    "2026-10-01T00:00:00Z",
    " 2026-10-01",
    "2026-10-01 ",
  ])("rejects invalid or out-of-year employment start %s", (employmentStartDate) => {
    failure({ ...input(), employmentStartDate }, "INVALID_EMPLOYMENT_START");
  });

  it("rejects a non-string start instead of coercing it", () => {
    failure(
      { ...input(), employmentStartDate: 20261001 as unknown as string },
      "INVALID_EMPLOYMENT_START",
    );
  });

  it.each(["2026-01-01", "2026-08-31", "2026-09-01", "2026-09-30"])(
    "keeps ordinary entry %s outside this path",
    (employmentStartDate) => {
      failure({ ...input(), employmentStartDate }, "NOT_LATE_ENTRY");
    },
  );

  it.each([2025, 2026] as const)("does not borrow a next-year basis for %s", (year) => {
    for (const day of [2, 31]) {
      const value = input("bw", year);
      failure(
        {
          ...value,
          employmentStartDate: `${year}-12-${String(day).padStart(2, "0")}`,
          firstFullMonth: { ...value.firstFullMonth, month: `${year + 1}-01` },
        },
        "FIRST_FULL_MONTH_OUTSIDE_YEAR",
      );
    }
  });

  it.each(["2026-10", "2026-12", "2025-11", "2027-11", "2026-011", "2026-11-01", ""])(
    "rejects the wrong reference month %s",
    (month) => {
      const value = input();
      failure(
        { ...value, firstFullMonth: { ...value.firstFullMonth, month } },
        "INVALID_REFERENCE_MONTH",
      );
    },
  );

  it("rejects a missing month", () => {
    failure(
      { ...input(), firstFullMonth: undefined } as unknown as Input,
      "INVALID_REFERENCE_MONTH",
    );
  });

  it.each(["basisRegionId", "basisPayTableId"] as const)("rejects mismatched %s", (field) => {
    const value = input();
    failure(
      { ...value, firstFullMonth: { ...value.firstFullMonth, [field]: "other" } },
      "BASIS_IDENTITY_MISMATCH",
    );
  });

  it("requires the western annual basis for RK Ost East in 2025", () => {
    const value = input("ost", 2025);
    const eastTable = value.pkg.rules
      .selection!.variants.find((item) => item.id === value.variantId)!
      .regions.find((item) => item.id === "OST_TARIF_OST")!.payTableId!;
    failure(
      {
        ...value,
        firstFullMonth: {
          ...value.firstFullMonth,
          basisRegionId: "OST_TARIF_OST",
          basisPayTableId: eastTable,
        },
      },
      "BASIS_IDENTITY_MISMATCH",
    );
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects an unsafe or non-positive monthly amount %s",
    (personalPaidBasisCents) => {
      const value = input();
      failure(
        { ...value, firstFullMonth: { ...value.firstFullMonth, personalPaidBasisCents } },
        "INVALID_MONTH_BASIS",
      );
    },
  );

  it("preserves an already personal amount exactly, including the safe-integer boundary", () => {
    const value = input();
    for (const amount of [1, 123457, Number.MAX_SAFE_INTEGER]) {
      expect(
        calculate({
          ...value,
          firstFullMonth: { ...value.firstFullMonth, personalPaidBasisCents: amount },
        }),
      ).toMatchObject({ meanMonthlyBasis: { numeratorCents: amount, denominator: 1 } });
    }
  });

  it.each([2024, 2027, 2026.5, Number.NaN])("rejects unsupported year %s", (entitlementYear) => {
    failure({ ...input(), entitlementYear }, "OUTSIDE_ENTITLEMENT_YEAR");
  });

  it("does not use a package for a different annual year", () => {
    failure(
      { ...input(), entitlementYear: 2025, employmentStartDate: "2025-10-15" },
      "OUTSIDE_ENTITLEMENT_YEAR",
    );
  });

  it.each(["variantId", "regionId"] as const)("rejects unknown selection %s", (field) => {
    failure({ ...input(), [field]: "UNKNOWN" }, "UNKNOWN_SELECTION");
  });

  it("rejects a tampered package ending before the full reference month", () => {
    const value = input();
    value.pkg.validTo = "2026-11-29";
    failure(value, "INVALID_PACKAGE");
  });

  it("rejects a tampered package ending before the first full month", () => {
    const value = input();
    value.pkg.validTo = "2026-10-31";
    failure(value, "INVALID_PACKAGE");
  });

  it("requires sourced annual rules", () => {
    const value = input();
    delete value.pkg.rules.caritasAnnualPaymentRules;
    failure(value, "MISSING_ANNUAL_PAYMENT_RULE");
  });

  it("rejects a missing norm source", () => {
    const value = input();
    const index = value.pkg.sources.findIndex((item) => item.id === "caritas-avr-jsz-2026");
    expect(index).toBeGreaterThanOrEqual(0);
    value.pkg.sources.splice(index, 1);
    failure(value, "INVALID_PACKAGE");
  });

  it("rejects incomplete annual-rule coverage", () => {
    const value = input();
    value.pkg.rules.caritasAnnualPaymentRules!.pop();
    failure(value, "INVALID_PACKAGE");
  });

  it("rejects a conflicting annual basis policy", () => {
    const value = input();
    value.pkg.rules.caritasAnnualPaymentRules![0].basisRegionId = "OTHER";
    failure(value, "INVALID_PACKAGE");
  });

  it.each(["engineContractVersion", "status", "capabilities"])(
    "rejects unsupported or activated package metadata %s",
    (field) => {
      const value = input();
      if (field === "engineContractVersion") value.pkg.engineContractVersion = 11;
      if (field === "status") Object.assign(value.pkg, { status: "VERIFIED" });
      if (field === "capabilities")
        Object.assign(value.pkg.rules.selection!.capabilities, { monthlySalary: "SUPPORTED" });
      failure(value, "INVALID_PACKAGE");
    },
  );

  it("copies the confirmed month and provenance without accepting additional payout fields", () => {
    const value = input();
    Object.assign(value.firstFullMonth, { annualAmountCents: 999, septemberGroupConfirmed: true });
    const before = JSON.stringify(value);
    const result = calculate(value);
    expect(JSON.stringify(value)).toBe(before);
    if (result.kind !== "personal-annual-payment-late-entry-basis")
      throw new Error("Expected basis");
    const snapshot = JSON.stringify(result);
    Object.assign(value.firstFullMonth, { personalPaidBasisCents: 5 });
    value.pkg.rules.caritasAnnualPaymentRules![0].sourceIds.push("other-source");
    expect(JSON.stringify(result)).toBe(snapshot);
    expect(result.firstFullMonth).not.toHaveProperty("annualAmountCents");
    expect(result.firstFullMonth).not.toHaveProperty("septemberGroupConfirmed");
    expect(result.firstFullMonth).not.toBe(value.firstFullMonth);
    (result.sourceBasis.sourceIds as string[]).push("output-only");
    (result.sourceBasis.basisRuleIds as string[]).push("output-only");
    expect(JSON.stringify(value.pkg)).not.toContain("output-only");
  });
});
