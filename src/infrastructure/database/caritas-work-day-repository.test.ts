import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isCurrentCaritasWorkDay,
  validateSavedCaritasWorkDay,
} from "@/domain/saved-caritas-work-day";
import { saveShift } from "./calendar-entry-repository";
import {
  listCaritasWorkDays,
  mapCaritasWorkDayRow,
  saveCaritasWorkDay,
} from "./caritas-work-day-repository";
import { migrateDatabase } from "./migrations";
import { TariffAnnualTestDatabase } from "./tariff-annual-test-database";
import { setupTvlShiftWork, type TvlShiftWorkFixture } from "./tvl-shift-work-test-fixtures";

describe("Caritas confirmed work-day facts", () => {
  let f: TvlShiftWorkFixture;
  beforeEach(async () => {
    f = await setupTvlShiftWork();
  });
  afterEach(() => f.adapter.database.close());

  const input = (fixture: TvlShiftWorkFixture) => ({
    shiftId: fixture.shift.id,
    date: fixture.shift.date,
    expectedShiftRevision: fixture.shift.revision,
    expectedShiftUpdatedAt: fixture.shift.updatedAt,
    timeZone: "Europe/Berlin",
    holidayTimeOff: false as boolean | null,
    shiftWork: true as boolean | null,
    expectedRevision: 0,
  });

  it.each([true, false, null])(
    "preserves explicit shiftWork=%s after reopening",
    async (shiftWork) => {
      const saved = await saveCaritasWorkDay(f.db, { ...input(f), shiftWork });
      expect(await listCaritasWorkDays(f.db)).toEqual([saved]);
      expect(isCurrentCaritasWorkDay(saved, f.shift, "Europe/Berlin")).toBe(true);
      const path = join(tmpdir(), `luna-caritas-${randomUUID()}.sqlite`);
      try {
        await f.adapter.database.backup(path);
        const reopened = new TariffAnnualTestDatabase(path);
        try {
          expect(await listCaritasWorkDays(reopened.db)).toEqual([saved]);
        } finally {
          reopened.database.close();
        }
      } finally {
        if (existsSync(path)) unlinkSync(path);
      }
    },
  );

  it("makes edited or deleted shifts and changed timezones stale, without erasing history", async () => {
    const saved = await saveCaritasWorkDay(f.db, input(f));
    for (const changed of [
      { ...f.shift, revision: f.shift.revision + 1 },
      { ...f.shift, updatedAt: "2026-09-23T00:00:00Z" },
      { ...f.shift, deletedAt: "2026-09-23T00:00:00Z" },
    ])
      expect(isCurrentCaritasWorkDay(saved, changed, "Europe/Berlin")).toBe(false);
    expect(isCurrentCaritasWorkDay(saved, f.shift, "UTC")).toBe(false);
    expect(await listCaritasWorkDays(f.db)).toEqual([saved]);
  });

  it("rejects conflicts and accepts a fresh reconfirmation", async () => {
    await saveCaritasWorkDay(f.db, input(f));
    await expect(saveCaritasWorkDay(f.db, input(f))).rejects.toThrow("inzwischen geändert");
    const cleared = await saveCaritasWorkDay(f.db, {
      ...input(f),
      expectedRevision: 1,
      holidayTimeOff: null,
      shiftWork: null,
    });
    expect(cleared.revision).toBe(2);
    const edited = await saveShift(f.db, {
      ...f.shift,
      expectedRevision: f.shift.revision,
      endTime: "22:00",
    });
    await expect(
      saveCaritasWorkDay(f.db, {
        ...input(f),
        expectedRevision: 2,
      }),
    ).rejects.toThrow("Dienst");
    const next = await saveCaritasWorkDay(f.db, {
      ...input(f),
      expectedRevision: 2,
      expectedShiftRevision: edited.revision,
      expectedShiftUpdatedAt: edited.updatedAt,
      shiftWork: false,
    });
    expect(next.shiftWork).toBe(false);
    expect(isCurrentCaritasWorkDay(next, edited, "Europe/Berlin")).toBe(true);
  });

  it("rejects a date outside the service and malformed or mismatched backup rows", async () => {
    await expect(
      saveCaritasWorkDay(f.db, {
        ...input(f),
        date: "2026-09-20",
      }),
    ).rejects.toThrow("Kalendertag");
    const saved = await saveCaritasWorkDay(f.db, input(f));
    for (const change of [
      { date: "2026-02-30" },
      { shiftRevision: 0 },
      { shiftWork: "yes" },
      { timeZone: "+02:00" },
      { origin: "inferred" },
      { extra: true },
      { confirmedAt: "2099-01-01T00:00:00Z" },
    ])
      expect(() => validateSavedCaritasWorkDay({ ...saved, ...change })).toThrow();
    expect(() =>
      mapCaritasWorkDayRow({
        shift_id: saved.shiftId,
        date: "2026-09-20",
        confirmation_json: JSON.stringify(saved),
      }),
    ).toThrow();
  });

  it("applies migration 23 once and rolls back failed registration", async () => {
    const before = f.adapter.database.prepare("SELECT * FROM shift_entries").all();
    f.adapter.database.exec(
      "DROP TABLE caritas_work_days; DELETE FROM schema_migrations WHERE version=23",
    );
    f.adapter.fail = "VALUES(23,?)";
    await expect(migrateDatabase(f.db)).rejects.toThrow("injected");
    expect(
      f.adapter.database
        .prepare("SELECT name FROM sqlite_master WHERE name='caritas_work_days'")
        .get(),
    ).toBeUndefined();
    f.adapter.fail = null;
    await migrateDatabase(f.db);
    await migrateDatabase(f.db);
    expect(await listCaritasWorkDays(f.db)).toEqual([]);
    expect(f.adapter.database.prepare("SELECT * FROM shift_entries").all()).toEqual(before);
    expect(
      f.adapter.database.prepare("SELECT COUNT(*) n FROM schema_migrations WHERE version=23").get(),
    ).toEqual({ n: 1 });
  });
});
