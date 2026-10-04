import { Temporal } from "@js-temporal/polyfill";
import type { RuleTariffPackage } from "./contracts.generated";
import type { ValidationIssue } from "./validation";

/** The employer scope is independent of region, profession and training year. */
export function tvalShiftAllowanceIssues(pkg: RuleTariffPackage): ValidationIssue[] {
  const policy = pkg.rules.tvalShiftAllowancePolicy;
  if (!policy) return [];
  const issues: ValidationIssue[] = [];
  const root = "/rules/tvalShiftAllowancePolicy";
  const add = (code: string, message: string) => issues.push({ code, path: root, message });
  if (pkg.engineContractVersion !== 13 || pkg.packageId !== "tval-pflege-tdl")
    add("TVAL_SHIFT_CONTRACT", "Training shift allowances require the separate TVA-L contract.");
  if (policy.shareBasisPoints !== 7500 || policy.rounding !== "RATE_THEN_TOTAL")
    add("TVAL_SHIFT_SHARE", "Apply the three-quarter share with explicit monetary rounding.");
  if (
    policy.scopes.length !== 2 ||
    ["GENERAL", "SECTION_43"].some((id) => policy.scopes.filter((s) => s.id === id).length !== 1)
  )
    add("TVAL_SHIFT_SCOPES", "General and hospital employer rules must be distinct.");
  const sourceIds = new Set(pkg.sources.map((source) => source.id));
  const date = (value: string): string => Temporal.PlainDate.from(value).toString();
  const next = (value: string | null): string | null =>
    value === null ? null : Temporal.PlainDate.from(value).add({ days: 1 }).toString();
  for (const scope of policy.scopes) {
    if (!scope.rates.sourceIds.length || scope.rates.sourceIds.some((id) => !sourceIds.has(id)))
      add("TVAL_SHIFT_SOURCES", "Each employer rule needs known sources.");
    try {
      let expected: string | null = date(pkg.validFrom);
      if (expected !== pkg.validFrom || (pkg.validTo !== null && date(pkg.validTo) !== pkg.validTo))
        throw new Error("Invalid package date.");
      const periods = [...scope.rates.periods].sort((a, b) =>
        a.validFrom.localeCompare(b.validFrom),
      );
      if (!periods.length) throw new Error("No periods.");
      for (const period of periods) {
        if (
          date(period.validFrom) !== period.validFrom ||
          period.validFrom !== expected ||
          (period.validTo !== null &&
            (date(period.validTo) !== period.validTo || period.validTo < period.validFrom))
        )
          throw new Error("Gap, overlap or invalid period.");
        expected = next(period.validTo);
        if (
          [
            period.shiftMonthlyCents,
            period.shiftHourlyCents,
            period.alternatingMonthlyCents,
            period.alternatingHourlyCents,
          ].some((amount) => !Number.isSafeInteger(amount) || amount <= 0)
        )
          add("TVAL_SHIFT_RATE", "All four employee reference amounts must be positive cents.");
      }
      if (expected !== next(pkg.validTo)) throw new Error("Incomplete package coverage.");
    } catch {
      add("TVAL_SHIFT_COVERAGE", "Each scope must cover every package day exactly once.");
    }
  }
  return issues;
}
