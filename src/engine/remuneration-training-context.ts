import type {
  RemunerationProfileData,
  TrainingSpecialDutyAllowance,
} from "@/domain/remuneration-profile";
import type { RemunerationIssue } from "@/domain/remuneration-result";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { resolveTariffSelection } from "@/rules/tariff-selection";
import { trainingPayIssues } from "@/rules/training-pay-validation";
import { annualPaymentRuleIssues } from "@/rules/annual-payment-rule-validation";

export interface TrainingPayContext {
  readonly kind: "training-tariff";
  readonly rulePackage: RuleTariffPackage;
  readonly monthlyCents: number;
  readonly weeklyMinutes: number;
  readonly fullTimeWeeklyMinutes: number;
  readonly categoryLabel: string;
  readonly trainingYear: number;
  readonly sector: "BT_K" | "BT_B";
  readonly tariffRegion: "OTHER" | "KAV_BW";
  readonly specialDutyAllowance: TrainingSpecialDutyAllowance | null;
}

/** Training categories and years are not employee pay groups or employee steps. */
export function resolveTrainingPay(
  rulePackage: RuleTariffPackage,
  selected: Extract<RemunerationProfileData["selection"], { kind: "tariff" }>,
  weeklyMinutes: number,
): { ok: true; context: TrainingPayContext } | { ok: false; issue: RemunerationIssue } {
  const fail = (code: RemunerationIssue["code"], message: string) =>
    ({ ok: false, issue: { code, message } }) as const;
  const declared = resolveTariffSelection(rulePackage, selected.variant, selected.region);
  const training = rulePackage.rules.trainingPay;
  if (
    ![10, 11].includes(rulePackage.engineContractVersion) ||
    rulePackage.packageId !== "tvaoed-pflege-vka" ||
    declared?.familyId !== "tvaoed-pflege" ||
    declared.engineId !== "tvaoed-pflege-v1" ||
    declared.employmentKind !== "APPRENTICE" ||
    declared.capabilities.basePay !== "SUPPORTED" ||
    !training ||
    trainingPayIssues(rulePackage).length > 0 ||
    annualPaymentRuleIssues(rulePackage).length > 0
  )
    return fail(
      "TARIFF_UNSUPPORTED",
      "Für dieses Ausbildungsregelwerk fehlt eine eindeutige Berechnungsanbindung.",
    );
  if (
    rulePackage.rules.selector.agreementId !== "tvaoed-vka" ||
    !["BT_K", "BT_B"].includes(selected.variant) ||
    !["OTHER", "KAV_BW"].includes(selected.region) ||
    declared.variant.specialPartId !== (selected.variant === "BT_K" ? "bt-k" : "bt-b")
  )
    return fail(
      "TABLE_SELECTION_INVALID",
      "Ausbildungsbereich oder Tarifregion passen nicht zum Regelwerk.",
    );
  const category = training.categories.find((item) => item.groupId === selected.group);
  if (
    !category ||
    !/^[1-6]$/.test(selected.level) ||
    !category.years.includes(Number(selected.level))
  )
    return fail(
      "TABLE_SELECTION_INVALID",
      "Bitte Ausbildungskategorie und vergütetes Ausbildungsjahr ausdrücklich wählen.",
    );
  const entries = rulePackage.rules.payTables
    .filter((table) => table.id === rulePackage.rules.selector.payTableId)
    .flatMap((table) => table.entries)
    .filter((entry) => entry.groupId === selected.group && entry.stepId === "s" + selected.level);
  if (entries.length !== 1)
    return fail(
      entries.length ? "TABLE_ENTRY_AMBIGUOUS" : "TABLE_ENTRY_MISSING",
      "Für dieses Ausbildungsjahr fehlt ein eindeutiges Ausbildungsentgelt.",
    );
  const weekly = rulePackage.rules.weeklyWorkingTimeRules?.filter(
    (rule) =>
      rule.sectors.includes(selected.variant as "BT_K" | "BT_B") &&
      rule.tariffRegions.includes(selected.region as "OTHER" | "KAV_BW"),
  );
  if (weekly?.length !== 1)
    return fail(
      "WEEKLY_TIME_MISSING",
      "Für diesen Ausbildungsbereich fehlt die tarifliche Vollzeitbasis.",
    );
  if (weeklyMinutes > weekly[0].fullTimeWeeklyMinutes)
    return fail(
      "PROFILE_INVALID",
      "Ausbildungsstunden über der Vollzeitbasis benötigen eine gesonderte Klärung; sie erhöhen nicht automatisch das Ausbildungsentgelt.",
    );
  return {
    ok: true,
    context: {
      kind: "training-tariff",
      rulePackage,
      monthlyCents: entries[0].monthlyCents,
      weeklyMinutes,
      fullTimeWeeklyMinutes: weekly[0].fullTimeWeeklyMinutes,
      categoryLabel: category.label,
      trainingYear: Number(selected.level),
      sector: selected.variant as "BT_K" | "BT_B",
      tariffRegion: selected.region as "OTHER" | "KAV_BW",
      specialDutyAllowance: selected.specialDutyAllowance ?? null,
    },
  };
}
