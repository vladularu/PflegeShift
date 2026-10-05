import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import type { SQLiteDatabase } from "expo-sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateDatabase, LATEST_DATABASE_SCHEMA_VERSION } from "./migrations";
import { loadProfile, saveProfile } from "./profile-repository";
import { projectStoredSimpleProfile } from "./simple-app-profile";
import { NURSING_TRAINING_PREFERENCE_KEY } from "@/domain/nursing-training";
import { createLocalBackupDocument, loadLocalBackupSnapshot } from "./local-backup";
import { validateLocalBackup } from "./local-backup-validation";
import { restoreLocalBackup } from "./local-backup-restore";
class MemoryDatabase {
  readonly raw = new Database(":memory:");
  async execAsync(sql: string) {
    this.raw.exec(sql);
  }
  async runAsync(sql: string, ...params: unknown[]) {
    const result = this.raw.prepare(sql).run(...params);
    return { changes: result.changes, lastInsertRowId: Number(result.lastInsertRowid) };
  }
  async getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null> {
    return (this.raw.prepare(sql).get(...params) as T | undefined) ?? null;
  }
  async getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    return this.raw.prepare(sql).all(...params) as T[];
  }
  get db() {
    return this as unknown as SQLiteDatabase;
  }
}
const sha256 = async (text: string) => createHash("sha256").update(text).digest("hex");
let memory: MemoryDatabase;
beforeEach(async () => {
  memory = new MemoryDatabase();
  await migrateDatabase(memory.db);
});
afterEach(() => memory.raw.close());
async function backup() {
  return createLocalBackupDocument(await loadLocalBackupSnapshot(memory.db), {
    appVersion: "synthetic",
    createdAt: new Date(),
    sha256,
  });
}
async function restore(serialized: string) {
  const document = await validateLocalBackup(serialized, {
    maxDatabaseSchemaVersion: LATEST_DATABASE_SCHEMA_VERSION,
    sha256,
  });
  await restoreLocalBackup(memory.db, document);
}

const work = {
  federalState: "NW" as const,
  holidayRegion: "NONE" as const,
  weeklyMinutes: 2310,
  timeZone: "Europe/Berlin",
};
const trainee = {
  trainingYear: 2 as const,
  sector: "BT_K" as const,
  tariffRegion: "OTHER" as const,
};
const adult = {
  payGroup: "P8" as const,
  payLevel: 4 as const,
  sector: "BT_K" as const,
  tariffRegion: "OTHER" as const,
  fullTimeWeeklyMinutes: 2310,
};
describe("simple nursing training salary persistence", () => {
  it("keeps an older profile without a training selection", async () => {
    const result = await saveProfile(memory.db, { ...work, tariff: adult });
    expect(result.tariff).toEqual(adult);
    expect(result.nursingTrainingTariff).toBeUndefined();
  });
  it("saves a trainee without a fake P group and preserves it on identity/work edits", async () => {
    await saveProfile(memory.db, { ...work, nursingTrainingTariff: trainee });
    await saveProfile(memory.db, { ...work, displayName: "Synthetic", weeklyMinutes: 2000 });
    const saved = await loadProfile(memory.db);
    expect(saved?.nursingTrainingTariff).toEqual(trainee);
    expect(saved?.tariff).toBeNull();
    expect((await projectStoredSimpleProfile(memory.db, saved))?.nursingTrainingTariff).toEqual(
      trainee,
    );
  });
  it.each(["adult", "manual"])(
    "explicit switching to %s removes the old trainee choice",
    async (mode) => {
      await saveProfile(memory.db, { ...work, nursingTrainingTariff: trainee });
      await saveProfile(memory.db, {
        ...work,
        ...(mode === "adult" ? { tariff: adult } : { manualMonthlyGrossCents: 170000 }),
      });
      expect((await loadProfile(memory.db))?.nursingTrainingTariff).toBeUndefined();
    },
  );
  it("switches from manual pay to trainee pay without retaining the manual amount", async () => {
    await saveProfile(memory.db, { ...work, manualMonthlyGrossCents: 170000 });
    const saved = await saveProfile(memory.db, { ...work, nursingTrainingTariff: trainee });
    expect(saved.manualMonthlyGrossCents).toBeNull();
    expect(saved.nursingTrainingTariff).toEqual(trainee);
  });
  it("roundtrips year, sector and region through a validated local backup", async () => {
    await saveProfile(memory.db, {
      ...work,
      nursingTrainingTariff: {
        ...trainee,
        trainingYear: 3,
        sector: "BT_B",
        tariffRegion: "KAV_BW",
      },
    });
    const file = await backup();
    await saveProfile(memory.db, { ...work, tariff: adult });
    await restore(file.serialized);
    expect((await loadProfile(memory.db))?.nursingTrainingTariff).toEqual({
      ...trainee,
      trainingYear: 3,
      sector: "BT_B",
      tariffRegion: "KAV_BW",
    });
  });
  it("restoring an old backup removes a later trainee preference", async () => {
    await saveProfile(memory.db, { ...work, tariff: adult });
    const file = await backup();
    await saveProfile(memory.db, { ...work, nursingTrainingTariff: trainee });
    await restore(file.serialized);
    expect((await loadProfile(memory.db))?.tariff).toEqual(adult);
    expect((await loadProfile(memory.db))?.nursingTrainingTariff).toBeUndefined();
  });
  it.each([0, 4, "2", true])(
    "rejects invalid training year %s before changing pay",
    async (trainingYear) => {
      await saveProfile(memory.db, { ...work, tariff: adult });
      await expect(
        saveProfile(memory.db, {
          ...work,
          nursingTrainingTariff: { ...trainee, trainingYear } as typeof trainee,
        }),
      ).rejects.toThrow();
      expect((await loadProfile(memory.db))?.tariff).toEqual(adult);
    },
  );
  it("rejects simultaneous adult and trainee modes", async () => {
    await expect(
      saveProfile(memory.db, { ...work, tariff: adult, nursingTrainingTariff: trainee }),
    ).rejects.toThrow();
    expect(await loadProfile(memory.db)).toBeNull();
  });
  it("rolls back the profile when storing the trainee preference fails", async () => {
    await saveProfile(memory.db, { ...work, tariff: adult });
    const run = memory.runAsync.bind(memory);
    memory.runAsync = async (sql, ...params) => {
      if (sql.startsWith("INSERT INTO app_preferences")) throw new Error("Synthetic write failure");
      return run(sql, ...params);
    };
    await expect(
      saveProfile(memory.db, { ...work, nursingTrainingTariff: trainee }),
    ).rejects.toThrow("Synthetic");
    expect((await loadProfile(memory.db))?.tariff).toEqual(adult);
  });
  it("rejects malformed and contradictory training data during backup validation", async () => {
    await saveProfile(memory.db, { ...work, tariff: adult });
    await memory.db.runAsync(
      "INSERT INTO app_preferences(key,value,updated_at) VALUES(?,?,?)",
      NURSING_TRAINING_PREFERENCE_KEY,
      JSON.stringify(trainee),
      new Date().toISOString(),
    );
    await expect(restore((await backup()).serialized)).rejects.toThrow();
    await memory.db.runAsync(
      "UPDATE app_preferences SET value = ? WHERE key = ?",
      '{"trainingYear":4}',
      NURSING_TRAINING_PREFERENCE_KEY,
    );
    await expect(restore((await backup()).serialized)).rejects.toThrow();
  });
});
