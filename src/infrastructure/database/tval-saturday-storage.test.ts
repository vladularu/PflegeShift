import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import current from "../../../rules/packages/reviewed/tval-pflege-tdl/2026-04.json";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { resolver, work } from "@/engine/remuneration-test-fixtures";
import { calculateDatedShiftTimePremiums } from "@/engine/remuneration-premiums";
import { calculateMonthlyDatedAllowances } from "@/engine/remuneration-allowances";
import { isCurrentTvlShiftWork } from "@/domain/saved-tvl-shift-work";
import {
  saveDatedRemunerationProfile,
  listRemunerationProfiles,
} from "./remuneration-profile-repository";
import { saveTvlShiftWork, listTvlShiftWork } from "./tvl-shift-work-repository";
import { restoreLocalBackup } from "./local-backup-restore";
import { TariffAnnualTestDatabase } from "./tariff-annual-test-database";
import {
  setupTvlShiftWork,
  exportTvlBackup,
  validateTvlBackup,
  type TvlShiftWorkFixture,
} from "./tvl-shift-work-test-fixtures";

describe("TVA-L Saturday confirmation storage and real calculation", () => {
  let f: TvlShiftWorkFixture;
  const rules = resolver([current as RuleTariffPackage]);
  beforeEach(async () => {
    f = await setupTvlShiftWork();
    f.profile = await saveDatedRemunerationProfile(f.db, {
      effectiveFrom: f.profile.effectiveFrom!,
      expectedRevision: f.profile.revision,
      data: {
        version: 8,
        weeklyMinutes: 2310,
        selection: {
          kind: "tariff",
          packageId: "tval-pflege-tdl",
          variant: "CARE",
          region: "WEST_38_5",
          group: "regular",
          level: "1",
          fullTimeWeeklyMinutes: 2310,
          tvalEmployerScope: "SECTION_43",
          tvlEmploymentCategory: "SALARIED_SECTION_38_5_1",
          tvalCareAllowances: { paidEntitlement: true, clinical: "HIGHER", burnCare: true },
        },
      },
    });
    f.input = { ...f.input, expectedProfileRevision: f.profile.revision };
  });
  afterEach(() => f.adapter.database.close());
  async function amount(db = f.db) {
    return calculateDatedShiftTimePremiums(
      f.shift,
      work,
      await listRemunerationProfiles(db),
      rules,
      "2026-09",
      await listTvlShiftWork(db),
    );
  }
  async function careAmount(db = f.db) {
    const result = calculateMonthlyDatedAllowances(
      "2026-09",
      [f.shift],
      work,
      await listRemunerationProfiles(db),
      [],
      rules,
      await listTvlShiftWork(db),
    );
    return result.positions.find((p) => p.basis.ruleId === "tval-part-iv:burn-month-full-hours")
      ?.amountCents;
  }
  it.each([
    [true, 512],
    [false, 1376],
    [null, null],
  ] as const)(
    "preserves %s and amount %s through restart and restore",
    async (shiftWork, cents) => {
      const saved = await saveTvlShiftWork(f.db, {
        ...f.input,
        shiftWork,
        burnCareIntervals: [{ from: 0, until: 60 }],
      });
      expect((await amount()).totalCents).toBe(cents);
      expect(await careAmount()).toBe(93);
      const path = join(tmpdir(), "luna-tval-saturday-" + randomUUID() + ".sqlite");
      try {
        await f.adapter.database.backup(path);
        const restarted = new TariffAnnualTestDatabase(path);
        try {
          expect(await listTvlShiftWork(restarted.db)).toEqual([saved]);
          expect((await amount(restarted.db)).totalCents).toBe(cents);
          expect(await careAmount(restarted.db)).toBe(93);
        } finally {
          restarted.database.close();
        }
      } finally {
        if (existsSync(path)) unlinkSync(path);
      }
      const exported = await exportTvlBackup(f);
      const verified = await validateTvlBackup(exported.serialized);
      await saveTvlShiftWork(f.db, {
        ...f.input,
        expectedRevision: saved.revision,
        shiftWork: null,
      });
      await restoreLocalBackup(f.db, verified);
      expect(await listTvlShiftWork(f.db)).toEqual([saved]);
      expect((await amount()).totalCents).toBe(cents);
      expect(await careAmount()).toBe(93);
    },
  );
  it("invalidates changed profiles and rejects a stale write", async () => {
    const saved = await saveTvlShiftWork(f.db, f.input);
    expect((await amount()).totalCents).toBe(512);
    const corrected = await saveDatedRemunerationProfile(f.db, {
      effectiveFrom: f.profile.effectiveFrom!,
      expectedRevision: f.profile.revision,
      data: { ...f.profile.data, weeklyMinutes: 1155 },
    });
    expect(isCurrentTvlShiftWork(saved, f.shift, work.timeZone, corrected)).toBe(false);
    expect((await amount()).totalCents).toBeNull();
    await expect(
      saveTvlShiftWork(f.db, { ...f.input, expectedRevision: saved.revision }),
    ).rejects.toThrow("Vergütungsstand");
    expect(await listTvlShiftWork(f.db)).toEqual([saved]);
    await saveTvlShiftWork(f.db, {
      ...f.input,
      expectedProfileRevision: corrected.revision,
      expectedRevision: saved.revision,
    });
    expect((await amount()).totalCents).toBe(512); // no second part-time cut
  });
  it("supports activity confirmation independently of Saturday withdrawal", async () => {
    const saved = await saveTvlShiftWork(f.db, f.input);
    const updated = await saveTvlShiftWork(f.db, {
      ...f.input,
      expectedRevision: saved.revision,
      burnCareIntervals: [],
    });
    expect(updated.burnCareIntervals).toEqual([]);
    const withdrawn = await saveTvlShiftWork(f.db, {
      ...f.input,
      expectedRevision: updated.revision,
      shiftWork: null,
    });
    expect(withdrawn.burnCareIntervals).toEqual([]);
    expect((await amount()).totalCents).toBeNull();
  });
});
