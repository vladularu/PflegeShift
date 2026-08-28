import { Temporal } from "@js-temporal/polyfill";

import type {
  RuleHolidayPackage,
  RuleLegalPackage,
  RulePackage,
  RuleTariffPackage,
} from "./contracts.generated";
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

export interface RuleResolver {
  readonly resolveTariff: (effectiveDate: string) => RuleResolution<RuleTariffPackage>;
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

export const BUNDLED_RULE_CATALOG: RuleResolverCatalog = Object.freeze({
  tariff: BUNDLED_TARIFF_RULES,
  legal: BUNDLED_LEGAL_RULES,
  holiday: BUNDLED_HOLIDAY_RULES,
});

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
): RuleResolver {
  return Object.freeze({
    resolveTariff: (effectiveDate: string) =>
      resolvePackage(catalog.tariff, "TARIFF", LEGACY_RULE_PACKAGE_IDS.tariff, effectiveDate),
    resolveLegal: (effectiveDate: string) =>
      resolvePackage(catalog.legal, "LEGAL", LEGACY_RULE_PACKAGE_IDS.legal, effectiveDate),
    resolveHoliday: (effectiveDate: string) =>
      resolvePackage(catalog.holiday, "HOLIDAY", LEGACY_RULE_PACKAGE_IDS.holiday, effectiveDate),
  });
}

export const bundledRuleResolver = createRuleResolver();

export function requireResolvedPackage<T extends RulePackage>(resolution: RuleResolution<T>): T {
  if (!resolution.ok) throw new RuleResolutionError(resolution.error);
  return resolution.value;
}
