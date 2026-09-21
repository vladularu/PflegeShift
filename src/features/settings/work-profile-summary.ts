import { FEDERAL_STATE_LABELS, TARIFF_REGION_LABELS, type UserProfile } from "@/domain/types";
export function profileSalaryLabel(profile: UserProfile): string {
  if (profile.tariff)
    return `TVöD-P · ${profile.tariff.payGroup} · Stufe ${profile.tariff.payLevel} · ${profile.tariff.sector === "BT_K" ? "BT-K" : "BT-B"} · ${TARIFF_REGION_LABELS[profile.tariff.tariffRegion]}`;
  if (profile.manualMonthlyGrossCents != null)
    return `Manuell · ${(profile.manualMonthlyGrossCents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}`;
  return "Gehalt noch nicht eingerichtet";
}
export function profileWorkLabel(profile: UserProfile): string {
  return `${(profile.weeklyMinutes / 60).toLocaleString("de-DE")} Std./Woche · ${FEDERAL_STATE_LABELS[profile.federalState]}${profile.holidayRegion === "UNKNOWN" ? " · Feiertagsregion offen" : ""}`;
}
