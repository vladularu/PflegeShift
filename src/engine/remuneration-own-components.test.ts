import { describe, expect, it } from "vitest";
import type { ActualOwnAnnualPayment } from "@/domain/annual-payment";
import type { OwnRemunerationConfiguration } from "@/domain/own-remuneration";
import { ownRemunerationFixture } from "@/domain/own-remuneration-test-fixtures";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type { TimeRemunerationPosition } from "@/domain/remuneration-result";
import type { SupplementPosition } from "@/domain/remuneration-supplement";
import type { ShiftEntry } from "@/domain/types";
import { createRuleResolver } from "@/rules/rule-resolver";
import { calculateOwnAnnualPayments } from "./remuneration-annual-payment";
import { resolveRemunerationContext } from "./remuneration-context";
import { calculateOwnMonthlyAllowances } from "./remuneration-own-allowances";
import { calculateOwnOvertime } from "./remuneration-own-overtime";
import { calculateOwnShiftDayPremiums } from "./remuneration-own-premiums";
import { remunerationShiftDays } from "./remuneration-shift-days";
import { history, resolver, shift, work } from "./remuneration-test-fixtures";

type TestDraft<T> = T extends readonly (infer Item)[]
  ? TestDraft<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: TestDraft<T[Key]> }
    : T;
function configurationFixture(): TestDraft<OwnRemunerationConfiguration> {
  return structuredClone(ownRemunerationFixture()) as TestDraft<OwnRemunerationConfiguration>;
}

function own(
  configuration = configurationFixture(),
  effectiveFrom = "2026-01-01",
): DatedRemunerationProfile {
  return {
    ...history(effectiveFrom),
    data: { version: 2, weeklyMinutes: 1155, selection: { kind: "own-configured", configuration } },
  };
}
function source(configuration = configurationFixture()) {
  return resolveRemunerationContext("2026-09-15", [own(configuration)]).source;
}
function premiums(
  configuration = configurationFixture(),
  entry: ShiftEntry = shift(),
  rules = resolver(),
) {
  return remunerationShiftDays(entry, work.timeZone).flatMap((day) => {
    const base: TimeRemunerationPosition = {
      id: "premium:" + day.date,
      kind: "time-premium",
      label: "Eigener Zuschlag",
      from: day.date,
      through: day.date,
      fromEpochMinutes: day.fromEpochMinutes,
      untilEpochMinutes: day.untilEpochMinutes,
      shiftId: entry.id,
      amountCents: 0,
      status: day.estimatedPause ? "estimated" : "calculated",
      source: source(configuration),
      issue: null,
      basis: {
        ruleId: null,
        minutes: day.netMinutes,
        hourlyRateCents: null,
        percentageBasisPoints: null,
        pauseMethod: day.estimatedPause ? "centered-duration-estimate" : "none",
      },
    };
    return calculateOwnShiftDayPremiums(base, day, entry, work, configuration, rules);
  });
}
const sum = (positions: readonly { amountCents: number | null }[]) =>
  positions.reduce((total, position) => total + (position.amountCents ?? 0), 0);
function overtime(minutes = 30): SupplementPosition {
  return {
    id: "ot",
    kind: "overtime-base",
    label: "Bestätigte Überstunden",
    from: "2026-09-15",
    through: "2026-09-15",
    amountCents: 0,
    status: "calculated",
    source: source(),
    issue: null,
    basis: {
      ruleId: null,
      shiftId: "shift",
      allowanceType: null,
      rateCents: null,
      personalMonthlyCents: null,
      percentageBasisPoints: null,
      minutes,
      calendarDays: 1,
      monthDays: 30,
      entitlement: null,
      pauseMethod: "none",
      proration: "none",
    },
  };
}
function actual(change: Partial<ActualOwnAnnualPayment> = {}): ActualOwnAnnualPayment {
  return {
    version: 1,
    paymentId: "annual",
    entitlementYear: 2026,
    payoutMonth: "2027-01",
    title: "Bestätigte Zahlung",
    grossCents: 87654,
    revision: 3,
    ...change,
  };
}

describe("own time premium primitives", () => {
  it("uses the confirmed personal percentage basis across midnight", () => {
    const positions = premiums();
    expect(positions.map((p) => p.basis.minutes)).toEqual([60, 60]);
    expect(sum(positions)).toBe(1250);
  });
  it.each([
    ["highest", 1400],
    ["add", 2650],
  ] as const)("applies the explicit %s combination", (combination, expected) => {
    const configuration = configurationFixture();
    configuration.timePremiums = { ...configuration.timePremiums!, combination };
    expect(
      sum(
        premiums(
          configuration,
          shift({ date: "2026-10-04", startTime: "00:00", endTime: "02:00" }),
        ),
      ),
    ).toBe(expected);
  });
  it.each([
    ["2026-03-29", 120, 1400],
    ["2026-10-25", 240, 2800],
  ] as const)("uses elapsed DST minutes on %s", (date, minutes, expected) => {
    const positions = premiums(
      configurationFixture(),
      shift({ date, startTime: "01:00", endTime: "04:00" }),
    );
    expect(positions.reduce((n, p) => n + p.basis.minutes, 0)).toBe(minutes);
    expect(sum(positions)).toBe(expected);
  });
  it("places one duration-only pause and keeps its estimate visible", () => {
    const positions = premiums(configurationFixture(), shift({ breakMinutes: 30 }));
    expect(positions.map((p) => p.basis.minutes)).toEqual([45, 45]);
    expect(sum(positions)).toBe(938);
    expect(
      positions.every(
        (p) => p.status === "estimated" && p.basis.pauseMethod === "centered-duration-estimate",
      ),
    ).toBe(true);
  });
  it("does not replace a missing positive percentage basis with zero", () => {
    const configuration = configurationFixture();
    configuration.percentageBasisHourlyCents = null;
    expect(
      premiums(configuration).every(
        (p) => p.amountCents === null && p.issue?.code === "PREMIUM_RATE_MISSING",
      ),
    ).toBe(true);
  });
  it("allows an explicitly configured zero percentage without a basis", () => {
    const configuration = configurationFixture();
    configuration.percentageBasisHourlyCents = null;
    configuration.timePremiums!.rules[0].rate = { kind: "percent", basisPoints: 0 };
    expect(premiums(configuration).every((p) => p.amountCents === 0 && p.issue === null)).toBe(
      true,
    );
  });
  it("rounds after multiplying by minutes", () => {
    const configuration = configurationFixture();
    configuration.percentageBasisHourlyCents = 1;
    configuration.timePremiums!.rules[0].rate = { kind: "percent", basisPoints: 5000 };
    expect(sum(premiums(configuration, shift({ startTime: "22:00", endTime: "22:45" })))).toBe(0);
  });
  it("honors explicitly disabled time premiums", () => {
    const configuration = configurationFixture();
    configuration.timePremiums = null;
    expect(premiums(configuration).every((p) => p.amountCents === 0 && p.issue === null)).toBe(
      true,
    );
  });
  it("keeps an unknown holiday candidate unavailable in highest mode", () => {
    const configuration = configurationFixture();
    configuration.timePremiums!.rules.push({
      id: "holiday",
      type: "holiday",
      window: null,
      rate: { kind: "hourly", centsPerHour: 1000 },
    });
    const missing = createRuleResolver({ tariff: [], legal: [], holiday: [] });
    expect(
      premiums(configuration, shift(), missing).some(
        (p) => p.amountCents === null && p.issue?.code === "HOLIDAY_RULES_UNAVAILABLE",
      ),
    ).toBe(true);
  });
});

describe("own overtime primitives", () => {
  it("adds a monthly personal base and the configured premium once", () => {
    const positions = calculateOwnOvertime(overtime(), configurationFixture());
    expect(positions.map((p) => p.amountCents)).toEqual([1250, 375]);
    expect(sum(positions)).toBe(1625);
  });
  it("prevents a second hourly base payment", () => {
    const configuration = configurationFixture();
    configuration.base = { kind: "hourly", centsPerHour: 1000 };
    expect(calculateOwnOvertime(overtime(), configuration)[0]).toMatchObject({
      amountCents: null,
      issue: { code: "OWN_OVERTIME_UNCONFIGURED" },
    });
    configuration.overtime!.basePayIncluded = true;
    expect(calculateOwnOvertime(overtime(), configuration).map((p) => p.amountCents)).toEqual([
      0, 150,
    ]);
  });
  it("uses a fixed hourly premium without a percentage basis", () => {
    const configuration = configurationFixture();
    configuration.percentageBasisHourlyCents = null;
    configuration.overtime = {
      basePayIncluded: true,
      premium: { kind: "hourly", centsPerHour: 700 },
    };
    expect(calculateOwnOvertime(overtime(), configuration).map((p) => p.amountCents)).toEqual([
      0, 350,
    ]);
  });
  it("keeps unconfigured overtime unavailable", () => {
    const configuration = configurationFixture();
    configuration.overtime = null;
    expect(calculateOwnOvertime(overtime(), configuration)[0]).toMatchObject({
      amountCents: null,
      issue: { code: "OWN_OVERTIME_UNCONFIGURED" },
    });
  });
  it("preserves explicitly zero percent with included base", () => {
    const configuration = configurationFixture();
    configuration.percentageBasisHourlyCents = null;
    configuration.overtime = {
      basePayIncluded: true,
      premium: { kind: "percent", basisPoints: 0 },
    };
    expect(calculateOwnOvertime(overtime(), configuration).map((p) => p.amountCents)).toEqual([
      0, 0,
    ]);
  });
});

describe("own fixed allowance primitives", () => {
  it("uses the personal full-month amount without another part-time factor", () => {
    expect(
      calculateOwnMonthlyAllowances("2026-10", [own()], resolver()).map((p) => p.amountCents),
    ).toEqual([8000]);
  });
  it("does not pay outside the explicit validity period", () => {
    expect(calculateOwnMonthlyAllowances("2026-09", [own()], resolver())).toEqual([]);
    expect(calculateOwnMonthlyAllowances("2027-10", [own()], resolver())).toEqual([]);
  });
  it("applies confirmed calendar-day proration", () => {
    const configuration = configurationFixture();
    configuration.fixedAllowances[0].validFrom = "2026-10-16";
    expect(
      calculateOwnMonthlyAllowances("2026-10", [own(configuration)], resolver())[0],
    ).toMatchObject({
      amountCents: 4129,
      basis: { calendarDays: 16, monthDays: 31, proration: "calendar-days" },
    });
  });
  it("keeps an unconfirmed partial month unavailable", () => {
    const configuration = configurationFixture();
    configuration.fixedAllowances[0].validFrom = "2026-10-16";
    configuration.fixedAllowances[0].partialMonth = "unconfirmed";
    expect(
      calculateOwnMonthlyAllowances("2026-10", [own(configuration)], resolver())[0],
    ).toMatchObject({ amountCents: null, issue: { code: "OWN_PRORATION_UNCONFIRMED" } });
  });
});

describe("own annual payment primitives", () => {
  it("estimates only from confirmed basis and entitlement months", () => {
    expect(calculateOwnAnnualPayments("2026-11", [own()])).toMatchObject({
      totalCents: 75000,
      status: "estimated",
      complete: true,
    });
  });
  it.each(["months", "basis"] as const)("keeps missing %s unavailable", (missing) => {
    const configuration = configurationFixture();
    if (missing === "months") configuration.specialPayments[0].entitlementMonths = null;
    else
      configuration.specialPayments[0].amount = {
        kind: "percent",
        basisPoints: 7500,
        confirmedBasisCents: null,
      };
    expect(calculateOwnAnnualPayments("2026-11", [own(configuration)])).toMatchObject({
      totalCents: null,
      knownSubtotalCents: 0,
      complete: false,
      status: "unavailable",
    });
  });
  it("preserves zero confirmed entitlement months", () => {
    const configuration = configurationFixture();
    configuration.specialPayments[0].entitlementMonths = 0;
    expect(calculateOwnAnnualPayments("2026-11", [own(configuration)])).toMatchObject({
      totalCents: 0,
      status: "estimated",
    });
  });
  it("rounds a half cent up after entitlement proration", () => {
    const configuration = configurationFixture();
    configuration.specialPayments[0].amount = { kind: "fixed", cents: 1 };
    expect(calculateOwnAnnualPayments("2026-11", [own(configuration)]).totalCents).toBe(1);
  });
  it("replaces the projection by the actual payment even in a later year", () => {
    expect(calculateOwnAnnualPayments("2026-11", [own()], [actual()]).positions).toEqual([]);
    const result = calculateOwnAnnualPayments("2027-01", [own()], [actual()]);
    expect(result).toMatchObject({ totalCents: 87654, status: "calculated" });
    expect(result.positions[0].basis).toMatchObject({
      entitlementYear: 2026,
      method: "actual",
      actualRevision: 3,
    });
  });
  it("preserves a confirmed actual zero payment", () => {
    expect(
      calculateOwnAnnualPayments("2027-01", [own()], [actual({ grossCents: 0 })]),
    ).toMatchObject({ totalCents: 0, status: "calculated", complete: true });
  });
  it("rejects contradictory terms within the payout month", () => {
    const changed = configurationFixture();
    changed.specialPayments[0].amount = { kind: "fixed", cents: 100000 };
    const result = calculateOwnAnnualPayments("2026-11", [own(), own(changed, "2026-11-16")]);
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0]).toMatchObject({
      amountCents: null,
      issue: { code: "ANNUAL_TERMS_AMBIGUOUS" },
    });
  });
  it("rejects duplicate actual claims", () => {
    expect(() =>
      calculateOwnAnnualPayments("2027-01", [own()], [actual(), actual({ revision: 4 })]),
    ).toThrow();
  });
});
