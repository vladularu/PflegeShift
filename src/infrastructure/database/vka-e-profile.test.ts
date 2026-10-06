import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import type { SQLiteDatabase } from "expo-sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateDatabase, LATEST_DATABASE_SCHEMA_VERSION } from "./migrations";
import { loadProfile, saveProfile } from "./profile-repository";
import { projectStoredSimpleProfile } from "./simple-app-profile";
import { VKA_E_PREFERENCE_KEY } from "@/domain/vka-e-tariff";
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
const e = {
  payGroup: "E9b" as const,
  payLevel: 4 as const,
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
const trainee = {
  trainingYear: 1 as const,
  sector: "BT_K" as const,
  tariffRegion: "OTHER" as const,
};
describe("simple TVöD E salary persistence", () => {
  it("keeps an E selection on identity and working-time edits without a fake P group", async () => {
    await saveProfile(memory.db, { ...work, vkaETariff: e });
    await saveProfile(memory.db, { ...work, weeklyMinutes: 1200, displayName: "Synthetic" });
    const saved = await loadProfile(memory.db);
    expect(saved?.vkaETariff).toEqual(e);
    expect(saved?.tariff).toBeNull();
    expect(saved?.weeklyMinutes).toBe(1200);
    expect((await projectStoredSimpleProfile(memory.db, saved))?.vkaETariff).toEqual(e);
  });
  it.each(["P", "manual", "training"])(
    "switches E to %s and back without retaining incompatible pay",
    async (mode) => {
      await saveProfile(memory.db, { ...work, vkaETariff: e });
      const input =
        mode === "P"
          ? { tariff: adult }
          : mode === "manual"
            ? { manualMonthlyGrossCents: 170000 }
            : { nursingTrainingTariff: trainee };
      await saveProfile(memory.db, { ...work, ...input });
      expect((await loadProfile(memory.db))?.vkaETariff).toBeUndefined();
      const saved = await saveProfile(memory.db, { ...work, vkaETariff: e });
      expect(saved.vkaETariff).toEqual(e);
      expect(saved.nursingTrainingTariff).toBeUndefined();
      expect(saved.manualMonthlyGrossCents).toBeNull();
      expect(saved.tariff).toBeNull();
    },
  );
  it("roundtrips E group, step, sector and region through a verified backup", async () => {
    const choice = {
      ...e,
      payGroup: "E12" as const,
      payLevel: 6 as const,
      sector: "BT_B" as const,
      tariffRegion: "KAV_BW" as const,
    };
    await saveProfile(memory.db, { ...work, vkaETariff: choice });
    const file = await backup();
    await saveProfile(memory.db, { ...work, tariff: adult });
    await restore(file.serialized);
    expect((await loadProfile(memory.db))?.vkaETariff).toEqual(choice);
  });
  it("restoring an older backup removes the later E selection", async () => {
    await saveProfile(memory.db, { ...work, tariff: adult });
    const file = await backup();
    await saveProfile(memory.db, { ...work, vkaETariff: e });
    await restore(file.serialized);
    expect((await loadProfile(memory.db))?.vkaETariff).toBeUndefined();
    expect((await loadProfile(memory.db))?.tariff).toEqual(adult);
  });
  it.each([
    { ...e, payGroup: "P8" },
    { ...e, payGroup: "E1", payLevel: 1 },
    { ...e, payLevel: "4" },
    { ...e, sector: "AT" },
    { ...e, tariffRegion: "UNKNOWN" },
    { ...e, birthDate: "2000-01-01" },
  ])("rejects invalid selection %j before changing pay", async (choice) => {
    await saveProfile(memory.db, { ...work, tariff: adult });
    await expect(
      saveProfile(memory.db, { ...work, vkaETariff: choice as typeof e }),
    ).rejects.toThrow();
    expect((await loadProfile(memory.db))?.tariff).toEqual(adult);
  });
  it.each([
    { tariff: adult },
    { manualMonthlyGrossCents: 100000 },
    { nursingTrainingTariff: trainee },
  ])("rejects mixed modes %j", async (other) => {
    await expect(saveProfile(memory.db, { ...work, vkaETariff: e, ...other })).rejects.toThrow();
    expect(await loadProfile(memory.db)).toBeNull();
  });
  it("rolls back both salary selections and profile on failed preference write", async () => {
    await saveProfile(memory.db, { ...work, nursingTrainingTariff: trainee });
    const run = memory.runAsync.bind(memory);
    memory.runAsync = async (sql, ...params) => {
      if (params[0] === VKA_E_PREFERENCE_KEY && sql.startsWith("INSERT"))
        throw Error("Synthetic E failure");
      return run(sql, ...params);
    };
    await expect(saveProfile(memory.db, { ...work, vkaETariff: e })).rejects.toThrow(
      "Synthetic E failure",
    );
    expect((await loadProfile(memory.db))?.nursingTrainingTariff).toEqual(trainee);
  });
  it("rejects contradictory E/trainee and malformed E backup data", async () => {
    await saveProfile(memory.db, { ...work, vkaETariff: e });
    await memory.db.runAsync(
      "INSERT INTO app_preferences(key,value,updated_at) VALUES(?,?,?)",
      NURSING_TRAINING_PREFERENCE_KEY,
      JSON.stringify(trainee),
      new Date().toISOString(),
    );
    await expect(restore((await backup()).serialized)).rejects.toThrow();
    await memory.db.runAsync(
      "DELETE FROM app_preferences WHERE key = ?",
      NURSING_TRAINING_PREFERENCE_KEY,
    );
    await memory.db.runAsync(
      "UPDATE app_preferences SET value=? WHERE key=?",
      '{"payGroup":"E1","payLevel":1}',
      VKA_E_PREFERENCE_KEY,
    );
    await expect(restore((await backup()).serialized)).rejects.toThrow();
  });
});
