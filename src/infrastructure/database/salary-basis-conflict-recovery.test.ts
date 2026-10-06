import Database from "better-sqlite3";
import type { SQLiteDatabase } from "expo-sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { salaryBasisCount } from "@/domain/salary-basis-conflict";
import { VKA_E_PREFERENCE_KEY } from "@/domain/vka-e-tariff";
import { TVL_KR_PREFERENCE_KEY } from "@/domain/tvl-kr-tariff";
import { TVUK_NURSING_PREFERENCE_KEY } from "@/domain/tvuk-nursing-tariff";
import { TVAL_PFLEGE_PREFERENCE_KEY } from "@/domain/tval-pflege-tariff";
import { NURSING_TRAINING_PREFERENCE_KEY } from "@/domain/nursing-training";
import { saveShift } from "./calendar-entry-repository";
import { TVH_KR_PREFERENCE_KEY } from "@/domain/tvh-kr-tariff";
import { calculateMonthlyPayEstimate } from "@/engine/simple-pay";
import { migrateDatabase } from "./migrations";
import { loadProfile, saveProfile } from "./profile-repository";
import { loadLocalBackupSnapshot } from "./local-backup";
import { projectStoredSimpleProfile } from "./simple-app-profile";
import { saveDatedRemunerationProfile } from "./remuneration-profile-repository";

class MemoryDatabase {
  readonly raw = new Database(":memory:");
  failDeletingSalary = false;
  async execAsync(sql: string) {
    this.raw.exec(sql);
  }
  async runAsync(sql: string, ...params: unknown[]) {
    if (
      this.failDeletingSalary &&
      sql.startsWith("DELETE FROM app_preferences") &&
      params[0] === TVH_KR_PREFERENCE_KEY
    )
      throw new Error("Synthetic preference write failure");
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
const work = {
  federalState: "NW" as const,
  holidayRegion: "NONE" as const,
  weeklyMinutes: 2310,
  timeZone: "Europe/Berlin",
  displayName: "Synthetic",
  employerName: "Synthetic employer",
  industry: "HEALTHCARE" as const,
  regularRotatingNightWork: true,
  sundayHolidayWorkEligible: true,
  allEmploymentWorkRecorded: false,
};
const p = {
  payGroup: "P11" as const,
  payLevel: 5 as const,
  sector: "BT_K" as const,
  tariffRegion: "OTHER" as const,
  fullTimeWeeklyMinutes: 2310,
};
const h = { payGroup: "KR8" as const, payLevel: 4 as const, fullTimeWeeklyMinutes: 2400 as const };
const alternatives = [
  {
    key: NURSING_TRAINING_PREFERENCE_KEY,
    selection: {
      nursingTrainingTariff: { trainingYear: 1, sector: "BT_K", tariffRegion: "OTHER" },
    },
  },
  {
    key: VKA_E_PREFERENCE_KEY,
    selection: {
      vkaETariff: { payGroup: "E9b", payLevel: 4, sector: "BT_K", tariffRegion: "OTHER" },
    },
  },
  {
    key: TVL_KR_PREFERENCE_KEY,
    selection: { tvlKrTariff: { payGroup: "KR8", payLevel: 4, universityRegion: "WEST" } },
  },
  {
    key: TVUK_NURSING_PREFERENCE_KEY,
    selection: { tvUkNursingTariff: { payGroup: "PUK8", payLevel: 4 } },
  },
  { key: TVH_KR_PREFERENCE_KEY, selection: { tvhKrTariff: h } },
  {
    key: TVAL_PFLEGE_PREFERENCE_KEY,
    selection: { tvalPflegeTariff: { trainingYear: 1, universityRegion: "WEST" } },
  },
] as const;
let memory: MemoryDatabase;
beforeEach(async () => {
  memory = new MemoryDatabase();
  await migrateDatabase(memory.db);
});
afterEach(() => memory.raw.close());
async function insertConflict() {
  await saveShift(memory.db, {
    date: "2026-10-06",
    title: "Synthetic shift",
    type: "CUSTOM",
    startTime: "07:00",
    endTime: "15:30",
    breakMinutes: 30,
    color: "#123456",
    symbol: "S",
  });
  await saveProfile(memory.db, { ...work, tariff: p });
  await memory.db.runAsync(
    "INSERT INTO app_preferences(key,value,updated_at) VALUES(?,?,?)",
    TVH_KR_PREFERENCE_KEY,
    JSON.stringify(h),
    "2026-10-01T09:00:00Z",
  );
  await memory.db.runAsync(
    "INSERT INTO app_preferences(key,value,updated_at) VALUES(?,?,?)",
    "calendar_background_image",
    "calendar-synthetic.jpg",
    "2026-10-01T09:00:00Z",
  );
}

describe("salary basis conflict recovery", () => {
  it("loads work and calendar data with inactive salary drafts, without a database write", async () => {
    await insertConflict();
    const before = await loadLocalBackupSnapshot(memory.db);
    const profile = await loadProfile(memory.db);
    expect(profile).toMatchObject({
      ...work,
      tariff: null,
      manualMonthlyGrossCents: null,
      tvhKrTariff: null,
      salaryBasisConflict: { tariff: p, tvhKrTariff: h },
    });
    expect(await loadLocalBackupSnapshot(memory.db)).toEqual(before);
    expect(calculateMonthlyPayEstimate("2026-10", [], profile!, null)).toMatchObject({
      available: false,
      personalBaseAmount: null,
      estimatedGrossAmount: null,
    });
  });
  it("does not activate a dated salary fallback while the conflict is unresolved", async () => {
    await saveProfile(memory.db, { ...work, tariff: p });
    await saveDatedRemunerationProfile(memory.db, {
      effectiveFrom: "2026-01-01",
      expectedRevision: 0,
      data: {
        version: 1,
        weeklyMinutes: 2310,
        selection: { kind: "own-monthly", monthlyGrossCents: 400000 },
      },
    });
    await memory.db.runAsync(
      "UPDATE remuneration_profiles SET updated_at=?",
      "2099-01-01T00:00:00Z",
    );
    await memory.db.runAsync(
      "INSERT INTO app_preferences(key,value,updated_at) VALUES(?,?,?)",
      TVH_KR_PREFERENCE_KEY,
      JSON.stringify(h),
      "2026-10-01T09:00:00Z",
    );
    const before = await loadLocalBackupSnapshot(memory.db);
    const profile = await loadProfile(memory.db);
    const projected = await projectStoredSimpleProfile(memory.db, profile, "2026-10-06");
    expect(projected).toBe(profile);
    expect(projected?.manualMonthlyGrossCents).toBeNull();
    expect(projected?.salaryBasisConflict).toMatchObject({ tariff: p, tvhKrTariff: h });
    expect(await loadLocalBackupSnapshot(memory.db)).toEqual(before);
  });
  it("blocks unrelated or empty salary saves without discarding the stored drafts", async () => {
    await insertConflict();
    const before = await loadLocalBackupSnapshot(memory.db);
    const profile = await loadProfile(memory.db);
    await expect(saveProfile(memory.db, { ...profile!, displayName: "Changed" })).rejects.toThrow(
      "Bitte zuerst eine Gehaltsgrundlage wählen.",
    );
    await expect(saveProfile(memory.db, { ...work, tariff: null })).rejects.toThrow(
      "Bitte zuerst eine Gehaltsgrundlage wählen.",
    );
    expect(await loadLocalBackupSnapshot(memory.db)).toEqual(before);
  });
  it("resolves only after an explicit selection, retaining work and unrelated preferences", async () => {
    await insertConflict();
    const old = memory.raw.prepare("SELECT created_at FROM user_profile").get();
    const selected = await saveProfile(memory.db, { ...work, tariff: p });
    expect(selected.tariff).toEqual(p);
    expect(selected.salaryBasisConflict).toBeUndefined();
    expect(selected.tvhKrTariff).toBeUndefined();
    expect(await loadProfile(memory.db)).toEqual(selected);
    expect(selected).toMatchObject(work);
    expect(memory.raw.prepare("SELECT created_at FROM user_profile").get()).toEqual(old);
    expect(
      memory.raw
        .prepare("SELECT value FROM app_preferences WHERE key=?")
        .get("calendar_background_image"),
    ).toEqual({ value: "calendar-synthetic.jpg" });
    expect(
      memory.raw.prepare("SELECT * FROM app_preferences WHERE key=?").get(TVH_KR_PREFERENCE_KEY),
    ).toBeUndefined();
  });
  it("rolls back the entire resolution if writing the selected basis fails", async () => {
    await insertConflict();
    const before = await loadLocalBackupSnapshot(memory.db);
    memory.failDeletingSalary = true;
    await expect(
      saveProfile(memory.db, { ...work, tariff: { ...p, payLevel: 6 } }),
    ).rejects.toThrow("Synthetic preference write failure");
    expect(await loadLocalBackupSnapshot(memory.db)).toEqual(before);
  });
  it.each(alternatives)(
    "preserves a conflicting preference $key as an inactive draft",
    async ({ key, selection }) => {
      await saveProfile(memory.db, { ...work, tariff: p });
      await memory.db.runAsync(
        "INSERT INTO app_preferences(key,value,updated_at) VALUES(?,?,?)",
        key,
        JSON.stringify(Object.values(selection)[0]),
        "2026-10-01T09:00:00Z",
      );
      const before = await loadLocalBackupSnapshot(memory.db);
      const profile = await loadProfile(memory.db);
      expect(profile?.salaryBasisConflict).toMatchObject({ tariff: p, ...selection });
      expect(salaryBasisCount(profile!)).toBe(0);
      expect(await loadLocalBackupSnapshot(memory.db)).toEqual(before);
    },
  );
  it.each([
    { tariff: p },
    { manualMonthlyGrossCents: 345050 },
    ...alternatives.map(({ selection }) => selection),
  ])("resolves the conflict transactionally to %j", async (selection) => {
    await insertConflict();
    const selected = await saveProfile(memory.db, { ...work, ...selection });
    expect(selected).toMatchObject(selection);
    expect(selected.salaryBasisConflict).toBeUndefined();
    expect(salaryBasisCount(selected)).toBe(1);
    expect(await loadProfile(memory.db)).toEqual(selected);
    expect(
      memory.raw.prepare("SELECT title FROM shift_entries WHERE deleted_at IS NULL").all(),
    ).toEqual([{ title: "Synthetic shift" }]);
  });
});
