import { defaultTariffRegion, tariffFullTimeWeeklyMinutes } from "@/domain/employment-profile";
import type {
  FederalState,
  HolidayRegion,
  PayGroup,
  PayLevel,
  TariffRegion,
  TariffSector,
  UserProfile,
} from "@/domain/types";

export type EvidenceFormValue = "UNKNOWN" | "YES" | "NO";

export interface SettingsFormValues {
  readonly federalState: FederalState;
  readonly holidayRegion: HolidayRegion;
  readonly weeklyHours: string;
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

export function settingsFormValues(profile: UserProfile): SettingsFormValues {
  return Object.freeze({
    federalState: profile.federalState,
    holidayRegion: profile.holidayRegion,
    weeklyHours: formatHours(profile.weeklyMinutes),
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
