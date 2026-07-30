import Database from "better-sqlite3";
import type { SQLiteDatabase } from "expo-sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/infrastructure/database/migrations";
import {
  deleteCalendarEntry,
  deleteTemplate,
  listCalendarEntries,
  listTemplates,
  loadProfile,
  saveAppointment,
  saveProfile,
  saveShift,
  saveTemplate,
} from "@/infrastructure/database/repository";

class TestDatabase {
  readonly database = new Database(":memory:");

  async execAsync(source: string): Promise<void> {
    this.database.exec(source);
  }

  async runAsync(source: string, ...params: unknown[]) {
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

describe("SQLite repository", () => {
  let testDb: TestDatabase;
  let db: SQLiteDatabase;

  beforeEach(async () => {
    testDb = new TestDatabase();
    db = testDb as unknown as SQLiteDatabase;
    await migrateDatabase(db);
  });

  afterEach(() => {
    testDb.database.close();
  });

  it("runs migrations and seed data idempotently", async () => {
    await migrateDatabase(db);
    expect(await listTemplates(db)).toHaveLength(4);
    expect(testDb.database.prepare("SELECT COUNT(*) count FROM schema_migrations").get()).toEqual({ count: 1 });
  });

  it("persists the singleton profile", async () => {
    expect(await loadProfile(db)).toBeNull();
    const profile = await saveProfile(db, {
      federalState: "NW",
      weeklyMinutes: 2_310,
      timeZone: "Europe/Berlin",
    });
    expect(profile).toMatchObject({ federalState: "NW", weeklyMinutes: 2_310 });

    const updated = await saveProfile(db, {
      federalState: "BY",
      weeklyMinutes: 2_400,
      timeZone: "Europe/Berlin",
    });
    expect(updated).toMatchObject({ federalState: "BY", weeklyMinutes: 2_400 });
  });

  it("increments template revisions and keeps a tombstone", async () => {
    const created = await saveTemplate(db, {
      name: "Zwischendienst",
      type: "CUSTOM",
      startTime: "10:00",
      endTime: "18:00",
      breakMinutes: 30,
      color: "#21A0A0",
      symbol: "Z",
      sortOrder: 50,
    });
    expect(created.revision).toBe(1);

    const updated = await saveTemplate(db, {
      ...created,
      expectedRevision: created.revision,
      name: "Mittel",
    });
    expect(updated.revision).toBe(2);

    await deleteTemplate(db, updated.id, updated.revision);
    expect((await listTemplates(db)).some((template) => template.id === updated.id)).toBe(false);
    expect(
      testDb.database.prepare("SELECT revision,deleted_at FROM shift_templates WHERE id=?").get(updated.id),
    ).toMatchObject({ revision: 3 });
  });

  it("stores multiple entry kinds, updates them and soft-deletes them", async () => {
    const shift = await saveShift(db, {
      date: "2026-07-30",
      title: "Früh",
      type: "EARLY",
      startTime: "06:00",
      endTime: "14:12",
      breakMinutes: 30,
      color: "#7E57C2",
      symbol: "F",
    });
    const appointment = await saveAppointment(db, {
      date: "2026-07-30",
      title: "Arzt",
      allDay: false,
      startTime: "16:00",
      endTime: "17:00",
      color: "#F2A93B",
    });
    expect(await listCalendarEntries(db, "2026-07-30", "2026-07-30")).toHaveLength(2);

    const updated = await saveShift(db, {
      ...shift,
      expectedRevision: shift.revision,
      endTime: "15:00",
    });
    expect(updated.revision).toBe(2);

    await deleteCalendarEntry(db, updated);
    await deleteCalendarEntry(db, appointment);
    expect(await listCalendarEntries(db)).toHaveLength(0);
    expect(
      testDb.database.prepare("SELECT revision,deleted_at FROM shift_entries WHERE id=?").get(shift.id),
    ).toMatchObject({ revision: 3 });
  });

  it("rejects stale revisions", async () => {
    const shift = await saveShift(db, {
      date: "2026-07-30",
      title: "Tag",
      type: "DAY",
      startTime: "08:00",
      endTime: "16:12",
      breakMinutes: 30,
      color: "#2F80ED",
      symbol: "T",
    });
    await saveShift(db, { ...shift, expectedRevision: shift.revision, title: "Tagdienst" });
    await expect(
      saveShift(db, { ...shift, expectedRevision: shift.revision, title: "Veraltet" }),
    ).rejects.toThrow("zwischenzeitlich geändert");
  });
});
