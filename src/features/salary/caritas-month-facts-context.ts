import { Temporal } from "@js-temporal/polyfill";
import {
  resolveRemunerationProfile,
  validateRemunerationProfileData,
  type DatedRemunerationProfile,
} from "@/domain/remuneration-profile";
import type { RuleResolver } from "@/rules/rule-resolver";
import { validateRulePackage } from "@/rules/validation";
import { resolveTariffSelection } from "@/rules/tariff-selection";

/** An input host only; this never authorizes a salary calculation or a DRAFT activation. */
export function caritasMonthFactsContext(
  month: string,
  profiles: readonly DatedRemunerationProfile[],
  resolver: RuleResolver,
) {
  try {
    const date = Temporal.PlainYearMonth.from(month);
    if (date.toString() !== month) return null;
    const firstDate = `${month}-01`;
    const lastDate = `${month}-${String(date.daysInMonth).padStart(2, "0")}`;
    const first = resolveRemunerationProfile(profiles, firstDate);
    const last = resolveRemunerationProfile(profiles, lastDate);
    if (
      first.status !== "dated" ||
      last.status !== "dated" ||
      first.profile !== last.profile ||
      first.profile.effectiveFrom === null
    )
      return null;
    const data = validateRemunerationProfileData(first.profile.data);
    const selection = data.selection;
    if (selection.kind !== "tariff" || !selection.packageId.startsWith("avr-caritas-p-"))
      return null;
    const start = resolver.resolveTariff(firstDate, selection.packageId);
    const end = resolver.resolveTariff(lastDate, selection.packageId);
    if (
      !start.ok ||
      !end.ok ||
      start.value.versionId !== end.value.versionId ||
      start.value.packageId !== end.value.packageId ||
      JSON.stringify(start.value) !== JSON.stringify(end.value)
    )
      return null;
    const checked = validateRulePackage(start.value);
    if (
      !checked.ok ||
      checked.value.kind !== "TARIFF" ||
      checked.value.packageId !== selection.packageId ||
      checked.value.engineContractVersion !== 14 ||
      checked.value.status !== "DRAFT"
    )
      return null;
    const declared = resolveTariffSelection(checked.value, selection.variant, selection.region);
    if (
      !declared?.groups
        .find((group) => group.id === selection.group.toLowerCase())
        ?.levels.includes(String(selection.level))
    )
      return null;
    return {
      profile: first.profile,
      profileEffectiveFrom: first.profile.effectiveFrom,
      ruleVersionId: checked.value.versionId,
      packageId: checked.value.packageId,
      bindingKey: JSON.stringify([month, first.profile, checked.value]),
    };
  } catch {
    return null;
  }
}
