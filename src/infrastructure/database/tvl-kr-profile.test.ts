import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import type { SQLiteDatabase } from "expo-sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateDatabase, LATEST_DATABASE_SCHEMA_VERSION } from "./migrations";
import { loadProfile, saveProfile } from "./profile-repository";
import { projectStoredSimpleProfile } from "./simple-app-profile";
import { TVL_KR_PREFERENCE_KEY } from "@/domain/tvl-kr-tariff";
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
const tvl = { payGroup: "KR8" as const, payLevel: 4 as const, universityRegion: "WEST" as const };
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
  { manualMonthlyGrossCents: 170000 },
] as const;
describe("simple TV-L nursing salary persistence", () => {
  it("retains KR selection on working-time edits and a fresh profile load", async () => {
    await saveProfile(memory.db, { ...work, tvlKrTariff: tvl });
    await saveProfile(memory.db, { ...work, weeklyMinutes: 1200, displayName: "Synthetic" });
    const profile = await loadProfile(memory.db);
    expect(profile?.tvlKrTariff).toEqual(tvl);
    expect(profile?.weeklyMinutes).toBe(1200);
    expect(profile?.tariff).toBeNull();
    expect(profile?.vkaETariff).toBeUndefined();
    expect(profile?.nursingTrainingTariff).toBeUndefined();
    expect(profile?.manualMonthlyGrossCents).toBeNull();
    expect((await projectStoredSimpleProfile(memory.db, profile))?.tvlKrTariff).toEqual(tvl);
  });
  it.each(alternatives)("switches TV-L to %j and back without another salary", async (other) => {
    await saveProfile(memory.db, { ...work, tvlKrTariff: tvl });
    await saveProfile(memory.db, { ...work, ...other });
    expect((await loadProfile(memory.db))?.tvlKrTariff).toBeUndefined();
    const profile = await saveProfile(memory.db, { ...work, tvlKrTariff: tvl });
    expect(profile.tvlKrTariff).toEqual(tvl);
    expect(profile.tariff).toBeNull();
    expect(profile.vkaETariff).toBeUndefined();
    expect(profile.nursingTrainingTariff).toBeUndefined();
    expect(profile.manualMonthlyGrossCents).toBeNull();
  });
  it.each(alternatives)("rejects mixed TV-L/%j modes without writing a profile", async (other) => {
    await expect(saveProfile(memory.db, { ...work, tvlKrTariff: tvl, ...other })).rejects.toThrow();
    expect(await loadProfile(memory.db)).toBeNull();
  });
  it("roundtrips KR group and level in a verified backup", async () => {
    const selected = {
      payGroup: "KR12" as const,
      payLevel: 6 as const,
      universityRegion: "EAST" as const,
    };
    await saveProfile(memory.db, { ...work, tvlKrTariff: selected });
    const file = await backup();
    await saveProfile(memory.db, { ...work, tariff: p });
    await restore(file.serialized);
    expect((await loadProfile(memory.db))?.tvlKrTariff).toEqual(selected);
  });
  it.each(alternatives)("restores an older %j backup and removes later TV-L", async (other) => {
    await saveProfile(memory.db, { ...work, ...other });
    const file = await backup();
    await saveProfile(memory.db, { ...work, tvlKrTariff: tvl });
    await restore(file.serialized);
    const profile = await loadProfile(memory.db);
    expect(profile?.tvlKrTariff).toBeUndefined();
    expect(profile).toMatchObject(other);
  });
  it.each([
    { ...tvl, payGroup: "P8" },
    { ...tvl, payGroup: "KR7", payLevel: 1 },
    { ...tvl, payLevel: "4" },
    { ...tvl, payLevel: 7 },
    { ...tvl, universityRegion: "UNKNOWN" },
    { payGroup: "KR8", payLevel: 4 },
    { ...tvl, sector: "BT_K" },
    { ...tvl, birthDate: "2000-01-01" },
  ])("rejects invalid %j without overwriting existing pay", async (value) => {
    await saveProfile(memory.db, { ...work, tariff: p });
    await expect(
      saveProfile(memory.db, { ...work, tvlKrTariff: value as typeof tvl }),
    ).rejects.toThrow();
    expect((await loadProfile(memory.db))?.tariff).toEqual(p);
  });
  it("rolls back profile and salary preferences on failed TV-L write", async () => {
    await saveProfile(memory.db, { ...work, vkaETariff: e });
    const run = memory.runAsync.bind(memory);
    memory.runAsync = async (sql, ...params) => {
      if (params[0] === TVL_KR_PREFERENCE_KEY && sql.startsWith("INSERT"))
        throw Error("Synthetic TV-L failure");
      return run(sql, ...params);
    };
    await expect(
      saveProfile(memory.db, { ...work, tvlKrTariff: tvl, weeklyMinutes: 1200 }),
    ).rejects.toThrow("Synthetic TV-L failure");
    const profile = await loadProfile(memory.db);
    expect(profile?.vkaETariff).toEqual(e);
    expect(profile?.weeklyMinutes).toBe(2310);
    expect(profile?.tvlKrTariff).toBeUndefined();
  });
  it.each([
    [VKA_E_PREFERENCE_KEY, e],
    [NURSING_TRAINING_PREFERENCE_KEY, trainee],
  ] as const)("rejects contradictory TV-L/%s backup", async (key, value) => {
    await saveProfile(memory.db, { ...work, tvlKrTariff: tvl });
    await memory.db.runAsync(
      "INSERT INTO app_preferences(key,value,updated_at) VALUES(?,?,?)",
      key,
      JSON.stringify(value),
      new Date().toISOString(),
    );
    await expect(restore((await backup()).serialized)).rejects.toThrow();
  });
  it("rejects malformed TV-L preference in backup and profile load", async () => {
    await saveProfile(memory.db, { ...work, tvlKrTariff: tvl });
    await memory.db.runAsync(
      "UPDATE app_preferences SET value=? WHERE key=?",
      JSON.stringify({ ...tvl, payLevel: 1 }),
      TVL_KR_PREFERENCE_KEY,
    );
    await expect(loadProfile(memory.db)).rejects.toThrow();
    await expect(restore((await backup()).serialized)).rejects.toThrow();
  });
});
