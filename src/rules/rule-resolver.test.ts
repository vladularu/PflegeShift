import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";

import holidayPackageFixture from "../../rules/examples/holiday-package.valid.json";
import legalPackageFixture from "../../rules/examples/legal-package.valid.json";
import manifestFixture from "../../rules/examples/manifest.valid.json";
import tariffPackageFixture from "../../rules/examples/tariff-package.valid.json";
import { FEDERAL_STATES, PAY_GROUPS, PAY_LEVELS, type TariffProfile } from "../domain/types";
import { easterSunday, getPublicHolidays } from "../engine/holidays";
import {
  getIndividualHourlyRate,
  getMonthlyTableAmount,
  getPremiumHourlyRate,
} from "../engine/tariff";
import {
  BUNDLED_RULE_PACKAGES,
  BUNDLED_TARIFF_RULES,
  LEGACY_RULE_PACKAGE_IDS,
} from "./bundled-rules";
import type { RuleManifest } from "./contracts.generated";
import {
  bundledRuleResolver,
  createRuleResolverFromCatalog,
  createRuleResolver,
  isRuleCatalogRuntimeCompatible,
  requireResolvedPackage,
  RuleCatalogCompatibilityError,
  RuleResolutionError,
} from "./rule-resolver";
import { validateRuleCatalog, validateRulePackage } from "./validation";

function packageHolidayDate(
  calculation:
    | { type: "FIXED_DATE"; month: number; day: number }
    | { type: "EASTER_OFFSET"; offsetDays: number }
    | { type: "REPENTANCE_DAY" }
    | { type: "SPECIFIC_DATE"; date: string },
  year: number,
): string {
  if (calculation.type === "FIXED_DATE") {
    return Temporal.PlainDate.from({
      year,
      month: calculation.month,
      day: calculation.day,
    }).toString();
  }
  if (calculation.type === "EASTER_OFFSET") {
    return Temporal.PlainDate.from(easterSunday(year))
      .add({ days: calculation.offsetDays })
      .toString();
  }
  if (calculation.type === "SPECIFIC_DATE") return calculation.date;

  const november23 = Temporal.PlainDate.from({ year, month: 11, day: 23 });
  const daysBack = november23.dayOfWeek > 3 ? november23.dayOfWeek - 3 : november23.dayOfWeek + 4;
  return november23.subtract({ days: daysBack }).toString();
}

describe("bundled legacy rule resolver", () => {
  it("loads only valid, deeply frozen legacy packages", () => {
    for (const rulePackage of BUNDLED_RULE_PACKAGES) {
      expect(validateRulePackage(rulePackage).ok).toBe(true);
      expect(rulePackage.status).toBe("LEGACY_EMBEDDED");
      expect(Object.isFrozen(rulePackage)).toBe(true);
      expect(Object.isFrozen(rulePackage.rules)).toBe(true);
    }
  });

  it("resolves the frozen tariff values at every legacy boundary", () => {
    const previous = requireResolvedPackage(bundledRuleResolver.resolveTariff("2026-04-30"));
    const current = requireResolvedPackage(bundledRuleResolver.resolveTariff("2026-05-01"));
    const previousEntry = previous.rules.payTables[0].entries.find(
      (entry) => entry.groupId === "p8" && entry.stepId === "s4",
    );
    const currentEntry = current.rules.payTables[0].entries.find(
      (entry) => entry.groupId === "p8" && entry.stepId === "s4",
    );

    expect(previous.versionId).toBe("2025-04");
    expect(previousEntry).toMatchObject({ monthlyCents: 396457, hourlyCents: 2338 });
    expect(current.versionId).toBe("2026-05");
    expect(currentEntry).toMatchObject({ monthlyCents: 407558, hourlyCents: 2403 });
    expect(bundledRuleResolver.resolveTariff("2025-03-31")).toMatchObject({
      ok: false,
      error: { code: "RULE_PACKAGE_NOT_FOUND" },
    });
    expect(bundledRuleResolver.resolveTariff("2027-04-01")).toMatchObject({
      ok: false,
      error: { code: "RULE_PACKAGE_NOT_FOUND" },
    });
  });

  it("matches every old tariff table value at both validity boundaries", () => {
    for (const date of ["2025-04-01", "2026-04-30", "2026-05-01", "2027-03-31"]) {
      const rulePackage = requireResolvedPackage(bundledRuleResolver.resolveTariff(date));
      for (const payGroup of PAY_GROUPS) {
        for (const payLevel of PAY_LEVELS) {
          const profile: TariffProfile = {
            payGroup,
            payLevel,
            sector: "BT_K",
            tariffRegion: "OTHER",
            fullTimeWeeklyMinutes: 2310,
          };
          const entry = rulePackage.rules.payTables[0].entries.find(
            (candidate) =>
              candidate.groupId === payGroup.toLowerCase() && candidate.stepId === `s${payLevel}`,
          );
          expect(entry, `${date} ${payGroup}/${payLevel}`).toBeDefined();
          expect(entry!.monthlyCents).toBe(Math.round(getMonthlyTableAmount(profile, date)! * 100));
          expect(entry!.hourlyCents).toBe(
            Math.round(getIndividualHourlyRate(profile, date)! * 100),
          );
        }
        const premiumEntry = rulePackage.rules.payTables[0].entries.find(
          (candidate) => candidate.groupId === payGroup.toLowerCase() && candidate.stepId === "s3",
        );
        const profile: TariffProfile = {
          payGroup,
          payLevel: 2,
          sector: "BT_K",
          tariffRegion: "OTHER",
          fullTimeWeeklyMinutes: 2310,
        };
        expect(premiumEntry!.hourlyCents).toBe(
          Math.round(getPremiumHourlyRate(profile, date)! * 100),
        );
      }
    }
  });

  it("exposes the exact legacy legal and holiday thresholds", () => {
    const legal = requireResolvedPackage(bundledRuleResolver.resolveLegal("2026-07-01"));
    const holidays = requireResolvedPackage(bundledRuleResolver.resolveHoliday("2026-01-01"));

    expect(legal.rules.workingTime).toMatchObject({
      standardDailyMinutes: 480,
      maxDailyMinutes: 600,
      nightAverageMinutes: 480,
      grossPlanningWarningMinutes: 960,
    });
    expect(legal.rules.restPeriod).toMatchObject({ defaultMinutes: 660 });
    expect(legal.rules.restPeriod.deviations[0]).toMatchObject({
      minimumMinutes: 600,
      compensationMinutes: 720,
      compensationWithinDays: 28,
    });
    expect(
      holidays.rules.holidays.find((holiday) => holiday.id === "corpus-christi"),
    ).toMatchObject({ federalStates: ["BW", "BY", "HE", "NW", "RP", "SL"] });
  });

  it("matches the old holiday engine across every historical rule boundary", () => {
    const rulePackage = requireResolvedPackage(bundledRuleResolver.resolveHoliday("2026-01-01"));
    for (const year of [2016, 2017, 2018, 2019, 2020, 2023, 2025, 2026, 2028]) {
      for (const federalState of FEDERAL_STATES) {
        const fromPackage = rulePackage.rules.holidays
          .filter(
            (holiday) =>
              holiday.validFrom <= `${year}-12-31` &&
              (holiday.validTo === null || holiday.validTo >= `${year}-01-01`) &&
              (holiday.scope === "NATIONWIDE" || holiday.federalStates?.includes(federalState)),
          )
          .map((holiday) => ({
            date: packageHolidayDate(holiday.calculation, year),
            name: holiday.name,
            scope: holiday.scope,
            validFrom: holiday.validFrom,
            validTo: holiday.validTo,
          }))
          .filter(
            (holiday) =>
              holiday.validFrom <= holiday.date &&
              (holiday.validTo === null || holiday.date <= holiday.validTo),
          )
          .map(({ date, name, scope }) => ({ date, name, scope }))
          .sort((left, right) => left.date.localeCompare(right.date));

        expect(fromPackage, `${year} ${federalState}`).toEqual(
          getPublicHolidays(year, federalState),
        );
      }
    }
  });

  it("returns explicit invalid, missing, and ambiguous resolution failures", () => {
    expect(bundledRuleResolver.resolveLegal("2026-02-31")).toMatchObject({
      ok: false,
      error: { code: "INVALID_EFFECTIVE_DATE" },
    });

    const duplicateCatalog = {
      tariff: [BUNDLED_TARIFF_RULES[1], BUNDLED_TARIFF_RULES[1]],
      legal: [],
      holiday: [],
    };
    expect(createRuleResolver(duplicateCatalog).resolveTariff("2026-07-01")).toMatchObject({
      ok: false,
      error: { code: "RULE_PACKAGE_AMBIGUOUS" },
    });
    expect(() => requireResolvedPackage(bundledRuleResolver.resolveTariff("2027-04-01"))).toThrow(
      RuleResolutionError,
    );
  });

  it("selects runtime package identities from the validated manifest tracks", () => {
    const validation = validateRuleCatalog(manifestFixture, [
      tariffPackageFixture,
      legalPackageFixture,
      holidayPackageFixture,
    ]);
    if (!validation.ok) throw new Error("Expected the catalog fixture to be valid.");

    expect(isRuleCatalogRuntimeCompatible(validation.value)).toBe(true);
    const resolver = createRuleResolverFromCatalog(validation.value);
    expect(requireResolvedPackage(resolver.resolveTariff("2026-05-01"))).toMatchObject({
      packageId: "tvoed-vka-bt-k",
      versionId: "2026-05",
    });
    expect(requireResolvedPackage(resolver.resolveLegal("2026-07-01"))).toMatchObject({
      packageId: "de-arbzg-care",
      versionId: "2026-01",
    });
    expect(requireResolvedPackage(resolver.resolveHoliday("2026-07-01"))).toMatchObject({
      packageId: "de-holidays",
      versionId: "2026",
    });
  });

  it("rejects catalog topologies that engine contract v1 cannot select unambiguously", () => {
    const validation = validateRuleCatalog(manifestFixture, [
      tariffPackageFixture,
      legalPackageFixture,
      holidayPackageFixture,
    ]);
    if (!validation.ok) throw new Error("Expected the catalog fixture to be valid.");
    const incompatible = {
      ...validation.value,
      manifest: {
        ...validation.value.manifest,
        tracks: validation.value.manifest.tracks.filter((track) => track.kind !== "LEGAL"),
      },
    } as typeof validation.value;

    expect(isRuleCatalogRuntimeCompatible(incompatible)).toBe(false);
    expect(() => createRuleResolverFromCatalog(incompatible)).toThrow(
      RuleCatalogCompatibilityError,
    );
  });

  it("cannot publish a LEGACY_EMBEDDED package through a catalog", () => {
    const legacy = BUNDLED_TARIFF_RULES[1];
    const manifest: RuleManifest = {
      ...(manifestFixture as RuleManifest),
      tracks: [
        {
          packageId: LEGACY_RULE_PACKAGE_IDS.tariff,
          kind: "TARIFF",
          coverageFrom: legacy.validFrom,
          coverageTo: legacy.validTo,
          coverage: "COMPLETE",
        },
      ],
      packages: [
        {
          packageId: legacy.packageId,
          versionId: legacy.versionId,
          kind: legacy.kind,
          engineContractVersion: legacy.engineContractVersion,
          validFrom: legacy.validFrom,
          validTo: legacy.validTo,
          path: `packages/${legacy.packageId}/${legacy.versionId}.json`,
          sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
          sizeBytes: 4096,
        },
      ],
    };
    const result = validateRuleCatalog(manifest, [legacy]);

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues.map((entry) => entry.code)).toContain(
      "UNPUBLISHED_CATALOG_PACKAGE",
    );
  });
});
