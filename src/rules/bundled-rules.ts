import legacyLegalValue from "../../rules/packages/legacy/de-arbzg-care.json";
import legacyHolidayValue from "../../rules/packages/legacy/de-holidays.json";
import legacyTariff2025Value from "../../rules/packages/legacy/tvoed-p-vka-2025-04.json";
import legacyTariff2026Value from "../../rules/packages/legacy/tvoed-p-vka-2026-05.json";

import type {
  RuleHolidayPackage,
  RuleLegalPackage,
  RulePackage,
  RuleTariffPackage,
} from "./contracts.generated";
import { validateRulePackage } from "./validation";

export const LEGACY_RULE_PACKAGE_IDS = Object.freeze({
  tariff: "tvoed-p-vka-legacy",
  legal: "de-arbzg-care-legacy",
  holiday: "de-holidays-legacy",
} as const);

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function loadLegacyPackage(value: unknown, fileName: string): RulePackage {
  const result = validateRulePackage(value);
  if (!result.ok) {
    const details = result.issues
      .map((validationIssue) => `${validationIssue.path}: ${validationIssue.message}`)
      .join("; ");
    throw new Error(`Invalid bundled rule package ${fileName}: ${details}`);
  }
  if (result.value.status !== "LEGACY_EMBEDDED") {
    throw new Error(`Bundled package ${fileName} must be LEGACY_EMBEDDED.`);
  }
  return deepFreeze(result.value);
}

function expectKind<K extends RulePackage["kind"]>(
  rulePackage: RulePackage,
  kind: K,
  fileName: string,
): Extract<RulePackage, { kind: K }> {
  if (rulePackage.kind !== kind) {
    throw new Error(`Bundled package ${fileName} must have kind ${kind}.`);
  }
  return rulePackage as Extract<RulePackage, { kind: K }>;
}

const tariff2025 = expectKind(
  loadLegacyPackage(legacyTariff2025Value, "tvoed-p-vka-2025-04.json"),
  "TARIFF",
  "tvoed-p-vka-2025-04.json",
);
const tariff2026 = expectKind(
  loadLegacyPackage(legacyTariff2026Value, "tvoed-p-vka-2026-05.json"),
  "TARIFF",
  "tvoed-p-vka-2026-05.json",
);
const legal = expectKind(
  loadLegacyPackage(legacyLegalValue, "de-arbzg-care.json"),
  "LEGAL",
  "de-arbzg-care.json",
);
const holiday = expectKind(
  loadLegacyPackage(legacyHolidayValue, "de-holidays.json"),
  "HOLIDAY",
  "de-holidays.json",
);

export const BUNDLED_TARIFF_RULES: readonly RuleTariffPackage[] = Object.freeze([
  tariff2025,
  tariff2026,
]);
export const BUNDLED_LEGAL_RULES: readonly RuleLegalPackage[] = Object.freeze([legal]);
export const BUNDLED_HOLIDAY_RULES: readonly RuleHolidayPackage[] = Object.freeze([holiday]);
export const BUNDLED_RULE_PACKAGES: readonly RulePackage[] = Object.freeze([
  ...BUNDLED_TARIFF_RULES,
  ...BUNDLED_LEGAL_RULES,
  ...BUNDLED_HOLIDAY_RULES,
]);
