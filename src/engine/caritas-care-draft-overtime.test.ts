import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  calculateCaritasCareDraftOvertime,
  type CaritasDraftOvertimeInput,
} from "./caritas-care-draft-overtime";

const pkg = JSON.parse(
  readFileSync(
    new URL(
      "../../rules/packages/reviewed/avr-caritas-p-mitte/2026-02-01-draft1.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as RuleTariffPackage;

function input(overrides: Partial<CaritasDraftOvertimeInput> = {}): CaritasDraftOvertimeInput {
  return {
    pkg,
    date: "2026-02-10",
    variantId: "ANLAGE_31",
    regionId: "MITTE",
    groupId: "p7",
    stepId: "5",
    minutes: 120,
    classification: "CONFIRMED_AVR_OVERTIME",
    workSettlement: "CASH",
    premiumSettlement: "CASH",
    ...overrides,
  };
}

describe("Caritas source-backed draft overtime", () => {
  it("uses step 4 for work pay and step 3 for the P7 premium", () => {
    const result = calculateCaritasCareDraftOvertime(input());
    expect(result).toMatchObject({
      kind: "draft-confirmed-overtime",
      status: "estimated",
      cashSubtotalCents: 6026,
      sourceIds: expect.arrayContaining(["caritas-avr-text-2026-03"]),
      positions: [
        {
          component: "WORK_HOURS",
          referenceHourlyCents: 2358,
          percentageBasisPoints: 10000,
          nominalAmountCents: 4716,
          cashAmountCents: 4716,
        },
        {
          component: "OVERTIME_PREMIUM",
          referenceHourlyCents: 2183,
          percentageBasisPoints: 3000,
          nominalAmountCents: 1310,
          cashAmountCents: 1310,
        },
      ],
    });
  });

  it("uses the P12 15 percent band and keeps time settlement out of cash", () => {
    const result = calculateCaritasCareDraftOvertime(
      input({ groupId: "p12", stepId: "6", workSettlement: "TIME", premiumSettlement: "CASH" }),
    );
    expect(result.kind).toBe("draft-confirmed-overtime");
    if (result.kind !== "draft-confirmed-overtime") return;
    expect(result.positions[0]).toMatchObject({
      settlement: "TIME",
      referenceHourlyCents: 3047,
      nominalAmountCents: 6094,
      cashAmountCents: 0,
    });
    expect(result.positions[1]).toMatchObject({
      settlement: "CASH",
      referenceHourlyCents: 2832,
      percentageBasisPoints: 1500,
      nominalAmountCents: 850,
    });
    expect(result.cashSubtotalCents).toBe(850);
  });

  it("never derives payable overtime from an unconfirmed classification or settlement", () => {
    expect(calculateCaritasCareDraftOvertime(input({ classification: "UNKNOWN" }))).toEqual({
      kind: "unavailable",
      reason: "CLASSIFICATION_UNCONFIRMED",
    });
    expect(calculateCaritasCareDraftOvertime(input({ classification: "NOT_OVERTIME" }))).toEqual({
      kind: "unavailable",
      reason: "NOT_OVERTIME",
    });
    expect(calculateCaritasCareDraftOvertime(input({ premiumSettlement: "UNKNOWN" }))).toEqual({
      kind: "unavailable",
      reason: "SETTLEMENT_UNCONFIRMED",
    });
  });

  it("fails closed on invalid dates, minutes, and personal table steps", () => {
    expect(calculateCaritasCareDraftOvertime(input({ date: "2027-01-01" }))).toEqual({
      kind: "unavailable",
      reason: "OUTSIDE_VALIDITY",
    });
    expect(calculateCaritasCareDraftOvertime(input({ minutes: 0 }))).toEqual({
      kind: "unavailable",
      reason: "INVALID_MINUTES",
    });
    expect(calculateCaritasCareDraftOvertime(input({ stepId: "1" }))).toEqual({
      kind: "unavailable",
      reason: "MISSING_TABLE_VALUE",
    });
  });
});
