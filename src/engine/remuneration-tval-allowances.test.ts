import { readFileSync } from "node:fs";
import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type { DatedAllowanceEntitlement } from "@/domain/remuneration-supplement";
import type { AllowanceStatus } from "@/domain/types";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { history, resolver } from "./remuneration-test-fixtures";
import { resolveRemunerationContext } from "./remuneration-context";
import {
  calculateTvalShiftAllowances,
  type TvalAllowanceDay,
  type TvalEmployerScope,
} from "./remuneration-tval-allowances";

const packages: RuleTariffPackage[] = ["2025-11", "2026-04", "2027-01", "2027-03", "2028-01"].map(
  (v) =>
    JSON.parse(
      readFileSync(
        new URL(`../../rules/packages/reviewed/tval-pflege-tdl/${v}.json`, import.meta.url),
        "utf8",
      ),
    ),
);
const catalog = resolver(packages);
function days(
  month = "2026-07",
  status: AllowanceStatus = "ALTERNATING_MONTHLY",
  scope: TvalEmployerScope | null = "SECTION_43",
  weeklyMinutes = 2310,
): TvalAllowanceDay[] {
  const first = Temporal.PlainDate.from(month + "-01");
  const profile: DatedRemunerationProfile = {
    ...history("2025-11-01"),
    data: {
      version: 1,
      weeklyMinutes,
      selection: {
        kind: "tariff",
        packageId: "tval-pflege-tdl",
        variant: "CARE",
        region: "WEST_38_5",
        group: "regular",
        level: "1",
        fullTimeWeeklyMinutes: 2310,
      },
    },
  };
  const entitlement: DatedAllowanceEntitlement = {
    from: first.toString(),
    through: first.with({ day: first.daysInMonth }).toString(),
    status,
    origin: "confirmed",
    revision: 1,
  };
  return Array.from({ length: first.daysInMonth }, (_, i) => {
    const date = first.add({ days: i }).toString();
    const context = resolveRemunerationContext(date, [profile], catalog);
    if (context.kind !== "tval-training") throw new Error("Expected TVA-L fixture.");
    return {
      date,
      context,
      employerScope: scope,
      entitlement,
      workedMinutes: i === 0 ? 480 : 0,
      estimatedPause: false,
    };
  });
}
describe("TVA-L three-quarter shift allowances", () => {
  it.each([
    ["2026-06", "GENERAL", "SHIFT_MONTHLY", 3000],
    ["2026-06", "GENERAL", "ALTERNATING_MONTHLY", 7875],
    ["2026-06", "SECTION_43", "SHIFT_MONTHLY", 4500],
    ["2026-06", "SECTION_43", "ALTERNATING_MONTHLY", 11250],
    ["2026-07", "GENERAL", "SHIFT_MONTHLY", 7500],
    ["2026-07", "GENERAL", "ALTERNATING_MONTHLY", 15000],
    ["2026-07", "SECTION_43", "SHIFT_MONTHLY", 7500],
    ["2026-07", "SECTION_43", "ALTERNATING_MONTHLY", 18750],
  ] as const)("%s %s %s = %i cents", (month, scope, status, amount) => {
    const result = calculateTvalShiftAllowances(days(month, status, scope));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      amountCents: amount,
      status: "estimated",
      issue: null,
      basis: { percentageBasisPoints: 7500, personalMonthlyCents: amount, proration: "none" },
    });
    expect(result[0]!.source.packageId).toBe("tval-pflege-tdl");
  });
  it.each([
    ["2025-11", 11250],
    ["2026-04", 11250],
    ["2027-01", 18750],
    ["2027-03", 18750],
    ["2028-01", 18750],
  ] as const)("uses the selected dated package in %s", (month, expected) => {
    expect(calculateTvalShiftAllowances(days(month))[0]!.amountCents).toBe(expected);
  });
  it("applies part-time only once, then prorates a partial month once", () => {
    const half = days("2026-09", "ALTERNATING_MONTHLY", "SECTION_43", 1155);
    expect(calculateTvalShiftAllowances(half)[0]!.amountCents).toBe(9375);
    expect(calculateTvalShiftAllowances(half.slice(15))[0]!.amountCents).toBe(4688);
  });
  it.each([
    ["2026-06", "GENERAL", "SHIFT_HOURLY", 144],
    ["2026-06", "SECTION_43", "ALTERNATING_HOURLY", 376],
    ["2026-07", "GENERAL", "SHIFT_HOURLY", 360],
    ["2026-07", "GENERAL", "ALTERNATING_HOURLY", 712],
    ["2026-07", "SECTION_43", "ALTERNATING_HOURLY", 896],
  ] as const)(
    "rounds the individual hourly rate and never part-time-cuts worked hours: %s %s %s",
    (month, scope, status, expected) => {
      for (const weekly of [2310, 1155]) {
        const result = calculateTvalShiftAllowances(days(month, status, scope, weekly));
        expect(result[0]).toMatchObject({
          amountCents: expected,
          basis: { minutes: 480, personalMonthlyCents: null },
        });
      }
    },
  );
  it("does not infer employer scope, confirmed rights, or fill a missing policy", () => {
    expect(
      calculateTvalShiftAllowances(days("2026-07", "ALTERNATING_MONTHLY", null))[0],
    ).toMatchObject({ amountCents: null, issue: { code: "ALLOWANCE_DECISION_MISSING" } });
    for (const origin of [null, "estimated"] as const) {
      const input = days().map((d) => ({
        ...d,
        entitlement: origin === null ? null : { ...d.entitlement!, origin },
      }));
      expect(calculateTvalShiftAllowances(input)[0]!.amountCents).toBeNull();
    }
    const input = days().slice(0, 1);
    const pkg = structuredClone(input[0]!.context.rulePackage);
    delete pkg.rules.tvalShiftAllowancePolicy;
    expect(
      calculateTvalShiftAllowances([
        { ...input[0]!, context: { ...input[0]!.context, rulePackage: pkg } },
      ])[0],
    ).toMatchObject({ amountCents: null, issue: { code: "ALLOWANCE_RULE_MISSING" } });
  });
  it("a confirmed absence of entitlement is zero, not an unknown or a second allowance", () => {
    const result = calculateTvalShiftAllowances(days("2026-07", "NONE", null));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ amountCents: 0, status: "calculated", issue: null });
  });
  it("does not merge employer changes and rejects duplicate days or invalid hours", () => {
    const input = days("2026-09");
    const result = calculateTvalShiftAllowances(
      input.map((d, i) => ({ ...d, employerScope: i < 15 ? "SECTION_43" : "GENERAL" })),
    );
    expect(result.map((p) => p.amountCents)).toEqual([9375, 7500]);
    expect(() => calculateTvalShiftAllowances([input[0]!, input[0]!])).toThrow();
    expect(() => calculateTvalShiftAllowances([{ ...input[0]!, workedMinutes: -1 }])).toThrow();
  });
  it("cannot turn an out-of-range confirmation or package into a known payment", () => {
    const input = days().slice(0, 1);
    expect(
      calculateTvalShiftAllowances([
        { ...input[0]!, entitlement: { ...input[0]!.entitlement!, from: "2026-08-01" } },
      ])[0]!.amountCents,
    ).toBeNull();
    expect(
      calculateTvalShiftAllowances([{ ...input[0]!, date: "2027-07-01" }])[0]!.amountCents,
    ).toBeNull();
  });
});
