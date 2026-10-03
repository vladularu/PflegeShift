import { describe, expect, it } from "vitest";
import { OwnRemunerationError, validateOwnRemuneration } from "./own-remuneration";
import { ownRemunerationFixture } from "./own-remuneration-test-fixtures";

const full = ownRemunerationFixture();
const night = full.timePremiums!.rules[0];
const allowance = full.fixedAllowances[0];
const annual = full.specialPayments[0];
const withNight = (patch: Record<string, unknown>) => ({
  ...full,
  timePremiums: {
    ...full.timePremiums,
    rules: [{ ...night, ...patch }],
  },
});

function expectDeepFrozen(value: unknown) {
  if (typeof value !== "object" || value === null) return;
  expect(Object.isFrozen(value)).toBe(true);
  Object.values(value).forEach(expectDeepFrozen);
}

describe("own remuneration input contract", () => {
  it("preserves every explicit component without applying any tariff formula", () => {
    const input = ownRemunerationFixture();
    const parsed = validateOwnRemuneration(input);
    expect(parsed).toEqual(input);
    expect(parsed).not.toBe(input);
    expectDeepFrozen(parsed);
    expect(Object.isFrozen(input)).toBe(false);
    expect(parsed.base).toMatchObject({ personalCents: 200000 });
  });
  it("supports hourly pay and explicit disabled components", () => {
    const input = {
      base: { kind: "hourly", centsPerHour: 2300 },
      percentageBasisHourlyCents: null,
      timePremiums: null,
      overtime: null,
      fixedAllowances: [],
      specialPayments: [],
    };
    expect(validateOwnRemuneration(input)).toEqual(input);
  });
  it("preserves unknown bases and entitlements rather than replacing them with zero", () => {
    const input = {
      ...full,
      percentageBasisHourlyCents: null,
      specialPayments: [
        {
          ...annual,
          entitlementMonths: null,
          amount: { kind: "percent", basisPoints: 8000, confirmedBasisCents: null },
        },
      ],
    };
    expect(validateOwnRemuneration(input)).toEqual(input);
  });
  it.each(["add", "highest"])("requires the explicit premium combination %s", (combination) => {
    expect(
      validateOwnRemuneration({ ...full, timePremiums: { ...full.timePremiums, combination } })
        .timePremiums?.combination,
    ).toBe(combination);
  });
  it("allows zero as an explicitly known supplement and valid overnight or leap-day boundaries", () => {
    const input = {
      ...full,
      overtime: { basePayIncluded: true, premium: null },
      fixedAllowances: [
        { ...allowance, monthlyCents: 0, validFrom: "2024-02-29", validTo: "2024-02-29" },
      ],
      specialPayments: [{ ...annual, entitlementMonths: 0, amount: { kind: "fixed", cents: 0 } }],
    };
    expect(validateOwnRemuneration(input)).toEqual(input);
  });
  it.each([
    null,
    [],
    {},
    { ...full, extra: "not-declared" },
    { ...full, base: { kind: "tariff", packageId: "tvoed-vka-bt-k" } },
    { ...full, base: { ...full.base, centsPerHour: 2300 } },
    { ...full, base: { kind: "monthly", personalCents: 1.2, partialMonth: "calendar-days" } },
    { ...full, base: { kind: "monthly", personalCents: 0, partialMonth: "calendar-days" } },
    { ...full, base: { kind: "monthly", personalCents: 10000001, partialMonth: "calendar-days" } },
    { ...full, base: { kind: "monthly", personalCents: 200000, partialMonth: "tvoed" } },
    { ...full, base: { kind: "hourly", centsPerHour: 2500 } },
    { ...full, base: { kind: "hourly", centsPerHour: 0 }, percentageBasisHourlyCents: null },
    { ...full, percentageBasisHourlyCents: 0 },
    { ...full, percentageBasisHourlyCents: undefined },
    { ...full, percentageBasisHourlyCents: NaN },
    { ...full, percentageBasisHourlyCents: Number.MAX_SAFE_INTEGER + 1 },
    { ...full, timePremiums: { rules: [night] } },
    { ...full, timePremiums: { combination: "priority", rules: [night] } },
    { ...full, timePremiums: { combination: "add", rules: [] } },
    { ...full, timePremiums: { combination: "add", rules: [night, night] } },
    {
      ...full,
      timePremiums: {
        combination: "add",
        rules: Array.from({ length: 33 }, (_, i) => ({ ...night, id: "rule-" + i })),
      },
    },
    withNight({ id: "../night" }),
    withNight({ type: "overtime" }),
    withNight({ window: null }),
    withNight({ window: { startMinute: 0, endMinute: 0 } }),
    withNight({ window: { startMinute: -1, endMinute: 60 } }),
    withNight({ window: { startMinute: 60, endMinute: 1440 } }),
    withNight({ window: { startMinute: 60.5, endMinute: 120 } }),
    withNight({ rate: { kind: "percent", basisPoints: -1 } }),
    withNight({ rate: { kind: "percent", basisPoints: 100001 } }),
    withNight({ rate: { kind: "percent", basisPoints: 2500, centsPerHour: 700 } }),
    withNight({ rate: { kind: "hourly", centsPerHour: Infinity } }),
    { ...full, overtime: { basePayIncluded: "yes", premium: null } },
    { ...full, overtime: { basePayIncluded: false, premium: null, automaticBalance: true } },
    { ...full, fixedAllowances: [allowance, allowance] },
    { ...full, fixedAllowances: [{ ...allowance, title: " " }] },
    { ...full, fixedAllowances: [{ ...allowance, title: "Line\nBreak" }] },
    { ...full, fixedAllowances: [{ ...allowance, title: "x".repeat(101) }] },
    { ...full, fixedAllowances: [{ ...allowance, validFrom: "2026-02-29" }] },
    { ...full, fixedAllowances: [{ ...allowance, validTo: "2026-09-30" }] },
    { ...full, fixedAllowances: [{ ...allowance, validFrom: "1899-12-31" }] },
    { ...full, fixedAllowances: [{ ...allowance, monthlyCents: -1 }] },
    { ...full, specialPayments: [annual, annual] },
    { ...full, specialPayments: [{ ...annual, payoutMonth: 0 }] },
    { ...full, specialPayments: [{ ...annual, payoutMonth: 13 }] },
    { ...full, specialPayments: [{ ...annual, entitlementMonths: 12.5 }] },
    { ...full, specialPayments: [{ ...annual, amount: { kind: "percent", basisPoints: 8000 } }] },
    {
      ...full,
      specialPayments: [
        { ...annual, amount: { kind: "percent", basisPoints: 8000, confirmedBasisCents: -1 } },
      ],
    },
    { ...full, specialPayments: [{ ...annual, actualPaidCents: 150000 }] },
  ])("rejects malformed or implicit inputs %#", (input) => {
    expect(() => validateOwnRemuneration(input)).toThrow(OwnRemunerationError);
  });
});
