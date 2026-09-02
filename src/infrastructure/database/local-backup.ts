import canonicalize from "canonicalize";
import type { SQLiteDatabase } from "expo-sqlite";

import { USER_DATA_PREFERENCE_KEYS } from "@/infrastructure/database/preferences-repository";
import { withImmediateTransaction } from "@/infrastructure/database/transaction";

export const LOCAL_BACKUP_FORMAT = "lunashift-local-backup";
export const LOCAL_BACKUP_VERSION = 1;

type BackupScalar = string | number | null;
type BackupRow = Readonly<Record<string, BackupScalar>>;

export interface LocalBackupSnapshot {
  readonly databaseSchemaVersion: number;
  readonly profile: BackupRow | null;
  readonly templates: readonly BackupRow[];
  readonly shifts: readonly BackupRow[];
  readonly appointments: readonly BackupRow[];
  readonly monthlyTariffDecisions: readonly BackupRow[];
  readonly preferences: readonly BackupRow[];
}

interface UnsignedLocalBackupDocument {
  readonly format: typeof LOCAL_BACKUP_FORMAT;
  readonly version: typeof LOCAL_BACKUP_VERSION;
  readonly createdAt: string;
  readonly appVersion: string | null;
  readonly databaseSchemaVersion: number;
  readonly data: {
    readonly profile: BackupRow | null;
    readonly templates: readonly BackupRow[];
    readonly shifts: readonly BackupRow[];
    readonly appointments: readonly BackupRow[];
    readonly monthlyTariffDecisions: readonly BackupRow[];
    readonly preferences: readonly BackupRow[];
  };
}

export interface LocalBackupDocument extends UnsignedLocalBackupDocument {
  readonly integrity: {
    readonly algorithm: "SHA-256";
    readonly canonicalization: "RFC8785";
    readonly scope: "document-without-integrity";
    readonly value: string;
  };
}

export interface CreatedLocalBackup {
  readonly document: LocalBackupDocument;
  readonly fileName: string;
  readonly serialized: string;
}

export class LocalBackupBlockedError extends Error {
  constructor() {
    super(
      "Im Testlabor ist noch ein Testlauf offen. Stelle zuerst das Original wieder her oder übernimm die Testdaten.",
    );
    this.name = "LocalBackupBlockedError";
  }
}

export async function loadLocalBackupSnapshot(db: SQLiteDatabase): Promise<LocalBackupSnapshot> {
  return withImmediateTransaction(db, async (transaction) => {
    const openTestRun = await transaction.getFirstAsync<{ readonly month: string }>(
      "SELECT month FROM dev_test_backups ORDER BY month LIMIT 1",
    );
    if (openTestRun !== null) throw new LocalBackupBlockedError();

    const schema = await transaction.getFirstAsync<{ readonly version: number }>(
      "SELECT MAX(version) AS version FROM schema_migrations",
    );
    if (schema === null || !Number.isInteger(schema.version) || schema.version < 1) {
      throw new Error("Die lokale Datenbankversion konnte nicht bestimmt werden.");
    }

    const profile = await transaction.getFirstAsync<BackupRow>(
      `SELECT id,federal_state,weekly_minutes,time_zone,pay_group,pay_level,tariff_sector,
              full_time_weekly_minutes,holiday_region,tariff_region,
              regular_rotating_night_work,sunday_holiday_work_eligible,
              all_employment_work_recorded,industry,manual_monthly_gross_cents,
              created_at,updated_at
         FROM user_profile
        WHERE id='singleton'`,
    );
    const templates = await transaction.getAllAsync<BackupRow>(
      `SELECT id,name,type,start_time,end_time,break_minutes,color,symbol,sort_order,
              all_day,notification_json,location_json,revision,created_at,updated_at,deleted_at
         FROM shift_templates
        ORDER BY sort_order,id`,
    );
    const shifts = await transaction.getAllAsync<BackupRow>(
      `SELECT id,date,template_id,title,type,all_day,start_time,end_time,break_minutes,
              color,symbol,note,notification_json,alarm_enabled,location_json,
              overtime_minutes,tariff_overtime_confirmed,holiday_premium_mode,
              revision,created_at,updated_at,deleted_at
         FROM shift_entries
        ORDER BY date,id`,
    );
    const appointments = await transaction.getAllAsync<BackupRow>(
      `SELECT id,date,title,all_day,start_time,end_time,color,note,
              recurrence_frequency,recurrence_interval,notification_json,location_json,
              revision,created_at,updated_at,deleted_at
         FROM appointments
        ORDER BY date,id`,
    );
    const monthlyTariffDecisions = await transaction.getAllAsync<BackupRow>(
      `SELECT month,allowance_status,revision,confirmed_at,updated_at
         FROM monthly_tariff_decisions
        ORDER BY month`,
    );
    const placeholders = USER_DATA_PREFERENCE_KEYS.map(() => "?").join(",");
    const preferences = await transaction.getAllAsync<BackupRow>(
      `SELECT key,value,updated_at
         FROM app_preferences
        WHERE key IN (${placeholders})
        ORDER BY key`,
      ...USER_DATA_PREFERENCE_KEYS,
    );

    return Object.freeze({
      databaseSchemaVersion: schema.version,
      profile: profile === null ? null : Object.freeze(profile),
      templates: Object.freeze(templates.map(Object.freeze)),
      shifts: Object.freeze(shifts.map(Object.freeze)),
      appointments: Object.freeze(appointments.map(Object.freeze)),
      monthlyTariffDecisions: Object.freeze(monthlyTariffDecisions.map(Object.freeze)),
      preferences: Object.freeze(preferences.map(Object.freeze)),
    });
  });
}

export async function createLocalBackupDocument(
  snapshot: LocalBackupSnapshot,
  input: {
    readonly appVersion: string | null;
    readonly createdAt: Date;
    readonly sha256: (value: string) => Promise<string>;
  },
): Promise<CreatedLocalBackup> {
  const createdAt = input.createdAt.toISOString();
  const unsigned: UnsignedLocalBackupDocument = Object.freeze({
    format: LOCAL_BACKUP_FORMAT,
    version: LOCAL_BACKUP_VERSION,
    createdAt,
    appVersion: input.appVersion,
    databaseSchemaVersion: snapshot.databaseSchemaVersion,
    data: Object.freeze({
      profile: snapshot.profile,
      templates: snapshot.templates,
      shifts: snapshot.shifts,
      appointments: snapshot.appointments,
      monthlyTariffDecisions: snapshot.monthlyTariffDecisions,
      preferences: snapshot.preferences,
    }),
  });
  const canonical = canonicalize(unsigned);
  if (canonical === undefined) {
    throw new Error("Das Backup konnte nicht eindeutig serialisiert werden.");
  }
  const checksum = await input.sha256(canonical);
  if (!/^[a-f\d]{64}$/iu.test(checksum)) {
    throw new Error("Der Backup-Prüfwert ist ungültig.");
  }
  const document: LocalBackupDocument = Object.freeze({
    ...unsigned,
    integrity: Object.freeze({
      algorithm: "SHA-256",
      canonicalization: "RFC8785",
      scope: "document-without-integrity",
      value: checksum.toLowerCase(),
    }),
  });
  const fileTimestamp = createdAt.replace(/\.\d{3}Z$/u, "Z").replaceAll(":", "-");

  return Object.freeze({
    document,
    fileName: `LUNA-Shift-Backup-${fileTimestamp}.json`,
    serialized: `${JSON.stringify(document, null, 2)}\n`,
  });
}
