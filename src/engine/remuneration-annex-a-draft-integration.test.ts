import { describe, expect, it } from "vitest";
import candidate from "../../rules/packages/reviewed/tvoed-vka-anlage-a/2026-05-01-draft1.json";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type { SavedTvoedAnnexAMonthConfirmation } from "@/domain/saved-tvoed-annex-a-month-confirmation";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { BUNDLED_HOLIDAY_RULES, BUNDLED_LEGAL_RULES } from "@/rules/bundled-rules";
import { createRuleResolver } from "@/rules/rule-resolver";
import { calculateMonthlyBaseRemuneration } from "./remuneration-base";
import { resolveRemunerationContext } from "./remuneration-context";
import {
  calculateAssessedMonthlyRemuneration,
  calculateDatedMonthlyRemuneration,
} from "./remuneration-month";
import { shift, work } from "./remuneration-test-fixtures";

const resolver = createRuleResolver({
  tariff: [candidate as RuleTariffPackage],
  legal: BUNDLED_LEGAL_RULES,
  holiday: BUNDLED_HOLIDAY_RULES,
});
const profile: DatedRemunerationProfile = {
  effectiveFrom: "2026-05-01",
  revision: 1,
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
  data: {
    version: 1,
    weeklyMinutes: 1155,
    selection: {
      kind: "tariff",
      packageId: "tvoed-vka-anlage-a",
      variant: "BT_K",
      region: "VKA",
      group: "EG9A",
      level: "3",
      fullTimeWeeklyMinutes: 2310,
    },
  },
};
const confirmation = {
  month: "2026-05",
  applicabilityConfirmed: true,
  comparableFullTimeConfirmed: true,
  fullMonthBaseEntitlementConfirmed: true,
  fullMonthSameContractConfirmed: true,
} as const;
const savedConfirmation: SavedTvoedAnnexAMonthConfirmation = {
  ...confirmation,
  profileEffectiveFrom: "2026-05-01",
  profileRevision: 1,
  packageId: "tvoed-vka-anlage-a",
  ruleVersionId: candidate.versionId,
  variantId: "BT_K",
  regionId: "VKA",
  groupId: "eg9a",
  stepId: "s3",
  contractedWeeklyMinutes: 1155,
  comparableFullTimeWeeklyMinutes: 2310,
  revision: 1,
  confirmedAt: "2026-05-02T00:00:00.000Z",
  updatedAt: "2026-05-02T00:00:00.000Z",
};

describe("TVöD Anlage A draft through the shared monthly pipeline", () => {
  it("resolves the dated EG identity and reports only the confirmed table base", () => {
    expect(resolveRemunerationContext("2026-05-01", [profile], resolver)).toMatchObject({
      kind: "tvoed-annex-a-draft",
      groupId: "eg9a",
      stepId: "s3",
      source: { packageId: "tvoed-vka-anlage-a", versionId: candidate.versionId },
    });
    expect(
      calculateMonthlyBaseRemuneration("2026-05", [profile], resolver, undefined, confirmation),
    ).toMatchObject({
      status: "estimated",
      complete: true,
      knownSubtotalCents: 204884,
      positions: [{ label: "Tabellenentgelt (Entwurf)", amountCents: 204884 }],
    });
    const monthly = calculateDatedMonthlyRemuneration({
      month: "2026-05",
      shifts: [],
      workProfile: work,
      history: [profile],
      allowanceEntitlements: [],
      annexAConfirmation: confirmation,
      resolver,
    });
    expect(monthly.base.knownSubtotalCents).toBe(204884);
    expect(monthly.complete).toBe(false);
    expect(monthly.estimatedGrossCents).toBeNull();
    expect(
      monthly.positions.some((position) => position.issue?.code === "TARIFF_UNSUPPORTED"),
    ).toBe(true);
    const appPath = calculateAssessedMonthlyRemuneration({
      month: "2026-05",
      shifts: [],
      workProfile: work,
      history: [profile],
      settings: {
        workplaceCoverage: "UNKNOWN",
        assignment: "UNKNOWN",
        updatedAt: null,
      },
      annexAConfirmation: confirmation,
      resolver,
    });
    expect(appPath.allowanceAssessment.periods[0].issue?.code).toBe("TARIFF_UNSUPPORTED");
    expect(appPath.estimatedGrossCents).toBeNull();
    expect(appPath.base.knownSubtotalCents).toBe(204884);
  });

  it("never carries a confirmation into another month or a split contract period", () => {
    expect(
      calculateMonthlyBaseRemuneration("2026-06", [profile], resolver, undefined, confirmation),
    ).toMatchObject({ complete: false, totalCents: null });
    expect(
      calculateMonthlyBaseRemuneration("2026-05", [profile], resolver, undefined, {
        ...confirmation,
        comparableFullTimeConfirmed: false,
      }),
    ).toMatchObject({ complete: false, totalCents: null });
    expect(
      calculateMonthlyBaseRemuneration(
        "2026-05",
        [{ ...profile, effectiveFrom: "2026-05-15" }],
        resolver,
        undefined,
        confirmation,
      ),
    ).toMatchObject({ complete: false, totalCents: null });
  });

  it("uses only a current saved answer in the same app calculation path", () => {
    const month = (
      history: readonly DatedRemunerationProfile[],
      answers: readonly SavedTvoedAnnexAMonthConfirmation[],
    ) =>
      calculateAssessedMonthlyRemuneration({
        month: "2026-05",
        shifts: [],
        workProfile: work,
        history,
        settings: { workplaceCoverage: "UNKNOWN", assignment: "UNKNOWN", updatedAt: null },
        savedAnnexAConfirmations: answers,
        resolver,
      });
    expect(month([profile], [savedConfirmation]).base.knownSubtotalCents).toBe(204884);
    expect(month([profile], [savedConfirmation]).estimatedGrossCents).toBeNull();
    for (const stale of [
      { ...savedConfirmation, ruleVersionId: "2027-01-01-draft1" },
      { ...savedConfirmation, profileRevision: 2 },
      { ...savedConfirmation, month: "2026-06" },
      { ...savedConfirmation, groupId: "eg8" },
      { ...savedConfirmation, comparableFullTimeConfirmed: null },
      { ...savedConfirmation, fullMonthSameContractConfirmed: false },
    ])
      expect(month([profile], [stale]).base.knownSubtotalCents).toBe(0);
    expect(month([{ ...profile, revision: 2 }], [savedConfirmation]).base.knownSubtotalCents).toBe(
      0,
    );
    expect(
      month([profile, { ...profile, effectiveFrom: "2026-05-15" }], [savedConfirmation]).base
        .knownSubtotalCents,
    ).toBe(0);
  });

  it("rejects a forged EG stage rather than falling back to a different table", () => {
    const invalid = {
      ...profile,
      data: {
        ...profile.data,
        selection: { ...profile.data.selection, group: "EG1", level: "1" },
      },
    } as DatedRemunerationProfile;
    expect(resolveRemunerationContext("2026-05-01", [invalid], resolver)).toMatchObject({
      kind: "unavailable",
      issue: { code: "TARIFF_UNSUPPORTED" },
    });
  });

  it("does not calculate premiums or overtime with the unrelated TVöD-P work profile", () => {
    const monthly = calculateDatedMonthlyRemuneration({
      month: "2026-05",
      shifts: [
        shift({
          id: "annex-a-night",
          date: "2026-05-12",
          overtimeMinutes: 60,
          tariffOvertimeConfirmed: true,
        }),
      ],
      workProfile: work,
      history: [profile],
      allowanceEntitlements: [],
      annexAConfirmation: confirmation,
      resolver,
    });
    expect(monthly.base.knownSubtotalCents).toBe(204884);
    expect(
      monthly.timePremiums.positions.every(
        (position) =>
          position.status === "unavailable" && position.issue?.code === "TARIFF_UNSUPPORTED",
      ),
    ).toBe(true);
    expect(
      monthly.overtime.positions.some(
        (position) =>
          position.status === "unavailable" && position.issue?.code === "TARIFF_UNSUPPORTED",
      ),
    ).toBe(true);
    expect(monthly.estimatedGrossCents).toBeNull();
  });
});
