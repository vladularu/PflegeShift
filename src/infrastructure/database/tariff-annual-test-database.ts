import Database from "better-sqlite3";
import type { SQLiteDatabase } from "expo-sqlite";
import { migrateDatabase } from "./migrations";
import { migrateTariffAnnualClaims } from "./migration-21-tariff-annual-claims";
import { saveProfile } from "./profile-repository";
import { work } from "@/engine/remuneration-test-fixtures";

/** Isolated Node test adapter; never included by the app composition. */
export class TariffAnnualTestDatabase {
  readonly database: Database.Database;
  fail: string | null = null;
  constructor(path: string | Buffer = ":memory:") {
    this.database = new Database(path);
  }
  get db() {
    return this as unknown as SQLiteDatabase;
  }
  async setup() {
    await migrateDatabase(this.db);
    await migrateTariffAnnualClaims(this.db, "2026-09-22T12:00:00Z");
    await saveProfile(this.db, work);
  }
  async execAsync(sql: string) {
    this.database.exec(sql);
  }
  async runAsync(sql: string, ...params: unknown[]) {
    if (this.fail && sql.includes(this.fail)) throw new Error("injected write failure");
    const r = this.database.prepare(sql).run(...params);
    return { changes: r.changes, lastInsertRowId: Number(r.lastInsertRowid) };
  }
  async getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null> {
    return (this.database.prepare(sql).get(...params) as T | undefined) ?? null;
  }
  async getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    return this.database.prepare(sql).all(...params) as T[];
  }
  async prepareAsync(sql: string) {
    const s = this.database.prepare(sql);
    return {
      executeAsync: async (params: unknown[]) => {
        if (this.fail && sql.includes(this.fail)) throw new Error("injected write failure");
        const r = s.run(...params);
        return { changes: r.changes, lastInsertRowId: Number(r.lastInsertRowid) };
      },
      finalizeAsync: async () => {},
    };
  }
}
