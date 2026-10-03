import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "../rules/contracts.generated";
import {
  calculateCaritasAnnualPaymentEarlyExitAmount as calculate,
  type CaritasAnnualPaymentEarlyExitAmountInput as Input,
} from "./caritas-annual-payment-early-exit-amount";

function input(
  region = "bw",
  year: 2025 | 2026 = 2026,
  group = "p6",
  territory?: string,
  end = "11-30",
  start = `${year - 1}-01-01`,
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
    .selection!.variants.find((item) => item.id === "ANLAGE_31")!
    .regions.find((item) => item.id === basisRegionId)!.payTableId!;
  const endDate = `${year}-${end}`;
  const endValue = Date.parse(endDate);
  const startValue = Date.parse(start);
  const endMonth = Number(end.slice(0, 2)),
    endDay = Number(end.slice(3, 5));
  const endMonthDays = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
  const fullMonth = endDay === endMonthDays ? endMonth : endMonth - 1;
  return {
    pkg,
    entitlementYear: year,
    variantId: "ANLAGE_31",
    regionId,
    employmentStartDate: start,
    employmentEndDate: endDate,
    singleEmploymentHistoryConfirmed: true,
    groupIdAtSeptember1: group,
    septemberGroupConfirmed: true,
    referenceCase: "EARLY_EXIT",
    earlyExitReferencePeriodConfirmed: true,
    parentalLeavePartTimeBasis: "NOT_APPLICABLE",
    // Explicit external personal components; these are not values inferred from a tariff table.
    lastFullMonth: {
      month: `${year}-${String(fullMonth).padStart(2, "0")}`,
      personalTablePayCents: 278204,
      personalFixedMonthlyAllowancesCents: 9450,
      basisRegionId,
      basisPayTableId,
      fullCalendarMonthEntgeltConfirmed: true,
      section16Paragraph6ComponentsConfirmed: true,
    },
    months: Array.from({ length: 12 }, (_, index) => {
      const first = Date.UTC(year, index, 1),
        last = Date.UTC(year, index + 1, 0);
      return {
        month: `${year}-${String(index + 1).padStart(2, "0")}`,
        entgeltOrContinuationDays: Math.max(
          0,
          (Math.min(last, endValue) - Math.max(first, startValue)) / 86400000 + 1,
        ),
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
  expect(calculate(value)).toEqual({ kind: "unavailable", reason });
}
const groups = ["p4", "p6", "p7", "p8", "p9", "p10", "p11", "p12", "p13", "p14", "p15", "p16"];

describe("Caritas Anlage 31 early-exit annual amount", () => {
  it.each(["bw", "bayern", "mitte", "nord", "nrw", "ost"])(
    "checks fixed 2025/2026 group amounts and provenance in %s",
    (region) => {
      const territories =
        region === "ost"
          ? ["OST_TARIF_OST", "OST_TARIF_WEST_BERLIN", "OST_TARIF_WEST_HAMBURG"]
          : [region.toUpperCase()];
      for (const year of [2025, 2026] as const)
        for (const territory of territories)
          for (const group of groups) {
            const value = input(region, year, group, territory);
            const lowerBand = ["p4", "p6", "p7", "p8"].includes(group);
            const result = calculate(value);
            expect(result).toMatchObject({
              kind: "personal-annual-payment-early-exit-amount",
              draft: true,
              completeGross: false,
              entitlementYear: year,
              amountCents: lowerBand ? 226767 : 200399,
              rateBasisPoints: lowerBand ? 8600 : 7600,
              exactAmountCents: {
                numerator: lowerBand ? "27212068400" : "24047874400",
                denominator: "120000",
              },
              parentalLeavePartTimeBasis: "NOT_APPLICABLE",
              basis: {
                kind: "personal-annual-payment-early-exit-basis",
                groupIdAtSeptember1: group,
                groupReferenceDate: `${year}-09-01`,
                referenceCase: "EARLY_EXIT",
                lastFullMonth: {
                  month: `${year}-11`,
                  personalTablePayCents: 278204,
                  personalFixedMonthlyAllowancesCents: 9450,
                  basisRegionId: value.lastFullMonth.basisRegionId,
                  basisPayTableId: value.lastFullMonth.basisPayTableId,
                },
                meanMonthlyBasis: { numeratorCents: 287654, denominator: 1 },
                annualRule: {
                  packageId: value.pkg.packageId,
                  versionId: value.pkg.versionId,
                  variantId: "ANLAGE_31",
                  regionId: territory,
                  basisTablePolicy:
                    year === 2025 && territory === "OST_TARIF_OST"
                      ? "RK_OST_WEST_TABLE_2025"
                      : "SELECTED_TERRITORY",
                  sourceIds: expect.arrayContaining([`caritas-avr-jsz-${year}`]),
                },
              },
              entitlement: {
                eligibility: { eligible: true, reason: "ANLAGE_31_EARLY_EXIT" },
                retainedMonthCount: 11,
                reducedMonthCount: 1,
                reductionFactor: { numerator: 11, denominator: 12 },
                sourcePolicy: {
                  packageId: value.pkg.packageId,
                  versionId: value.pkg.versionId,
                  variantId: "ANLAGE_31",
                  regionId: territory,
                },
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
            expect(() => JSON.stringify(result)).not.toThrow();
            expect(result).not.toHaveProperty("monthlyGrossCents");
          }
    },
  );
  it.each([
    ["09-01", "08", 9, 185537],
    ["09-30", "09", 9, 185537],
    ["10-01", "09", 10, 206152],
    ["10-31", "10", 10, 206152],
    ["11-01", "10", 11, 226767],
    ["11-15", "10", 11, 226767],
    ["11-30", "11", 11, 226767],
  ] as const)(
    "uses the actual last full employment month at %s",
    (end, reference, retained, amountCents) => {
      expect(calculate(input("bw", 2026, "p6", undefined, end))).toMatchObject({
        kind: "personal-annual-payment-early-exit-amount",
        amountCents,
        basis: { lastFullMonth: { month: `2026-${reference}` } },
        entitlement: { reductionFactor: { numerator: retained, denominator: 12 } },
      });
    },
  );
  it("retains one paid exit day but reduces a wholly unpaid exit month", () => {
    const value = input("bw", 2026, "p6", undefined, "11-01");
    expect(calculate(value)).toMatchObject({
      amountCents: 226767,
      entitlement: { retainedMonthCount: 11 },
    });
    expect(calculate(withMonth(value, 11, { entgeltOrContinuationDays: 0 }))).toMatchObject({
      amountCents: 206152,
      entitlement: { retainedMonthCount: 10 },
    });
  });
  it("retains a confirmed sickness-supplement exit month without adding it to the basis", () => {
    const value = withMonth(input("bw", 2026, "p6", undefined, "11-15"), 11, {
      entgeltOrContinuationDays: 0,
      reductionException: { kind: "SICK_PAY_SUPPLEMENT", paidSupplementConfirmed: true },
    });
    expect(calculate(value)).toMatchObject({
      amountCents: 226767,
      basis: { meanMonthlyBasis: { numeratorCents: 287654, denominator: 1 } },
      entitlement: { retainedMonthCount: 11 },
    });
  });
  it("accepts actual employment on September 1 with three retained twelfths", () => {
    expect(calculate(input("bw", 2026, "p6", undefined, "11-30", "2026-09-01"))).toMatchObject({
      kind: "personal-annual-payment-early-exit-amount",
      amountCents: 61846,
      entitlement: { retainedMonthCount: 3, reducedMonthCount: 9 },
    });
  });
  it.each([
    ["08-31", "2025-01-01"],
    ["09-30", "2026-09-02"],
    ["11-30", "2026-10-01"],
  ] as const)("does not invent a September group for end %s / start %s", (end, start) => {
    failure(input("bw", 2026, "p6", undefined, end, start), "EARLY_EXIT_RATE_REFERENCE_UNRESOLVED");
  });
  it("requires a full employment month before an exit on September 1", () => {
    for (const start of ["2026-08-15", "2026-09-01"])
      failure(input("bw", 2026, "p6", undefined, "09-01", start), "NO_FULL_EMPLOYMENT_MONTH");
  });
  it("does not substitute the last paid month for the last full employment month", () => {
    const value = input("bw", 2026, "p6", undefined, "11-15");
    failure(
      { ...value, lastFullMonth: { ...value.lastFullMonth, month: "2026-09" } },
      "INVALID_REFERENCE_MONTH",
    );
    failure(
      withMonth(value, 10, { entgeltOrContinuationDays: 0 }),
      "REFERENCE_MONTH_FACTS_MISMATCH",
    );
  });
  it.each([0, 1, 29])(
    "rejects an alleged full November with %i annual entitlement days",
    (days) => {
      failure(
        withMonth(input(), 11, { entgeltOrContinuationDays: days }),
        "REFERENCE_MONTH_FACTS_MISMATCH",
      );
    },
  );
  it("rejects a sickness-only full reference month", () => {
    failure(
      withMonth(input(), 11, {
        entgeltOrContinuationDays: 0,
        reductionException: { kind: "SICK_PAY_SUPPLEMENT", paidSupplementConfirmed: true },
      }),
      "REFERENCE_MONTH_FACTS_MISMATCH",
    );
  });
  it("rejects paid days after exit and before entry", () => {
    failure(withMonth(input(), 12, { entgeltOrContinuationDays: 1 }), "ENTGELT_OUTSIDE_EMPLOYMENT");
    failure(
      withMonth(input("bw", 2026, "p6", undefined, "11-30", "2026-09-01"), 8, {
        entgeltOrContinuationDays: 1,
      }),
      "ENTGELT_OUTSIDE_EMPLOYMENT",
    );
  });
  it("does not grant the Anlage 31 exception to Anlage 32", () => {
    failure({ ...input(), variantId: "ANLAGE_32" }, "UNSUPPORTED_EARLY_EXIT");
  });
  it.each(["12-01", "12-31"])(
    "leaves the regular December 1 case outside this function (%s)",
    (end) => {
      failure(input("bw", 2026, "p6", undefined, end), "UNSUPPORTED_EARLY_EXIT");
    },
  );
  it("requires an actual confirmed end in the entitlement year", () => {
    const value = input();
    failure({ ...value, employmentEndDate: null }, "UNSUPPORTED_EARLY_EXIT");
    failure({ ...value, employmentEndDate: "2026-11-31" }, "INVALID_EMPLOYMENT_PERIOD");
    failure(
      {
        ...value,
        employmentEndDate: "2025-11-30",
        months: value.months.map((item) => ({ ...item, entgeltOrContinuationDays: 0 })),
      },
      "UNSUPPORTED_EARLY_EXIT",
    );
  });
  it.each(["APPLICABLE", "UNKNOWN", undefined, null, false])(
    "requires explicit exclusion of the parental-leave basis (%s)",
    (flag) => {
      failure(
        { ...input(), parentalLeavePartTimeBasis: flag } as Input,
        "UNSUPPORTED_SPECIAL_BASIS",
      );
    },
  );
  it.each([
    ["earlyExitReferencePeriodConfirmed", "REFERENCE_CASE_UNCONFIRMED"],
    ["septemberGroupConfirmed", "REFERENCE_GROUP_UNCONFIRMED"],
    ["singleEmploymentHistoryConfirmed", "EMPLOYMENT_HISTORY_UNCONFIRMED"],
  ] as const)("requires strict confirmation of %s", (field, reason) => {
    for (const flag of [false, undefined, 1, "true"])
      failure({ ...input(), [field]: flag } as Input, reason);
  });
  it.each([
    "ORDINARY_FULL_MONTHS",
    "PARTIAL_MONTHS",
    "SICK_PAY_SUPPLEMENT",
    "LATE_ENTRY",
    "PARENTAL_LEAVE",
    "UNKNOWN",
  ] as const)("does not reuse the %s reference case", (referenceCase) => {
    failure({ ...input(), referenceCase }, "UNSUPPORTED_REFERENCE_CASE");
  });
  it.each([
    ["fullCalendarMonthEntgeltConfirmed", "REFERENCE_MONTH_INCOMPLETE"],
    ["section16Paragraph6ComponentsConfirmed", "MONTH_COMPONENTS_UNCONFIRMED"],
  ] as const)("requires strict last-month confirmation of %s", (field, reason) => {
    const value = input();
    for (const flag of [false, undefined, 1, "true"])
      failure(
        { ...value, lastFullMonth: { ...value.lastFullMonth, [field]: flag } } as Input,
        reason,
      );
  });
  it.each(["basisRegionId", "basisPayTableId"] as const)("requires consistent %s", (field) => {
    const value = input();
    failure(
      { ...value, lastFullMonth: { ...value.lastFullMonth, [field]: "OTHER" } },
      "BASIS_IDENTITY_MISMATCH",
    );
  });
  it.each(["personalTablePayCents", "personalFixedMonthlyAllowancesCents"] as const)(
    "rejects invalid component cents in %s",
    (field) => {
      const value = input();
      for (const amount of [
        -1,
        1.5,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.MAX_SAFE_INTEGER + 1,
      ])
        failure(
          { ...value, lastFullMonth: { ...value.lastFullMonth, [field]: amount } },
          "INVALID_MONTH_COMPONENTS",
        );
    },
  );
  it("supports zero fixed allowances while requiring positive confirmed table pay", () => {
    const value = input();
    failure(
      { ...value, lastFullMonth: { ...value.lastFullMonth, personalTablePayCents: 0 } },
      "INVALID_MONTH_COMPONENTS",
    );
    expect(
      calculate({
        ...value,
        lastFullMonth: { ...value.lastFullMonth, personalFixedMonthlyAllowancesCents: 0 },
      }),
    ).toMatchObject({
      kind: "personal-annual-payment-early-exit-amount",
      basis: { meanMonthlyBasis: { numeratorCents: 278204, denominator: 1 } },
    });
  });
  it("does not import hourly premiums, overtime or other additional positions into the basis", () => {
    const value = input();
    const result = calculate({
      ...value,
      lastFullMonth: {
        ...value.lastFullMonth,
        overtimeCents: 100000,
        hourlyPremiumsCents: 100000,
        performanceBonusCents: 100000,
      },
    } as Input);
    expect(result).toMatchObject({
      amountCents: 226767,
      basis: { meanMonthlyBasis: { numeratorCents: 287654, denominator: 1 } },
    });
    for (const field of ["overtimeCents", "hourlyPremiumsCents", "performanceBonusCents"])
      expect(result).not.toHaveProperty(`basis.lastFullMonth.${field}`);
  });
  it("rejects unsafe addition of individually safe components", () => {
    const value = input();
    failure(
      {
        ...value,
        lastFullMonth: {
          ...value.lastFullMonth,
          personalTablePayCents: Number.MAX_SAFE_INTEGER,
          personalFixedMonthlyAllowancesCents: 1,
        },
      },
      "AMOUNT_OVERFLOW",
    );
  });
  it.each([
    [29, 21],
    [30, 22],
    [31, 22],
    [101, 72],
  ] as const)("rounds basis %i only at the final cent", (basis, expected) => {
    const value = input("bw", 2026, "p6", undefined, "10-31");
    expect(
      calculate({
        ...value,
        lastFullMonth: {
          ...value.lastFullMonth,
          personalTablePayCents: basis,
          personalFixedMonthlyAllowancesCents: 0,
        },
      }),
    ).toMatchObject({
      amountCents: expected,
      exactAmountCents: { numerator: String(basis * 86000), denominator: "120000" },
    });
  });
  it("propagates unconfirmed/invalid yearly facts and unknown selection", () => {
    const value = input();
    failure(withMonth(value, 11, { monthFactsConfirmed: false }), "MONTH_FACTS_UNCONFIRMED");
    failure({ ...value, months: value.months.slice(1) }, "INVALID_MONTHS");
    failure({ ...value, pkg: { ...value.pkg, engineContractVersion: 11 } }, "INVALID_PACKAGE");
    failure({ ...value, regionId: "OTHER" }, "UNKNOWN_SELECTION");
    failure({ ...value, groupIdAtSeptember1: "OTHER" }, "UNKNOWN_PAY_GROUP");
  });
  it("rejects an arbitrary shift of sourced package validity before using its reference month", () => {
    const value = input("bw", 2026, "p6", undefined, "09-01");
    failure({ ...value, pkg: { ...value.pkg, validFrom: "2026-08-15" } }, "INVALID_PACKAGE");
  });
  it("requires the original rounding evidence and never substitutes an unknown document", () => {
    const value = input();
    const sources = value.pkg.sources.map((source) =>
      source.id === "caritas-avr-jsz-2026" ? { ...source, sha256: "0".repeat(64) } : source,
    ) as RuleTariffPackage["sources"];
    failure({ ...value, pkg: { ...value.pkg, sources } }, "ROUNDING_SOURCE_MISSING");
  });

  it("does not mutate inputs and copies the confirmed month and claim facts", () => {
    const value = input(),
      snapshot = structuredClone(value);
    const result = calculate(value);
    expect(value).toEqual(snapshot);
    if (result.kind !== "personal-annual-payment-early-exit-amount")
      throw new Error("Expected early-exit amount");
    expect(result.basis.lastFullMonth).not.toBe(value.lastFullMonth);
    expect(result.entitlement.months[10]).not.toBe(value.months[10]);
    (value.lastFullMonth as { personalTablePayCents: number }).personalTablePayCents = 1;
    (value.months[10] as { entgeltOrContinuationDays: number }).entgeltOrContinuationDays = 0;
    expect(result.amountCents).toBe(226767);
    expect(result.basis.lastFullMonth.personalTablePayCents).toBe(278204);
    expect(result.entitlement.months[10].entgeltOrContinuationDays).toBe(30);
  });
});
