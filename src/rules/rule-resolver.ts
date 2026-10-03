import { Temporal } from "@js-temporal/polyfill";

import type {
  RuleHolidayPackage,
  RuleLegalPackage,
  RuleManifest,
  RulePackage,
  RuleTariffPackage,
} from "./contracts.generated";
import type { ValidatedRuleCatalog } from "./validation";
import {
  BUNDLED_HOLIDAY_RULES,
  BUNDLED_LEGAL_RULES,
  BUNDLED_TARIFF_RULES,
  LEGACY_RULE_PACKAGE_IDS,
} from "./bundled-rules";

export type RuleResolutionErrorCode =
  "INVALID_EFFECTIVE_DATE" | "RULE_PACKAGE_NOT_FOUND" | "RULE_PACKAGE_AMBIGUOUS";

export interface RuleResolutionFailure {
  readonly code: RuleResolutionErrorCode;
  readonly kind: RulePackage["kind"];
  readonly packageId: string;
  readonly effectiveDate: string;
  readonly message: string;
}

export type RuleResolution<T extends RulePackage> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: RuleResolutionFailure };

export interface RuleResolverCatalog {
  readonly tariff: readonly RuleTariffPackage[];
  readonly legal: readonly RuleLegalPackage[];
  readonly holiday: readonly RuleHolidayPackage[];
}

export interface RuleResolverPackageIds {
  readonly tariff: string;
  readonly legal: string;
  readonly holiday: string;
}

export interface RuleResolver {
  /** Optional for legacy custom adapters; absence never authorizes a fallback. */
  readonly tariffPackageIds?: readonly string[];
  readonly annualTariffCandidates?: (
    packageId: string,
    year: number,
  ) => readonly RuleTariffPackage[];
  readonly resolveTariff: (
    effectiveDate: string,
    packageId?: string,
  ) => RuleResolution<RuleTariffPackage>;
  readonly resolveLegal: (effectiveDate: string) => RuleResolution<RuleLegalPackage>;
  readonly resolveHoliday: (effectiveDate: string) => RuleResolution<RuleHolidayPackage>;
}

export class RuleResolutionError extends Error {
  readonly failure: RuleResolutionFailure;

  constructor(failure: RuleResolutionFailure) {
    super(failure.message);
    this.name = "RuleResolutionError";
    this.failure = failure;
  }
}

export class RuleCatalogCompatibilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuleCatalogCompatibilityError";
  }
}

export const BUNDLED_RULE_CATALOG: RuleResolverCatalog = Object.freeze({
  tariff: BUNDLED_TARIFF_RULES,
  legal: BUNDLED_LEGAL_RULES,
  holiday: BUNDLED_HOLIDAY_RULES,
});

function packageIdsFromManifest(manifest: RuleManifest): RuleResolverPackageIds | null {
  const { tracks } = manifest;
  const packageIdFor = (kind: RulePackage["kind"]): string | null => {
    const matches = tracks.filter((track) => track.kind === kind);
    return matches.length === 1 ? matches[0].packageId : null;
  };
  const tariff =
    manifest.schemaVersion === 2
      ? (manifest.legacyTariffPackageId ?? null)
      : packageIdFor("TARIFF");
  if (tracks.filter((track) => track.kind === "TARIFF" && track.packageId === tariff).length !== 1)
    return null;
  const legal = packageIdFor("LEGAL");
  const holiday = packageIdFor("HOLIDAY");
  return tariff !== null && legal !== null && holiday !== null
    ? Object.freeze({ tariff, legal, holiday })
    : null;
}

export function isRuleCatalogRuntimeCompatible(catalog: ValidatedRuleCatalog): boolean {
  return packageIdsFromManifest(catalog.manifest) !== null;
}

function isValidDate(value: string): boolean {
  try {
    return Temporal.PlainDate.from(value).toString() === value;
  } catch {
    return false;
  }
}

function resolvePackage<T extends RulePackage>(
  packages: readonly T[],
  kind: T["kind"],
  packageId: string,
  effectiveDate: string,
): RuleResolution<T> {
  if (!isValidDate(effectiveDate)) {
    return {
      ok: false,
      error: {
        code: "INVALID_EFFECTIVE_DATE",
        kind,
        packageId,
        effectiveDate,
        message: `Invalid effective date for ${packageId}: ${effectiveDate}.`,
      },
    };
  }

  const matches = packages.filter(
    (rulePackage) =>
      rulePackage.packageId === packageId &&
      rulePackage.validFrom <= effectiveDate &&
      (rulePackage.validTo === null || effectiveDate <= rulePackage.validTo),
  );
  if (matches.length === 1) return { ok: true, value: matches[0] };

  const code = matches.length === 0 ? "RULE_PACKAGE_NOT_FOUND" : "RULE_PACKAGE_AMBIGUOUS";
  return {
    ok: false,
    error: {
      code,
      kind,
      packageId,
      effectiveDate,
      message:
        matches.length === 0
          ? `No ${kind} package ${packageId} covers ${effectiveDate}.`
          : `Multiple ${kind} packages ${packageId} cover ${effectiveDate}.`,
    },
  };
}

export function createRuleResolver(
  catalog: RuleResolverCatalog = BUNDLED_RULE_CATALOG,
  packageIds: RuleResolverPackageIds = LEGACY_RULE_PACKAGE_IDS,
): RuleResolver {
  return Object.freeze({
    tariffPackageIds: Object.freeze([...new Set(catalog.tariff.map((item) => item.packageId))]),
    annualTariffCandidates: (packageId: string, year: number) =>
      Object.freeze(
        Number.isInteger(year) && year >= 1900 && year <= 4099
          ? catalog.tariff.filter(
              (item) =>
                item.packageId === packageId &&
                item.validFrom <= year + "-12-31" &&
                (item.validTo === null || item.validTo >= year + "-01-01"),
            )
          : [],
      ),
    resolveTariff: (effectiveDate: string, packageId: string = packageIds.tariff) =>
      resolvePackage(catalog.tariff, "TARIFF", packageId, effectiveDate),
    resolveLegal: (effectiveDate: string) =>
      resolvePackage(catalog.legal, "LEGAL", packageIds.legal, effectiveDate),
    resolveHoliday: (effectiveDate: string) =>
      resolvePackage(catalog.holiday, "HOLIDAY", packageIds.holiday, effectiveDate),
  });
}

export function createRuleResolverFromCatalog(catalog: ValidatedRuleCatalog): RuleResolver {
  const packageIds = packageIdsFromManifest(catalog.manifest);
  if (packageIds === null) {
    throw new RuleCatalogCompatibilityError(
      "The rule resolver requires an unambiguous legacy tariff selection and exactly one legal and holiday track.",
    );
  }
  return createRuleResolver(
    {
      tariff: catalog.packages.filter(
        (rulePackage): rulePackage is RuleTariffPackage => rulePackage.kind === "TARIFF",
      ),
      legal: catalog.packages.filter(
        (rulePackage): rulePackage is RuleLegalPackage => rulePackage.kind === "LEGAL",
      ),
      holiday: catalog.packages.filter(
        (rulePackage): rulePackage is RuleHolidayPackage => rulePackage.kind === "HOLIDAY",
      ),
    },
    packageIds,
  );
}

export const bundledRuleResolver = createRuleResolver();

export function requireResolvedPackage<T extends RulePackage>(resolution: RuleResolution<T>): T {
  if (!resolution.ok) throw new RuleResolutionError(resolution.error);
  return resolution.value;
}
