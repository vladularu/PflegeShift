import type { SQLiteDatabase } from "expo-sqlite";

import type {
  PayGroup,
  PayLevel,
  SaveProfileInput,
  TariffSector,
  UserProfile,
} from "@/domain/types";
import { validateProfile } from "@/domain/validation";

interface ProfileRow {
  federal_state: UserProfile["federalState"];
  weekly_minutes: number;
  time_zone: string;
  pay_group: PayGroup | null;
  pay_level: PayLevel | null;
  tariff_sector: TariffSector | null;
  full_time_weekly_minutes: number | null;
  created_at: string;
  updated_at: string;
}

function mapProfile(row: ProfileRow): UserProfile {
  const tariff =
    row.pay_group !== null &&
    row.pay_level !== null &&
    row.tariff_sector !== null &&
    row.full_time_weekly_minutes !== null
      ? {
          payGroup: row.pay_group as NonNullable<UserProfile["tariff"]>["payGroup"],
          payLevel: row.pay_level as NonNullable<UserProfile["tariff"]>["payLevel"],
          sector: row.tariff_sector as NonNullable<UserProfile["tariff"]>["sector"],
          fullTimeWeeklyMinutes: row.full_time_weekly_minutes,
        }
      : null;
  const validated = validateProfile({
    federalState: row.federal_state,
    weeklyMinutes: row.weekly_minutes,
    timeZone: row.time_zone,
    tariff,
  });
  return Object.freeze({
    federalState: validated.federalState,
    weeklyMinutes: validated.weeklyMinutes,
    timeZone: validated.timeZone,
    tariff: validated.tariff ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export async function loadProfile(db: SQLiteDatabase): Promise<UserProfile | null> {
  const row = await db.getFirstAsync<ProfileRow>(
    `SELECT federal_state,weekly_minutes,time_zone,pay_group,pay_level,
      tariff_sector,full_time_weekly_minutes,created_at,updated_at
     FROM user_profile WHERE id='singleton'`,
  );
  return row === null ? null : mapProfile(row);
}

export async function saveProfile(
  db: SQLiteDatabase,
  rawInput: SaveProfileInput,
): Promise<UserProfile> {
  const input = validateProfile(rawInput);
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO user_profile(
       id,federal_state,weekly_minutes,time_zone,pay_group,pay_level,
       tariff_sector,full_time_weekly_minutes,created_at,updated_at
     ) VALUES('singleton',?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       federal_state=excluded.federal_state,
       weekly_minutes=excluded.weekly_minutes,
       time_zone=excluded.time_zone,
       pay_group=excluded.pay_group,
       pay_level=excluded.pay_level,
       tariff_sector=excluded.tariff_sector,
       full_time_weekly_minutes=excluded.full_time_weekly_minutes,
       updated_at=excluded.updated_at`,
    input.federalState,
    input.weeklyMinutes,
    input.timeZone,
    input.tariff?.payGroup ?? null,
    input.tariff?.payLevel ?? null,
    input.tariff?.sector ?? null,
    input.tariff?.fullTimeWeeklyMinutes ?? null,
    now,
    now,
  );
  const profile = await loadProfile(db);
  if (profile === null) throw new Error("Profil konnte nicht gespeichert werden.");
  return profile;
}
