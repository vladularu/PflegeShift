import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tvoedAnnexAShiftBinding } from "@/domain/saved-tvoed-annex-a-premium-facts";
import { work } from "@/engine/remuneration-test-fixtures";
import { parseDevBackupPayload } from "./dev-backup-payload";
import { generateTestRun, restoreTestBackup, setDeveloperMode } from "./dev-tools-repository";
import { saveDatedRemunerationProfile } from "./remuneration-profile-repository";
import { saveShift } from "./calendar-entry-repository";
import {
  listTvoedAnnexAPremiumFacts,
  saveTvoedAnnexAPremiumFacts,
} from "./tvoed-annex-a-premium-facts-repository";
import { setupTvlShiftWork, type TvlShiftWorkFixture } from "./tvl-shift-work-test-fixtures";

describe("TVöD Anlage A premium facts in test laboratory backup v14", () => {
  let f: TvlShiftWorkFixture;
  let profileRevision: number;
  beforeEach(async () => {
    f = await setupTvlShiftWork();
    await setDeveloperMode(f.db, true);
    const profile = await saveDatedRemunerationProfile(f.db, {
      effectiveFrom: "2026-09-01",
      expectedRevision: f.profile.revision,
      data: {
        version: 1,
        weeklyMinutes: 1920,
        selection: {
          kind: "tariff",
          packageId: "tvoed-vka-anlage-a",
          variant: "BT_K",
          region: "VKA",
          group: "EG6",
          level: "2",
          fullTimeWeeklyMinutes: 2340,
        },
      },
    });
    profileRevision = profile.revision;
  });
  afterEach(() => f.adapter.database.close());
  const answer = () => ({
    month: "2026-09",
    profileEffectiveFrom: "2026-09-01",
    expectedProfileRevision: profileRevision,
    ruleVersionId: "2026-05-01-draft1",
    cashPaymentConfirmed: true as boolean | null,
    localAgreement: "NONE_CONFIRMED" as const,
    dayDecisions: [
      {
        shiftId: f.shift.id,
        date: f.shift.date,
        origin: "confirmed" as const,
        shiftBinding: tvoedAnnexAShiftBinding(f.shift, "Europe/Berlin"),
        workKind: "REGULAR_ACTIVE" as const,
        holidayTimeOff: null,
        shiftWork: true,
        legacyAngestellteClass: null,
      },
    ],
    expectedRevision: 0,
  });
  const generate = () =>
    generateTestRun(f.db, { startMonth: "2026-09", range: 1, scenario: "NORMAL_ROTATION" }, work);
  const stored = async () => {
    const row = await f.db.getFirstAsync<{ payload: string }>(
      "SELECT payload FROM dev_test_backups WHERE month='2026-09'",
    );
    return row!.payload;
  };

  it("restores the exact original after repeated test generation", async () => {
    const original = await saveTvoedAnnexAPremiumFacts(f.db, answer());
    await generate();
    const backup = parseDevBackupPayload(await stored(), "2026-09");
    expect(backup.version).toBe(16);
    expect(backup.remuneration.tvoedAnnexAPremiumFacts).toHaveLength(1);
    expect(await listTvoedAnnexAPremiumFacts(f.db)).toEqual([]);
    await generate();
    await restoreTestBackup(f.db, ["2026-09"]);
    expect(await listTvoedAnnexAPremiumFacts(f.db)).toEqual([original]);
  });

  it("restores October facts bound to a September night shift outside the test month", async () => {
    const night = await saveShift(f.db, {
      ...f.shift,
      expectedRevision: f.shift.revision,
      date: "2026-09-30",
      startTime: "21:00",
      endTime: "07:00",
    });
    const base = answer();
    const original = await saveTvoedAnnexAPremiumFacts(f.db, {
      ...base,
      month: "2026-10",
      dayDecisions: [
        {
          ...base.dayDecisions[0],
          date: "2026-10-01",
          shiftBinding: tvoedAnnexAShiftBinding(night, "Europe/Berlin"),
        },
      ],
    });
    await generateTestRun(
      f.db,
      { startMonth: "2026-10", range: 1, scenario: "NORMAL_ROTATION" },
      work,
    );
    const row = await f.db.getFirstAsync<{ payload: string }>(
      "SELECT payload FROM dev_test_backups WHERE month='2026-10'",
    );
    expect(
      parseDevBackupPayload(row!.payload, "2026-10").remuneration.tvoedAnnexAPremiumFacts,
    ).toHaveLength(1);
    await restoreTestBackup(f.db, ["2026-10"]);
    expect(await listTvoedAnnexAPremiumFacts(f.db)).toEqual([original]);
  });

  it("restores a multi-month run in dependency order even when months are requested backwards", async () => {
    const night = await saveShift(f.db, {
      ...f.shift,
      expectedRevision: f.shift.revision,
      date: "2026-09-30",
      startTime: "21:00",
      endTime: "07:00",
    });
    const base = answer();
    const original = await saveTvoedAnnexAPremiumFacts(f.db, {
      ...base,
      month: "2026-10",
      dayDecisions: [
        {
          ...base.dayDecisions[0],
          date: "2026-10-01",
          shiftBinding: tvoedAnnexAShiftBinding(night, "Europe/Berlin"),
        },
      ],
    });
    await generateTestRun(
      f.db,
      { startMonth: "2026-09", range: 3, scenario: "NORMAL_ROTATION" },
      work,
    );
    await restoreTestBackup(f.db, ["2026-11", "2026-10", "2026-09"]);
    expect(await listTvoedAnnexAPremiumFacts(f.db)).toEqual([original]);
    const restored = await f.db.getFirstAsync<{ id: string }>(
      "SELECT id FROM shift_entries WHERE id=?",
      night.id,
    );
    expect(restored).toEqual({ id: night.id });
  });

  it("reads v13 without inventing premium facts, but rejects an undeclared field", async () => {
    await generate();
    const payload = JSON.parse(await stored());
    payload.version = 13;
    delete payload.remuneration.tvoedAnnexAPremiumFacts;
    delete payload.remuneration.drkEmployeeMonthConfirmations;
    delete payload.remuneration.drkTrainingMonthConfirmations;
    expect(
      parseDevBackupPayload(JSON.stringify(payload), "2026-09").remuneration
        .tvoedAnnexAPremiumFacts,
    ).toEqual([]);
    payload.remuneration.tvoedAnnexAPremiumFacts = [];
    expect(() => parseDevBackupPayload(JSON.stringify(payload), "2026-09")).toThrow();
  });

  it.each(["missing", "duplicate", "wrong-month", "invalid", "future", "orphan-shift"])(
    "rejects %s before replacing test-month data",
    async (mutation) => {
      await saveTvoedAnnexAPremiumFacts(f.db, answer());
      await generate();
      const payload = JSON.parse(await stored());
      const rows = payload.remuneration.tvoedAnnexAPremiumFacts;
      const row = rows[0];
      const value = JSON.parse(row.facts_json);
      if (mutation === "missing") delete payload.remuneration.tvoedAnnexAPremiumFacts;
      if (mutation === "duplicate") rows.push({ ...row });
      if (mutation === "wrong-month") row.month = "2026-10";
      if (mutation === "invalid") value.localAgreement = "ASSUMED";
      if (mutation === "future") value.profileRevision = 999;
      if (mutation === "orphan-shift") {
        value.dayDecisions[0].shiftId = "missing-shift";
        const binding = JSON.parse(value.dayDecisions[0].shiftBinding);
        binding[0] = "missing-shift";
        value.dayDecisions[0].shiftBinding = JSON.stringify(binding);
      }
      row.facts_json = JSON.stringify(value);
      await f.db.runAsync(
        "UPDATE dev_test_backups SET payload=? WHERE month='2026-09'",
        JSON.stringify(payload),
      );
      const before = f.adapter.database.prepare("SELECT * FROM shift_entries ORDER BY id").all();
      await expect(restoreTestBackup(f.db, ["2026-09"])).rejects.toThrow();
      expect(f.adapter.database.prepare("SELECT * FROM shift_entries ORDER BY id").all()).toEqual(
        before,
      );
    },
  );

  it("rolls a failed insert back and can retry", async () => {
    const original = await saveTvoedAnnexAPremiumFacts(f.db, answer());
    await generate();
    const before = f.adapter.database.prepare("SELECT * FROM shift_entries ORDER BY id").all();
    f.adapter.fail = "INSERT INTO tvoed_annex_a_premium_facts";
    await expect(restoreTestBackup(f.db, ["2026-09"])).rejects.toThrow("injected");
    expect(f.adapter.database.prepare("SELECT * FROM shift_entries ORDER BY id").all()).toEqual(
      before,
    );
    expect(await listTvoedAnnexAPremiumFacts(f.db)).toEqual([]);
    f.adapter.fail = null;
    await restoreTestBackup(f.db, ["2026-09"]);
    expect(await listTvoedAnnexAPremiumFacts(f.db)).toEqual([original]);
  });
});
