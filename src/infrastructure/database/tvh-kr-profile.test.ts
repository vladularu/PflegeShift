import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import type { SQLiteDatabase } from "expo-sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateDatabase, LATEST_DATABASE_SCHEMA_VERSION } from "./migrations";
import { loadProfile, saveProfile } from "./profile-repository";
import { projectStoredSimpleProfile } from "./simple-app-profile";
import { TVH_KR_PREFERENCE_KEY } from "@/domain/tvh-kr-tariff";
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
const tvh = {
  payGroup: "KR8" as const,
  payLevel: 4 as const,
  fullTimeWeeklyMinutes: 2310 as const,
};
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
  { tvUkNursingTariff: { payGroup: "PUK8" as const, payLevel: 4 as const } },
  {
    tvlKrTariff: {
      payGroup: "KR8" as const,
      payLevel: 4 as const,
      universityRegion: "WEST" as const,
    },
  },
  { vkaETariff: e },
  { nursingTrainingTariff: trainee },
  { manualMonthlyGrossCents: 170000 },
] as const;
describe("simple TV-H nursing salary persistence", () => {
  it("retains KR selection on working-time edits and a fresh profile load", async () => {
    await saveProfile(memory.db, { ...work, tvhKrTariff: tvh });
    await saveProfile(memory.db, { ...work, weeklyMinutes: 1200, displayName: "Synthetic" });
    const profile = await loadProfile(memory.db);
    expect(profile?.tvhKrTariff).toEqual(tvh);
    expect(profile?.weeklyMinutes).toBe(1200);
    expect(profile?.tariff).toBeNull();
    expect(profile?.vkaETariff).toBeUndefined();
    expect(profile?.nursingTrainingTariff).toBeUndefined();
    expect(profile?.manualMonthlyGrossCents).toBeNull();
    expect((await projectStoredSimpleProfile(memory.db, profile))?.tvhKrTariff).toEqual(tvh);
  });
  it.each(alternatives)("switches TV-H to %j and back without another salary", async (other) => {
    await saveProfile(memory.db, { ...work, tvhKrTariff: tvh });
    await saveProfile(memory.db, { ...work, ...other });
    expect((await loadProfile(memory.db))?.tvhKrTariff).toBeUndefined();
    const profile = await saveProfile(memory.db, { ...work, tvhKrTariff: tvh });
    expect(profile.tvhKrTariff).toEqual(tvh);
    expect(profile.tariff).toBeNull();
    expect(profile.vkaETariff).toBeUndefined();
    expect(profile.nursingTrainingTariff).toBeUndefined();
    expect(profile.manualMonthlyGrossCents).toBeNull();
  });
  it.each(alternatives)("rejects mixed TV-H/%j modes without writing a profile", async (other) => {
    await expect(saveProfile(memory.db, { ...work, tvhKrTariff: tvh, ...other })).rejects.toThrow();
    expect(await loadProfile(memory.db)).toBeNull();
  });
  it("roundtrips KR group, 1b and full-time basis in a verified backup", async () => {
    const selected = {
      payGroup: "KR6" as const,
      payLevel: "1b" as const,
      fullTimeWeeklyMinutes: 2400 as const,
    };
    await saveProfile(memory.db, { ...work, tvhKrTariff: selected });
    const file = await backup();
    await saveProfile(memory.db, { ...work, tariff: p });
    await restore(file.serialized);
    expect((await loadProfile(memory.db))?.tvhKrTariff).toEqual(selected);
  });
  it.each(alternatives)("restores an older %j backup and removes later TV-H", async (other) => {
    await saveProfile(memory.db, { ...work, ...other });
    const file = await backup();
    await saveProfile(memory.db, { ...work, tvhKrTariff: tvh });
    await restore(file.serialized);
    const profile = await loadProfile(memory.db);
    expect(profile?.tvhKrTariff).toBeUndefined();
    expect(profile).toMatchObject(other);
  });
  it.each([
    { ...tvh, payGroup: "P8" },
    { ...tvh, payGroup: "KR7", payLevel: 1 },
    { ...tvh, payLevel: "4" },
    { ...tvh, payLevel: 8 },
    { ...tvh, fullTimeWeeklyMinutes: 2340 },
    { ...tvh, universityRegion: "UNKNOWN" },
    { payGroup: "KR8" },
    { ...tvh, sector: "BT_K" },
    { ...tvh, birthDate: "2000-01-01" },
  ])("rejects invalid %j without overwriting existing pay", async (value) => {
    await saveProfile(memory.db, { ...work, tariff: p });
    await expect(
      saveProfile(memory.db, { ...work, tvhKrTariff: value as typeof tvh }),
    ).rejects.toThrow();
    expect((await loadProfile(memory.db))?.tariff).toEqual(p);
  });
  it("preserves distinct entry steps through storage", async () => {
    for (const payLevel of ["1a", "1b"] as const) {
      const selected = { ...tvh, payGroup: "KR5" as const, payLevel };
      await saveProfile(memory.db, { ...work, tvhKrTariff: selected });
      expect((await loadProfile(memory.db))?.tvhKrTariff).toEqual(selected);
    }
  });
  it("rejects contracted hours above selected full-time without overwriting", async () => {
    await saveProfile(memory.db, { ...work, tvhKrTariff: tvh });
    await expect(saveProfile(memory.db, { ...work, weeklyMinutes: 2400 })).rejects.toThrow();
    expect((await loadProfile(memory.db))?.weeklyMinutes).toBe(2310);
  });
  it("rolls back profile and salary preferences on failed TV-H write", async () => {
    await saveProfile(memory.db, { ...work, vkaETariff: e });
    const run = memory.runAsync.bind(memory);
    memory.runAsync = async (sql, ...params) => {
      if (params[0] === TVH_KR_PREFERENCE_KEY && sql.startsWith("INSERT"))
        throw Error("Synthetic TV-H failure");
      return run(sql, ...params);
    };
    await expect(
      saveProfile(memory.db, { ...work, tvhKrTariff: tvh, weeklyMinutes: 1200 }),
    ).rejects.toThrow("Synthetic TV-H failure");
    const profile = await loadProfile(memory.db);
    expect(profile?.vkaETariff).toEqual(e);
    expect(profile?.weeklyMinutes).toBe(2310);
    expect(profile?.tvhKrTariff).toBeUndefined();
  });
  it.each([
    [VKA_E_PREFERENCE_KEY, e],
    [NURSING_TRAINING_PREFERENCE_KEY, trainee],
  ] as const)("rejects contradictory TV-H/%s backup", async (key, value) => {
    await saveProfile(memory.db, { ...work, tvhKrTariff: tvh });
    await memory.db.runAsync(
      "INSERT INTO app_preferences(key,value,updated_at) VALUES(?,?,?)",
      key,
      JSON.stringify(value),
      new Date().toISOString(),
    );
    await expect(restore((await backup()).serialized)).rejects.toThrow();
  });
  it("rejects a backup with contracted hours above TV-H full-time", async () => {
    await saveProfile(memory.db, { ...work, tvhKrTariff: tvh });
    await memory.db.runAsync("UPDATE user_profile SET weekly_minutes=?", 2400);
    await expect(restore((await backup()).serialized)).rejects.toThrow();
  });
  it("rejects malformed TV-H preference in backup and profile load", async () => {
    await saveProfile(memory.db, { ...work, tvhKrTariff: tvh });
    await memory.db.runAsync(
      "UPDATE app_preferences SET value=? WHERE key=?",
      JSON.stringify({ ...tvh, payLevel: 1 }),
      TVH_KR_PREFERENCE_KEY,
    );
    await expect(loadProfile(memory.db)).rejects.toThrow();
    await expect(restore((await backup()).serialized)).rejects.toThrow();
  });
});
