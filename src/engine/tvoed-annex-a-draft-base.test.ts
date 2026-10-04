import { describe, expect, it } from "vitest";
import oldCandidate from "../../rules/packages/reviewed/tvoed-vka-anlage-a/2025-04-01-draft1.json";
import currentCandidate from "../../rules/packages/reviewed/tvoed-vka-anlage-a/2026-05-01-draft1.json";
import type { RuleTariffPackage } from "../rules/contracts.generated";
import {
  calculateTvoedAnnexADraftBase,
  type TvoedAnnexADraftBaseInput,
} from "./tvoed-annex-a-draft-base";

const base: TvoedAnnexADraftBaseInput = {
  pkg: currentCandidate as RuleTariffPackage,
  date: "2026-05-01",
  variantId: "BT_K",
  groupId: "eg9a",
  stepId: "s3",
  contractedWeeklyMinutes: 1155,
  comparableFullTimeWeeklyMinutes: 2310,
  applicabilityConfirmed: true,
  comparableFullTimeConfirmed: true,
  fullMonthBaseEntitlementConfirmed: true,
  fullMonthSameContractConfirmed: true,
};

describe("TVöD-VKA Anlage A isolated table base", () => {
  it("uses the dated official EG table, exact part-time ratio and both explicit special parts", () => {
    expect(calculateTvoedAnnexADraftBase(base)).toMatchObject({
      kind: "draft-table-base",
      completeGross: false,
      fullTimeTableCents: 409767,
      personalTableBaseCents: 204884,
      variantId: "BT_K",
    });
    expect(
      calculateTvoedAnnexADraftBase({ ...base, variantId: "BT_B", contractedWeeklyMinutes: 2310 }),
    ).toMatchObject({
      kind: "draft-table-base",
      personalTableBaseCents: 409767,
      variantId: "BT_B",
    });
    expect(
      calculateTvoedAnnexADraftBase({
        ...base,
        pkg: oldCandidate as RuleTariffPackage,
        date: "2026-04-30",
      }),
    ).toMatchObject({
      kind: "draft-table-base",
      fullTimeTableCents: 398606,
      personalTableBaseCents: 199303,
    });
  });

  it("does not invent EG 1 stage 1 or extend the known table beyond its coverage", () => {
    expect(calculateTvoedAnnexADraftBase({ ...base, groupId: "eg1", stepId: "s1" })).toEqual({
      kind: "unavailable",
      reason: "MISSING_TABLE_VALUE",
    });
    expect(calculateTvoedAnnexADraftBase({ ...base, date: "2027-04-01" })).toEqual({
      kind: "unavailable",
      reason: "OUTSIDE_VALIDITY",
    });
  });

  it.each([
    [{ applicabilityConfirmed: false }, "TARIFF_APPLICABILITY_UNCONFIRMED"],
    [{ comparableFullTimeConfirmed: false }, "FULL_TIME_REFERENCE_UNCONFIRMED"],
    [{ fullMonthBaseEntitlementConfirmed: false }, "MONTH_ENTITLEMENT_UNCONFIRMED"],
    [{ fullMonthSameContractConfirmed: false }, "MONTH_ENTITLEMENT_UNCONFIRMED"],
    [{ contractedWeeklyMinutes: 2521 }, "INVALID_WEEKLY_TIME"],
    [{ date: "2026-02-30" }, "INVALID_DATE"],
  ] as const)("fails closed when material inputs are missing or invalid", (change, reason) => {
    expect(calculateTvoedAnnexADraftBase({ ...base, ...change })).toEqual({
      kind: "unavailable",
      reason,
    });
  });
});
