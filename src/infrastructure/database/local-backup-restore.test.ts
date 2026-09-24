import { ANALYSIS_VIEW_KEY, DEFAULT_ANALYSIS_VIEW } from "@/domain/analysis-view";
import { loadAnalysisView, saveAnalysisView } from "./analysis-view-repository";
import { createHash } from "node:crypto";

import canonicalize from "canonicalize";
import Database from "better-sqlite3";
import type { SQLiteDatabase } from "expo-sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  LocalBackupValidationError,
  loadCurrentDatabaseSchemaVersion,
  MAX_LOCAL_BACKUP_CHARACTERS,
  validateLocalBackup,
} from "@/infrastructure/database/local-backup-validation";
import { restoreLocalBackup } from "@/infrastructure/database/local-backup-restore";
import {
  LocalBackupBlockedError,
  createLocalBackupDocument,
  loadLocalBackupSnapshot,
  type LocalBackupDocument,
} from "@/infrastructure/database/local-backup";
import { migrateDatabase } from "@/infrastructure/database/migrations";
import { loadProfile, saveProfile } from "@/infrastructure/database/profile-repository";
import {
  loadAppearancePreferences,
  saveAppearancePreferences,
} from "@/infrastructure/database/appearance-repository";
import {
  loadPlanningHintsPreference,
  savePlanningHintsPreference,
} from "@/infrastructure/database/preferences-repository";

class TestDatabase {
  readonly database = new Database(":memory:");
  failSqlIncludes: string | null = null;

  async execAsync(source: string): Promise<void> {
    this.database.exec(source);
  }

  async runAsync(source: string, ...params: unknown[]) {
    if (this.failSqlIncludes !== null && source.includes(this.failSqlIncludes)) {
      throw new Error("injected restore failure");
    }
    const result = this.database.prepare(source).run(...params);
    return {
      changes: result.changes,
      lastInsertRowId: Number(result.lastInsertRowid),
    };
  }

  async getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null> {
    return (this.database.prepare(source).get(...params) as T | undefined) ?? null;
  }

  async getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]> {
    return this.database.prepare(source).all(...params) as T[];
  }
}

function sha256(value: string): Promise<string> {
  return Promise.resolve(createHash("sha256").update(value).digest("hex"));
}

async function createSourceBackup(db: SQLiteDatabase): Promise<LocalBackupDocument> {
  await db.execAsync(`
    INSERT INTO user_profile(
      id,federal_state,weekly_minutes,time_zone,industry,manual_monthly_gross_cents,
      holiday_region,tariff_region,created_at,updated_at
    ) VALUES (
      'singleton','NW',2310,'Europe/Berlin','HEALTHCARE',345000,'NONE','OTHER',
      '2026-09-01T10:00:00.000Z','2026-09-01T10:00:00.000Z'
    );
    INSERT INTO shift_entries(
      id,date,template_id,title,type,all_day,start_time,end_time,break_minutes,color,symbol,
      note,notification_json,alarm_enabled,location_json,overtime_minutes,
      tariff_overtime_confirmed,holiday_premium_mode,revision,created_at,updated_at,deleted_at
    ) VALUES (
      'shift-source','2026-09-02','default-early','Frühdienst','EARLY',0,'06:00','14:12',
      30,'#4FCB68','rise','Übergabe',NULL,0,NULL,0,0,'WITH_TIME_OFF',3,
      '2026-09-01T10:00:00.000Z','2026-09-02T10:00:00.000Z',NULL
    );
    INSERT INTO shift_entries(
      id,date,template_id,title,type,all_day,start_time,end_time,break_minutes,color,symbol,
      note,notification_json,alarm_enabled,location_json,overtime_minutes,
      tariff_overtime_confirmed,holiday_premium_mode,revision,created_at,updated_at,deleted_at
    ) VALUES (
      'shift-deleted','2026-08-02','default-late','Gelöscht','LATE',0,'13:18','21:30',
      30,'#F05C68','sun',NULL,NULL,0,NULL,0,0,'WITH_TIME_OFF',2,
      '2026-08-01T10:00:00.000Z','2026-08-02T10:00:00.000Z','2026-08-02T10:00:00.000Z'
    );
    INSERT INTO appointments(
      id,date,title,all_day,start_time,end_time,color,note,recurrence_frequency,
      recurrence_interval,notification_json,location_json,revision,created_at,updated_at,deleted_at
    ) VALUES (
      'appointment-source','2026-10-03','Arzttermin',0,'10:00','10:30','#31A7C3',NULL,
      NULL,NULL,NULL,NULL,2,'2026-09-01T10:00:00.000Z','2026-09-02T10:00:00.000Z',NULL
    );
    INSERT INTO monthly_tariff_decisions(
      month,allowance_status,revision,confirmed_at,updated_at
    ) VALUES (
      '2026-09','SHIFT_MONTHLY',1,'2026-09-01T10:00:00.000Z','2026-09-01T10:00:00.000Z'
    );
    INSERT INTO app_preferences(key,value,updated_at) VALUES
      ('calendar_show_shifts','false','2026-09-01T10:00:00.000Z'),
      ('tvoed_assignment','PERMANENT','2026-09-01T10:00:00.000Z');
  `);
  const snapshot = await loadLocalBackupSnapshot(db);
  return (
    await createLocalBackupDocument(snapshot, {
      appVersion: "0.1.0",
      createdAt: new Date("2026-09-02T12:00:00.000Z"),
      sha256,
    })
  ).document;
}

async function signedSerialized(
  document: LocalBackupDocument,
  mutate: (unsigned: Record<string, unknown>) => void,
): Promise<string> {
  const unsigned = JSON.parse(JSON.stringify(document)) as Record<string, unknown>;
  delete unsigned.integrity;
  mutate(unsigned);
  const canonical = canonicalize(unsigned);
  if (canonical === undefined) throw new Error("test document is not canonicalizable");
  return JSON.stringify({
    ...unsigned,
    integrity: {
      algorithm: "SHA-256",
      canonicalization: "RFC8785",
      scope: "document-without-integrity",
      value: await sha256(canonical),
    },
  });
}

describe("local backup restore", () => {
  it("round-trips dashboard order, visibility and metric, and resets them for older backups", async () => {
    const view = {
      ...DEFAULT_ANALYSIS_VIEW,
      order: ["PAY", "WORK", "CHECK", "SHIFTS"] as const,
      hidden: ["SHIFTS"] as const,
      shiftMetric: "COUNT" as const,
    };
    await saveAnalysisView(sourceDb, view);
    const backup = await createLocalBackupDocument(await loadLocalBackupSnapshot(sourceDb), {
      appVersion: "0.1.0",
      createdAt: new Date("2026-09-21T10:00:00Z"),
      sha256,
    });
    const validated = await validateLocalBackup(backup.serialized, {
      maxDatabaseSchemaVersion: await loadCurrentDatabaseSchemaVersion(destinationDb),
      sha256,
    });
    await restoreLocalBackup(destinationDb, validated);
    expect(await loadAnalysisView(destinationDb)).toEqual(view);
    const legacy = await validateLocalBackup(JSON.stringify(document), {
      maxDatabaseSchemaVersion: await loadCurrentDatabaseSchemaVersion(destinationDb),
      sha256,
    });
    await restoreLocalBackup(destinationDb, legacy);
    expect(await loadAnalysisView(destinationDb)).toEqual(DEFAULT_ANALYSIS_VIEW);
  });

  it("rejects duplicate or unknown dashboard cards in a correctly signed backup", async () => {
    for (const order of [
      ["WORK", "WORK", "PAY", "SHIFTS"],
      ["WORK", "CHECK", "PAY", "UNKNOWN"],
    ]) {
      const serialized = await signedSerialized(document, (unsigned) => {
        const data = unsigned.data as { preferences: unknown[] };
        data.preferences.push({
          key: ANALYSIS_VIEW_KEY,
          value: JSON.stringify({ ...DEFAULT_ANALYSIS_VIEW, order }),
          updated_at: "2026-09-21T10:00:00Z",
        });
      });
      await expect(
        validateLocalBackup(serialized, {
          maxDatabaseSchemaVersion: await loadCurrentDatabaseSchemaVersion(destinationDb),
          sha256,
        }),
      ).rejects.toBeInstanceOf(LocalBackupValidationError);
    }
  });

  let source: TestDatabase;
  let destination: TestDatabase;
  let sourceDb: SQLiteDatabase;
  let destinationDb: SQLiteDatabase;
  let document: LocalBackupDocument;

  beforeEach(async () => {
    source = new TestDatabase();
    destination = new TestDatabase();
    sourceDb = source as unknown as SQLiteDatabase;
    destinationDb = destination as unknown as SQLiteDatabase;
    await migrateDatabase(sourceDb);
    await migrateDatabase(destinationDb);
    document = await createSourceBackup(sourceDb);
    destination.database.exec(`
      INSERT INTO user_profile(
        id,federal_state,weekly_minutes,time_zone,holiday_region,tariff_region,created_at,updated_at
      ) VALUES (
        'singleton','BY',2400,'Europe/Berlin','UNKNOWN','OTHER',
        '2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z'
      );
      INSERT INTO shift_entries(
        id,date,template_id,title,type,start_time,end_time,break_minutes,color,symbol,
        revision,created_at,updated_at
      ) VALUES (
        'shift-old','2025-01-02','default-late','Alt','LATE','13:18','21:30',30,
        '#F05C68','sun',1,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z'
      );
      INSERT INTO app_preferences(key,value,updated_at) VALUES
        ('developer_mode','1','2025-01-01T00:00:00.000Z'),
        ('calendar_show_shifts','true','2025-01-01T00:00:00.000Z');
      INSERT INTO scheduled_entry_notifications(
        entry_kind,entry_id,occurrence_date,notification_id
      ) VALUES ('SHIFT','shift-old','2025-01-02','old-native-notification');
    `);
  });

  afterEach(() => {
    source.database.close();
    destination.database.close();
  });

  it("round-trips identity and appearance together", async () => {
    await sourceDb.runAsync(
      "UPDATE user_profile SET display_name=?,employer_name=?",
      "Alex",
      "Klinikum am Park",
    );
    await saveAppearancePreferences(sourceDb, { themeId: "sea", mode: "dark" });
    const exported = await createLocalBackupDocument(await loadLocalBackupSnapshot(sourceDb), {
      appVersion: "test",
      createdAt: new Date(),
      sha256,
    });
    const backup = await validateLocalBackup(exported.serialized, {
      maxDatabaseSchemaVersion: 13,
      sha256,
    });
    await restoreLocalBackup(destinationDb, backup);
    expect(
      await destinationDb.getFirstAsync("SELECT display_name,employer_name FROM user_profile"),
    ).toEqual({ display_name: "Alex", employer_name: "Klinikum am Park" });
    expect(await loadAppearancePreferences(destinationDb)).toEqual({
      themeId: "sea",
      mode: "dark",
    });
  });

  it.each(["P5", "P6"] as const)(
    "persists and restores %s stage 1 without a schema migration",
    async (payGroup) => {
      await saveProfile(sourceDb, {
        federalState: "NW",
        weeklyMinutes: 2310,
        timeZone: "Europe/Berlin",
        manualMonthlyGrossCents: null,
        tariff: {
          payGroup,
          payLevel: 1,
          sector: "BT_K",
          tariffRegion: "OTHER",
          fullTimeWeeklyMinutes: 2310,
        },
      });
      expect((await loadProfile(sourceDb))?.tariff).toMatchObject({ payGroup, payLevel: 1 });
      const exported = await createLocalBackupDocument(await loadLocalBackupSnapshot(sourceDb), {
        appVersion: "test",
        createdAt: new Date(),
        sha256,
      });
      const validated = await validateLocalBackup(exported.serialized, {
        maxDatabaseSchemaVersion: await loadCurrentDatabaseSchemaVersion(destinationDb),
        sha256,
      });
      await restoreLocalBackup(destinationDb, validated);
      expect((await loadProfile(destinationDb))?.tariff).toMatchObject({ payGroup, payLevel: 1 });

      const invalid = await signedSerialized(exported.document, (unsigned) => {
        const data = unsigned.data as { profile: Record<string, unknown> };
        data.profile.pay_group = "P7";
      });
      await expect(
        validateLocalBackup(invalid, {
          maxDatabaseSchemaVersion: await loadCurrentDatabaseSchemaVersion(destinationDb),
          sha256,
        }),
      ).rejects.toBeInstanceOf(LocalBackupValidationError);
      expect((await loadProfile(destinationDb))?.tariff).toMatchObject({ payGroup, payLevel: 1 });
    },
  );

  it("verifies an original version 12 backup before filling absent identity and appearance defaults", async () => {
    const serialized = await signedSerialized(document, (unsigned) => {
      unsigned.databaseSchemaVersion = 12;
      const data = unsigned.data as { profile: Record<string, unknown> };
      delete data.profile.display_name;
      delete data.profile.employer_name;
    });
    await saveAppearancePreferences(destinationDb, { themeId: "mint", mode: "dark" });
    const backup = await validateLocalBackup(serialized, { maxDatabaseSchemaVersion: 13, sha256 });
    await restoreLocalBackup(destinationDb, backup);
    expect(
      await destinationDb.getFirstAsync("SELECT display_name,employer_name FROM user_profile"),
    ).toEqual({ display_name: null, employer_name: null });
    expect(await loadAppearancePreferences(destinationDb)).toEqual({
      themeId: "standard",
      mode: "system",
    });
    await expect(
      validateLocalBackup(serialized.replace("345000", "345001"), {
        maxDatabaseSchemaVersion: 13,
        sha256,
      }),
    ).rejects.toThrow("Prüfwert");
  });

  it("persists planning settings and restores them through a validated backup", async () => {
    expect(await loadPlanningHintsPreference(sourceDb)).toBe(true);
    await savePlanningHintsPreference(sourceDb, false);
    expect(await loadPlanningHintsPreference(sourceDb)).toBe(false);
    const snapshot = await loadLocalBackupSnapshot(sourceDb);
    const exported = await createLocalBackupDocument(snapshot, {
      appVersion: "test",
      createdAt: new Date("2026-09-10T00:00:00Z"),
      sha256,
    });
    const backup = await validateLocalBackup(exported.serialized, {
      maxDatabaseSchemaVersion: await loadCurrentDatabaseSchemaVersion(destinationDb),
      sha256,
    });
    await restoreLocalBackup(destinationDb, backup);
    expect(await loadPlanningHintsPreference(destinationDb)).toBe(false);
    await savePlanningHintsPreference(destinationDb, true);
    expect(await loadPlanningHintsPreference(destinationDb)).toBe(true);
  });

  it("restores an older backup without keeping a newer hidden-planning setting", async () => {
    await savePlanningHintsPreference(destinationDb, false);
    const backup = await validateLocalBackup(JSON.stringify(document), {
      maxDatabaseSchemaVersion: await loadCurrentDatabaseSchemaVersion(destinationDb),
      sha256,
    });
    await restoreLocalBackup(destinationDb, backup);
    expect(await loadPlanningHintsPreference(destinationDb)).toBe(true);
  });

  it("rejects a signed backup with a malformed planning preference before restore", async () => {
    const serialized = await signedSerialized(document, (unsigned) => {
      const data = unsigned.data as { preferences: Record<string, unknown>[] };
      data.preferences.push({
        key: "check_show_planning_hints",
        value: "off",
        updated_at: "2026-09-10T00:00:00.000Z",
      });
    });
    await expect(
      validateLocalBackup(serialized, {
        maxDatabaseSchemaVersion: await loadCurrentDatabaseSchemaVersion(destinationDb),
        sha256,
      }),
    ).rejects.toThrow(LocalBackupValidationError);
  });

  it("rejects invalid planning preference writes and retains the previous value on failure", async () => {
    await expect(
      savePlanningHintsPreference(sourceDb, "false" as unknown as boolean),
    ).rejects.toThrow();
    source.failSqlIncludes = "INSERT INTO app_preferences";
    await expect(savePlanningHintsPreference(sourceDb, false)).rejects.toThrow();
    expect(await loadPlanningHintsPreference(sourceDb)).toBe(true);
  });

  it("validates a current v1 backup and builds a user-facing preview", async () => {
    const backup = await validateLocalBackup(JSON.stringify(document), {
      maxDatabaseSchemaVersion: await loadCurrentDatabaseSchemaVersion(destinationDb),
      sha256,
    });

    expect(backup.preview).toMatchObject({
      createdAt: "2026-09-02T12:00:00.000Z",
      appVersion: "0.1.0",
      databaseSchemaVersion: 13,
      profileIncluded: true,
      templateCount: 7,
      shiftCount: 1,
      appointmentCount: 1,
      monthlyTariffDecisionCount: 1,
      preferenceCount: 2,
      deletedRecordCount: 1,
      firstEntryDate: "2026-09-02",
      lastEntryDate: "2026-10-03",
    });
  });

  it("replaces only exported user data and preserves internal state", async () => {
    const backup = await validateLocalBackup(JSON.stringify(document), {
      maxDatabaseSchemaVersion: 13,
      sha256,
    });

    await restoreLocalBackup(destinationDb, backup);

    expect(await loadLocalBackupSnapshot(destinationDb)).toEqual(
      await loadLocalBackupSnapshot(sourceDb),
    );
    expect(
      destination.database
        .prepare("SELECT value FROM app_preferences WHERE key='developer_mode'")
        .get(),
    ).toEqual({ value: "1" });
    expect(
      destination.database
        .prepare("SELECT COUNT(*) count FROM scheduled_entry_notifications")
        .get(),
    ).toEqual({ count: 0 });
    expect(
      destination.database.prepare("SELECT COUNT(*) count FROM schema_migrations").get(),
    ).toEqual({ count: 13 });
  });

  it("rolls the complete replacement back when an insert fails", async () => {
    const backup = await validateLocalBackup(JSON.stringify(document), {
      maxDatabaseSchemaVersion: 13,
      sha256,
    });
    const before = await loadLocalBackupSnapshot(destinationDb);
    destination.failSqlIncludes = "INSERT INTO appointments";

    await expect(restoreLocalBackup(destinationDb, backup)).rejects.toThrow(
      "injected restore failure",
    );
    destination.failSqlIncludes = null;

    expect(await loadLocalBackupSnapshot(destinationDb)).toEqual(before);
    expect(
      destination.database
        .prepare("SELECT COUNT(*) count FROM scheduled_entry_notifications")
        .get(),
    ).toEqual({ count: 1 });
  });

  it("rejects checksum changes and future database schemas before writing", async () => {
    const changed = JSON.parse(JSON.stringify(document)) as LocalBackupDocument;
    Object.assign(changed, { appVersion: "tampered" });
    await expect(
      validateLocalBackup(JSON.stringify(changed), { maxDatabaseSchemaVersion: 13, sha256 }),
    ).rejects.toThrow("Prüfwert");

    const future = await signedSerialized(document, (unsigned) => {
      unsigned.databaseSchemaVersion = 14;
    });
    await expect(
      validateLocalBackup(future, { maxDatabaseSchemaVersion: 13, sha256 }),
    ).rejects.toThrow("neueren LUNA-Shift-Version");
  });

  it("rejects empty and oversized serialized input before parsing", async () => {
    await expect(validateLocalBackup("", { maxDatabaseSchemaVersion: 13, sha256 })).rejects.toThrow(
      "leer oder zu groß",
    );
    await expect(
      validateLocalBackup("x".repeat(MAX_LOCAL_BACKUP_CHARACTERS + 1), {
        maxDatabaseSchemaVersion: 13,
        sha256,
      }),
    ).rejects.toThrow("leer oder zu groß");
  });

  it("rejects duplicate ids, broken references, nested JSON and unknown fields", async () => {
    const duplicate = await signedSerialized(document, (unsigned) => {
      const data = unsigned.data as { shifts: unknown[] };
      data.shifts.push(data.shifts[0]);
    });
    await expect(
      validateLocalBackup(duplicate, { maxDatabaseSchemaVersion: 13, sha256 }),
    ).rejects.toBeInstanceOf(LocalBackupValidationError);

    const missingTemplate = await signedSerialized(document, (unsigned) => {
      const data = unsigned.data as { shifts: Record<string, unknown>[] };
      Object.assign(data.shifts[0] ?? {}, { template_id: "missing-template" });
    });
    await expect(
      validateLocalBackup(missingTemplate, { maxDatabaseSchemaVersion: 13, sha256 }),
    ).rejects.toBeInstanceOf(LocalBackupValidationError);

    const invalidNestedJson = await signedSerialized(document, (unsigned) => {
      const data = unsigned.data as { shifts: Record<string, unknown>[] };
      Object.assign(data.shifts[0] ?? {}, { notification_json: "{" });
    });
    await expect(
      validateLocalBackup(invalidNestedJson, { maxDatabaseSchemaVersion: 13, sha256 }),
    ).rejects.toBeInstanceOf(LocalBackupValidationError);

    const unknownNestedField = await signedSerialized(document, (unsigned) => {
      const data = unsigned.data as { shifts: Record<string, unknown>[] };
      Object.assign(data.shifts[0] ?? {}, {
        notification_json: JSON.stringify({
          amount: 5,
          unit: "MINUTE",
          direction: "BEFORE",
          reference: "START",
          unexpected: true,
        }),
      });
    });
    await expect(
      validateLocalBackup(unknownNestedField, { maxDatabaseSchemaVersion: 13, sha256 }),
    ).rejects.toBeInstanceOf(LocalBackupValidationError);

    const inconsistentAllDay = await signedSerialized(document, (unsigned) => {
      const data = unsigned.data as { shifts: Record<string, unknown>[] };
      Object.assign(data.shifts[0] ?? {}, { all_day: 1 });
    });
    await expect(
      validateLocalBackup(inconsistentAllDay, { maxDatabaseSchemaVersion: 13, sha256 }),
    ).rejects.toBeInstanceOf(LocalBackupValidationError);

    const missingDefaultTemplate = await signedSerialized(document, (unsigned) => {
      const data = unsigned.data as { templates: Record<string, unknown>[] };
      data.templates = data.templates.filter((template) => template.id !== "default-free");
    });
    await expect(
      validateLocalBackup(missingDefaultTemplate, { maxDatabaseSchemaVersion: 13, sha256 }),
    ).rejects.toBeInstanceOf(LocalBackupValidationError);

    const unknownField = await signedSerialized(document, (unsigned) => {
      unsigned.unexpected = "value";
    });
    await expect(
      validateLocalBackup(unknownField, { maxDatabaseSchemaVersion: 13, sha256 }),
    ).rejects.toBeInstanceOf(LocalBackupValidationError);
  });

  it("blocks restore while the test laboratory owns an original backup", async () => {
    const backup = await validateLocalBackup(JSON.stringify(document), {
      maxDatabaseSchemaVersion: 13,
      sha256,
    });
    const before = await loadLocalBackupSnapshot(destinationDb);
    destination.database
      .prepare(
        `INSERT INTO dev_test_backups(month,payload,run_id,created_at)
         VALUES ('2026-09','{}','run-1','2026-09-02T10:00:00.000Z')`,
      )
      .run();

    await expect(restoreLocalBackup(destinationDb, backup)).rejects.toBeInstanceOf(
      LocalBackupBlockedError,
    );

    destination.database.prepare("DELETE FROM dev_test_backups").run();
    expect(await loadLocalBackupSnapshot(destinationDb)).toEqual(before);
  });
});
