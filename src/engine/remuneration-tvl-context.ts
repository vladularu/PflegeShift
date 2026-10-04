import type { RemunerationSelection, TvlEmploymentCategory } from "@/domain/remuneration-profile";
import type { RemunerationIssue } from "@/domain/remuneration-result";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { resolveTariffSelection } from "@/rules/tariff-selection";
import { validateRulePackage } from "@/rules/validation";
import type { TvlCareAllowances } from "@/domain/tvl-care-allowances";

export interface TvlKrPayContext {
  readonly kind: "tvl-kr";
  readonly rulePackage: RuleTariffPackage;
  readonly monthlyCents: number;
  readonly weeklyMinutes: number;
  readonly fullTimeWeeklyMinutes: number;
  readonly groupId: string;
  readonly employmentCategory: TvlEmploymentCategory | null;
  readonly careAllowances?: TvlCareAllowances | null;
}

/** Resolve only the declared KR identity and dated basis; no TVöD or saved-hour fallback. */
export function resolveTvlKrPay(
  date: string,
  rulePackage: RuleTariffPackage,
  selected: Extract<RemunerationSelection, { kind: "tariff" }>,
  weeklyMinutes: number,
):
  | { readonly ok: true; readonly context: TvlKrPayContext }
  | { readonly ok: false; readonly issue: RemunerationIssue } {
  const fail = (code: RemunerationIssue["code"], message: string) => ({
    ok: false as const,
    issue: { code, message },
  });
  if (rulePackage.engineContractVersion !== 12 || !validateRulePackage(rulePackage).ok)
    return fail(
      "TARIFF_UNSUPPORTED",
      "Das TV-L/KR-Regelpaket ist unvollständig oder nicht unterstützt.",
    );
  const declared = resolveTariffSelection(rulePackage, selected.variant, selected.region);
  if (
    selected.packageId !== rulePackage.packageId ||
    !declared ||
    !/^KR(?:[5-9]|1[0-7])$/.test(selected.group) ||
    !/^[1-6]$/.test(selected.level)
  )
    return fail(
      "TABLE_SELECTION_INVALID",
      "Bitte TV-L/KR-Bereich, Tarifgebiet, Gruppe und Stufe ausdrücklich wählen.",
    );
  const entries = rulePackage.rules.payTables
    .filter((table) => table.id === rulePackage.rules.selector.payTableId)
    .flatMap((table) => table.entries)
    .filter(
      (entry) => entry.groupId === selected.group.toLowerCase() && entry.stepId === selected.level,
    );
  if (entries.length !== 1)
    return fail(
      entries.length ? "TABLE_ENTRY_AMBIGUOUS" : "TABLE_ENTRY_MISSING",
      "Für diese KR-Gruppe und Stufe fehlt ein eindeutiger Tabellenwert.",
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
      "Für diesen Zeitraum fehlt eine eindeutige TV-L-Vollzeitbasis.",
    );
  const fullTimeWeeklyMinutes = workingTimes[0].fullTimeWeeklyMinutes;
  if (weeklyMinutes > fullTimeWeeklyMinutes)
    return fail(
      "PROFILE_INVALID",
      "Die vereinbarten Wochenstunden liegen über der tariflichen Vollzeitbasis. Bitte den datierten Beschäftigungsumfang prüfen; Mehrstunden erhöhen nicht automatisch das Grundentgelt.",
    );
  return {
    ok: true,
    context: {
      kind: "tvl-kr",
      rulePackage,
      monthlyCents: entries[0].monthlyCents,
      weeklyMinutes,
      fullTimeWeeklyMinutes,
      groupId: selected.group.toLowerCase(),
      employmentCategory: selected.tvlEmploymentCategory ?? null,
      careAllowances: selected.tvlCareAllowances ?? null,
    },
  };
}
