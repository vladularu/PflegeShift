import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import type { SQLiteDatabase } from "expo-sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrateDatabase, LATEST_DATABASE_SCHEMA_VERSION } from "./migrations";
import { loadProfile, saveProfile } from "./profile-repository";
import {
  listRemunerationProfiles,
  saveDatedRemunerationProfile,
} from "./remuneration-profile-repository";
import { projectStoredSimpleProfile } from "./simple-app-profile";
import {
  createLocalBackupDocument,
  loadLocalBackupSnapshot,
  LOCAL_BACKUP_VERSION,
} from "./local-backup";
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
const input = {
  federalState: "HE" as const,
  weeklyMinutes: 2310,
  timeZone: "Europe/Berlin",
  displayName: "Synthetic",
  employerName: "Synthetic employer",
  tariff: {
    payGroup: "P8" as const,
    payLevel: 4 as const,
    sector: "BT_K" as const,
    tariffRegion: "OTHER" as const,
    fullTimeWeeklyMinutes: 2310,
  },
};
const data = {
  version: 1 as const,
  weeklyMinutes: 1155,
  selection: {
    kind: "tariff" as const,
    packageId: "tvoed-vka-bt-k",
    variant: "BT_B",
    region: "OTHER",
    group: "P6",
    level: "1",
    fullTimeWeeklyMinutes: 2340,
  },
};
const sha256 = async (text: string) => createHash("sha256").update(text).digest("hex");
let memory: MemoryDatabase;
const load = async () =>
  projectStoredSimpleProfile(memory.db, await loadProfile(memory.db), "2026-10-04");
async function saveDated(effectiveFrom = "2026-10-01", value = data) {
  vi.setSystemTime(new Date("2026-10-03T10:00:00Z"));
  return saveDatedRemunerationProfile(memory.db, {
    effectiveFrom,
    data: value,
    expectedRevision: 0,
  });
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T09:00:00Z"));
  memory = new MemoryDatabase();
  await migrateDatabase(memory.db);
});
afterEach(() => {
  memory.raw.close();
  vi.useRealTimers();
});

describe("simple app return preserves stored data", () => {
  it("keeps a fresh install unconfigured", async () => {
    expect(await load()).toBeNull();
  });
  it("uses the old profile immediately without requiring a date", async () => {
    const saved = await saveProfile(memory.db, input);
    expect(await load()).toEqual(saved);
  });
  it("reads a newer valid TVoed-P edit without changing any stored data", async () => {
    await saveProfile(memory.db, input);
    await saveDated();
    const before = await loadLocalBackupSnapshot(memory.db);
    const projected = await load();
    expect(projected).toMatchObject({
      displayName: "Synthetic",
      employerName: "Synthetic employer",
      weeklyMinutes: 2310,
      tariff: { payGroup: "P6", payLevel: 1, sector: "BT_B", fullTimeWeeklyMinutes: 2340 },
    });
    expect(await loadLocalBackupSnapshot(memory.db)).toEqual(before);
  });
  it("keeps future changes stored and inactive", async () => {
    const saved = await saveProfile(memory.db, input);
    await saveDated("2027-01-01");
    expect(await load()).toEqual(saved);
    expect((await listRemunerationProfiles(memory.db)).map((item) => item.effectiveFrom)).toEqual([
      null,
      "2027-01-01",
    ]);
  });
  it("keeps foreign tariffs separate instead of relabeling them as TVoed-P", async () => {
    const saved = await saveProfile(memory.db, input);
    await saveDated("2026-10-01", {
      ...data,
      selection: { ...data.selection, packageId: "avr-caritas-care-rk-ost" },
    });
    expect(await load()).toEqual(saved);
  });
  it("never imports a level that is invalid for the old table", async () => {
    const saved = await saveProfile(memory.db, input);
    await saveDated("2026-10-01", {
      ...data,
      selection: { ...data.selection, group: "P8", level: "1" },
    });
    expect(await load()).toEqual(saved);
  });
  it("keeps a later simple form edit authoritative on reload", async () => {
    await saveProfile(memory.db, input);
    await saveDated();
    vi.setSystemTime(new Date("2026-10-04T11:00:00Z"));
    const saved = await saveProfile(memory.db, {
      ...input,
      tariff: { ...input.tariff, payGroup: "P9", payLevel: 3 },
    });
    expect(await load()).toEqual(saved);
    expect(
      (await listRemunerationProfiles(memory.db)).find(
        (item) => item.effectiveFrom === "2026-10-01",
      )?.data,
    ).toEqual(data);
  });
  it("projects own monthly pay without another part-time reduction", async () => {
    await saveProfile(memory.db, input);
    vi.setSystemTime(new Date("2026-10-03T10:00:00Z"));
    await saveDatedRemunerationProfile(memory.db, {
      effectiveFrom: "2026-10-01",
      expectedRevision: 0,
      data: {
        version: 1,
        weeklyMinutes: 1155,
        selection: { kind: "own-monthly", monthlyGrossCents: 212345 },
      },
    });
    expect(await load()).toMatchObject({
      tariff: null,
      weeklyMinutes: 2310,
      manualMonthlyGrossCents: 212345,
    });
  });
  it("retains backup 19 and restores both the original and the projected view", async () => {
    await saveProfile(memory.db, input);
    await saveDated();
    const before = await loadLocalBackupSnapshot(memory.db);
    const projected = await load();
    const file = await createLocalBackupDocument(before, {
      appVersion: "synthetic",
      createdAt: new Date(),
      sha256,
    });
    expect(file.document.version).toBe(LOCAL_BACKUP_VERSION);
    expect(LOCAL_BACKUP_VERSION).toBe(19);
    const validated = await validateLocalBackup(file.serialized, {
      maxDatabaseSchemaVersion: LATEST_DATABASE_SCHEMA_VERSION,
      sha256,
    });
    const restored = new MemoryDatabase();
    try {
      await migrateDatabase(restored.db);
      await restoreLocalBackup(restored.db, validated);
      expect(await loadLocalBackupSnapshot(restored.db)).toEqual(before);
      expect(
        await projectStoredSimpleProfile(restored.db, await loadProfile(restored.db), "2026-10-04"),
      ).toEqual(projected);
    } finally {
      restored.raw.close();
    }
  });
});
