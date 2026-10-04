import { describe, expect, it } from "vitest";
import { history } from "@/engine/remuneration-test-fixtures";
import { ownRemunerationFixture } from "@/domain/own-remuneration-test-fixtures";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type { SavedActualOwnAnnualPayment } from "@/domain/saved-annual-payment";
import {
  annualPaymentChoices,
  annualPaymentYear,
  annualPayoutText,
  prepareAnnualPayment,
  type AnnualPaymentSession,
} from "./annual-payment-model";

const profile: DatedRemunerationProfile = {
  ...history(),
  data: {
    version: 2,
    weeklyMinutes: 1155,
    selection: { kind: "own-configured", configuration: ownRemunerationFixture() },
  },
};
const saved: SavedActualOwnAnnualPayment = {
  payment: {
    version: 1,
    revision: 2,
    paymentId: "annual",
    entitlementYear: 2026,
    payoutMonth: "2027-01",
    title: "Sonderzahlung",
    grossCents: 12345,
  },
  revoked: true,
  updatedAt: "2026-11-01T00:00:00Z",
};
const session: AnnualPaymentSession = {
  paymentId: "annual",
  title: "Sonderzahlung",
  entitlementYear: 2026,
  defaultPayoutMonth: "2026-11",
  saved: null,
  profilesToken: "[]",
};
describe("actual annual payment input", () => {
  it.each(["", "0", "1899", "4100", "2026.5", "2e3", " 2026", "20260"])(
    "rejects invalid claim year %s",
    (value) => expect(annualPaymentYear(value)).toBeNull(),
  );
  it.each([1900, 1999, 2026, 4099])("accepts claim year %i", (year) =>
    expect(annualPaymentYear(String(year))).toBe(year),
  );
  it("does not infer a historical configuration from an undated profile or tariff", () => {
    expect(
      annualPaymentChoices([{ ...profile, effectiveFrom: null }, history()], [], 2026),
    ).toEqual([]);
    expect(annualPaymentChoices([profile], [], 2025)).toEqual([]);
  });
  it("uses yearly validity, profile boundaries and a single stable ID across changes", () => {
    expect(annualPaymentChoices([profile], [], 2026).map((item) => item.paymentId)).toEqual([
      "annual",
      "bonus",
    ]);
    expect(annualPaymentChoices([profile], [], 2027).map((item) => item.paymentId)).toEqual([
      "annual",
    ]);
    expect(
      annualPaymentChoices([profile, { ...profile, effectiveFrom: "2026-07-01" }], [], 2026),
    ).toHaveLength(2);
    expect(annualPaymentChoices([profile, history("2026-12-01")], [], 2027)).toEqual([]);
  });
  it("retains removed, revoked and cross-year confirmations for their claim year", () => {
    const choice = annualPaymentChoices([], [saved], 2026);
    expect(choice).toEqual([
      { paymentId: "annual", title: "Sonderzahlung", defaultPayoutMonth: "2027-01", saved },
    ]);
    expect(
      annualPaymentChoices([profile], [saved], 2026).find((item) => item.paymentId === "annual")
        ?.saved,
    ).toBe(saved);
    expect(annualPaymentChoices([], [saved], 2027)).toEqual([]);
  });
  it("uses exact cents, accepts zero and keeps the expected record for re-confirmation", () => {
    expect(prepareAnnualPayment(session, "1250,01", "01.2027")).toEqual({
      expected: null,
      payment: {
        paymentId: "annual",
        entitlementYear: 2026,
        title: "Sonderzahlung",
        payoutMonth: "2027-01",
        grossCents: 125001,
      },
    });
    expect(prepareAnnualPayment({ ...session, saved }, "0", "11.2026")).toMatchObject({
      expected: saved,
      payment: { grossCents: 0 },
    });
    expect(annualPayoutText("2027-01")).toBe("01.2027");
  });
  it.each(["", "-1", "1.000,00", "1,005", "1e3", "10000000,01"])(
    "rejects invalid gross amount %s",
    (value) => expect(() => prepareAnnualPayment(session, value, "11.2026")).toThrow(),
  );
  it.each(["", "2026-11", "13.2026", "00.2026", "1.2026", "01.1899", "01.4100", "11.2026junk"])(
    "rejects invalid payout month %s",
    (value) => expect(() => prepareAnnualPayment(session, "1250", value)).toThrow(),
  );
});
