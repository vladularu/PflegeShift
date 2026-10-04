import { describe, expect, it } from "vitest";

import manifestFixture from "../../rules/examples/manifest.valid.json";
import previewGeneration4 from "../../rules/releases/preview-generation-4.json";
import legalValue from "../../rules/packages/reviewed/de-arbzg-care/2026-01.json";
import holiday2026Value from "../../rules/packages/reviewed/de-holidays/2026.json";
import holiday2027Value from "../../rules/packages/reviewed/de-holidays/2027.json";
import previousValue from "../../rules/packages/reviewed/tvoed-vka-bt-k/2026-05.json";
import correctedValue from "../rules/__fixtures__/original-tvoed-selection-r2.json";
import annualValue from "../../rules/packages/reviewed/tvoed-vka-bt-k/2026-05-r3.json";
import { storedRuleCatalogRuntime, type StoredRuleCatalogSnapshot } from "./rule-catalog-runtime";
import { reconcileRuleCatalogRuntimeAfterSync } from "./rule-catalog-runtime-refresh";
import type { UserProfile } from "@/domain/types";
import { calculateMonthlyPayEstimate } from "@/engine/pay";
import type { RuleManifest, RulePackage } from "@/rules/contracts.generated";
import { validateRuleCatalog, validateRulePackage } from "@/rules/validation";

// Runtime boundary fixture only: this does not sign, publish, or approve the draft.
function catalogSnapshot(tariff: unknown, generation: number): StoredRuleCatalogSnapshot {
  const packages = [tariff, legalValue, holiday2026Value, holiday2027Value].map((value) => {
    const rule = structuredClone(value) as RulePackage;
    rule.status = "PUBLISHED";
    rule.review = {
      status: "PUBLISHED",
      reviewedBy: "test-fixture",
      reviewedAt: "2026-09-21T00:00:00Z",
      gitCommit: "a".repeat(40),
    };
    return rule;
  });
  const tracks = [...new Set(packages.map((rule) => rule.packageId))].map((packageId) => {
    const versions = packages
      .filter((rule) => rule.packageId === packageId)
      .sort((a, b) => a.validFrom.localeCompare(b.validFrom));
    return {
      packageId,
      kind: versions[0].kind,
      coverageFrom: versions[0].validFrom,
      coverageTo: versions.at(-1)!.validTo,
      coverage: "COMPLETE" as const,
    };
  });
  const manifest = {
    ...manifestFixture,
    generation,
    tracks,
    packages: packages.map((rule) => ({
      packageId: rule.packageId,
      versionId: rule.versionId,
      kind: rule.kind,
      engineContractVersion: rule.engineContractVersion,
      validFrom: rule.validFrom,
      validTo: rule.validTo,
      path: `packages/${rule.packageId}/${rule.versionId}.json`,
      sha256: "b".repeat(64),
      sizeBytes: 4096,
    })),
  };
  const validation = validateRuleCatalog(manifest, packages);
  if (!validation.ok) throw new Error(JSON.stringify(validation.issues));
  return {
    activeGeneration: generation,
    generation,
    recoveredFromGeneration: null,
    catalog: validation.value,
  };
}

const profile: UserProfile = {
  federalState: "HE",
  holidayRegion: "NONE",
  weeklyMinutes: 2310,
  timeZone: "Europe/Berlin",
  regularRotatingNightWork: false,
  sundayHolidayWorkEligible: true,
  allEmploymentWorkRecorded: true,
  tariff: {
    payGroup: "P5",
    payLevel: 1,
    sector: "BT_K",
    tariffRegion: "OTHER",
    fullTimeWeeklyMinutes: 2310,
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("P5/P6 catalog revision", () => {
  it("models the reported Preview generation 4 and a future contract-11 replacement", async () => {
    expect(previewGeneration4.packageSources).toContain(
      "rules/packages/reviewed/tvoed-vka-bt-k/2026-05.json",
    );
    expect(previousValue.rules.payTables[0].entries).toHaveLength(50);
    expect(annualValue.rules.payTables[0].entries).toHaveLength(62);
    expect(annualValue.engineContractVersion).toBe(11);
    expect(annualValue.status).toBe("REVIEWED");

    const current = storedRuleCatalogRuntime(catalogSnapshot(previousValue, 4));
    const before = calculateMonthlyPayEstimate(
      "2026-09",
      [],
      profile,
      null,
      undefined,
      undefined,
      current.resolver,
    );
    expect(before.available).toBe(false);

    // The next generation is a synthetic upgrade fixture, not a published release.
    const replacement = await reconcileRuleCatalogRuntimeAfterSync(
      current,
      { status: "ACTIVATED", generation: 5, previousGeneration: 4 },
      async () => catalogSnapshot(annualValue, 5),
    );
    expect(replacement.status).toBe("REPLACED");
    expect(replacement.runtime.diagnosis).toMatchObject({
      source: "STORED",
      selectedGeneration: 5,
    });
    const resolved = replacement.runtime.resolver.resolveTariff("2026-09-01");
    expect(resolved.ok && resolved.value.versionId).toBe("2026-05-r3");
    const after = calculateMonthlyPayEstimate(
      "2026-09",
      [],
      profile,
      null,
      undefined,
      undefined,
      replacement.runtime.resolver,
    );
    expect(after.available).toBe(true);
    expect(after.personalBaseAmount).toBe(2907.18);
  });

  it("uses a new version and never borrows the old review evidence", () => {
    // Historical contract 8 remains preserved but is excluded by the current schema.
    const historicalValidation = validateRulePackage(correctedValue);
    expect(historicalValidation.ok).toBe(false);
    if (!historicalValidation.ok)
      expect(historicalValidation.issues.map((issue) => issue.code)).toContain("SCHEMA_ENUM");
    expect(correctedValue.versionId).toBe("2026-05-r2");
    expect(correctedValue.status).toBe("DRAFT");
    expect(correctedValue.review).toEqual({
      status: "DRAFT",
      reviewedBy: null,
      reviewedAt: null,
      gitCommit: null,
    });
    expect(correctedValue.sources).toEqual(
      previousValue.sources.map((source, index) =>
        index < 2 ? { ...source, documentDate: "2025-04-06" } : source,
      ),
    );
    expect(correctedValue.validFrom).toBe(previousValue.validFrom);
    expect(correctedValue.validTo).toBe(previousValue.validTo);
    const retainedEntries = correctedValue.rules.payTables[0].entries.filter(
      (entry) => !["p5", "p6"].includes(entry.groupId),
    );
    expect(retainedEntries).toEqual(previousValue.rules.payTables[0].entries);
    expect(retainedEntries).toHaveLength(50);
    expect(correctedValue.rules.allowanceRules).toEqual(
      previousValue.rules.allowanceRules.map((rule) => {
        const tariffRegion =
          rule.id === "shift-hourly-bt-k-non-bw-current"
            ? "OTHER"
            : rule.id === "shift-hourly-other-current"
              ? "KAV_BW"
              : null;
        return tariffRegion === null
          ? rule
          : {
              ...rule,
              conditions: {
                ...rule.conditions,
                federalStates: null,
                tariffRegions: [tariffRegion],
              },
            };
      }),
    );
    expect(correctedValue.rules.weeklyWorkingTimeRules).toEqual(
      previousValue.rules.weeklyWorkingTimeRules,
    );
    expect(
      correctedValue.rules.premiumRules.filter((rule) => rule.premiumType !== "OVERTIME"),
    ).toEqual(previousValue.rules.premiumRules.filter((rule) => rule.premiumType !== "OVERTIME"));
    expect(
      correctedValue.rules.premiumRules.find((rule) => rule.id === "overtime-p5-p11"),
    ).toMatchObject({
      percentageBasisPoints: 3000,
      conditions: { payGroups: ["p5", "p6", "p7", "p8", "p9", "p10", "p11"] },
    });
  });

  it.each([
    ["P5", [2907.18, 3146.33, 3216.62, 3334.09, 3422.22, 3629.25]],
    ["P6", [3012.49, 3187.41, 3363.47, 3737.95, 3833.41, 4013.41]],
  ] as const)(
    "repairs stored-catalog pay for every %s stage by replacing the generation",
    async (payGroup, expected) => {
      const oldRuntime = storedRuleCatalogRuntime(catalogSnapshot(previousValue, 3));
      const replacement = await reconcileRuleCatalogRuntimeAfterSync(
        oldRuntime,
        { status: "ACTIVATED", generation: 4, previousGeneration: 3 },
        async () => catalogSnapshot(annualValue, 4),
      );
      expect(replacement.status).toBe("REPLACED");
      expect(replacement.runtime.diagnosis).toMatchObject({
        source: "STORED",
        selectedGeneration: 4,
      });
      for (const payLevel of [1, 2, 3, 4, 5, 6] as const) {
        const selected = { ...profile, tariff: { ...profile.tariff!, payGroup, payLevel } };
        const before = calculateMonthlyPayEstimate(
          "2026-09",
          [],
          selected,
          null,
          undefined,
          undefined,
          oldRuntime.resolver,
        );
        expect(before.available).toBe(false);
        expect(before.personalBaseAmount).toBeNull();
        const after = calculateMonthlyPayEstimate(
          "2026-09",
          [],
          selected,
          null,
          undefined,
          undefined,
          replacement.runtime.resolver,
        );
        expect(after.available).toBe(true);
        expect(after.personalBaseAmount).toBe(expected[payLevel - 1]);
        const halfTime = calculateMonthlyPayEstimate(
          "2026-09",
          [],
          { ...selected, weeklyMinutes: 1155 },
          null,
          undefined,
          undefined,
          replacement.runtime.resolver,
        );
        expect(halfTime.personalBaseAmount).toBe(Math.round(expected[payLevel - 1] * 50) / 100);
      }
      for (const date of ["2025-12-25", "2026-09-21", "2027-12-25"]) {
        expect(replacement.runtime.resolver.resolveHoliday(date)).toEqual(
          oldRuntime.resolver.resolveHoliday(date),
        );
        expect(replacement.runtime.resolver.resolveLegal(date)).toEqual(
          oldRuntime.resolver.resolveLegal(date),
        );
      }
      const p8 = {
        ...profile,
        tariff: { ...profile.tariff!, payGroup: "P8" as const, payLevel: 4 as const },
      };
      expect(
        calculateMonthlyPayEstimate(
          "2026-09",
          [],
          p8,
          null,
          undefined,
          undefined,
          replacement.runtime.resolver,
        ),
      ).toEqual({
        ...calculateMonthlyPayEstimate(
          "2026-09",
          [],
          p8,
          null,
          undefined,
          undefined,
          oldRuntime.resolver,
        ),
        tariffLabel: annualValue.label,
      });
    },
  );

  it("keeps the old runtime if the corrected generation cannot be loaded", async () => {
    const current = storedRuleCatalogRuntime(catalogSnapshot(previousValue, 3));
    const failed = await reconcileRuleCatalogRuntimeAfterSync(
      current,
      { status: "ACTIVATED", generation: 4, previousGeneration: 3 },
      async () => {
        throw new Error("offline read failed");
      },
    );
    expect(failed.status).toBe("FAILED");
    expect(failed.runtime).toBe(current);
  });

  it("rejects publishing both overlapping tariff revisions in one generation", () => {
    const snapshot = catalogSnapshot(annualValue, 4);
    const old = catalogSnapshot(previousValue, 3);
    const descriptor = old.catalog.manifest.packages.find((entry) => entry.kind === "TARIFF")!;
    const manifest: RuleManifest = {
      ...snapshot.catalog.manifest,
      packages: [...snapshot.catalog.manifest.packages, descriptor],
    };
    const result = validateRuleCatalog(manifest, [
      ...snapshot.catalog.packages,
      old.catalog.packages.find((entry) => entry.kind === "TARIFF")!,
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.issues.map((issue) => issue.code)).toContain("OVERLAPPING_PACKAGE_RANGE");
  });
});
