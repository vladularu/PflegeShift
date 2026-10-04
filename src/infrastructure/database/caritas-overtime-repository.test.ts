import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isCurrentCaritasOvertime,
  validateSavedCaritasOvertime,
  type SaveCaritasOvertimeInput,
} from "@/domain/saved-caritas-overtime";
import { shift as shiftFixture } from "@/engine/remuneration-test-fixtures";
import { saveShift } from "./calendar-entry-repository";
import {
  listCaritasOvertime,
  loadCaritasOvertime,
  mapCaritasOvertimeRow,
  requireCaritasOvertimeParents,
  saveCaritasOvertime,
} from "./caritas-overtime-repository";
import { migrateDatabase } from "./migrations";
import { migrateCaritasOvertime } from "./migration-25-caritas-overtime";
import { saveOvertimeAllocation } from "./overtime-allocation-repository";
import { saveDatedRemunerationProfile } from "./remuneration-profile-repository";
import { TariffAnnualTestDatabase } from "./tariff-annual-test-database";

describe("confirmed Caritas overtime storage", () => {
  let adapter: TariffAnnualTestDatabase;
  let f: Awaited<ReturnType<typeof setup>>;

  async function setup() {
    adapter = new TariffAnnualTestDatabase();
    await adapter.setup();
    const db = adapter.db;
    const profile = await saveDatedRemunerationProfile(db, {
      effectiveFrom: "2026-09-01",
      expectedRevision: 0,
      data: {
        version: 1,
        weeklyMinutes: 2340,
        selection: {
          kind: "tariff",
          packageId: "avr-caritas-p-mitte",
          variant: "ANLAGE_31",
          region: "MITTE",
          group: "p7",
          level: "5",
          fullTimeWeeklyMinutes: 2340,
        },
      },
    });
    if (profile.effectiveFrom === null)
      throw new Error("Das Caritas-Testprofil benötigt ein Gültigkeitsdatum.");
    const shift = await saveShift(db, {
      ...shiftFixture({
        date: "2026-09-19",
        startTime: "07:00",
        endTime: "15:00",
        overtimeMinutes: 60,
        tariffOvertimeConfirmed: true,
      }),
      id: undefined,
    });
    const allocation = await saveOvertimeAllocation(db, {
      shiftId: shift.id,
      expectedShiftRevision: shift.revision,
      timeZone: "Europe/Berlin",
      allocations: [{ date: shift.date, minutes: 60 }],
      expectedRevision: 0,
    });
    if (shift.updatedAt === null)
      throw new Error("Der Testdienst benötigt einen Änderungszeitpunkt.");
    const input: SaveCaritasOvertimeInput = {
      shiftId: shift.id,
      expectedShiftRevision: shift.revision,
      expectedShiftUpdatedAt: shift.updatedAt,
      timeZone: "Europe/Berlin",
      expectedAllocationRevision: allocation.revision,
      profileEffectiveFrom: profile.effectiveFrom,
      expectedProfileRevision: profile.revision,
      ruleVersionId: "2026-02-01-draft1",
      classificationCase: "SHIFT_PLAN",
      employerOrderConfirmed: true,
      applicableRuleConfirmed: true,
      workSettlement: "CASH",
      premiumSettlement: "TIME",
      workPayoutMonth: "2026-10",
      premiumPayoutMonth: null,
      expectedRevision: 0,
    };
    return { db, profile, shift, allocation, input };
  }

  beforeEach(async () => {
    f = await setup();
  });
  afterEach(() => adapter.database.close());

  it("adds an empty table without deriving entitlement from existing overtime minutes", async () => {
    await f.db.execAsync("DROP TABLE caritas_overtime");
    await f.db.runAsync("DELETE FROM schema_migrations WHERE version=25");
    await migrateCaritasOvertime(f.db, "2026-09-23T00:00:00Z");
    expect(await listCaritasOvertime(f.db)).toEqual([]);
    await migrateDatabase(f.db);
    expect(await listCaritasOvertime(f.db)).toEqual([]);
    const version = adapter.database
      .prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE version=25")
      .get() as { count: number };
    expect(version.count).toBe(1);
  });

  it("persists explicit classification and separate work/premium settlement", async () => {
    const saved = await saveCaritasOvertime(f.db, f.input);
    expect(saved).toMatchObject({
      version: 1,
      classification: "CONFIRMED_AVR_OVERTIME",
      classificationCase: "SHIFT_PLAN",
      workSettlement: "CASH",
      premiumSettlement: "TIME",
      workPayoutMonth: "2026-10",
      premiumPayoutMonth: null,
      allocationRevision: f.allocation.revision,
      profileRevision: f.profile.revision,
    });
    expect(await loadCaritasOvertime(f.db, f.shift.id)).toEqual(saved);
    expect(await listCaritasOvertime(f.db)).toEqual([saved]);
    expect(
      isCurrentCaritasOvertime(
        saved,
        f.shift,
        f.allocation,
        f.profile,
        "2026-02-01-draft1",
        "Europe/Berlin",
      ),
    ).toBe(true);
    expect(Object.isFrozen(saved)).toBe(true);
    expect(() =>
      requireCaritasOvertimeParents(saved, f.shift, f.allocation, [f.profile]),
    ).not.toThrow();
  });

  it("rejects incomplete legal confirmation, row tampering and optimistic conflicts", async () => {
    await expect(
      saveCaritasOvertime(f.db, { ...f.input, employerOrderConfirmed: false as true }),
    ).rejects.toThrow("Einstufung");
    const saved = await saveCaritasOvertime(f.db, f.input);
    await expect(saveCaritasOvertime(f.db, f.input)).rejects.toThrow("inzwischen geändert");
    expect(() => validateSavedCaritasOvertime({ ...saved, workSettlement: "UNKNOWN" })).toThrow(
      "Einstufung",
    );
    expect(() => validateSavedCaritasOvertime({ ...saved, version: 2 })).toThrow("Version");
    expect(() => validateSavedCaritasOvertime({ ...saved, premiumPayoutMonth: "2026-10" })).toThrow(
      "Zeitausgleich",
    );
    expect(() => validateSavedCaritasOvertime({ ...saved, workPayoutMonth: "2026-13" })).toThrow(
      "Auszahlungsmonat",
    );
    expect(() =>
      mapCaritasOvertimeRow({ shift_id: "other", confirmation_json: JSON.stringify(saved) }),
    ).toThrow("Widersprüchliche");
  });

  it("allows unknown cash timing but rejects payment before the overtime work", async () => {
    const unknown = await saveCaritasOvertime(f.db, { ...f.input, workPayoutMonth: null });
    expect(unknown.workPayoutMonth).toBeNull();
    await expect(
      saveCaritasOvertime(f.db, {
        ...f.input,
        expectedRevision: unknown.revision,
        workPayoutMonth: "2026-08",
      }),
    ).rejects.toThrow("vor den bestätigten Überstunden");
  });

  it("makes changed allocations, shifts, profiles and rule versions stale", async () => {
    const saved = await saveCaritasOvertime(f.db, f.input);
    expect(
      isCurrentCaritasOvertime(
        saved,
        f.shift,
        { ...f.allocation, revision: f.allocation.revision + 1 },
        f.profile,
        "2026-02-01-draft1",
        "Europe/Berlin",
      ),
    ).toBe(false);
    expect(
      isCurrentCaritasOvertime(
        saved,
        { ...f.shift, revision: f.shift.revision + 1 },
        f.allocation,
        f.profile,
        "2026-02-01-draft1",
        "Europe/Berlin",
      ),
    ).toBe(false);
    expect(
      isCurrentCaritasOvertime(
        saved,
        f.shift,
        f.allocation,
        { ...f.profile, revision: f.profile.revision + 1 },
        "2026-02-01-draft1",
        "Europe/Berlin",
      ),
    ).toBe(false);
    expect(
      isCurrentCaritasOvertime(
        saved,
        f.shift,
        f.allocation,
        f.profile,
        "2027-01-01-draft1",
        "Europe/Berlin",
      ),
    ).toBe(false);
  });

  it("refuses to reuse a confirmation after its allocation is revised", async () => {
    const saved = await saveCaritasOvertime(f.db, f.input);
    const nextAllocation = await saveOvertimeAllocation(f.db, {
      shiftId: f.shift.id,
      expectedShiftRevision: f.shift.revision,
      timeZone: "Europe/Berlin",
      allocations: [{ date: f.shift.date, minutes: 60 }],
      expectedRevision: f.allocation.revision,
    });
    expect(nextAllocation.revision).toBe(f.allocation.revision + 1);
    await expect(
      saveCaritasOvertime(f.db, { ...f.input, expectedRevision: saved.revision }),
    ).rejects.toThrow("Überstundenaufteilung");
    expect(await loadCaritasOvertime(f.db, f.shift.id)).toEqual(saved);
  });
});
