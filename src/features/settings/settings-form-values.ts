import type {
  FederalState,
  PayGroup,
  PayLevel,
  TariffSector,
  UserProfile,
} from "@/domain/types";

export interface SettingsFormValues {
  readonly federalState: FederalState;
  readonly weeklyHours: string;
  readonly payGroup: PayGroup;
  readonly payLevel: PayLevel;
  readonly sector: TariffSector;
  readonly fullTimeHours: string;
}

function formatHours(minutes: number): string {
  return String(minutes / 60).replace(".", ",");
}

export function settingsFormValues(profile: UserProfile): SettingsFormValues {
  return Object.freeze({
    federalState: profile.federalState,
    weeklyHours: formatHours(profile.weeklyMinutes),
    payGroup: profile.tariff?.payGroup ?? "P8",
    payLevel: profile.tariff?.payLevel ?? 4,
    sector: profile.tariff?.sector ?? "BT_K",
    fullTimeHours: profile.tariff
      ? formatHours(profile.tariff.fullTimeWeeklyMinutes)
      : profile.federalState === "BW" ? "39" : "38,5",
  });
}
