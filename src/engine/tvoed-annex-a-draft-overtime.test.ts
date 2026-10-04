import { describe, expect, it } from "vitest";
import oldCandidate from "../../rules/packages/reviewed/tvoed-vka-anlage-a/2025-04-01-draft1.json";
import currentCandidate from "../../rules/packages/reviewed/tvoed-vka-anlage-a/2026-05-01-draft1.json";
import type { RuleTariffPackage } from "../rules/contracts.generated";
import {
  calculateTvoedAnnexADraftOvertime,
  type TvoedAnnexADraftOvertimeInput,
} from "./tvoed-annex-a-draft-overtime";

function input(
  overrides: Partial<TvoedAnnexADraftOvertimeInput> = {},
): TvoedAnnexADraftOvertimeInput {
  return {
    pkg: currentCandidate as RuleTariffPackage,
    date: "2026-09-10",
    variantId: "BT_K",
    groupId: "eg9b",
    stepId: "s5",
    fullTimeWeeklyMinutes: 2340,
    fullTimeReferenceConfirmed: true,
    applicabilityConfirmed: true,
    minutes: 120,
    classification: "CONFIRMED_TVOED_OVERTIME",
    workPayNotAlreadyIncludedConfirmed: true,
    workSettlement: "CASH",
    premiumSettlement: "CASH",
    ...overrides,
  };
}

describe("TVöD Anlage A draft overtime", () => {
  it.each(["BT_K", "BT_B"] as const)(
    "uses EG9b stage 4 for work and stage 3 for its 30% premium in %s",
    (variantId) => {
      expect(calculateTvoedAnnexADraftOvertime(input({ variantId }))).toMatchObject({
        kind: "draft-confirmed-overtime",
        status: "estimated",
        completeGross: false,
        payoutMonth: null,
        cashSubtotalCents: 7019,
        positions: [
          {
            component: "WORK_HOURS",
            referenceHourlyCents: 2766,
            percentageBasisPoints: 10000,
            nominalAmountCents: 5532,
            cashAmountCents: 5532,
          },
          {
            component: "OVERTIME_PREMIUM",
            referenceHourlyCents: 2479,
            percentageBasisPoints: 3000,
            nominalAmountCents: 1487,
            cashAmountCents: 1487,
          },
        ],
      });
    },
  );

  it("uses 15% from EG9c and keeps compensated work hours out of cash", () => {
    expect(
      calculateTvoedAnnexADraftOvertime(
        input({
          groupId: "eg9c",
          stepId: "s6",
          workSettlement: "TIME",
        }),
      ),
    ).toMatchObject({
      kind: "draft-confirmed-overtime",
      cashSubtotalCents: 813,
      positions: [
        {
          component: "WORK_HOURS",
          settlement: "TIME",
          referenceHourlyCents: 2903,
          nominalAmountCents: 5806,
          cashAmountCents: 0,
        },
        {
          component: "OVERTIME_PREMIUM",
          settlement: "CASH",
          referenceHourlyCents: 2710,
          percentageBasisPoints: 1500,
          nominalAmountCents: 813,
          cashAmountCents: 813,
        },
      ],
    });
  });

  it("never invents a cash payment month or adds it to the work month", () => {
    const result = calculateTvoedAnnexADraftOvertime(
      input({
        workSettlement: "TIME",
        premiumSettlement: "TIME",
      }),
    );
    expect(result).toMatchObject({
      kind: "draft-confirmed-overtime",
      payoutMonth: null,
      cashSubtotalCents: 0,
      positions: [
        { settlement: "TIME", nominalAmountCents: 5532, cashAmountCents: 0 },
        { settlement: "TIME", nominalAmountCents: 1487, cashAmountCents: 0 },
      ],
    });
  });

  it("keeps the historical table and version distinct", () => {
    const result = calculateTvoedAnnexADraftOvertime(
      input({
        pkg: oldCandidate as RuleTariffPackage,
        date: "2025-09-10",
      }),
    );
    expect(result.kind).toBe("draft-confirmed-overtime");
    if (result.kind === "draft-confirmed-overtime") {
      expect(result.versionId).toBe("2025-04-01-draft1");
      expect(result.positions[0].referenceHourlyCents).not.toBe(2766);
    }
  });

  it.each([
    [{ classification: "UNKNOWN" }, "CLASSIFICATION_UNCONFIRMED"],
    [{ classification: "NOT_OVERTIME" }, "NOT_OVERTIME"],
    [{ workPayNotAlreadyIncludedConfirmed: false }, "WORK_PAY_DUPLICATION_UNCONFIRMED"],
    [{ workSettlement: "UNKNOWN" }, "SETTLEMENT_UNCONFIRMED"],
    [{ premiumSettlement: "UNKNOWN" }, "SETTLEMENT_UNCONFIRMED"],
    [{ applicabilityConfirmed: false }, "TARIFF_APPLICABILITY_UNCONFIRMED"],
    [{ fullTimeWeeklyMinutes: 2520 }, "FULL_TIME_REFERENCE_UNSUPPORTED"],
    [{ minutes: 0 }, "INVALID_MINUTES"],
    [{ date: "2026-04-30" }, "OUTSIDE_VALIDITY"],
    [{ groupId: "p9" }, "UNKNOWN_SELECTION"],
    [{ groupId: "eg1", stepId: "s1" }, "UNKNOWN_SELECTION"],
  ] as const)("fails closed for %j", (overrides, reason) => {
    expect(calculateTvoedAnnexADraftOvertime(input(overrides))).toEqual({
      kind: "unavailable",
      reason,
    });
  });

  it("rejects a tampered rate even when a valid table still exists", () => {
    const pkg = structuredClone(currentCandidate) as RuleTariffPackage;
    pkg.rules.tvoedAnnexAOvertimePolicy!.rateBands[0].premiumBasisPoints = 1500;
    expect(calculateTvoedAnnexADraftOvertime(input({ pkg }))).toEqual({
      kind: "unavailable",
      reason: "INVALID_PACKAGE",
    });
  });
});
