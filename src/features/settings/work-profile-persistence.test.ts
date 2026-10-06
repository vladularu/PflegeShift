import Database from "better-sqlite3";
import type { SQLiteDatabase } from "expo-sqlite";
import { mkdtempSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateDatabase } from "@/infrastructure/database/migrations";
import { loadProfile, saveProfile } from "@/infrastructure/database/profile-repository";
import type { SaveProfileInput } from "@/domain/types";
class FileDatabase {
  readonly database: Database.Database;
  constructor(path: string) {
    this.database = new Database(path);
  }
  async execAsync(sql: string) {
    this.database.exec(sql);
  }
  async runAsync(sql: string, ...params: unknown[]) {
    const result = this.database.prepare(sql).run(...params);
    return { changes: result.changes, lastInsertRowId: Number(result.lastInsertRowid) };
  }
  async getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null> {
    return (this.database.prepare(sql).get(...params) as T) ?? null;
  }
  async getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    return this.database.prepare(sql).all(...params) as T[];
  }
  get port() {
    return this as unknown as SQLiteDatabase;
  }
}
const existing: SaveProfileInput = {
  displayName: "Alex",
  employerName: "Klinikum",
  federalState: "NW",
  holidayRegion: "NONE",
  weeklyMinutes: 2310,
  timeZone: "Europe/Berlin",
  industry: "HEALTHCARE",
  regularRotatingNightWork: null,
  sundayHolidayWorkEligible: false,
  allEmploymentWorkRecorded: true,
  tariff: {
    payGroup: "P8",
    payLevel: 4,
    sector: "BT_K",
    tariffRegion: "OTHER",
    fullTimeWeeklyMinutes: 2310,
  },
};
describe("work profile persistence across connection restart", () => {
  let directory: string;
  let path: string;
  let db: FileDatabase;
  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), "luna-profile-flow-"));
    path = join(directory, "profile.sqlite");
    db = new FileDatabase(path);
    await migrateDatabase(db.port);
    await saveProfile(db.port, existing);
  });
  afterEach(() => {
    db.database.close();
    unlinkSync(path);
    rmdirSync(directory);
  });
  it("loads the existing profile, saves a whole work/identity draft and reopens it without changing salary or assumptions", async () => {
    const loaded = await loadProfile(db.port);
    expect(loaded).toMatchObject(existing);
    const saved = await saveProfile(db.port, {
      ...loaded!,
      displayName: "Andrea",
      weeklyMinutes: 1800,
    });
    db.database.close();
    db = new FileDatabase(path);
    await migrateDatabase(db.port);
    expect(await loadProfile(db.port)).toEqual(saved);
    expect(await loadProfile(db.port)).toMatchObject({
      ...existing,
      displayName: "Andrea",
      weeklyMinutes: 1800,
    });
  });
  it("rejects an invalid dependent group/stage without changing the previous persisted profile", async () => {
    const loaded = await loadProfile(db.port);
    await expect(
      saveProfile(db.port, {
        ...loaded!,
        tariff: { ...loaded!.tariff!, payGroup: "P7", payLevel: 1 },
      }),
    ).rejects.toThrow();
    db.database.close();
    db = new FileDatabase(path);
    expect(await loadProfile(db.port)).toEqual(loaded);
  });
});
