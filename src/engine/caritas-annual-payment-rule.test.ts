import { describe, expect, it } from "vitest";
import { caritasAnnualPaymentFixture } from "../testing/caritas-annual-payment-fixture";
import { lookupCaritasAnnualPaymentRule } from "./caritas-annual-payment-rule";

describe("Caritas annual-payment source lookup", () => {
  it.each([
    ["ANLAGE_31", "p4", 8600],
    ["ANLAGE_32", "p8", 8600],
    ["ANLAGE_31", "p9", 7600],
    ["ANLAGE_32", "p16", 7600],
  ])("reads %s %s with the sourced P-band", (annex, group, rate) => {
    const result = lookupCaritasAnnualPaymentRule(
      caritasAnnualPaymentFixture(),
      2026,
      annex as string,
      "BW",
      group as string,
    );
    expect(result).toMatchObject({
      kind: "source-annual-payment-rule",
      entitlementYear: 2026,
      variantId: annex,
      regionId: "BW",
      rateBasisPoints: rate,
      referenceMonths: [7, 8, 9],
      groupReferenceMonth: 9,
      groupReferenceDay: 1,
      payoutMonth: 11,
      draft: true,
      completeGross: false,
    });
    expect(result).not.toHaveProperty("amountCents");
    expect(result).not.toHaveProperty("grossCents");
  });
  it("exposes the 2025 West basis for the Ost care territory", () => {
    const pkg = caritasAnnualPaymentFixture("ost", 2025);
    const result = lookupCaritasAnnualPaymentRule(pkg, 2025, "ANLAGE_32", "OST_TARIF_OST", "p16");
    expect(result).toMatchObject({
      kind: "source-annual-payment-rule",
      basisRegionId: "OST_TARIF_WEST_HAMBURG",
      basisTablePolicy: "RK_OST_WEST_TABLE_2025",
      basisPayTableId: "caritas-ost-p-2025-common",
    });
    expect(result).not.toHaveProperty("basisCents");
  });
  it("uses the selected Ost territory from 2026", () => {
    const pkg = caritasAnnualPaymentFixture("ost", 2026);
    const ownTable = pkg.rules.selection!.variants[1].regions[0].payTableId;
    const result = lookupCaritasAnnualPaymentRule(pkg, 2026, "ANLAGE_32", "OST_TARIF_OST", "p16");
    expect(result).toMatchObject({
      kind: "source-annual-payment-rule",
      basisRegionId: "OST_TARIF_OST",
      basisTablePolicy: "SELECTED_TERRITORY",
      basisPayTableId: ownTable,
      sourceIds: expect.arrayContaining(["caritas-bk-2025-03-jsz-ost"]),
    });
  });
  it("preserves the different annex eligibility policies", () => {
    for (const [annex, policy] of [
      ["ANLAGE_31", "ANLAGE_31_SECTION_16_1_AND_6"],
      ["ANLAGE_32", "ANLAGE_32_SECTION_16_1"],
    ]) {
      expect(
        lookupCaritasAnnualPaymentRule(caritasAnnualPaymentFixture(), 2026, annex, "BW", "p7"),
      ).toMatchObject({ eligibilityPolicy: policy });
    }
  });
  it("returns unavailable for an older package without annual rules", () => {
    expect(
      lookupCaritasAnnualPaymentRule(
        caritasAnnualPaymentFixture("bw", 2026, false),
        2026,
        "ANLAGE_31",
        "BW",
        "p7",
      ),
    ).toEqual({
      kind: "unavailable",
      reason: "MISSING_ANNUAL_PAYMENT_RULE",
    });
  });
  it.each([2024, 2027, 2026.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid entitlement year %s",
    (year) => {
      expect(
        lookupCaritasAnnualPaymentRule(
          caritasAnnualPaymentFixture(),
          year,
          "ANLAGE_31",
          "BW",
          "p7",
        ),
      ).toEqual({
        kind: "unavailable",
        reason: "OUTSIDE_ENTITLEMENT_YEAR",
      });
    },
  );
  it("does not select 2026 merely because the 2025 package includes January", () => {
    expect(
      lookupCaritasAnnualPaymentRule(
        caritasAnnualPaymentFixture("bw", 2025),
        2026,
        "ANLAGE_31",
        "BW",
        "p7",
      ),
    ).toEqual({
      kind: "unavailable",
      reason: "OUTSIDE_ENTITLEMENT_YEAR",
    });
  });
  it("rejects unknown selection and groups including P5", () => {
    const pkg = caritasAnnualPaymentFixture();
    expect(lookupCaritasAnnualPaymentRule(pkg, 2026, "ANLAGE_33", "BW", "p7")).toEqual({
      kind: "unavailable",
      reason: "UNKNOWN_SELECTION",
    });
    expect(lookupCaritasAnnualPaymentRule(pkg, 2026, "ANLAGE_31", "NRW", "p7")).toEqual({
      kind: "unavailable",
      reason: "UNKNOWN_SELECTION",
    });
    for (const group of ["p5", "p17", "P7"]) {
      expect(lookupCaritasAnnualPaymentRule(pkg, 2026, "ANLAGE_31", "BW", group)).toEqual({
        kind: "unavailable",
        reason: "UNKNOWN_PAY_GROUP",
      });
    }
  });
  it("rejects tampered packages rather than returning partial metadata", () => {
    const pkg = caritasAnnualPaymentFixture();
    pkg.rules.caritasAnnualPaymentRules![0].rateBasisPoints = 7600;
    expect(lookupCaritasAnnualPaymentRule(pkg, 2026, "ANLAGE_31", "BW", "p7")).toEqual({
      kind: "unavailable",
      reason: "INVALID_PACKAGE",
    });
  });
  it("returns copied arrays without mutating the source package", () => {
    const pkg = caritasAnnualPaymentFixture();
    const before = JSON.stringify(pkg);
    const result = lookupCaritasAnnualPaymentRule(pkg, 2026, "ANLAGE_31", "BW", "p7");
    expect(result.kind).toBe("source-annual-payment-rule");
    if (result.kind !== "source-annual-payment-rule") throw new Error("Expected source rule");
    expect(result.sourceIds).not.toBe(pkg.rules.caritasAnnualPaymentRules![0].sourceIds);
    expect(result.payGroups).not.toBe(pkg.rules.caritasAnnualPaymentRules![0].payGroups);
    expect(JSON.stringify(pkg)).toBe(before);
  });
});
