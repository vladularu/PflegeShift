import { Temporal } from "@js-temporal/polyfill";
import {
  resolveRemunerationProfile,
  validateRemunerationProfileData,
  type DatedRemunerationProfile,
  type RemunerationProfileData,
} from "@/domain/remuneration-profile";
import type { RemunerationIssue, RemunerationSource } from "@/domain/remuneration-result";
import { TARIFF_REGIONS, type TariffRegion } from "@/domain/types";
import { bundledRuleResolver, type RuleResolver } from "@/rules/rule-resolver";
import { LEGACY_RULE_PACKAGE_IDS } from "@/rules/bundled-rules";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { resolveTariffSelection } from "@/rules/tariff-selection";
import { annualPaymentRuleIssues } from "@/rules/annual-payment-rule-validation";
import type { OwnRemunerationConfiguration } from "@/domain/own-remuneration";

import { resolveTvlKrPay, type TvlKrPayContext } from "./remuneration-tvl-context";

interface ContextBase {
  readonly profile: DatedRemunerationProfile | null;
  readonly source: RemunerationSource;
}
export type RemunerationContext = ContextBase &
  (
    | TvlKrPayContext
    | { readonly kind: "unavailable"; readonly issue: RemunerationIssue }
    | {
        readonly kind: "own-configured";
        readonly configuration: OwnRemunerationConfiguration;
        readonly weeklyMinutes: number;
      }
    | {
        readonly kind: "own-monthly";
        readonly monthlyCents: number;
        readonly weeklyMinutes: number;
      }
    | {
        readonly kind: "tariff";
        readonly rulePackage: RuleTariffPackage;
        readonly monthlyCents: number;
        readonly weeklyMinutes: number;
        readonly fullTimeWeeklyMinutes: number;
      }
  );
export interface RemunerationPeriod {
  readonly from: string;
  readonly through: string;
  readonly context: RemunerationContext;
}

function sourceFor(
  profile: DatedRemunerationProfile | null,
  rulePackage?: RuleTariffPackage,
): RemunerationSource {
  return {
    kind: rulePackage ? "tariff" : "profile",
    profileEffectiveFrom: profile?.effectiveFrom ?? null,
    profileRevision: profile?.revision ?? null,
    requestedPackageId:
      profile?.data?.selection?.kind === "tariff" ? profile.data.selection.packageId : null,
    packageId: rulePackage?.packageId ?? null,
    versionId: rulePackage?.versionId ?? null,
    packageValidFrom: rulePackage?.validFrom ?? null,
    packageValidTo: rulePackage?.validTo ?? null,
    references:
      rulePackage?.sources.map(({ id, title, url, section }) => ({ id, title, url, section })) ??
      [],
  };
}

function unavailable(
  profile: DatedRemunerationProfile | null,
  code: RemunerationIssue["code"],
  message: string,
  rulePackage?: RuleTariffPackage,
): RemunerationContext {
  return {
    kind: "unavailable",
    profile,
    source: sourceFor(profile, rulePackage),
    issue: { code, message },
  };
}

/** Resolve the requested identity first; only the embedded legacy table has a named compatibility mapping. */
export function resolveRemunerationContext(
  date: string,
  history: readonly DatedRemunerationProfile[],
  resolver: RuleResolver = bundledRuleResolver,
): RemunerationContext {
  const resolved = resolveRemunerationProfile(history, date);
  const profile = resolved.profile;
  if (profile === null)
    return unavailable(null, "PROFILE_MISSING", "Für diesen Zeitraum fehlt ein Vergütungsstand.");
  if (resolved.status === "unknown-effective-date")
    return unavailable(
      profile,
      "EFFECTIVE_DATE_UNKNOWN",
      "Der Gültigkeitsbeginn der übernommenen Vergütung ist noch nicht bestätigt.",
    );
  let data: RemunerationProfileData;
  try {
    data = validateRemunerationProfileData(profile.data);
  } catch {
    return unavailable(
      profile,
      "PROFILE_INVALID",
      "Dieser Vergütungsstand wird noch nicht unterstützt.",
    );
  }
  const selection = data.selection;
  if (selection.kind === "own-configured")
    return {
      kind: "own-configured",
      profile,
      source: sourceFor(profile),
      configuration: selection.configuration,
      weeklyMinutes: data.weeklyMinutes,
    };
  if (selection.kind === "unconfigured")
    return unavailable(
      profile,
      "REMUNERATION_UNCONFIGURED",
      "Die Vergütung ist für diesen Zeitraum nicht eingerichtet.",
    );
  if (selection.kind === "own-monthly")
    return {
      kind: "own-monthly",
      profile,
      source: sourceFor(profile),
      monthlyCents: selection.monthlyGrossCents,
      weeklyMinutes: data.weeklyMinutes,
    };
  const packageId =
    resolver === bundledRuleResolver && selection.packageId === "tvoed-vka-bt-k"
      ? LEGACY_RULE_PACKAGE_IDS.tariff
      : selection.packageId;
  const ruleResolution = resolver.resolveTariff(date, packageId);
  if (!ruleResolution.ok)
    return unavailable(
      profile,
      ruleResolution.error.code === "RULE_PACKAGE_AMBIGUOUS"
        ? "RULE_PACKAGE_AMBIGUOUS"
        : "RULE_PACKAGE_NOT_FOUND",
      "Das ausgewählte Tarifregelwerk ist für diesen Zeitraum nicht eindeutig verfügbar.",
    );
  const rulePackage = ruleResolution.value;
  if (
    rulePackage.packageId !== packageId ||
    rulePackage.validFrom > date ||
    (rulePackage.validTo !== null && rulePackage.validTo < date)
  )
    return unavailable(
      profile,
      "RULE_PACKAGE_NOT_FOUND",
      "Das Tarifregelwerk passt nicht zur Auswahl oder zum Zeitraum.",
      rulePackage,
    );
  if (rulePackage.engineContractVersion === 12) {
    const tvl = resolveTvlKrPay(date, rulePackage, selection, data.weeklyMinutes);
    return tvl.ok
      ? { ...tvl.context, profile, source: sourceFor(profile, rulePackage) }
      : unavailable(profile, tvl.issue.code, tvl.issue.message, rulePackage);
  }
  // Additional tariff families receive their own adapter; matching table shapes do not establish support.
  if (!["tvoed-vka-bt-k", LEGACY_RULE_PACKAGE_IDS.tariff].includes(selection.packageId))
    return unavailable(
      profile,
      "TARIFF_UNSUPPORTED",
      "Für diesen Tarif fehlt noch die geprüfte Berechnungsanbindung.",
      rulePackage,
    );
  if (![1, 2, 3, 11].includes(rulePackage.engineContractVersion))
    return unavailable(
      profile,
      "TARIFF_UNSUPPORTED",
      "Für diesen Tarifvertrag fehlt noch die geprüfte Berechnungsanbindung.",
      rulePackage,
    );
  if (rulePackage.engineContractVersion === 11 && annualPaymentRuleIssues(rulePackage).length > 0)
    return unavailable(
      profile,
      "TARIFF_UNSUPPORTED",
      "Die Jahresregeln des Tarifpakets sind unvollständig oder widersprüchlich.",
      rulePackage,
    );
  if (rulePackage.rules.selection !== undefined) {
    const declared = resolveTariffSelection(rulePackage, selection.variant, selection.region);
    if (declared === null)
      return unavailable(
        profile,
        "TABLE_SELECTION_INVALID",
        "Die Auswahl ist in diesem Tarifpaket nicht eindeutig hinterlegt.",
        rulePackage,
      );
    if (
      declared.familyId !== "tvoed-p" ||
      declared.engineId !== "tvoed-p-v3" ||
      declared.employmentKind !== "EMPLOYEE" ||
      declared.capabilities.basePay !== "SUPPORTED" ||
      declared.capabilities.timePremiums !== "SUPPORTED" ||
      declared.capabilities.allowances !== "SUPPORTED" ||
      declared.capabilities.overtime !== "SUPPORTED" ||
      declared.capabilities.annualPayment !==
        (rulePackage.engineContractVersion === 11 ? "SUPPORTED" : "UNSUPPORTED")
    )
      return unavailable(
        profile,
        "TARIFF_UNSUPPORTED",
        "Die angegebenen Tarifkomponenten benötigen eine andere Berechnungsanbindung.",
        rulePackage,
      );
    if (declared.variant.specialPartId !== (selection.variant === "BT_K" ? "bt-k" : "bt-b"))
      return unavailable(
        profile,
        "TABLE_SELECTION_INVALID",
        "Die Tarifvariante passt nicht zur gewählten Berechnung.",
        rulePackage,
      );
  }
  if (
    !/^P[1-9]\d*$/u.test(selection.group) ||
    !TARIFF_REGIONS.includes(selection.region as TariffRegion) ||
    !["BT_K", "BT_B"].includes(selection.variant) ||
    !/^[1-9]\d*$/u.test(selection.level)
  )
    return unavailable(
      profile,
      "TABLE_SELECTION_INVALID",
      "Tarifbereich, Region, Gruppe oder Stufe sind nicht unterstützt.",
      rulePackage,
    );
  const selector = rulePackage.rules.selector;
  const specialParts =
    "specialPartIds" in selector ? selector.specialPartIds : [selector.specialPartId];
  const selectedPart = selection.variant === "BT_K" ? "bt-k" : "bt-b";
  const legacyPart =
    rulePackage.packageId === LEGACY_RULE_PACKAGE_IDS.tariff && specialParts.includes("bt-p");
  if (selector.agreementId !== "tvoed-vka" || (!specialParts.includes(selectedPart) && !legacyPart))
    return unavailable(
      profile,
      "TABLE_SELECTION_INVALID",
      "Das Tarifpaket gilt nicht für den gewählten Tarifbereich.",
      rulePackage,
    );
  const tables = rulePackage.rules.payTables.filter(
    (table) => table.id === rulePackage.rules.selector.payTableId,
  );
  if (tables.length !== 1)
    return unavailable(
      profile,
      "TABLE_SELECTION_INVALID",
      "Die Entgelttabelle ist nicht eindeutig ausgewählt.",
      rulePackage,
    );
  const matches = tables[0].entries.filter(
    (entry) =>
      entry.groupId === selection.group.toLowerCase() && entry.stepId === "s" + selection.level,
  );
  if (matches.length !== 1)
    return unavailable(
      profile,
      matches.length === 0 ? "TABLE_ENTRY_MISSING" : "TABLE_ENTRY_AMBIGUOUS",
      "Für die gewählte Gruppe und Stufe fehlt ein eindeutiger Tabellenwert.",
      rulePackage,
    );
  const weeklyRules = rulePackage.rules.weeklyWorkingTimeRules;
  const weeklyMatches = weeklyRules?.filter(
    (rule) =>
      rule.sectors.includes(selection.variant as "BT_K" | "BT_B") &&
      rule.tariffRegions.includes(selection.region as TariffRegion),
  );
  if (weeklyMatches && weeklyMatches.length !== 1)
    return unavailable(
      profile,
      "WEEKLY_TIME_MISSING",
      "Für Tarifbereich und Region fehlt eine eindeutige Vollzeit-Arbeitszeit.",
      rulePackage,
    );
  const fullTimeWeeklyMinutes =
    weeklyMatches?.[0].fullTimeWeeklyMinutes ?? selection.fullTimeWeeklyMinutes;
  return {
    kind: "tariff",
    profile,
    source: sourceFor(profile, rulePackage),
    rulePackage,
    monthlyCents: matches[0].monthlyCents,
    weeklyMinutes: data.weeklyMinutes,
    fullTimeWeeklyMinutes,
  };
}

export function remunerationMonthStart(month: string): Temporal.PlainDate {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/u.test(month) || month < "1900-01")
    throw new Error("Ungültiger Vergütungsmonat.");
  return Temporal.PlainDate.from(month + "-01");
}

function sameContext(left: RemunerationContext, right: RemunerationContext): boolean {
  if (left.profile !== right.profile || left.kind !== right.kind) return false;
  if (left.kind === "unavailable" && right.kind === "unavailable")
    return (
      left.issue.code === right.issue.code &&
      left.source.packageId === right.source.packageId &&
      left.source.versionId === right.source.versionId
    );
  if (left.kind === "tariff" && right.kind === "tariff")
    return left.rulePackage === right.rulePackage;
  if (left.kind === "tvl-kr" && right.kind === "tvl-kr")
    return (
      left.rulePackage === right.rulePackage &&
      left.monthlyCents === right.monthlyCents &&
      left.fullTimeWeeklyMinutes === right.fullTimeWeeklyMinutes
    );
  return (
    (left.kind === "own-monthly" && right.kind === "own-monthly") ||
    (left.kind === "own-configured" && right.kind === "own-configured")
  );
}

/** Inclusive, non-overlapping periods cover every day, including missing-rule intervals. */
export function resolveRemunerationMonth(
  month: string,
  history: readonly DatedRemunerationProfile[],
  resolver: RuleResolver = bundledRuleResolver,
): readonly RemunerationPeriod[] {
  const first = remunerationMonthStart(month);
  const periods: RemunerationPeriod[] = [];
  for (let offset = 0; offset < first.daysInMonth; offset += 1) {
    const date = first.add({ days: offset }).toString();
    const context = resolveRemunerationContext(date, history, resolver);
    const previous = periods[periods.length - 1];
    if (previous && sameContext(previous.context, context))
      periods[periods.length - 1] = { ...previous, through: date };
    else periods.push({ from: date, through: date, context });
  }
  return periods;
}
