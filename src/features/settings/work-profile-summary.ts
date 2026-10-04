import { FEDERAL_STATE_LABELS, type UserProfile } from "@/domain/types";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import {
  resolveRemunerationProfile,
  validateRemunerationProfileData,
} from "@/domain/remuneration-profile";
import type { RuleResolver } from "@/rules/rule-resolver";
import { remunerationTariffOptions } from "./remuneration-tariff-options";

export function datedSalarySummary(
  profiles: readonly DatedRemunerationProfile[],
  date: string,
  resolver: RuleResolver,
): { readonly label: string; readonly tariff: boolean } {
  try {
    const resolved = resolveRemunerationProfile(profiles, date);
    if (resolved.status === "missing")
      return { label: "Gehalt noch nicht eingerichtet", tariff: false };
    if (resolved.status === "unknown-effective-date")
      return { label: "Vergütung übernommen · Beginn noch bestätigen", tariff: false };
    const selection = validateRemunerationProfileData(resolved.profile.data).selection;
    const euro = (cents: number) =>
      (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
    if (selection.kind === "unconfigured")
      return { label: "Gehalt noch nicht eingerichtet", tariff: false };
    if (selection.kind === "own-monthly")
      return {
        label: "Eigenes Monatsentgelt · " + euro(selection.monthlyGrossCents),
        tariff: false,
      };
    if (selection.kind === "own-configured") {
      const base = selection.configuration.base;
      return {
        label:
          base.kind === "monthly"
            ? "Eigenes Monatsentgelt · " + euro(base.personalCents)
            : "Eigener Stundenlohn · " + euro(base.centsPerHour),
        tariff: false,
      };
    }
    const options = remunerationTariffOptions(date, resolver);
    const option = options.available.find((item) => item.id === selection.packageId);
    const group = option?.groups.find((item) => item.id === selection.group);
    const variant = option?.variants.find((item) => item.id === selection.variant);
    const region = variant?.regions.find((item) => item.id === selection.region);
    const combination =
      option !== undefined &&
      group?.levels.includes(selection.level) === true &&
      region !== undefined;
    const label = combination ? option.label : "Gespeicherter Tarif · Berechnungsgrundlage offen";
    const period = group?.levelLabels?.[selection.level] ?? "Stufe " + selection.level;
    return {
      label: [
        label,
        group?.label ?? selection.group.toUpperCase(),
        period,
        variant?.label,
        region?.label,
      ]
        .filter(Boolean)
        .join(" · "),
      tariff: combination,
    };
  } catch {
    return { label: "Vergütungsstand nicht verfügbar", tariff: false };
  }
}

export function profileWorkLabel(profile: UserProfile): string {
  return `${(profile.weeklyMinutes / 60).toLocaleString("de-DE")} Std./Woche · ${FEDERAL_STATE_LABELS[profile.federalState]}${profile.holidayRegion === "UNKNOWN" ? " · Feiertagsregion offen" : ""}`;
}
