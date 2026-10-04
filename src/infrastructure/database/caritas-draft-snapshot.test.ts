import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { shift as shiftFixture } from "@/engine/remuneration-test-fixtures";
import { tariffAnnualFixture } from "@/engine/tariff-annual-test-fixtures";
import { deleteCalendarEntry, saveShift } from "./calendar-entry-repository";
import { loadCaritasDraftSnapshot } from "./caritas-draft-snapshot";
import { saveCaritasOvertime } from "./caritas-overtime-repository";
import { saveOvertimeAllocation } from "./overtime-allocation-repository";
import { saveDatedRemunerationProfile } from "./remuneration-profile-repository";
import { saveTariffAnnualClaim } from "./tariff-annual-claim-repository";
import { TariffAnnualTestDatabase } from "./tariff-annual-test-database";

describe("Caritas candidate full-history snapshot", () => {
  let adapter: TariffAnnualTestDatabase;

  beforeEach(async () => {
    adapter = new TariffAnnualTestDatabase();
    await adapter.setup();
  });
  afterEach(() => adapter.database.close());

  it("loads current parents and confirmed payout timing in one local view", async () => {
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
    if (profile.effectiveFrom === null) throw new Error("Datierter Teststand fehlt.");
    const entry = await saveShift(db, {
      ...shiftFixture({
        date: "2026-09-19",
        startTime: "07:00",
        endTime: "09:00",
        overtimeMinutes: 60,
        tariffOvertimeConfirmed: true,
      }),
      id: undefined,
    });
    const allocation = await saveOvertimeAllocation(db, {
      shiftId: entry.id,
      expectedShiftRevision: entry.revision,
      timeZone: "Europe/Berlin",
      allocations: [{ date: entry.date, minutes: 60 }],
      expectedRevision: 0,
    });
    const confirmation = await saveCaritasOvertime(db, {
      shiftId: entry.id,
      expectedShiftRevision: entry.revision,
      expectedShiftUpdatedAt: entry.updatedAt,
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
    });
    const { claim } = tariffAnnualFixture();
    claim.version = 3;
    claim.selection.packageId = "avr-caritas-p-mitte";
    claim.selection.variant = "ANLAGE_31";
    claim.selection.region = "MITTE";
    claim.selection.group = "p7";
    claim.selection.groupAtSeptember1Confirmed = true;
    const annual = await saveTariffAnnualClaim(db, {
      claim,
      actualPayment: { grossCents: 321_000, payoutMonth: "2026-11" },
      expected: null,
    });
    const snapshot = await loadCaritasDraftSnapshot(db);
    expect(snapshot).toMatchObject({
      entriesComplete: true,
      historyComplete: true,
      overtimeAllocations: [allocation],
      overtimeConfirmations: [confirmation],
      monthFacts: [],
      workDayConfirmations: [],
      tariffAnnualClaims: [annual],
    });
    expect(snapshot.remunerationProfiles).toContainEqual(profile);
    expect(snapshot.shifts).toContainEqual(entry);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.shifts)).toBe(true);

    await deleteCalendarEntry(db, entry);
    const afterDeletion = await loadCaritasDraftSnapshot(db);
    expect(afterDeletion.shifts).toEqual([]);
    expect(afterDeletion.overtimeConfirmations).toEqual([confirmation]);
  });
});
