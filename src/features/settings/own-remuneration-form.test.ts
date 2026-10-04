import { describe, expect, it } from "vitest";
import { ownRemunerationFixture } from "@/domain/own-remuneration-test-fixtures";
import {
  ownBaseError,
  ownConfigurationFromDraft,
  ownDecimal,
  ownNumber,
  ownRemunerationDraft,
  nextOwnId,
} from "./own-remuneration-form";

describe("own remuneration input", () => {
  it("roundtrips all configuration fields, IDs and validity dates without mutation", () => {
    const config = ownRemunerationFixture();
    const before = structuredClone(config);
    expect(ownConfigurationFromDraft(ownRemunerationDraft(config), "2000,00")).toEqual(config);
    expect(config).toEqual(before);
  });
  it("roundtrips hourly wages without carrying a fictitious percentage basis", () => {
    const config = {
      ...ownRemunerationFixture(),
      base: { kind: "hourly" as const, centsPerHour: 2137 },
      percentageBasisHourlyCents: null,
    };
    expect(ownConfigurationFromDraft(ownRemunerationDraft(config), "21,37")).toEqual(config);
  });
  it("starts with no invented premiums, allowances, payments or proration", () => {
    expect(ownConfigurationFromDraft(ownRemunerationDraft(), "1800,50")).toEqual({
      base: { kind: "monthly", personalCents: 180050, partialMonth: "unconfirmed" },
      percentageBasisHourlyCents: null,
      timePremiums: null,
      overtime: null,
      fixedAllowances: [],
      specialPayments: [],
    });
  });
  it.each(["", "NaN", "Infinity", "1e3", "1.234,56", "-1", "25%", "1,001", " 1 2 ", ".50"])(
    "rejects ambiguous number %s",
    (input) => {
      expect(() => ownNumber(input, "Betrag", 100000)).toThrow();
    },
  );
  it.each([
    ["1,01", 101],
    ["0.29", 29],
    [" 50 ", 5000],
    ["0", 0],
  ])("parses %s exactly", (input, scaled) => {
    expect(ownNumber(String(input), "Betrag", 100000)).toBe(scaled);
    expect(ownNumber(ownDecimal(Number(scaled)), "Betrag", 100000)).toBe(scaled);
  });
  it("validates base limits and does not accept zero as a wage", () => {
    expect(ownBaseError("0", "monthly")).toBeTruthy();
    expect(ownBaseError("100000", "monthly")).toBeNull();
    expect(ownBaseError("100000,01", "monthly")).toBeTruthy();
    expect(ownBaseError("10000", "hourly")).toBeNull();
    expect(ownBaseError("10000,01", "hourly")).toBeTruthy();
  });
  it("requires an explicit collision rule and night window", () => {
    const draft = ownRemunerationDraft(ownRemunerationFixture());
    expect(() => ownConfigurationFromDraft({ ...draft, combination: "" }, "2000")).toThrow(
      "zusammentreffende",
    );
    draft.premiums[0].start = "";
    expect(() => ownConfigurationFromDraft(draft, "2000")).toThrow("HH:MM");
    draft.premiums[0].start = draft.premiums[0].end;
    expect(() => ownConfigurationFromDraft(draft, "2000")).toThrow("verschieden");
  });
  it("preserves unknown bases and entitlement months rather than converting to zero", () => {
    const draft = ownRemunerationDraft(ownRemunerationFixture());
    draft.percentageBasis = "";
    draft.specialPayments[0].basis = "";
    draft.specialPayments[0].entitlementMonths = "";
    const result = ownConfigurationFromDraft(draft, "2000");
    expect(result.percentageBasisHourlyCents).toBeNull();
    expect(result.specialPayments[0].entitlementMonths).toBeNull();
    expect(result.specialPayments[0].amount).toMatchObject({ confirmedBasisCents: null });
    draft.specialPayments[0].basis = "0";
    draft.specialPayments[0].entitlementMonths = "0";
    expect(ownConfigurationFromDraft(draft, "2000").specialPayments[0]).toMatchObject({
      entitlementMonths: 0,
      amount: { confirmedBasisCents: 0 },
    });
  });
  it("validates dates, title and whole payout month at the UI boundary", () => {
    const draft = ownRemunerationDraft(ownRemunerationFixture());
    draft.allowances[0].validFrom = "01.10.2026";
    expect(ownConfigurationFromDraft(draft, "2000").fixedAllowances[0].validFrom).toBe(
      "2026-10-01",
    );
    draft.allowances[0].validTo = "30.09.2026";
    expect(() => ownConfigurationFromDraft(draft, "2000")).toThrow("vor");
    draft.allowances[0].validTo = "31.02.2027";
    expect(() => ownConfigurationFromDraft(draft, "2000")).toThrow("Datum");
    draft.allowances[0].validTo = "";
    draft.allowances[0].title = " ";
    expect(() => ownConfigurationFromDraft(draft, "2000")).toThrow("Bezeichnung");
    draft.allowances[0].title = "Zulage";
    draft.specialPayments[0].payoutMonth = "1.5";
    expect(() => ownConfigurationFromDraft(draft, "2000")).toThrow("ganze Zahl");
  });
  it("keeps independent identifiers after removing and adding components", () => {
    expect(nextOwnId([{ id: "premium-1" }, { id: "premium-3" }], "premium")).toBe("premium-2");
  });
});
