import { defaultTariffRegion, tariffFullTimeWeeklyMinutes } from "@/domain/employment-profile";
import type {
  FederalState,
  HolidayRegion,
  Industry,
  PayGroup,
  PayLevel,
  TariffRegion,
  TariffSector,
  UserProfile,
} from "@/domain/types";

export type EvidenceFormValue = "UNKNOWN" | "YES" | "NO";
export type IndustryFormValue = Industry | "UNKNOWN";
export type SalaryMode = "UNSET" | "TVOED_P" | "MANUAL";

export interface SettingsFormValues {
  readonly federalState: FederalState;
  readonly holidayRegion: HolidayRegion;
  readonly weeklyHours: string;
  readonly industry: IndustryFormValue;
  readonly salaryMode: SalaryMode;
  readonly manualMonthlyGross: string;
  readonly regularRotatingNightWork: EvidenceFormValue;
  readonly sundayHolidayWorkEligible: EvidenceFormValue;
  readonly allEmploymentWorkRecorded: EvidenceFormValue;
  readonly payGroup: PayGroup;
  readonly payLevel: PayLevel;
  readonly sector: TariffSector;
  readonly tariffRegion: TariffRegion;
  readonly fullTimeHours: string;
}

export function evidenceFormValue(value: boolean | null): EvidenceFormValue {
  return value === null ? "UNKNOWN" : value ? "YES" : "NO";
}

export function evidenceBoolean(value: EvidenceFormValue): boolean | null {
  return value === "UNKNOWN" ? null : value === "YES";
}

function formatHours(minutes: number): string {
  return String(minutes / 60).replace(".", ",");
}

function formatManualMonthlyGross(cents: number | null | undefined): string {
  return cents == null ? "" : (cents / 100).toFixed(2).replace(".", ",");
}

export function parseManualMonthlyGrossCents(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+(?:[,.]\d{1,2})?$/.test(trimmed)) return null;
  const euros = Number(trimmed.replace(",", "."));
  const cents = Math.round(euros * 100);
  return Number.isSafeInteger(cents) && cents >= 1 && cents <= 10_000_000 ? cents : null;
}

export function manualMonthlyGrossFieldError(value: string): string | null {
  return parseManualMonthlyGrossCents(value) === null
    ? "Bitte ein Monatsbrutto zwischen 0,01 € und 100.000 € angeben."
    : null;
}

export function settingsFormValues(profile: UserProfile): SettingsFormValues {
  return Object.freeze({
    federalState: profile.federalState,
    holidayRegion: profile.holidayRegion,
    weeklyHours: formatHours(profile.weeklyMinutes),
    industry: profile.industry ?? "UNKNOWN",
    salaryMode:
      profile.manualMonthlyGrossCents != null
        ? "MANUAL"
        : profile.tariff !== null
          ? "TVOED_P"
          : "UNSET",
    manualMonthlyGross: formatManualMonthlyGross(profile.manualMonthlyGrossCents),
    regularRotatingNightWork: evidenceFormValue(profile.regularRotatingNightWork),
    sundayHolidayWorkEligible: evidenceFormValue(profile.sundayHolidayWorkEligible),
    allEmploymentWorkRecorded: evidenceFormValue(profile.allEmploymentWorkRecorded),
    payGroup: profile.tariff?.payGroup ?? "P8",
    payLevel: profile.tariff?.payLevel ?? 4,
    sector: profile.tariff?.sector ?? "BT_K",
    tariffRegion: profile.tariff?.tariffRegion ?? defaultTariffRegion(profile.federalState),
    fullTimeHours: formatHours(
      profile.tariff?.fullTimeWeeklyMinutes ??
        tariffFullTimeWeeklyMinutes("BT_K", defaultTariffRegion(profile.federalState)),
    ),
  });
}
