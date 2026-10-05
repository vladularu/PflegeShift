import type { TvUkNursingGroup, TvUkPayLevel } from "@/domain/tvuk-nursing-tariff";
import { Temporal } from "@js-temporal/polyfill";
import type { TvlKrGroup, TvlKrUniversityRegion } from "@/domain/tvl-kr-tariff";
import { getTvlKrUniversityFullTimeMinutes } from "@/engine/simple-tvl-kr-pay";
import { defaultTariffRegion, tariffFullTimeWeeklyMinutes } from "@/domain/employment-profile";
import type {
  FederalState,
  HolidayRegion,
  Industry,
  PayGroup,
  PayLevel,
  VkaETariff,
  TariffRegion,
  TariffSector,
  UserProfile,
} from "@/domain/types";

export type EvidenceFormValue = "UNKNOWN" | "YES" | "NO";
export type IndustryFormValue = Industry | "UNKNOWN";
export type SalaryMode =
  "UNSET" | "TVOED_P" | "TVOED_E" | "TVL_KR" | "TVUK_NURSING" | "TVAOED_PFLEGE" | "MANUAL";

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
  readonly trainingYear: 1 | 2 | 3 | "UNSET";
  readonly payGroup: PayGroup;
  readonly tvUkPayGroup: TvUkNursingGroup;
  readonly tvUkPayLevel: TvUkPayLevel;
  readonly krPayGroup: TvlKrGroup;
  readonly tvlUniversityRegion: TvlKrUniversityRegion;
  readonly ePayGroup: VkaETariff["payGroup"];
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
    salaryMode: profile.tvUkNursingTariff
      ? "TVUK_NURSING"
      : profile.tvlKrTariff
        ? "TVL_KR"
        : profile.vkaETariff
          ? "TVOED_E"
          : profile.nursingTrainingTariff
            ? "TVAOED_PFLEGE"
            : profile.manualMonthlyGrossCents != null
              ? "MANUAL"
              : profile.tariff !== null
                ? "TVOED_P"
                : "UNSET",
    manualMonthlyGross: formatManualMonthlyGross(profile.manualMonthlyGrossCents),
    regularRotatingNightWork: evidenceFormValue(profile.regularRotatingNightWork),
    sundayHolidayWorkEligible: evidenceFormValue(profile.sundayHolidayWorkEligible),
    allEmploymentWorkRecorded: evidenceFormValue(profile.allEmploymentWorkRecorded),
    trainingYear: profile.nursingTrainingTariff?.trainingYear ?? "UNSET",
    payGroup: profile.tariff?.payGroup ?? "P8",
    tvUkPayGroup: profile.tvUkNursingTariff?.payGroup ?? "PUK8",
    tvUkPayLevel: profile.tvUkNursingTariff?.payLevel ?? 4,
    krPayGroup: profile.tvlKrTariff?.payGroup ?? "KR8",
    tvlUniversityRegion:
      profile.tvlKrTariff?.universityRegion ??
      (["BB", "MV", "SN", "ST", "TH"].includes(profile.federalState) ? "EAST" : "WEST"),
    ePayGroup: profile.vkaETariff?.payGroup ?? "E9b",
    payLevel:
      profile.tvlKrTariff?.payLevel ??
      profile.vkaETariff?.payLevel ??
      profile.tariff?.payLevel ??
      4,
    sector:
      profile.vkaETariff?.sector ??
      profile.nursingTrainingTariff?.sector ??
      profile.tariff?.sector ??
      "BT_K",
    tariffRegion:
      profile.vkaETariff?.tariffRegion ??
      profile.nursingTrainingTariff?.tariffRegion ??
      profile.tariff?.tariffRegion ??
      defaultTariffRegion(profile.federalState),
    fullTimeHours: formatHours(
      (profile.tvUkNursingTariff
        ? 2310
        : profile.tvlKrTariff
          ? getTvlKrUniversityFullTimeMinutes(
              Temporal.Now.plainDateISO(profile.timeZone).toString(),
              profile.tvlKrTariff.universityRegion,
            )
          : null) ??
        profile.tariff?.fullTimeWeeklyMinutes ??
        tariffFullTimeWeeklyMinutes("BT_K", defaultTariffRegion(profile.federalState)),
    ),
  });
}
