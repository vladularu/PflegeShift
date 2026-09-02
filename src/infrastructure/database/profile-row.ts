import type {
  HolidayRegion,
  Industry,
  PayGroup,
  PayLevel,
  TariffRegion,
  TariffSector,
  UserProfile,
} from "@/domain/types";
import { defaultHolidayRegion } from "@/domain/employment-profile";
import { validateProfile } from "@/domain/validation";

export interface ProfileRow {
  federal_state: UserProfile["federalState"];
  holiday_region: HolidayRegion;
  weekly_minutes: number;
  time_zone: string;
  industry: Industry | null;
  manual_monthly_gross_cents: number | null;
  pay_group: PayGroup | null;
  pay_level: PayLevel | null;
  tariff_sector: TariffSector | null;
  tariff_region: TariffRegion;
  full_time_weekly_minutes: number | null;
  regular_rotating_night_work: number | null;
  sunday_holiday_work_eligible: number | null;
  all_employment_work_recorded: number | null;
  created_at: string;
  updated_at: string;
}

function nullableBoolean(value: number | null): boolean | null {
  return value === null ? null : value === 1;
}

export function mapProfileRow(row: ProfileRow): UserProfile {
  const holidayRegion =
    row.holiday_region === "UNKNOWN" && defaultHolidayRegion(row.federal_state) === "NONE"
      ? "NONE"
      : row.holiday_region;
  const tariff =
    row.pay_group !== null &&
    row.pay_level !== null &&
    row.tariff_sector !== null &&
    row.full_time_weekly_minutes !== null
      ? {
          payGroup: row.pay_group,
          payLevel: row.pay_level,
          sector: row.tariff_sector,
          tariffRegion: row.tariff_region,
          fullTimeWeeklyMinutes: row.full_time_weekly_minutes,
        }
      : null;
  const validated = validateProfile({
    federalState: row.federal_state,
    holidayRegion,
    weeklyMinutes: row.weekly_minutes,
    timeZone: row.time_zone,
    industry: row.industry,
    manualMonthlyGrossCents: row.manual_monthly_gross_cents,
    regularRotatingNightWork: nullableBoolean(row.regular_rotating_night_work),
    sundayHolidayWorkEligible: nullableBoolean(row.sunday_holiday_work_eligible),
    allEmploymentWorkRecorded: nullableBoolean(row.all_employment_work_recorded),
    tariff,
  });
  return Object.freeze({
    federalState: validated.federalState,
    holidayRegion: validated.holidayRegion ?? defaultHolidayRegion(row.federal_state),
    weeklyMinutes: validated.weeklyMinutes,
    timeZone: validated.timeZone,
    industry: validated.industry ?? null,
    manualMonthlyGrossCents: validated.manualMonthlyGrossCents ?? null,
    regularRotatingNightWork: validated.regularRotatingNightWork ?? null,
    sundayHolidayWorkEligible: validated.sundayHolidayWorkEligible ?? null,
    allEmploymentWorkRecorded: validated.allEmploymentWorkRecorded ?? null,
    tariff: validated.tariff ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}
