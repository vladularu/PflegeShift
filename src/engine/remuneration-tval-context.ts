import type {
  RemunerationSelection,
  TvalEmployerScope,
  TvlEmploymentCategory,
} from "@/domain/remuneration-profile";
import type { RemunerationIssue } from "@/domain/remuneration-result";
import type { TvalCareAllowances } from "@/domain/tval-care-allowances";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { resolveTariffSelection } from "@/rules/tariff-selection";
import { validateRulePackage } from "@/rules/validation";

export interface TvalTrainingPayContext {
  readonly kind: "tval-training";
  readonly rulePackage: RuleTariffPackage;
  readonly monthlyCents: number;
  readonly weeklyMinutes: number;
  readonly fullTimeWeeklyMinutes: number;
  readonly categoryLabel: string;
  readonly periodLabel: string;
  readonly employerScope: TvalEmployerScope | null;
  readonly employmentCategory: TvlEmploymentCategory | null;
  readonly careAllowances: TvalCareAllowances | null;
}

/** Explicit TVA-L category and paid period; never infer eligibility or progression. */
export function resolveTvalTrainingPay(
  date: string,
  rulePackage: RuleTariffPackage,
  selected: Extract<RemunerationSelection, { kind: "tariff" }>,
  weeklyMinutes: number,
):
  | { readonly ok: true; readonly context: TvalTrainingPayContext }
  | { readonly ok: false; readonly issue: RemunerationIssue } {
  const fail = (code: RemunerationIssue["code"], message: string) => ({
    ok: false as const,
    issue: { code, message },
  });
  if (rulePackage.engineContractVersion !== 13 || !validateRulePackage(rulePackage).ok)
    return fail(
      "TARIFF_UNSUPPORTED",
      "Das TVA-L-Pflege-Regelpaket ist unvollständig oder nicht unterstützt.",
    );
  const declared = resolveTariffSelection(rulePackage, selected.variant, selected.region);
  const category = rulePackage.rules.tvalTrainingPay!.categories.find(
    (c) => c.groupId === selected.group,
  );
  const period = category?.levels.find((l) => l.id === selected.level);
  if (selected.packageId !== rulePackage.packageId || !declared || !category || !period)
    return fail(
      "TABLE_SELECTION_INVALID",
      "Bitte TVA-L-Geltung, Tarifgebiet, Ausbildungskategorie und vergüteten Ausbildungszeitraum ausdrücklich bestätigen.",
    );
  const entries = rulePackage.rules.payTables
    .filter((table) => table.id === rulePackage.rules.selector.payTableId)
    .flatMap((table) => table.entries)
    .filter((entry) => entry.groupId === selected.group && entry.stepId === selected.level);
  if (entries.length !== 1)
    return fail(
      entries.length ? "TABLE_ENTRY_AMBIGUOUS" : "TABLE_ENTRY_MISSING",
      "Für diesen Ausbildungszeitraum fehlt ein eindeutiger Tabellenwert.",
    );
  const workingTimes = rulePackage.rules.employmentWorkingTimeRules?.filter(
    (rule) =>
      rule.variantId === selected.variant &&
      rule.regionId === selected.region &&
      rule.validFrom <= date &&
      (rule.validTo === null || date <= rule.validTo),
  );
  if (workingTimes?.length !== 1)
    return fail(
      "WEEKLY_TIME_MISSING",
      "Für diesen Zeitraum fehlt eine eindeutige TVA-L-Vollzeitbasis.",
    );
  const fullTimeWeeklyMinutes = workingTimes[0].fullTimeWeeklyMinutes;
  if (weeklyMinutes > fullTimeWeeklyMinutes)
    return fail(
      "PROFILE_INVALID",
      "Die vereinbarte Ausbildungszeit liegt über der gewählten Vollzeitbasis. Bitte die bestätigte Konstellation prüfen; zusätzliche Stunden erhöhen nicht automatisch das Ausbildungsentgelt.",
    );
  return {
    ok: true,
    context: {
      kind: "tval-training",
      rulePackage,
      monthlyCents: entries[0].monthlyCents,
      weeklyMinutes,
      fullTimeWeeklyMinutes,
      categoryLabel: category.label,
      periodLabel: period.label,
      employerScope: selected.tvalEmployerScope ?? null,
      employmentCategory: selected.tvlEmploymentCategory ?? null,
      careAllowances: selected.tvalCareAllowances ?? null,
    },
  };
}
