import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupTvlShiftWork, type TvlShiftWorkFixture } from "./tvl-shift-work-test-fixtures";
import { saveTvlShiftWork } from "./tvl-shift-work-repository";
import { loadRemunerationSnapshot } from "./remuneration-snapshot-repository";
import { saveShift } from "./calendar-entry-repository";

describe("atomic TV-L facts snapshot", () => {
  let f: TvlShiftWorkFixture;
  beforeEach(async () => {
    f = await setupTvlShiftWork();
  });
  afterEach(() => f.adapter.database.close());
  it.each([true, false, null])(
    "preserves %s and stale records without assuming a value",
    async (shiftWork) => {
      const saved = await saveTvlShiftWork(f.db, { ...f.input, shiftWork });
      await saveShift(f.db, { ...f.shift, expectedRevision: f.shift.revision, note: "changed" });
      const snapshot = await loadRemunerationSnapshot(f.db);
      expect(snapshot.tvlShiftWork).toEqual([saved]);
      expect(Object.isFrozen(snapshot.tvlShiftWork)).toBe(true);
      expect(snapshot.profiles.find((p) => p.effectiveFrom === f.profile.effectiveFrom)).toEqual(
        f.profile,
      );
    },
  );
  it("rejects corrupted facts instead of allowing a partial salary snapshot", async () => {
    await saveTvlShiftWork(f.db, f.input);
    await f.db.runAsync("UPDATE tvl_shift_work SET confirmation_json='{}'");
    await expect(loadRemunerationSnapshot(f.db)).rejects.toThrow();
    expect(f.adapter.database.inTransaction).toBe(false);
  });
  it("serializes a write after the complete read snapshot", async () => {
    let started!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = f.adapter.getAllAsync.bind(f.adapter);
    f.adapter.getAllAsync = async <T>(sql: string, ...params: unknown[]): Promise<T[]> => {
      if (sql.includes("FROM remuneration_profiles")) {
        started();
        await gate;
      }
      return original<T>(sql, ...params);
    };
    const pending = loadRemunerationSnapshot(f.db);
    await entered;
    const writing = saveTvlShiftWork(f.db, f.input);
    release();
    expect((await pending).tvlShiftWork).toEqual([]);
    const saved = await writing;
    expect((await loadRemunerationSnapshot(f.db)).tvlShiftWork).toEqual([saved]);
  });
});
