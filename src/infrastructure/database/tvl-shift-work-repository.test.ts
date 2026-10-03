import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { isCurrentTvlShiftWork, validateTvlShiftWork } from "@/domain/saved-tvl-shift-work";
import {
  saveTvlShiftWork,
  listTvlShiftWork,
  mapTvlShiftWorkRow,
} from "./tvl-shift-work-repository";
import { saveShift, deleteCalendarEntry } from "./calendar-entry-repository";
import { saveDatedRemunerationProfile } from "./remuneration-profile-repository";
import { migrateDatabase } from "./migrations";
import { TariffAnnualTestDatabase } from "./tariff-annual-test-database";
import { setupTvlShiftWork, type TvlShiftWorkFixture } from "./tvl-shift-work-test-fixtures";

describe("TV-L service-specific confirmations", () => {
  let f: TvlShiftWorkFixture;
  beforeEach(async () => {
    f = await setupTvlShiftWork();
  });
  afterEach(() => f.adapter.database.close());
  it.each([true, false, null])(
    "persists %s without interpreting false as missing",
    async (shiftWork) => {
      const saved = await saveTvlShiftWork(f.db, { ...f.input, shiftWork });
      expect(saved.shiftWork).toBe(shiftWork);
      expect(Object.isFrozen(saved)).toBe(true);
      expect(await listTvlShiftWork(f.db)).toEqual([saved]);
      expect(isCurrentTvlShiftWork(saved, f.shift, f.input.timeZone, f.profile)).toBe(
        shiftWork !== null,
      );
      const path = join(tmpdir(), "luna-tvl-confirmation-" + randomUUID() + ".sqlite");
      try {
        await f.adapter.database.backup(path);
        const reopened = new TariffAnnualTestDatabase(path);
        try {
          expect(await listTvlShiftWork(reopened.db)).toEqual([saved]);
        } finally {
          reopened.database.close();
        }
      } finally {
        if (existsSync(path)) unlinkSync(path);
      }
    },
  );
  it("invalidates shift edits, profile corrections, timezone and deletion without erasing history", async () => {
    const saved = await saveTvlShiftWork(f.db, f.input);
    for (const changed of [
      { ...f.shift, revision: f.shift.revision + 1 },
      { ...f.shift, date: "2026-09-20" },
      { ...f.shift, updatedAt: "2026-09-23T00:00:00Z" },
      { ...f.shift, deletedAt: "2026-09-23T00:00:00Z" },
      { ...f.shift, allDay: true },
    ])
      expect(isCurrentTvlShiftWork(saved, changed, f.input.timeZone, f.profile)).toBe(false);
    expect(isCurrentTvlShiftWork(saved, f.shift, "UTC", f.profile)).toBe(false);
    const corrected = await saveDatedRemunerationProfile(f.db, {
      effectiveFrom: f.input.profileEffectiveFrom,
      expectedRevision: f.profile.revision,
      data: { ...f.profile.data, weeklyMinutes: 1155 },
    });
    expect(isCurrentTvlShiftWork(saved, f.shift, f.input.timeZone, corrected)).toBe(false);
    await expect(saveTvlShiftWork(f.db, { ...f.input, expectedRevision: 1 })).rejects.toThrow(
      "Vergütungsstand",
    );
    expect(await listTvlShiftWork(f.db)).toEqual([saved]);
  });
  it("detects conflicts, accepts explicit withdrawal, and reconfirms using current revisions", async () => {
    await saveTvlShiftWork(f.db, f.input);
    await expect(saveTvlShiftWork(f.db, f.input)).rejects.toThrow("inzwischen geändert");
    const cleared = await saveTvlShiftWork(f.db, {
      ...f.input,
      expectedRevision: 1,
      shiftWork: null,
    });
    expect(cleared.revision).toBe(2);
    const updated = await saveShift(f.db, {
      ...f.shift,
      expectedRevision: f.shift.revision,
      endTime: "20:00",
    });
    await expect(saveTvlShiftWork(f.db, { ...f.input, expectedRevision: 2 })).rejects.toThrow(
      "Dienst",
    );
    const next = await saveTvlShiftWork(f.db, {
      ...f.input,
      expectedRevision: 2,
      shiftWork: false,
      expectedShiftRevision: updated.revision,
      expectedShiftUpdatedAt: updated.updatedAt,
    });
    expect(isCurrentTvlShiftWork(next, updated, f.input.timeZone, f.profile)).toBe(true);
    expect(next.shiftWork).toBe(false);
  });
  it.each(["profile", "timezone", "missing", "deleted", "all-day"])(
    "rejects invalid parent %s before writing",
    async (scenario) => {
      let input = f.input;
      if (scenario === "profile") input = { ...input, profileEffectiveFrom: "2026-09-20" };
      if (scenario === "timezone") input = { ...input, timeZone: "UTC" };
      if (scenario === "missing") input = { ...input, shiftId: "missing" };
      if (scenario === "deleted") await deleteCalendarEntry(f.db, f.shift);
      if (scenario === "all-day") {
        const entry = await saveShift(f.db, {
          ...f.shift,
          expectedRevision: f.shift.revision,
          type: "FREE",
          allDay: true,
          startTime: null,
          endTime: null,
          breakMinutes: 0,
        });
        input = {
          ...input,
          expectedShiftRevision: entry.revision,
          expectedShiftUpdatedAt: entry.updatedAt,
        };
      }
      await expect(saveTvlShiftWork(f.db, input)).rejects.toThrow();
      expect(await listTvlShiftWork(f.db)).toEqual([]);
    },
  );
  it("supports two explicit profiles across a midnight change without overwriting the first confirmation", async () => {
    const entry = await saveShift(f.db, {
      ...f.shift,
      expectedRevision: f.shift.revision,
      startTime: "20:00",
      endTime: "06:00",
    });
    const next = await saveDatedRemunerationProfile(f.db, {
      effectiveFrom: "2026-09-20",
      expectedRevision: 0,
      data: f.profile.data,
    });
    const input = {
      ...f.input,
      expectedShiftRevision: entry.revision,
      expectedShiftUpdatedAt: entry.updatedAt,
    };
    const first = await saveTvlShiftWork(f.db, input);
    const second = await saveTvlShiftWork(f.db, {
      ...input,
      profileEffectiveFrom: next.effectiveFrom!,
      expectedProfileRevision: next.revision,
      shiftWork: false,
    });
    expect(await listTvlShiftWork(f.db)).toEqual([first, second]);
  });
  it("validates exact payloads and rejects false claims even with a matching SQL key", async () => {
    const saved = await saveTvlShiftWork(f.db, f.input);
    for (const change of [
      { shiftWork: "yes" },
      { shiftWork: undefined },
      { revision: 0 },
      { shiftRevision: 0 },
      { profileRevision: 1.5 },
      { profileEffectiveFrom: "2026-02-30" },
      { timeZone: "+02:00" },
      { timeZone: "Not/AZone" },
      { extra: true },
      { shiftUpdatedAt: "bad" },
      { confirmedAt: "2099-01-01T00:00:00Z" },
    ])
      expect(() => validateTvlShiftWork({ ...saved, ...change })).toThrow();
    expect(() =>
      mapTvlShiftWorkRow({
        shift_id: "different",
        profile_effective_from: saved.profileEffectiveFrom,
        confirmation_json: JSON.stringify(saved),
      }),
    ).toThrow();
  });
  it("applies migration 22 once, without inventing facts, and rolls failed registration back", async () => {
    const before = f.adapter.database.prepare("SELECT * FROM shift_entries").all();
    f.adapter.database.exec(
      "DROP TABLE tvl_shift_work; DELETE FROM schema_migrations WHERE version=22",
    );
    f.adapter.fail = "VALUES(22,?)";
    await expect(migrateDatabase(f.db)).rejects.toThrow("injected");
    expect(
      f.adapter.database
        .prepare("SELECT name FROM sqlite_master WHERE name='tvl_shift_work'")
        .get(),
    ).toBeUndefined();
    f.adapter.fail = null;
    await migrateDatabase(f.db);
    await migrateDatabase(f.db);
    expect(await listTvlShiftWork(f.db)).toEqual([]);
    expect(f.adapter.database.prepare("SELECT * FROM shift_entries").all()).toEqual(before);
    expect(
      f.adapter.database.prepare("SELECT COUNT(*) n FROM schema_migrations WHERE version=22").get(),
    ).toEqual({ n: 1 });
  });
  it("rolls back a failed write without losing an existing confirmation", async () => {
    const saved = await saveTvlShiftWork(f.db, f.input);
    f.adapter.fail = "INSERT INTO tvl_shift_work";
    await expect(
      saveTvlShiftWork(f.db, { ...f.input, expectedRevision: 1, shiftWork: false }),
    ).rejects.toThrow("injected");
    expect(await listTvlShiftWork(f.db)).toEqual([saved]);
    expect(f.adapter.database.inTransaction).toBe(false);
  });
  it("adds the new table without rewriting 10000 existing services", async () => {
    const row = f.adapter.database
      .prepare("SELECT * FROM shift_entries WHERE id=?")
      .get(f.shift.id) as Record<string, unknown>;
    const columns = Object.keys(row);
    const insert = f.adapter.database.prepare(
      `INSERT INTO shift_entries(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})`,
    );
    f.adapter.database.transaction(() => {
      for (let index = 0; index < 10000; index++)
        insert.run(...columns.map((key) => (key === "id" ? "bulk-tvl-" + index : row[key])));
    })();
    const before = f.adapter.database
      .prepare("SELECT id,revision,updated_at FROM shift_entries ORDER BY id")
      .all();
    f.adapter.database.exec(
      "DROP TABLE tvl_shift_work; DELETE FROM schema_migrations WHERE version=22",
    );
    await migrateDatabase(f.db);
    expect(await listTvlShiftWork(f.db)).toEqual([]);
    expect(
      f.adapter.database
        .prepare("SELECT id,revision,updated_at FROM shift_entries ORDER BY id")
        .all(),
    ).toEqual(before);
    expect(before).toHaveLength(10001);
  });
});
