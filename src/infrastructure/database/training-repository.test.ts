import { createHash, randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import canonicalize from "canonicalize";
import type { SQLiteDatabase } from "expo-sqlite";
import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { ConcurrencyError } from "@/domain/errors";
import { UNKNOWN_YOUTH_CONTEXT } from "@/domain/youth-context";
import {
  type TrainingProfileData,
  type ShiftTrainingData,
  isCurrentShiftTraining,
} from "@/domain/training-data";
import { shift as fixture, work } from "@/engine/remuneration-test-fixtures";
import { migrateDatabase, LATEST_DATABASE_SCHEMA_VERSION } from "./migrations";
import { saveProfile } from "./profile-repository";
import { saveShift, deleteCalendarEntry } from "./calendar-entry-repository";
import {
  saveTrainingProfile,
  listTrainingProfiles,
  saveShiftTraining,
  listShiftTraining,
  type SaveShiftTrainingInput,
} from "./training-repository";
import {
  createLocalBackupDocument,
  loadLocalBackupSnapshot,
  LOCAL_BACKUP_VERSION,
} from "./local-backup";
import { validateLocalBackup } from "./local-backup-validation";
import { restoreLocalBackup } from "./local-backup-restore";
import { setDeveloperMode, generateTestRun, restoreTestBackup } from "./dev-tools-repository";

class TestDatabase {
  readonly database: Database.Database;
  fail: string | null = null;
  constructor(path = ":memory:") {
    this.database = new Database(path);
  }
  async execAsync(sql: string) {
    this.database.exec(sql);
  }
  async runAsync(sql: string, ...params: unknown[]) {
    if (this.fail && sql.includes(this.fail)) throw new Error("injected failure");
    const result = this.database.prepare(sql).run(...params);
    return { changes: result.changes, lastInsertRowId: Number(result.lastInsertRowid) };
  }
  async getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null> {
    return (this.database.prepare(sql).get(...params) as T | undefined) ?? null;
  }
  async getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    return this.database.prepare(sql).all(...params) as T[];
  }
  async prepareAsync(sql: string) {
    const statement = this.database.prepare(sql);
    return {
      executeAsync: async (params: unknown[]) => {
        const result = statement.run(...params);
        return { changes: result.changes, lastInsertRowId: Number(result.lastInsertRowid) };
      },
      finalizeAsync: async () => {},
    };
  }
}
const profile: TrainingProfileData = {
  version: 1,
  effectiveFrom: "2026-09-01",
  birthDate: "2009-09-15",
  fullTimeCompulsorySchooling: false,
  status: "training",
  training: {
    profession: "Pflegefachperson",
    legalBasis: "PFLBG",
    startedOn: "2026-09-01",
    expectedEndOn: "2029-08-31",
    year: 1,
    yearConfirmedFrom: "2026-09-01",
    shorteningMonths: null,
  },
};
const details: ShiftTrainingData = {
  version: 1,
  pauses: [{ start: "2026-09-15T08:00:00Z", end: "2026-09-15T08:30:00Z" }],
  school: {
    lessons: [{ start: "2026-09-15T06:00:00Z", end: "2026-09-15T06:45:00Z" }],
    travelToWorkMinutes: null,
    travelFromWorkMinutes: 0,
    block: null,
  },
};
const sha256 = async (value: string) => createHash("sha256").update(value).digest("hex");
const validate = (value: string) =>
  validateLocalBackup(value, { maxDatabaseSchemaVersion: LATEST_DATABASE_SCHEMA_VERSION, sha256 });

describe("persisted training profiles, school and actual pauses", () => {
  let adapter: TestDatabase, db: SQLiteDatabase;
  let input: SaveShiftTrainingInput;
  let shift: Awaited<ReturnType<typeof saveShift>>;
  beforeEach(async () => {
    adapter = new TestDatabase();
    db = adapter as unknown as SQLiteDatabase;
    await migrateDatabase(db);
    await saveProfile(db, work);
    shift = await saveShift(db, {
      ...fixture({
        date: "2026-09-15",
        title: "Schule",
        type: "TRAINING",
        startTime: "08:00",
        endTime: "14:00",
        breakMinutes: 30,
      }),
      id: undefined,
    });
    input = {
      shiftId: shift.id,
      expectedShiftRevision: shift.revision,
      expectedShiftDate: shift.date,
      expectedShiftUpdatedAt: shift.updatedAt,
      timeZone: work.timeZone,
      expectedRevision: 0,
      data: details,
    };
  });
  afterEach(() => adapter.database.close());
  it("atomically adopts explicit pause intervals without modifying unrelated service fields", async () => {
    const saved = await saveShiftTraining(db, {
      ...input,
      synchronizeBreakMinutes: true,
      data: { ...details, pauses: [] },
    });
    const row = adapter.database
      .prepare("SELECT * FROM shift_entries WHERE id=?")
      .get(shift.id) as Record<string, unknown>;
    expect(row.break_minutes).toBe(0);
    expect(row.revision).toBe(shift.revision + 1);
    expect(saved.shiftRevision).toBe(row.revision);
    expect(saved.shiftUpdatedAt).toBe(row.updated_at);
    expect(row.title).toBe(shift.title);
    expect(row.start_time).toBe(shift.startTime);
    expect(row.end_time).toBe(shift.endTime);
    expect(row.type).toBe(shift.type);
    expect(row.notification_json).toBeNull();
    await expect(validate((await backup()).serialized)).resolves.toBeDefined();
  });
  it("rolls back the service total when detail persistence fails", async () => {
    adapter.fail = "INSERT INTO shift_training_details";
    await expect(
      saveShiftTraining(db, {
        ...input,
        synchronizeBreakMinutes: true,
        data: { ...details, pauses: [] },
      }),
    ).rejects.toThrow("injected failure");
    const row = adapter.database
      .prepare("SELECT break_minutes,revision FROM shift_entries WHERE id=?")
      .get(shift.id);
    expect(row).toEqual({ break_minutes: 30, revision: shift.revision });
    expect(await listShiftTraining(db)).toEqual([]);
  });
  it("does not replace the service total for unknown pause intervals", async () => {
    const saved = await saveShiftTraining(db, {
      ...input,
      synchronizeBreakMinutes: true,
      data: { version: 1, pauses: null, school: null },
    });
    expect(saved.shiftRevision).toBe(shift.revision);
    expect(
      adapter.database.prepare("SELECT break_minutes FROM shift_entries WHERE id=?").get(shift.id),
    ).toEqual({ break_minutes: 30 });
  });
  it("rejects outside pauses before changing the service total", async () => {
    await expect(
      saveShiftTraining(db, {
        ...input,
        synchronizeBreakMinutes: true,
        data: {
          version: 1,
          school: null,
          pauses: [{ start: "2026-09-15T03:00:00Z", end: "2026-09-15T03:15:00Z" }],
        },
      }),
    ).rejects.toThrow("außerhalb");
    expect(
      adapter.database
        .prepare("SELECT break_minutes,revision FROM shift_entries WHERE id=?")
        .get(shift.id),
    ).toEqual({ break_minutes: 30, revision: shift.revision });
  });
  async function backup() {
    return createLocalBackupDocument(await loadLocalBackupSnapshot(db), {
      appVersion: "test",
      createdAt: new Date(),
      sha256,
    });
  }
  it("migrates idempotently without inferring school from existing names", async () => {
    await migrateDatabase(db);
    expect(await listShiftTraining(db)).toEqual([]);
    expect(await listTrainingProfiles(db)).toEqual([]);
    expect(
      await db.getFirstAsync("SELECT COUNT(*) AS n FROM schema_migrations WHERE version=19"),
    ).toEqual({ n: 1 });
  });
  it("rolls back migration failure and preserves 10000 existing shifts", async () => {
    adapter.database.exec(
      "DROP TABLE shift_training_details; DROP TABLE training_profiles; DELETE FROM schema_migrations WHERE version=19;",
    );
    const insert = adapter.database.prepare(
      "INSERT INTO shift_entries(id,date,title,type,start_time,end_time,break_minutes,color,symbol,revision,created_at,updated_at) VALUES(?,'2026-09-20','Schule','TRAINING','08:00','14:00',30,'#EA5B55','N',1,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
    );
    adapter.database.transaction(() => {
      for (let i = 0; i < 10000; i++) insert.run("old-" + i);
    })();
    const before = await db.getAllAsync("SELECT * FROM shift_entries ORDER BY id");
    adapter.fail = "INSERT INTO schema_migrations";
    await expect(migrateDatabase(db)).rejects.toThrow("injected");
    expect(
      await db.getFirstAsync("SELECT name FROM sqlite_master WHERE name='training_profiles'"),
    ).toBeNull();
    adapter.fail = null;
    await migrateDatabase(db);
    expect(await db.getAllAsync("SELECT * FROM shift_entries ORDER BY id")).toEqual(before);
  });
  it("stores chronological profiles with independent age and optimistic revisions", async () => {
    const first = await saveTrainingProfile(db, { data: profile, expectedRevision: 0 });
    await expect(
      saveTrainingProfile(db, { data: profile, expectedRevision: 0 }),
    ).rejects.toBeInstanceOf(ConcurrencyError);
    const later = await saveTrainingProfile(db, {
      data: { ...profile, effectiveFrom: "2029-09-01", status: "employment", training: null },
      expectedRevision: 0,
    });
    expect(await listTrainingProfiles(db)).toEqual([first, later]);
    const changed = await saveTrainingProfile(db, {
      data: { ...profile, fullTimeCompulsorySchooling: null },
      expectedRevision: 1,
    });
    expect(changed.revision).toBe(2);
  });
  it("stores exact school units, pauses and unknown travel without mutating the shift", async () => {
    const before = await db.getFirstAsync("SELECT * FROM shift_entries WHERE id=?", shift.id);
    const result = await saveShiftTraining(db, input);
    expect(result.data).toEqual(details);
    expect(await listShiftTraining(db)).toEqual([result]);
    expect(await db.getFirstAsync("SELECT * FROM shift_entries WHERE id=?", shift.id)).toEqual(
      before,
    );
    await expect(saveShiftTraining(db, input)).rejects.toBeInstanceOf(ConcurrencyError);
  });
  it("preserves explicitly classified exam v2 after SQLite restart and backup restore", async () => {
    const exam: ShiftTrainingData = {
      version: 2,
      pauses: details.pauses,
      school: null,
      exam: {
        kind: "EXAM",
        requiredByRuleOrContract: true,
        finalWritten: true,
        precedingWorkDate: "2026-09-14",
        participation: [
          { start: "2026-09-15T06:00:00Z", end: "2026-09-15T08:00:00Z" },
          { start: "2026-09-15T08:30:00Z", end: "2026-09-15T10:00:00Z" },
        ],
        travelToWorkMinutes: 0,
        travelFromWorkMinutes: null,
      },
    };
    await saveShiftTraining(db, { ...input, data: exam });
    const document = await backup();
    const targetPath = join(tmpdir(), "luna-exam-" + randomUUID() + ".sqlite");
    let target = new TestDatabase(targetPath);
    try {
      await migrateDatabase(target as unknown as SQLiteDatabase);
      await restoreLocalBackup(
        target as unknown as SQLiteDatabase,
        await validate(document.serialized),
      );
      target.database.close();
      target = new TestDatabase(targetPath);
      expect((await listShiftTraining(target as unknown as SQLiteDatabase))[0]?.data).toEqual(exam);
    } finally {
      target.database.close();
      unlinkSync(targetPath);
    }
  });
  it("preserves versioned exam-route instants after SQLite restart and backup restore", async () => {
    const exam: ShiftTrainingData = {
      version: 3,
      pauses: details.pauses,
      school: null,
      exam: {
        kind: "EXAM",
        requiredByRuleOrContract: true,
        finalWritten: false,
        precedingWorkDate: null,
        participation: [
          { start: "2026-09-15T06:00:00Z", end: "2026-09-15T08:00:00Z" },
          { start: "2026-09-15T08:30:00Z", end: "2026-09-15T10:00:00Z" },
        ],
        travelFromWorkMinutes: 0,
        travelToWorkMinutes: 20,
        travelFromWorkInterval: null,
        travelToWorkInterval: {
          start: "2026-09-15T10:00:00Z",
          end: "2026-09-15T10:20:00Z",
        },
      },
    };
    await saveShiftTraining(db, { ...input, data: exam });
    const document = await backup();
    const targetPath = join(tmpdir(), "luna-exam-route-" + randomUUID() + ".sqlite");
    let target = new TestDatabase(targetPath);
    try {
      await migrateDatabase(target as unknown as SQLiteDatabase);
      await restoreLocalBackup(
        target as unknown as SQLiteDatabase,
        await validate(document.serialized),
      );
      target.database.close();
      target = new TestDatabase(targetPath);
      expect((await listShiftTraining(target as unknown as SQLiteDatabase))[0]?.data).toEqual(exam);
    } finally {
      target.database.close();
      unlinkSync(targetPath);
    }
  });
  it("preserves versioned school-route instants after SQLite restart and backup restore", async () => {
    const located: ShiftTrainingData = {
      ...details,
      version: 3,
      exam: null,
      school: {
        ...details.school!,
        travelToWorkMinutes: 20,
        travelFromWorkMinutes: 0,
        travelToWorkInterval: {
          start: "2026-09-15T06:45:00Z",
          end: "2026-09-15T07:05:00Z",
        },
        travelFromWorkInterval: null,
      },
    };
    await saveShiftTraining(db, { ...input, data: located });
    expect((await listShiftTraining(db))[0]?.data).toEqual(located);
    const document = await backup();
    const targetPath = join(tmpdir(), "luna-school-route-" + randomUUID() + ".sqlite");
    let target = new TestDatabase(targetPath);
    try {
      await migrateDatabase(target as unknown as SQLiteDatabase);
      await restoreLocalBackup(
        target as unknown as SQLiteDatabase,
        await validate(document.serialized),
      );
      target.database.close();
      target = new TestDatabase(targetPath);
      expect((await listShiftTraining(target as unknown as SQLiteDatabase))[0]?.data).toEqual(
        located,
      );
    } finally {
      target.database.close();
      unlinkSync(targetPath);
    }
  });
  it("rejects stale shifts and time zones, and supports explicit revocation", async () => {
    const saved = await saveShiftTraining(db, input);
    const edited = await saveShift(db, {
      ...shift,
      expectedRevision: shift.revision,
      title: "Geändert",
    });
    expect(isCurrentShiftTraining(saved, edited, work.timeZone)).toBe(false);
    await expect(saveShiftTraining(db, { ...input, expectedRevision: 1 })).rejects.toBeInstanceOf(
      ConcurrencyError,
    );
    const current = {
      ...input,
      expectedShiftRevision: edited.revision,
      expectedShiftUpdatedAt: edited.updatedAt,
      expectedRevision: 1,
    };
    await expect(saveShiftTraining(db, { ...current, timeZone: "UTC" })).rejects.toBeInstanceOf(
      ConcurrencyError,
    );
    expect(
      (
        await saveShiftTraining(db, {
          ...current,
          data: { version: 1, pauses: null, school: null },
        })
      ).revision,
    ).toBe(2);
  });
  it("rejects deleted parents and mismatching pause duration", async () => {
    await expect(
      saveShiftTraining(db, { ...input, data: { ...details, pauses: [] } }),
    ).rejects.toThrow("Pausendauer");
    await deleteCalendarEntry(db, shift);
    await expect(saveShiftTraining(db, input)).rejects.toBeInstanceOf(ConcurrencyError);
  });
  it("copies nested input before awaiting database work", async () => {
    const mutable = JSON.parse(JSON.stringify(input));
    const promise = saveShiftTraining(db, mutable);
    mutable.data.school.travelToWorkMinutes = 300;
    expect((await promise).data.school?.travelToWorkMinutes).toBeNull();
  });
  it("rolls back failed save without overwriting prior confirmations", async () => {
    const old = await saveShiftTraining(db, input);
    adapter.fail = "INSERT INTO shift_training_details";
    await expect(saveShiftTraining(db, { ...input, expectedRevision: 1 })).rejects.toThrow(
      "injected",
    );
    expect(await listShiftTraining(db)).toEqual([old]);
  });
  it.each([1, 2] as const)(
    "roundtrips profile v%i inside backup v6 and persists after reopening",
    async (version) => {
      const savedProfile: TrainingProfileData =
        version === 1
          ? profile
          : {
              ...profile,
              version: 2,
              youth: {
                ...UNKNOWN_YOUTH_CONTEXT,
                careInstitution: true,
                allWorkAndSchoolRecorded: true,
                shortenedWorkingDays: ["2026-09-15"],
                holidayLostMinutes: { "2026-10-03": 0 },
              },
            };
      await saveTrainingProfile(db, { data: savedProfile, expectedRevision: 0 });
      await saveShiftTraining(db, input);
      const source = await loadLocalBackupSnapshot(db);
      const document = await backup();
      expect(document.document.version).toBe(LOCAL_BACKUP_VERSION);
      const path = join(tmpdir(), "luna-training-" + randomUUID() + ".sqlite");
      let target = new TestDatabase(path);
      try {
        await migrateDatabase(target as unknown as SQLiteDatabase);
        await restoreLocalBackup(
          target as unknown as SQLiteDatabase,
          await validate(document.serialized),
        );
        target.database.close();
        target = new TestDatabase(path);
        expect(await loadLocalBackupSnapshot(target as unknown as SQLiteDatabase)).toEqual(source);
        expect((await listTrainingProfiles(target as unknown as SQLiteDatabase))[0]?.data).toEqual(
          savedProfile,
        );
        expect((await listShiftTraining(target as unknown as SQLiteDatabase))[0]?.data).toEqual(
          details,
        );
      } finally {
        target.database.close();
        unlinkSync(path);
      }
    },
  );
  it.each([1, 2, 3, 4, 5])(
    "reads legacy backup v%i without inventing training data",
    async (version) => {
      const value = JSON.parse((await backup()).serialized);
      value.version = version;
      value.databaseSchemaVersion = 13 + version;
      delete value.data.trainingProfiles;
      delete value.data.shiftTrainingDetails;
      delete value.data.actualAnnualPayments;
      delete value.data.tariffAnnualClaims;
      delete value.data.tvlShiftWork;
      delete value.data.caritasWorkDays;
      delete value.data.caritasMonthFacts;
      delete value.data.caritasOvertime;
      delete value.data.tvoedAnnexAMonthConfirmations;
      delete value.data.tvoedSueMonthConfirmations;
      delete value.data.tvoedSueAllowanceConfirmations;
      delete value.data.tvoedAnnexAPremiumFacts;
      delete value.data.drkEmployeeMonthConfirmations;
      delete value.data.drkTrainingMonthConfirmations;
      if (version < 5) delete value.data.paidAbsences;
      if (version < 4) delete value.data.overtimeAllocations;
      if (version < 3) delete value.data.allowanceDecisions;
      if (version < 2) delete value.data.remunerationProfiles;
      const { integrity: _integrity, ...unsigned } = value;
      value.integrity.value = await sha256(canonicalize(unsigned)!);
      await saveTrainingProfile(db, { data: profile, expectedRevision: 0 });
      await restoreLocalBackup(db, await validate(JSON.stringify(value)));
      expect(await listTrainingProfiles(db)).toEqual([]);
      expect(await listShiftTraining(db)).toEqual([]);
    },
  );
  it("rejects corrupt or orphaned training records before replacing data", async () => {
    await saveShiftTraining(db, input);
    const original = await backup();
    for (const mutation of [
      (v: Record<string, unknown>) => {
        v.shift_id = "orphan";
      },
      (v: Record<string, unknown>) => {
        v.shift_revision = 999;
      },
      (v: Record<string, unknown>) => {
        v.data_json = '{"version":2}';
      },
      (v: Record<string, unknown>) => {
        v.extra = true;
      },
    ]) {
      const value = JSON.parse(original.serialized);
      mutation(value.data.shiftTrainingDetails[0]);
      const { integrity: _integrity, ...unsigned } = value;
      value.integrity.value = await sha256(canonicalize(unsigned)!);
      await expect(validate(JSON.stringify(value))).rejects.toThrow();
    }
    expect((await listShiftTraining(db))[0]?.data).toEqual(details);
  });
  it("rolls back a failed training restore together with all replaced user data", async () => {
    await saveTrainingProfile(db, { data: profile, expectedRevision: 0 });
    await saveShiftTraining(db, input);
    const source = await validate((await backup()).serialized);
    await saveTrainingProfile(db, {
      data: { ...profile, fullTimeCompulsorySchooling: true },
      expectedRevision: 1,
    });
    const before = await loadLocalBackupSnapshot(db);
    adapter.fail = "INSERT INTO shift_training_details";
    await expect(restoreLocalBackup(db, source)).rejects.toThrow("injected");
    expect(await loadLocalBackupSnapshot(db)).toEqual(before);
  });
  it("restores original school/pause data after a testlab run without resetting profiles", async () => {
    const original = await saveShiftTraining(db, input);
    const savedProfile = await saveTrainingProfile(db, { data: profile, expectedRevision: 0 });
    await setDeveloperMode(db, true);
    await generateTestRun(
      db,
      { startMonth: "2026-09", range: 1, scenario: "NORMAL_ROTATION" },
      work,
    );
    expect(await listShiftTraining(db)).toEqual([]);
    await restoreTestBackup(db, ["2026-09"]);
    expect(await listShiftTraining(db)).toEqual([original]);
    expect(await listTrainingProfiles(db)).toEqual([savedProfile]);
  });
});
