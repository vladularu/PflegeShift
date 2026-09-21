import type { SQLiteDatabase } from "expo-sqlite";

import type { SaveProfileInput, UserProfile } from "@/domain/types";
import { defaultHolidayRegion } from "@/domain/employment-profile";
import { validateProfile } from "@/domain/validation";
import { mapProfileRow, type ProfileRow } from "@/infrastructure/database/profile-row";

export async function loadProfile(db: SQLiteDatabase): Promise<UserProfile | null> {
  const row = await db.getFirstAsync<ProfileRow>(
    `SELECT federal_state,holiday_region,weekly_minutes,time_zone,pay_group,pay_level,
      tariff_sector,tariff_region,full_time_weekly_minutes,industry,manual_monthly_gross_cents,
      regular_rotating_night_work,sunday_holiday_work_eligible,all_employment_work_recorded,
      display_name,employer_name,created_at,updated_at
     FROM user_profile WHERE id='singleton'`,
  );
  return row === null ? null : mapProfileRow(row);
}

export async function saveProfile(
  db: SQLiteDatabase,
  rawInput: SaveProfileInput,
): Promise<UserProfile> {
  const current = await loadProfile(db);
  const input = validateProfile({
    ...rawInput,
    displayName:
      rawInput.displayName === undefined ? (current?.displayName ?? null) : rawInput.displayName,
    employerName:
      rawInput.employerName === undefined ? (current?.employerName ?? null) : rawInput.employerName,
    industry: rawInput.industry === undefined ? (current?.industry ?? null) : rawInput.industry,
    manualMonthlyGrossCents:
      rawInput.manualMonthlyGrossCents === undefined
        ? (current?.manualMonthlyGrossCents ?? null)
        : rawInput.manualMonthlyGrossCents,
  });
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO user_profile(
       id,federal_state,holiday_region,weekly_minutes,time_zone,pay_group,pay_level,
       tariff_sector,tariff_region,full_time_weekly_minutes,industry,manual_monthly_gross_cents,
       regular_rotating_night_work,sunday_holiday_work_eligible,all_employment_work_recorded,
       display_name,employer_name,created_at,updated_at
     ) VALUES('singleton',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       federal_state=excluded.federal_state,
       holiday_region=excluded.holiday_region,
       weekly_minutes=excluded.weekly_minutes,
       time_zone=excluded.time_zone,
       pay_group=excluded.pay_group,
       pay_level=excluded.pay_level,
       tariff_sector=excluded.tariff_sector,
       tariff_region=excluded.tariff_region,
       full_time_weekly_minutes=excluded.full_time_weekly_minutes,
       industry=excluded.industry,
       display_name=excluded.display_name,
       employer_name=excluded.employer_name,
       manual_monthly_gross_cents=excluded.manual_monthly_gross_cents,
       regular_rotating_night_work=excluded.regular_rotating_night_work,
       sunday_holiday_work_eligible=excluded.sunday_holiday_work_eligible,
       all_employment_work_recorded=excluded.all_employment_work_recorded,
       updated_at=excluded.updated_at`,
    input.federalState,
    input.holidayRegion ?? defaultHolidayRegion(input.federalState),
    input.weeklyMinutes,
    input.timeZone,
    input.tariff?.payGroup ?? null,
    input.tariff?.payLevel ?? null,
    input.tariff?.sector ?? null,
    input.tariff?.tariffRegion ?? "OTHER",
    input.tariff?.fullTimeWeeklyMinutes ?? null,
    input.industry ?? null,
    input.manualMonthlyGrossCents ?? null,
    input.regularRotatingNightWork === null ? null : input.regularRotatingNightWork ? 1 : 0,
    input.sundayHolidayWorkEligible === null ? null : input.sundayHolidayWorkEligible ? 1 : 0,
    input.allEmploymentWorkRecorded === null ? null : input.allEmploymentWorkRecorded ? 1 : 0,
    input.displayName ?? null,
    input.employerName ?? null,
    now,
    now,
  );
  const profile = await loadProfile(db);
  if (profile === null) throw new Error("Profil konnte nicht gespeichert werden.");
  return profile;
}
