import { describe, expect, it } from "vitest";
import { validateTariffAnnualClaim } from "./tariff-annual-claim";
import { tariffAnnualFixture } from "@/engine/tariff-annual-test-fixtures";
import { ValidationError } from "./validation";

describe("personal tariff annual claim contract", () => {
  it("persists a Caritas V3 historical-group confirmation without upgrading older claims", () => {
    const { claim } = tariffAnnualFixture();
    claim.version = 3;
    claim.selection.packageId = "avr-caritas-p-bw";
    claim.selection.variant = "ANLAGE_31";
    claim.selection.region = "BW";
    claim.selection.group = "p7";
    claim.selection.groupAtSeptember1Confirmed = false;
    const saved = validateTariffAnnualClaim(claim);
    expect(saved.selection.groupAtSeptember1Confirmed).toBe(false);
    expect(validateTariffAnnualClaim(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
    delete claim.selection.groupAtSeptember1Confirmed;
    expect(() => validateTariffAnnualClaim(claim)).toThrow(ValidationError);
    claim.selection.groupAtSeptember1Confirmed = true;
    claim.selection.packageId = "tvoed-vka-bt-k";
    expect(() => validateTariffAnnualClaim(claim)).toThrow(ValidationError);
    claim.version = 1;
    expect(() => validateTariffAnnualClaim(claim)).toThrow(ValidationError);
  });
  it.each([null, false, true])("preserves explicit V2 TV-L retirement state %s", (answer) => {
    const { claim } = tariffAnnualFixture();
    claim.version = 2;
    claim.selection.packageId = "tvl-kr-tdl";
    claim.exceptions.tvlLegacyRetirementExit = answer;
    const saved = validateTariffAnnualClaim(claim);
    expect(saved.version).toBe(2);
    expect(saved.exceptions.tvlLegacyRetirementExit).toBe(answer);
    expect(Object.isFrozen(saved.exceptions)).toBe(true);
    expect(validateTariffAnnualClaim(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });
  it("keeps V1 unchanged and rejects missing or unversioned retirement facts", () => {
    const { claim } = tariffAnnualFixture();
    expect(validateTariffAnnualClaim(claim)).toEqual(claim);
    claim.exceptions.tvlLegacyRetirementExit = true;
    expect(() => validateTariffAnnualClaim(claim)).toThrow(ValidationError);
    claim.version = 2;
    expect(() => validateTariffAnnualClaim(claim)).toThrow(ValidationError);
    claim.selection.packageId = "tvl-kr-tdl";
    delete claim.exceptions.tvlLegacyRetirementExit;
    expect(() => validateTariffAnnualClaim(claim)).toThrow(ValidationError);
  });
  it("returns a detached, deeply frozen snapshot without creating missing facts", () => {
    const { claim } = tariffAnnualFixture();
    claim.basis.months[0].baseCents = null;
    const saved = validateTariffAnnualClaim(claim);
    claim.basis.months[0].baseCents = 900_000;
    expect(saved.basis.months[0].baseCents).toBeNull();
    expect(saved.employment.takeover.immediate).toBeNull();
    expect(Object.isFrozen(saved.basis.months[0])).toBe(true);
    expect(Object.isFrozen(saved.entitlements)).toBe(true);
    expect(Object.isFrozen(saved.selection)).toBe(true);
  });
  it.each([
    "version",
    "extra-root",
    "extra-selection",
    "duplicate-month",
    "missing-month",
    "bad-reason",
    "duplicate-basis",
    "bad-date",
    "reversed-period",
    "bad-year",
    "negative-cents",
    "decimal-cents",
    "unsafe-cents",
    "nan",
    "wrong-boolean",
    "too-many-days",
    "bad-basis-month",
    "negative-share",
    "zero-denominator",
    "excess-share",
    "string-cents",
    "missing-confirmation",
  ])("rejects %s", (kind) => {
    const { claim } = tariffAnnualFixture();
    if (kind === "version") Object.assign(claim, { version: 2 });
    if (kind === "extra-root") Object.assign(claim, { secret: "must-not-appear" });
    if (kind === "extra-selection") Object.assign(claim.selection, { autoGroup: true });
    if (kind === "duplicate-month") claim.entitlements[1].month = 1;
    if (kind === "missing-month") claim.entitlements.pop();
    if (kind === "bad-reason") Object.assign(claim.entitlements[0], { reason: "HOLIDAY" });
    if (kind === "duplicate-basis") claim.basis.months.push(claim.basis.months[0]);
    if (kind === "bad-date") claim.employment.start = "2026-02-30";
    if (kind === "reversed-period") claim.employment.end = "2020-12-31";
    if (kind === "bad-year") claim.year = 4100;
    if (kind === "negative-cents") claim.basis.months[0].baseCents = -1;
    if (kind === "decimal-cents") claim.basis.months[0].baseCents = 1.1;
    if (kind === "unsafe-cents") claim.basis.months[0].baseCents = Number.MAX_SAFE_INTEGER;
    if (kind === "nan") claim.basis.months[0].baseCents = NaN;
    if (kind === "wrong-boolean") Object.assign(claim.selection, { confirmed: "yes" });
    if (kind === "too-many-days") claim.basis.months[2].paidCalendarDays = 31;
    if (kind === "bad-basis-month") claim.basis.months[0].month = "2026-2";
    if (kind === "negative-share") claim.allocation.twelfthsNumerator = -1;
    if (kind === "zero-denominator") claim.allocation.twelfthsDenominator = 0;
    if (kind === "excess-share")
      Object.assign(claim.allocation, { twelfthsNumerator: 25, twelfthsDenominator: 2 });
    if (kind === "string-cents") Object.assign(claim.basis.months[0], { baseCents: "300000" });
    if (kind === "missing-confirmation") Object.assign(claim.selection, { confirmed: undefined });
    expect(() => validateTariffAnnualClaim(claim)).toThrow(ValidationError);
  });
  it("allows an incomplete draft without interpreting it as a complete zero claim", () => {
    const { claim } = tariffAnnualFixture();
    claim.employment.start = null;
    claim.employment.confirmed = false;
    claim.basis.months = [];
    claim.entitlements.forEach((row) => {
      row.reason = "UNKNOWN";
    });
    claim.allocation.required = null;
    expect(validateTariffAnnualClaim(claim)).toEqual(claim);
  });
});
