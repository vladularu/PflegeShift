import { describe, expect, it } from "vitest";
import { UserFacingError } from "./errors";
import { validateActualOwnAnnualPayments, type ActualOwnAnnualPayment } from "./annual-payment";

const record: ActualOwnAnnualPayment = {
  version: 1,
  paymentId: "bonus",
  entitlementYear: 2026,
  payoutMonth: "2027-01",
  title: "Jahreszahlung",
  grossCents: 123456,
  revision: 1,
};

describe("confirmed own annual payment contract", () => {
  it("preserves the entitlement year independently of payout year and copies frozen inputs", () => {
    const input = Object.freeze([Object.freeze({ ...record })]);
    const result = validateActualOwnAnnualPayments(input);
    expect(result).toEqual(input);
    expect(result).not.toBe(input);
    expect(result[0]).not.toBe(input[0]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0])).toBe(true);
    expect(result[0].payoutMonth).toBe("2027-01");
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
  it("preserves an explicitly confirmed zero payment", () => {
    expect(validateActualOwnAnnualPayments([{ ...record, grossCents: 0 }])[0].grossCents).toBe(0);
  });
  it("accepts the same payment ID for distinct entitlement years", () => {
    expect(
      validateActualOwnAnnualPayments([record, { ...record, entitlementYear: 2025 }]),
    ).toHaveLength(2);
  });
  it("rejects a duplicate entitlement regardless of payout month", () => {
    expect(() =>
      validateActualOwnAnnualPayments([record, { ...record, payoutMonth: "2026-12" }]),
    ).toThrow(UserFacingError);
  });
  it.each([undefined, null, {}, "payment", [null], [[]], [{ ...record, extra: true }]])(
    "rejects malformed containers or unknown fields %j",
    (input) => expect(() => validateActualOwnAnnualPayments(input)).toThrow(UserFacingError),
  );
  it.each([
    { version: 2 },
    { paymentId: "" },
    { paymentId: "../bonus" },
    { paymentId: "x".repeat(81) },
    { entitlementYear: 1899 },
    { entitlementYear: 4100 },
    { entitlementYear: 2026.5 },
    { payoutMonth: "2026-00" },
    { payoutMonth: "2026-13" },
    { payoutMonth: "2026-1" },
    { payoutMonth: "1899-12" },
    { payoutMonth: "4100-01" },
    { title: "" },
    { title: " bonus" },
    { title: "bonus\n" },
    { title: "x".repeat(101) },
    { grossCents: -1 },
    { grossCents: 0.5 },
    { grossCents: 1000000001 },
    { grossCents: Infinity },
    { revision: 0 },
    { revision: 1.5 },
    { revision: Number.MAX_SAFE_INTEGER + 1 },
  ])("rejects invalid explicit payment fields %j", (patch) => {
    expect(() => validateActualOwnAnnualPayments([{ ...record, ...patch }])).toThrow(
      UserFacingError,
    );
  });
  it("bounds the record count without changing caller data", () => {
    const input = Array.from({ length: 4097 }, (_, i) => ({ ...record, paymentId: "bonus-" + i }));
    expect(() => validateActualOwnAnnualPayments(input)).toThrow(UserFacingError);
    expect(input).toHaveLength(4097);
    expect(input[4096].paymentId).toBe("bonus-4096");
  });
  it("accepts the upper supported boundaries and an empty collection", () => {
    expect(validateActualOwnAnnualPayments([])).toEqual([]);
    expect(
      validateActualOwnAnnualPayments([
        {
          ...record,
          entitlementYear: 4099,
          payoutMonth: "4099-12",
          grossCents: 1000000000,
          revision: Number.MAX_SAFE_INTEGER,
        },
      ])[0].grossCents,
    ).toBe(1000000000);
  });
});
