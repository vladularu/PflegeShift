import { describe, expect, it } from "vitest";
import candidate from "../../rules/packages/reviewed/tvoed-vka-sue-bt-b/2026-05-01-draft1.json";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import { validateSavedTvoedSueMonthConfirmation } from "@/domain/saved-tvoed-sue-month-confirmation";
import { validateSavedTvoedSueAllowanceConfirmation } from "@/domain/saved-tvoed-sue-allowance-confirmation";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { BUNDLED_HOLIDAY_RULES, BUNDLED_LEGAL_RULES } from "@/rules/bundled-rules";
import { createRuleResolver } from "@/rules/rule-resolver";
import { summarizeAnnualRemuneration } from "@/features/analysis/annual-remuneration";
import { calculateMonthlyBaseRemuneration } from "./remuneration-base";
import { resolveRemunerationContext } from "./remuneration-context";
import {
  calculateAssessedMonthlyRemuneration,
  calculateDatedMonthlyRemuneration,
} from "./remuneration-month";
import { shift, work } from "./remuneration-test-fixtures";
import { resolveSavedTvoedSueMonthConfirmation } from "./tvoed-sue-saved-confirmation";

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
    weeklyMinutes: 2310,
    selection: {
      kind: "tariff",
      packageId: "tvoed-vka-sue-bt-b",
      variant: "BT_B",
      region: "VKA",
      group: "S8A",
      level: "3",
      fullTimeWeeklyMinutes: 2340,
    },
  },
};
const confirmation = {
  month: "2026-05",
  tariffApplicabilityConfirmed: true,
  sueClassificationConfirmed: true,
  standardFullTimeConfirmed: true,
  fullMonthBaseEntitlementConfirmed: true,
  fullMonthSameContractConfirmed: true,
} as const;
const savedAllowance = validateSavedTvoedSueAllowanceConfirmation({
  month: "2026-05",
  profileEffectiveFrom: profile.effectiveFrom,
  profileRevision: profile.revision,
  packageId: "tvoed-vka-sue-bt-b",
  ruleVersionId: candidate.versionId,
  variantId: "BT_B",
  regionId: "VKA",
  groupId: "s8a",
  stepId: "s3",
  contractedWeeklyMinutes: 2310,
  standardFullTimeWeeklyMinutes: 2340,
  sectionXxivClassificationConfirmed: true,
  fullMonthAllowanceEntitlementConfirmed: true,
  caseGroup: null,
  conversionDays: "NONE_CONFIRMED",
  revision: 1,
  confirmedAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
});

describe("SuE BT-B draft through the shared monthly result", () => {
  it("resolves the selected S-group from the catalog, not a TVöD-P or EG table", () => {
    expect(resolveRemunerationContext("2026-05-01", [profile], resolver)).toMatchObject({
      kind: "tvoed-sue-draft",
      groupId: "s8a",
      stepId: "s3",
      fullTimeWeeklyMinutes: 2340,
      source: { packageId: "tvoed-vka-sue-bt-b", versionId: candidate.versionId },
    });
  });

  it("reports only the confirmed partial table base, never complete gross", () => {
    expect(
      calculateMonthlyBaseRemuneration(
        "2026-05",
        [profile],
        resolver,
        undefined,
        undefined,
        confirmation,
      ),
    ).toMatchObject({
      status: "estimated",
      complete: true,
      knownSubtotalCents: 392584,
      positions: [
        {
          label: "SuE-Tabellenentgelt (Entwurf)",
          status: "estimated",
          amountCents: 392584,
          source: { packageId: "tvoed-vka-sue-bt-b", versionId: candidate.versionId },
        },
      ],
    });
    const monthly = calculateDatedMonthlyRemuneration({
      month: "2026-05",
      shifts: [],
      workProfile: work,
      history: [profile],
      allowanceEntitlements: [],
      sueConfirmation: confirmation,
      resolver,
    });
    expect(monthly.base.knownSubtotalCents).toBe(392584);
    expect(monthly.complete).toBe(false);
    expect(monthly.estimatedGrossCents).toBeNull();
    expect(
      monthly.positions.some((position) => position.issue?.code === "TARIFF_UNSUPPORTED"),
    ).toBe(true);
  });

  it("keeps the draft unavailable without monthly confirmation or for a split profile", () => {
    expect(calculateMonthlyBaseRemuneration("2026-05", [profile], resolver)).toMatchObject({
      status: "unavailable",
      positions: [{ amountCents: null, issue: { code: "TARIFF_UNSUPPORTED" } }],
    });
    const changed: DatedRemunerationProfile = {
      ...profile,
      effectiveFrom: "2026-05-16",
      revision: 2,
    };
    expect(
      calculateMonthlyBaseRemuneration(
        "2026-05",
        [profile, changed],
        resolver,
        undefined,
        undefined,
        confirmation,
      ),
    ).toMatchObject({ status: "unavailable", totalCents: null });
  });

  it("uses only a saved answer matching the exact month, profile and rule version", () => {
    const saved = validateSavedTvoedSueMonthConfirmation({
      month: "2026-05",
      profileEffectiveFrom: "2026-05-01",
      profileRevision: profile.revision,
      packageId: "tvoed-vka-sue-bt-b",
      ruleVersionId: candidate.versionId,
      variantId: "BT_B",
      regionId: "VKA",
      groupId: "s8a",
      stepId: "s3",
      contractedWeeklyMinutes: 2310,
      standardFullTimeWeeklyMinutes: 2340,
      tariffApplicabilityConfirmed: true,
      sueClassificationConfirmed: true,
      standardFullTimeConfirmed: true,
      fullMonthBaseEntitlementConfirmed: true,
      fullMonthSameContractConfirmed: true,
      revision: 1,
      confirmedAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    });
    expect(resolveSavedTvoedSueMonthConfirmation("2026-05", [profile], [saved], resolver)).toEqual(
      confirmation,
    );
    const monthly = calculateDatedMonthlyRemuneration({
      month: "2026-05",
      shifts: [],
      workProfile: work,
      history: [profile],
      allowanceEntitlements: [],
      savedSueConfirmations: [saved],
      resolver,
    });
    expect(monthly.base.knownSubtotalCents).toBe(392584);
    expect(monthly.estimatedGrossCents).toBeNull();
    for (const stale of [
      { ...saved, ruleVersionId: "2025-04-01-draft1" },
      { ...saved, profileRevision: 2 },
      { ...saved, month: "2026-06" },
      { ...saved, sueClassificationConfirmed: null },
    ]) {
      const result = calculateDatedMonthlyRemuneration({
        month: "2026-05",
        shifts: [],
        workProfile: work,
        history: [profile],
        allowanceEntitlements: [],
        savedSueConfirmations: [stale],
        resolver,
      });
      expect(result.base.positions[0].amountCents).toBeNull();
    }
  });

  it("adds a confirmed SuE allowance once as a partial amount without claiming complete gross", () => {
    const calculate = (saved = [savedAllowance], history = [profile]) =>
      calculateDatedMonthlyRemuneration({
        month: "2026-05",
        shifts: [],
        workProfile: work,
        history,
        allowanceEntitlements: [],
        sueConfirmation: confirmation,
        savedSueAllowanceConfirmations: saved,
        resolver,
      });
    const monthly = calculate();
    expect(monthly.allowances.knownSubtotalCents).toBe(12833);
    expect(
      monthly.allowances.positions.filter((item) => item.id === "allowance:tvoed-sue:2026-05"),
    ).toMatchObject([
      {
        label: "SuE-Zulage (Entwurf)",
        amountCents: 12833,
        status: "estimated",
        source: { packageId: "tvoed-vka-sue-bt-b", versionId: candidate.versionId },
      },
    ]);
    expect(monthly.knownSubtotalCents).toBe(405417);
    expect(monthly.complete).toBe(false);
    expect(monthly.estimatedGrossCents).toBeNull();
    const assessed = calculateAssessedMonthlyRemuneration({
      month: "2026-05",
      shifts: [],
      workProfile: work,
      history: [profile],
      settings: { workplaceCoverage: "UNKNOWN", assignment: "UNKNOWN", updatedAt: null },
      sueConfirmation: confirmation,
      savedSueAllowanceConfirmations: [savedAllowance],
      resolver,
    });
    const annual = summarizeAnnualRemuneration(2026, "ready", [
      { month: "2026-05", result: assessed },
    ]);
    expect(annual.allowances.knownSubtotalCents).toBe(12833);
    expect(annual.knownSubtotalCents).toBe(405417);
    expect(annual.estimatedGrossCents).toBeNull();

    const withoutBase = calculateDatedMonthlyRemuneration({
      month: "2026-05",
      shifts: [],
      workProfile: work,
      history: [profile],
      allowanceEntitlements: [],
      savedSueAllowanceConfirmations: [savedAllowance],
      resolver,
    });
    expect(withoutBase.allowances.knownSubtotalCents).toBe(0);
    expect(withoutBase.estimatedGrossCents).toBeNull();

    for (const stale of [
      { ...savedAllowance, profileRevision: 2 },
      { ...savedAllowance, ruleVersionId: "2025-04-01-draft1" },
      { ...savedAllowance, conversionDays: "TAKEN" as const },
      { ...savedAllowance, sectionXxivClassificationConfirmed: null },
    ]) {
      const result = calculate([stale]);
      expect(result.allowances.knownSubtotalCents).toBe(0);
      expect(result.estimatedGrossCents).toBeNull();
      expect(
        result.allowances.positions.find((item) => item.id === "allowance:tvoed-sue:2026-05"),
      ).toMatchObject({ amountCents: null, status: "unavailable" });
    }
    const changed: DatedRemunerationProfile = {
      ...profile,
      effectiveFrom: "2026-05-16",
      revision: 2,
    };
    expect(calculate([savedAllowance], [profile, changed]).allowances.knownSubtotalCents).toBe(0);
  });

  it("does not make unreviewed allowances or overtime appear calculated", () => {
    const result = calculateAssessedMonthlyRemuneration({
      month: "2026-05",
      shifts: [],
      workProfile: work,
      history: [profile],
      settings: { workplaceCoverage: "UNKNOWN", assignment: "UNKNOWN", updatedAt: null },
      sueConfirmation: confirmation,
      resolver,
    });
    expect(result.base.knownSubtotalCents).toBe(392584);
    expect(result.complete).toBe(false);
    expect(result.estimatedGrossCents).toBeNull();
    expect(result.allowanceAssessment.periods[0].issue?.code).toBe("TARIFF_UNSUPPORTED");
  });

  it("marks real shift premiums and overtime unavailable, not zero", () => {
    const monthly = calculateDatedMonthlyRemuneration({
      month: "2026-05",
      shifts: [
        shift({
          date: "2026-05-15",
          overtimeMinutes: 60,
          tariffOvertimeConfirmed: true,
        }),
      ],
      workProfile: work,
      history: [profile],
      allowanceEntitlements: [],
      sueConfirmation: confirmation,
      resolver,
    });
    for (const kind of ["time-premium", "overtime"] as const) {
      const positions = monthly.positions.filter((position) =>
        kind === "overtime" ? position.kind.startsWith("overtime-") : position.kind === kind,
      );
      expect(positions.length).toBeGreaterThan(0);
      expect(positions.every((position) => position.amountCents === null)).toBe(true);
      expect(positions.every((position) => position.issue?.code === "TARIFF_UNSUPPORTED")).toBe(
        true,
      );
    }
    expect(monthly.estimatedGrossCents).toBeNull();
  });

  it("rejects an invalid S-group or a nonstandard full-time basis", () => {
    const selection = profile.data.selection;
    if (selection.kind !== "tariff") throw new Error("Expected a tariff profile.");
    const invalidGroup: DatedRemunerationProfile = {
      ...profile,
      data: {
        ...profile.data,
        selection: { ...selection, group: "S10" },
      },
    };
    const wrongTime: DatedRemunerationProfile = {
      ...profile,
      data: {
        ...profile.data,
        selection: { ...selection, fullTimeWeeklyMinutes: 2310 },
      },
    };
    for (const item of [invalidGroup, wrongTime])
      expect(resolveRemunerationContext("2026-05-01", [item], resolver)).toMatchObject({
        kind: "unavailable",
        issue: { code: "TARIFF_UNSUPPORTED" },
      });
  });
});
