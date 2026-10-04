import { describe, expect, it } from "vitest";
import oldRaw from "../../rules/packages/reviewed/tvoed-vka-sue-bt-b/2025-04-01-draft1.json";
import currentRaw from "../../rules/packages/reviewed/tvoed-vka-sue-bt-b/2026-05-01-draft1.json";
import type { RuleTariffPackage } from "../rules/contracts.generated";
import {
  calculateTvoedSueDraftAllowance,
  type TvoedSueDraftAllowanceInput,
} from "./tvoed-sue-draft-allowance";

const input: TvoedSueDraftAllowanceInput = {
  pkg: currentRaw as RuleTariffPackage,
  month: "2026-05",
  groupId: "s8a",
  stepId: "s3",
  contractedWeeklyMinutes: 2340,
  tariffApplicabilityConfirmed: true,
  sueClassificationConfirmed: true,
  standardFullTimeConfirmed: true,
  fullMonthBaseEntitlementConfirmed: true,
  fullMonthSameContractConfirmed: true,
  sectionXxivClassificationConfirmed: true,
  fullMonthAllowanceEntitlementConfirmed: true,
  caseGroup: "UNKNOWN",
  conversionDays: "NONE_CONFIRMED",
};

describe("draft BT-B SuE allowance", () => {
  it("uses catalog amounts for 130 and 180 euro bands in both table periods", () => {
    expect(calculateTvoedSueDraftAllowance(input)).toMatchObject({
      kind: "draft-monthly-allowance",
      completeGross: false,
      fullTimeAllowanceCents: 13000,
      personalAllowanceCents: 13000,
      sourceIds: ["vka-tvoed-sue-bt-b-2025-2026"],
    });
    expect(calculateTvoedSueDraftAllowance({ ...input, groupId: "s11b" })).toMatchObject({
      fullTimeAllowanceCents: 18000,
      personalAllowanceCents: 18000,
    });
    expect(
      calculateTvoedSueDraftAllowance({
        ...input,
        pkg: oldRaw as RuleTariffPackage,
        month: "2026-04",
        groupId: "s14",
      }),
    ).toMatchObject({ fullTimeAllowanceCents: 18000, versionId: "2025-04-01-draft1" });
  });

  it("prorates the allowance exactly once for part time", () => {
    expect(
      calculateTvoedSueDraftAllowance({ ...input, contractedWeeklyMinutes: 1170 }),
    ).toMatchObject({ personalAllowanceCents: 6500 });
  });

  it("requires S15 case group 6 and never infers it", () => {
    expect(calculateTvoedSueDraftAllowance({ ...input, groupId: "s15" })).toEqual({
      kind: "unavailable",
      reason: "CASE_GROUP_UNCONFIRMED",
    });
    expect(
      calculateTvoedSueDraftAllowance({ ...input, groupId: "s15", caseGroup: "OTHER" }),
    ).toMatchObject({ kind: "not-applicable" });
    expect(
      calculateTvoedSueDraftAllowance({ ...input, groupId: "s15", caseGroup: "6" }),
    ).toMatchObject({ fullTimeAllowanceCents: 18000 });
  });

  it("does not invent payment for ineligible groups or unresolved conversion days", () => {
    expect(calculateTvoedSueDraftAllowance({ ...input, groupId: "s18" })).toMatchObject({
      kind: "not-applicable",
    });
    expect(calculateTvoedSueDraftAllowance({ ...input, conversionDays: "TAKEN" })).toEqual({
      kind: "unavailable",
      reason: "CONVERSION_DAYS_UNRESOLVED",
    });
    expect(calculateTvoedSueDraftAllowance({ ...input, conversionDays: "UNKNOWN" })).toEqual({
      kind: "unavailable",
      reason: "CONVERSION_DAYS_UNRESOLVED",
    });
  });

  it("requires confirmed classification and allowance entitlement", () => {
    expect(
      calculateTvoedSueDraftAllowance({ ...input, sectionXxivClassificationConfirmed: false }),
    ).toEqual({ kind: "unavailable", reason: "SECTION_XXIV_UNCONFIRMED" });
    expect(
      calculateTvoedSueDraftAllowance({ ...input, fullMonthAllowanceEntitlementConfirmed: false }),
    ).toEqual({ kind: "unavailable", reason: "ALLOWANCE_ENTITLEMENT_UNCONFIRMED" });
    expect(calculateTvoedSueDraftAllowance({ ...input, month: "2026-04" })).toEqual({
      kind: "unavailable",
      reason: "OUTSIDE_VALIDITY",
    });
  });
});
