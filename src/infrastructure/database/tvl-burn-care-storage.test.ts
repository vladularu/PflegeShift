import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { saveTvlShiftWork, listTvlShiftWork } from "./tvl-shift-work-repository";
import { saveShift } from "./calendar-entry-repository";
import { saveDatedRemunerationProfile } from "./remuneration-profile-repository";
import { restoreLocalBackup } from "./local-backup-restore";
import { loadLocalBackupSnapshot } from "./local-backup";
import { TariffAnnualTestDatabase } from "./tariff-annual-test-database";
import { generateTestRun, restoreTestBackup, setDeveloperMode } from "./dev-tools-repository";
import { work } from "@/engine/remuneration-test-fixtures";
import {
  setupTvlShiftWork,
  exportTvlBackup,
  validateTvlBackup,
  resignTvlBackup,
  type TvlShiftWorkFixture,
} from "./tvl-shift-work-test-fixtures";

describe("actual TV-L activity persistence and backup", () => {
  let f: TvlShiftWorkFixture;
  beforeEach(async () => {
    f = await setupTvlShiftWork();
  });
  afterEach(() => f.adapter.database.close());
  it("preserves actual intervals through test-lab generation and original restore", async () => {
    await setDeveloperMode(f.db, true);
    const original = await saveTvlShiftWork(f.db, {
      ...f.input,
      shiftWork: null,
      burnCareIntervals: [{ from: 0, until: 60 }],
    });
    await generateTestRun(
      f.db,
      { startMonth: "2026-09", range: 1, scenario: "NORMAL_ROTATION" },
      work,
    );
    expect(await listTvlShiftWork(f.db)).toEqual([]);
    await restoreTestBackup(f.db, ["2026-09"]);
    expect(await listTvlShiftWork(f.db)).toEqual([original]);
  });
  it.each([
    null,
    [],
    [
      { from: 0, until: 60 },
      { from: 120, until: 180 },
    ],
  ])(
    "preserves actual activity %# through snapshot, database reopen and backup restore",
    async (burnCareIntervals) => {
      const saved = await saveTvlShiftWork(f.db, {
        ...f.input,
        shiftWork: null,
        burnCareIntervals,
      });
      expect(saved.burnCareIntervals).toEqual(burnCareIntervals);
      if (burnCareIntervals) {
        expect(Object.isFrozen(saved.burnCareIntervals)).toBe(true);
        expect(saved.burnCareIntervals).not.toBe(burnCareIntervals);
      }
      const reopened = new TariffAnnualTestDatabase(f.adapter.database.serialize());
      try {
        expect(await listTvlShiftWork(reopened.db)).toEqual([saved]);
      } finally {
        reopened.database.close();
      }
      const exported = await exportTvlBackup(f);
      const verified = await validateTvlBackup(exported.serialized);
      await saveTvlShiftWork(f.db, { ...f.input, expectedRevision: 1, burnCareIntervals: null });
      await restoreLocalBackup(f.db, verified);
      expect(await listTvlShiftWork(f.db)).toEqual([saved]);
    },
  );
  it("preserves fresh independent activity when only Saturday changes, but never reconfirms stale activity", async () => {
    const burnCareIntervals = [{ from: 0, until: 60 }];
    await saveTvlShiftWork(f.db, { ...f.input, burnCareIntervals });
    const second = await saveTvlShiftWork(f.db, {
      ...f.input,
      shiftWork: false,
      expectedRevision: 1,
    });
    expect(second.burnCareIntervals).toEqual(burnCareIntervals);
    const edited = await saveShift(f.db, {
      ...f.shift,
      expectedRevision: f.shift.revision,
      endTime: "20:00",
    });
    const next = await saveTvlShiftWork(f.db, {
      ...f.input,
      expectedRevision: 2,
      expectedShiftRevision: edited.revision,
      expectedShiftUpdatedAt: edited.updatedAt,
    });
    expect(next.burnCareIntervals).toBeNull();
  });
  it("deep-copies caller input before the asynchronous transaction", async () => {
    const intervals = [{ from: 0, until: 60 }];
    const pending = saveTvlShiftWork(f.db, { ...f.input, burnCareIntervals: intervals });
    intervals[0].until = 180;
    expect((await pending).burnCareIntervals).toEqual([{ from: 0, until: 60 }]);
  });
  it.each([
    undefined,
    [{ from: 0, until: 500 }],
    [{ from: -1, until: 60 }],
    [
      { from: 0, until: 120 },
      { from: 60, until: 180 },
    ],
  ])("rejects malformed or excessive activity %# without writing", async (burnCareIntervals) => {
    await expect(saveTvlShiftWork(f.db, { ...f.input, burnCareIntervals })).rejects.toThrow();
    expect(await listTvlShiftWork(f.db)).toEqual([]);
  });
  it("preserves stale historical times after a shorter service without paying them as current", async () => {
    const saved = await saveTvlShiftWork(f.db, {
      ...f.input,
      burnCareIntervals: [{ from: 300, until: 420 }],
    });
    await saveShift(f.db, { ...f.shift, expectedRevision: f.shift.revision, endTime: "17:00" });
    const backup = await exportTvlBackup(f);
    const verified = await validateTvlBackup(backup.serialized);
    await f.db.runAsync("DELETE FROM tvl_shift_work");
    await restoreLocalBackup(f.db, verified);
    expect(await listTvlShiftWork(f.db)).toEqual([saved]);
  });
  it("rejects a re-signed backup with invalid current activity even when Saturday is unknown", async () => {
    await saveTvlShiftWork(f.db, { ...f.input, shiftWork: null, burnCareIntervals: [] });
    const backup = await exportTvlBackup(f),
      before = await loadLocalBackupSnapshot(f.db);
    const changed = await resignTvlBackup(backup.serialized, (root) => {
      const rows = root.data.tvlShiftWork as { confirmation_json: string }[];
      const value = JSON.parse(rows[0].confirmation_json);
      value.burnCareIntervals = [{ from: 0, until: 600 }];
      rows[0].confirmation_json = JSON.stringify(value);
    });
    await expect(validateTvlBackup(changed)).rejects.toThrow();
    expect(await loadLocalBackupSnapshot(f.db)).toEqual(before);
  });
  it("checks both profile allocations against the same net shift duration, including backup import", async () => {
    const s = await saveShift(f.db, {
      ...f.shift,
      expectedRevision: f.shift.revision,
      startTime: "20:00",
      endTime: "04:00",
      breakMinutes: 60,
    });
    const after = await saveDatedRemunerationProfile(f.db, {
      expectedRevision: 0,
      effectiveFrom: "2026-09-20",
      data: f.profile.data,
    });
    const input = {
      ...f.input,
      shiftWork: null,
      expectedShiftRevision: s.revision,
      expectedShiftUpdatedAt: s.updatedAt,
    };
    await saveTvlShiftWork(f.db, { ...input, burnCareIntervals: [{ from: 0, until: 240 }] });
    const later = {
      ...input,
      profileEffectiveFrom: after.effectiveFrom!,
      expectedProfileRevision: after.revision,
    };
    await expect(
      saveTvlShiftWork(f.db, { ...later, burnCareIntervals: [{ from: 240, until: 480 }] }),
    ).rejects.toThrow("zusammen");
    await saveTvlShiftWork(f.db, { ...later, burnCareIntervals: [{ from: 300, until: 480 }] });
    const backup = await exportTvlBackup(f);
    const malicious = await resignTvlBackup(backup.serialized, (root) => {
      const rows = root.data.tvlShiftWork as { confirmation_json: string }[];
      const row = rows.find(
        (item) => JSON.parse(item.confirmation_json).profileEffectiveFrom === after.effectiveFrom,
      )!;
      const value = JSON.parse(row.confirmation_json);
      value.burnCareIntervals = [{ from: 240, until: 480 }];
      row.confirmation_json = JSON.stringify(value);
    });
    await expect(validateTvlBackup(malicious)).rejects.toThrow();
    expect(await listTvlShiftWork(f.db)).toHaveLength(2);
  });
});
