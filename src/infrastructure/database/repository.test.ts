import Database from "better-sqlite3";
import type { SQLiteDatabase } from "expo-sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { migrateDatabase } from "@/infrastructure/database/migrations";
import {
  deleteCalendarEntry,
  deleteTemplate,
  listCalendarEntries,
  listMonthlyTariffDecisions,
  listTemplates,
  loadCalendarPreferences,
  loadProfile,
  loadTvoedWorkPatternSettings,
  restoreCalendarEntry,
  restoreTemplate,
  saveAppointment,
  saveCalendarPreferences,
  saveProfile,
  saveShift,
  saveMonthlyTariffDecision,
  saveTemplate,
  saveTvoedWorkPatternSettings,
  swapTemplateSortOrder,
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
    const templates = await listTemplates(db);
    expect(templates).toHaveLength(7);
    expect(templates.find((template) => template.id === "default-free")?.symbol).toBe("–");
    expect(testDb.database.prepare("SELECT COUNT(*) count FROM schema_migrations").get()).toEqual({
      count: 6,
    });
    expect(testDb.database.pragma("secure_delete", { simple: true })).toBe(1);
  });

  it("rejects malformed persisted values before they reach engine rendering", async () => {
    testDb.database
      .prepare("UPDATE shift_templates SET start_time='99:00' WHERE id='default-early'")
      .run();

    await expect(listTemplates(db)).rejects.toThrow("Uhrzeiten");

    testDb.database
      .prepare(
        `INSERT INTO user_profile(
        id,federal_state,weekly_minutes,time_zone,created_at,updated_at
       ) VALUES ('singleton','NW',2310,'SQL/Not-A-Time-Zone','now','now')`,
      )
      .run();
    await expect(loadProfile(db)).rejects.toThrow("Zeitzone");
  });

  it("finishes an interrupted second migration without losing existing data", async () => {
    testDb.database.exec("DELETE FROM schema_migrations WHERE version=2");
    testDb.database.exec("DROP TABLE monthly_tariff_decisions");
    testDb.database.exec(
      "INSERT INTO user_profile(id,federal_state,weekly_minutes,time_zone,created_at,updated_at) VALUES ('singleton','NW',2310,'Europe/Berlin','now','now')",
    );
    testDb.database.exec(
      "ALTER TABLE user_profile RENAME COLUMN pay_group TO interrupted_pay_group",
    );
    testDb.database.exec("ALTER TABLE user_profile ADD COLUMN pay_group TEXT");

    await migrateDatabase(db);

    expect(await loadProfile(db)).toMatchObject({
      federalState: "NW",
      weeklyMinutes: 2_310,
      tariff: null,
    });
    expect(
      testDb.database.prepare("SELECT COUNT(*) count FROM schema_migrations WHERE version=2").get(),
    ).toEqual({ count: 1 });
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
      tariff: {
        payGroup: "P8",
        payLevel: 4,
        sector: "BT_K",
        fullTimeWeeklyMinutes: 2_310,
      },
    });
    expect(updated).toMatchObject({
      federalState: "BY",
      weeklyMinutes: 2_400,
      tariff: { payGroup: "P8", payLevel: 4, sector: "BT_K" },
    });
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
      testDb.database
        .prepare("SELECT revision,deleted_at FROM shift_templates WHERE id=?")
        .get(updated.id),
    ).toMatchObject({ revision: 3 });

    const restored = await restoreTemplate(db, updated);
    expect(restored).toMatchObject({ id: updated.id, revision: 4, deletedAt: null });
    expect((await listTemplates(db)).some((template) => template.id === updated.id)).toBe(true);
  });

  it("swaps template sort order atomically", async () => {
    const [first, second] = await listTemplates(db);
    const swapped = await swapTemplateSortOrder(db, first, second);

    expect(swapped.find((template) => template.id === first.id)).toMatchObject({
      sortOrder: second.sortOrder,
      revision: first.revision + 1,
    });
    expect(swapped.find((template) => template.id === second.id)).toMatchObject({
      sortOrder: first.sortOrder,
      revision: second.revision + 1,
    });
  });

  it("rolls back both template order writes when the second update fails", async () => {
    const [first, second] = await listTemplates(db);
    testDb.database.exec(
      `CREATE TRIGGER fail_second_template_move
       BEFORE UPDATE OF sort_order ON shift_templates
       WHEN OLD.id = '${second.id}'
       BEGIN SELECT RAISE(ABORT, 'injected second update failure'); END`,
    );

    await expect(swapTemplateSortOrder(db, first, second)).rejects.toThrow(
      "injected second update failure",
    );

    const unchanged = await listTemplates(db);
    expect(unchanged.find((template) => template.id === first.id)).toMatchObject({
      sortOrder: first.sortOrder,
      revision: first.revision,
    });
    expect(unchanged.find((template) => template.id === second.id)).toMatchObject({
      sortOrder: second.sortOrder,
      revision: second.revision,
    });
  });

  it("projects template presentation changes onto existing entries without changing times", async () => {
    const early = (await listTemplates(db)).find((template) => template.id === "default-early");
    if (!early) throw new Error("Default early template missing");
    await saveShift(db, {
      date: "2026-07-30",
      templateId: early.id,
      title: early.name,
      type: early.type,
      startTime: early.startTime,
      endTime: early.endTime,
      breakMinutes: early.breakMinutes,
      color: early.color,
      symbol: early.symbol,
    });

    await saveTemplate(db, {
      ...early,
      expectedRevision: early.revision,
      name: "Früh neu",
      startTime: "07:00",
      endTime: "15:00",
      color: "#21A0A0",
      symbol: "FN",
    });

    expect((await listCalendarEntries(db))[0]).toMatchObject({
      title: "Früh neu",
      color: "#21A0A0",
      symbol: "FN",
      startTime: "06:00",
      endTime: "14:12",
      breakMinutes: 30,
    });
  });

  it("stores editable absence templates and links new absence entries", async () => {
    const sick = (await listTemplates(db)).find((template) => template.id === "default-sick");
    if (!sick) throw new Error("Default sickness template missing");
    expect(sick).toMatchObject({
      type: "SICK",
      startTime: null,
      endTime: null,
      breakMinutes: 0,
    });
    const saved = await saveShift(db, {
      date: "2026-07-30",
      templateId: sick.id,
      title: sick.name,
      type: sick.type,
      startTime: null,
      endTime: null,
      breakMinutes: 0,
      color: sick.color,
      symbol: sick.symbol,
    });
    expect(saved.templateId).toBe("default-sick");
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
      overtimeMinutes: 30,
      holidayPremiumMode: "WITHOUT_TIME_OFF",
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
    expect(updated).toMatchObject({
      overtimeMinutes: 30,
      holidayPremiumMode: "WITHOUT_TIME_OFF",
    });

    await deleteCalendarEntry(db, updated);
    await deleteCalendarEntry(db, appointment);
    expect(await listCalendarEntries(db)).toHaveLength(0);
    expect(
      testDb.database
        .prepare("SELECT revision,deleted_at FROM shift_entries WHERE id=?")
        .get(shift.id),
    ).toMatchObject({ revision: 3 });

    const restored = await restoreCalendarEntry(db, updated);
    expect(restored).toMatchObject({ id: updated.id, revision: 4, deletedAt: null });
    expect(await listCalendarEntries(db)).toHaveLength(1);
  });

  it("persists and revises monthly tariff decisions", async () => {
    const created = await saveMonthlyTariffDecision(db, {
      month: "2026-07",
      allowanceStatus: "SHIFT_MONTHLY",
    });
    expect(created.revision).toBe(1);
    const updated = await saveMonthlyTariffDecision(db, {
      month: "2026-07",
      allowanceStatus: "ALTERNATING_MONTHLY",
      expectedRevision: created.revision,
    });
    expect(updated).toMatchObject({
      allowanceStatus: "ALTERNATING_MONTHLY",
      revision: 2,
    });
    expect(await listMonthlyTariffDecisions(db)).toHaveLength(1);
  });

  it("rejects invalid tariff decisions from writes and persisted rows", async () => {
    await expect(
      saveMonthlyTariffDecision(db, {
        month: "2026-99",
        allowanceStatus: "SHIFT_MONTHLY",
      }),
    ).rejects.toThrow("Auswertungsmonat");

    await saveMonthlyTariffDecision(db, {
      month: "2026-08",
      allowanceStatus: "SHIFT_MONTHLY",
    });
    testDb.database
      .prepare(
        "UPDATE monthly_tariff_decisions SET confirmed_at='not-an-instant' WHERE month='2026-08'",
      )
      .run();
    await expect(listMonthlyTariffDecisions(db)).rejects.toThrow("Zeitstempel");
  });

  it("persists calendar visibility, labels and time details", async () => {
    expect(await loadCalendarPreferences(db)).toMatchObject({
      labelMode: "FULL",
      showShiftTimes: false,
      showShiftDuration: false,
    });
    await saveCalendarPreferences(db, {
      viewMode: "YEAR",
      showShifts: true,
      showAppointments: false,
      showHolidays: false,
      labelMode: "SYMBOL",
      showShiftTimes: true,
      showShiftDuration: true,
    });
    expect(await loadCalendarPreferences(db)).toEqual({
      viewMode: "YEAR",
      showShifts: true,
      showAppointments: false,
      showHolidays: false,
      labelMode: "SYMBOL",
      showShiftTimes: true,
      showShiftDuration: true,
    });
  });

  it("rolls back every calendar preference when one write fails", async () => {
    const before = await loadCalendarPreferences(db);
    const originalRunAsync = testDb.runAsync.bind(testDb);
    let preferenceWrites = 0;
    const runSpy = vi.spyOn(testDb, "runAsync").mockImplementation(async (source, ...params) => {
      if (source.includes("INSERT INTO app_preferences")) {
        preferenceWrites += 1;
        if (preferenceWrites === 4) throw new Error("injected preference failure");
      }
      return originalRunAsync(source, ...params);
    });

    await expect(
      saveCalendarPreferences(db, {
        viewMode: "YEAR",
        showShifts: false,
        showAppointments: false,
        showHolidays: false,
        labelMode: "SYMBOL",
        showShiftTimes: true,
        showShiftDuration: true,
      }),
    ).rejects.toThrow("injected preference failure");
    runSpy.mockRestore();

    expect(await loadCalendarPreferences(db)).toEqual(before);
  });

  it("persists work-pattern settings on the existing database connection", async () => {
    const saved = await saveTvoedWorkPatternSettings(db, {
      workplaceCoverage: "AROUND_THE_CLOCK",
      assignment: "PERMANENT",
    });

    expect(saved).toMatchObject({
      workplaceCoverage: "AROUND_THE_CLOCK",
      assignment: "PERMANENT",
    });
    expect(await loadTvoedWorkPatternSettings(db)).toEqual(saved);
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
