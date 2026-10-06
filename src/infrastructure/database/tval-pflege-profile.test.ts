import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import type { SQLiteDatabase } from "expo-sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateDatabase, LATEST_DATABASE_SCHEMA_VERSION } from "./migrations";
import { loadProfile, saveProfile } from "./profile-repository";
import { projectStoredSimpleProfile } from "./simple-app-profile";
import { TVAL_PFLEGE_PREFERENCE_KEY } from "@/domain/tval-pflege-tariff";
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
const selected = { trainingYear: 1 as const, universityRegion: "WEST" as const };
const p = {
  payGroup: "P8" as const,
  payLevel: 4 as const,
  sector: "BT_K" as const,
  tariffRegion: "OTHER" as const,
  fullTimeWeeklyMinutes: 2310,
};
const e = {
  payGroup: "E9b" as const,
  payLevel: 4 as const,
  sector: "BT_K" as const,
  tariffRegion: "OTHER" as const,
};
const trainee = {
  trainingYear: 1 as const,
  sector: "BT_K" as const,
  tariffRegion: "OTHER" as const,
};
const alternatives = [
  { tariff: p },
  { vkaETariff: e },
  { nursingTrainingTariff: trainee },
  {
    tvlKrTariff: {
      payGroup: "KR8" as const,
      payLevel: 4 as const,
      universityRegion: "WEST" as const,
    },
  },
  { tvUkNursingTariff: { payGroup: "PUK8" as const, payLevel: 4 as const } },
  {
    tvhKrTariff: {
      payGroup: "KR8" as const,
      payLevel: 4 as const,
      fullTimeWeeklyMinutes: 2310 as const,
    },
  },
  { manualMonthlyGrossCents: 170000 },
] as const;
describe("simple TVA-L Pflege persistence", () => {
  it("retains training selection through work edits and fresh profile projection", async () => {
    await saveProfile(memory.db, { ...work, tvalPflegeTariff: selected });
    await saveProfile(memory.db, { ...work, weeklyMinutes: 1200, displayName: "Synthetic" });
    const profile = await loadProfile(memory.db);
    expect(profile).toMatchObject({
      tvalPflegeTariff: selected,
      weeklyMinutes: 1200,
      tariff: null,
      manualMonthlyGrossCents: null,
    });
    expect((await projectStoredSimpleProfile(memory.db, profile))?.tvalPflegeTariff).toEqual(
      selected,
    );
  });
  it.each(alternatives)("switches to %j and back exclusively", async (other) => {
    await saveProfile(memory.db, { ...work, tvalPflegeTariff: selected });
    await saveProfile(memory.db, { ...work, ...other });
    expect((await loadProfile(memory.db))?.tvalPflegeTariff).toBeUndefined();
    const profile = await saveProfile(memory.db, { ...work, tvalPflegeTariff: selected });
    expect(profile.tvalPflegeTariff).toEqual(selected);
    for (const key of Object.keys(other))
      expect(profile[key as keyof typeof profile] == null).toBe(true);
  });
  it.each(alternatives)("rejects contradictory %j without writing", async (other) => {
    await expect(
      saveProfile(memory.db, { ...work, tvalPflegeTariff: selected, ...other }),
    ).rejects.toThrow();
    expect(await loadProfile(memory.db)).toBeNull();
  });
  it("roundtrips year 3 and East region through a verified backup", async () => {
    const east = { trainingYear: 3 as const, universityRegion: "EAST" as const };
    await saveProfile(memory.db, { ...work, tvalPflegeTariff: east });
    const file = await backup();
    await saveProfile(memory.db, { ...work, tariff: p });
    await restore(file.serialized);
    expect((await loadProfile(memory.db))?.tvalPflegeTariff).toEqual(east);
  });
  it.each(alternatives)("restoring earlier %j removes later TVA-L", async (other) => {
    await saveProfile(memory.db, { ...work, ...other });
    const file = await backup();
    await saveProfile(memory.db, { ...work, tvalPflegeTariff: selected });
    await restore(file.serialized);
    const profile = await loadProfile(memory.db);
    expect(profile?.tvalPflegeTariff).toBeUndefined();
    expect(profile).toMatchObject(other);
  });
  it.each([
    { ...selected, trainingYear: 0 },
    { ...selected, trainingYear: 4 },
    { ...selected, trainingYear: "1" },
    { ...selected, universityRegion: "UNKNOWN" },
    { trainingYear: 1 },
    { ...selected, birthDate: "2000-01-01" },
    { ...selected, sector: "BT_K" },
  ])("rejects malformed %j without overwriting salary", async (value) => {
    await saveProfile(memory.db, { ...work, tariff: p });
    await expect(
      saveProfile(memory.db, { ...work, tvalPflegeTariff: value as typeof selected }),
    ).rejects.toThrow();
    expect((await loadProfile(memory.db))?.tariff).toEqual(p);
  });
  it("rolls back the profile and all tariff preferences on failed write", async () => {
    await saveProfile(memory.db, { ...work, vkaETariff: e });
    const run = memory.runAsync.bind(memory);
    memory.runAsync = async (sql, ...params) => {
      if (params[0] === TVAL_PFLEGE_PREFERENCE_KEY && sql.startsWith("INSERT"))
        throw Error("Synthetic TVA-L failure");
      return run(sql, ...params);
    };
    await expect(
      saveProfile(memory.db, { ...work, tvalPflegeTariff: selected, weeklyMinutes: 1200 }),
    ).rejects.toThrow("Synthetic TVA-L failure");
    expect(await loadProfile(memory.db)).toMatchObject({ vkaETariff: e, weeklyMinutes: 2310 });
  });
  it.each([
    [VKA_E_PREFERENCE_KEY, e],
    [NURSING_TRAINING_PREFERENCE_KEY, trainee],
  ] as const)("rejects conflicting %s on load and backup restore", async (key, value) => {
    await saveProfile(memory.db, { ...work, tvalPflegeTariff: selected });
    await memory.db.runAsync(
      "INSERT INTO app_preferences(key,value,updated_at) VALUES(?,?,?)",
      key,
      JSON.stringify(value),
      new Date().toISOString(),
    );
    await expect(loadProfile(memory.db)).rejects.toThrow();
    await expect(restore((await backup()).serialized)).rejects.toThrow();
  });
  it("rejects corrupted training data during load and backup restore", async () => {
    await saveProfile(memory.db, { ...work, tvalPflegeTariff: selected });
    await memory.db.runAsync(
      "UPDATE app_preferences SET value=? WHERE key=?",
      JSON.stringify({ ...selected, trainingYear: 4 }),
      TVAL_PFLEGE_PREFERENCE_KEY,
    );
    await expect(loadProfile(memory.db)).rejects.toThrow();
    await expect(restore((await backup()).serialized)).rejects.toThrow();
  });
});
