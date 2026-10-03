import { createHash } from "node:crypto";
import canonicalize from "canonicalize";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConcurrencyError } from "@/domain/errors";
import { tariffAnnualFixture } from "@/engine/tariff-annual-test-fixtures";
import tvlRaw from "../../../rules/packages/reviewed/tvl-kr-tdl/2026-04.json";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { calculateTariffAnnualClaim } from "@/engine/tariff-annual-payment";
import { createLocalBackupDocument, loadLocalBackupSnapshot } from "./local-backup";
import { validateLocalBackup } from "./local-backup-validation";
import { restoreLocalBackup } from "./local-backup-restore";
import { migrateDatabase } from "./migrations";
import { loadProfile } from "./profile-repository";
import { generateTestRun, restoreTestBackup, setDeveloperMode } from "./dev-tools-repository";
import {
  listTariffAnnualClaims,
  revokeTariffAnnualClaim,
  saveTariffAnnualClaim,
} from "./tariff-annual-claim-repository";
import { TariffAnnualTestDatabase } from "./tariff-annual-test-database";

const sha256 = async (value: string) => createHash("sha256").update(value).digest("hex");
interface MutableBackup {
  version: number;
  databaseSchemaVersion: number;
  data: Record<string, unknown>;
  integrity: { value: string };
}
async function resign(serialized: string, edit: (root: MutableBackup) => void) {
  const root = JSON.parse(serialized) as MutableBackup;
  edit(root);
  if (root.version < 17) delete root.data.tvoedAnnexAPremiumFacts;
  if (root.version < 18) delete root.data.drkEmployeeMonthConfirmations;
  if (root.version < 19) delete root.data.drkTrainingMonthConfirmations;
  const { integrity: _integrity, ...unsigned } = root;
  root.integrity.value = await sha256(canonicalize(unsigned)!);
  return JSON.stringify(root);
}

describe("tariff annual claim backup v8", () => {
  let adapter: TariffAnnualTestDatabase;
  beforeEach(async () => {
    adapter = new TariffAnnualTestDatabase();
    await adapter.setup();
  });
  afterEach(() => adapter.database.close());
  const save = (id = "annual", grossCents: number | null = 123456) =>
    saveTariffAnnualClaim(adapter.db, {
      claim: { ...tariffAnnualFixture().claim, id },
      actualPayment: grossCents === null ? null : { grossCents, payoutMonth: "2027-01" },
      expected: null,
    });
  const backup = async () =>
    createLocalBackupDocument(await loadLocalBackupSnapshot(adapter.db), {
      createdAt: new Date("2026-09-22T12:00:00Z"),
      appVersion: "0.1.0",
      sha256,
    });
  const validate = (serialized: string) =>
    validateLocalBackup(serialized, { maxDatabaseSchemaVersion: 31, sha256 });

  it("retains the V2 TV-L confirmation through database reload and backup restoration", async () => {
    const { claim } = tariffAnnualFixture();
    claim.version = 2;
    claim.selection = {
      packageId: "tvl-kr-tdl",
      variant: "SECTION_43",
      region: "WEST_38_5",
      group: "kr9",
      confirmed: true,
    };
    claim.exceptions.tvlLegacyRetirementExit = false;
    const initial = await saveTariffAnnualClaim(adapter.db, {
      claim,
      actualPayment: null,
      expected: null,
    });
    const exported = await backup();
    await revokeTariffAnnualClaim(adapter.db, initial);
    await restoreLocalBackup(adapter.db, await validate(exported.serialized));
    const restored = (await listTariffAnnualClaims(adapter.db))[0];
    expect(restored).toEqual(initial);
    expect(restored.claim.exceptions.tvlLegacyRetirementExit).toBe(false);
    expect(
      calculateTariffAnnualClaim(tvlRaw as RuleTariffPackage, restored.claim).amountCents,
    ).toBe(223050);
    const malformed = await resign(exported.serialized, (root) => {
      const rows = root.data.tariffAnnualClaims as { claim_json: string }[];
      const payload = JSON.parse(rows[0].claim_json) as { exceptions: Record<string, unknown> };
      payload.exceptions.tvlLegacyRetirementExit = "yes";
      rows[0].claim_json = JSON.stringify(payload);
    });
    await expect(validate(malformed)).rejects.toThrow();
    expect(await listTariffAnnualClaims(adapter.db)).toEqual([initial]);
  });

  it("round-trips a V3 Caritas confirmation in backup v12 without relabeling it as v11", async () => {
    const { claim } = tariffAnnualFixture();
    claim.version = 3;
    claim.selection = {
      packageId: "avr-caritas-p-bw",
      variant: "ANLAGE_31",
      region: "BW",
      group: "p7",
      confirmed: true,
      groupAtSeptember1Confirmed: true,
    };
    const initial = await saveTariffAnnualClaim(adapter.db, {
      claim,
      actualPayment: null,
      expected: null,
    });
    const exported = await backup();
    expect(exported.document.version).toBe(19);
    const mislabeled = await resign(exported.serialized, (root) => {
      root.version = 11;
      root.databaseSchemaVersion = 24;
      delete root.data.caritasOvertime;
      delete root.data.tvoedAnnexAMonthConfirmations;
      delete root.data.tvoedSueMonthConfirmations;
      delete root.data.tvoedSueAllowanceConfirmations;
    });
    await expect(validate(mislabeled)).rejects.toThrow();
    await revokeTariffAnnualClaim(adapter.db, initial);
    await restoreLocalBackup(adapter.db, await validate(exported.serialized));
    expect(await listTariffAnnualClaims(adapter.db)).toEqual([initial]);
  });

  it("continues to import a genuine v11 backup with unchanged V1 claims", async () => {
    const initial = await save("previous-version", null);
    const legacy = await resign((await backup()).serialized, (root) => {
      root.version = 11;
      root.databaseSchemaVersion = 24;
      delete root.data.caritasOvertime;
      delete root.data.tvoedAnnexAMonthConfirmations;
      delete root.data.tvoedSueMonthConfirmations;
      delete root.data.tvoedSueAllowanceConfirmations;
    });
    await revokeTariffAnnualClaim(adapter.db, initial);
    await restoreLocalBackup(adapter.db, await validate(legacy));
    expect(await listTariffAnnualClaims(adapter.db)).toEqual([initial]);
  });

  it("activates additive migration 21 through normal bootstrap and rolls back failure", async () => {
    const profile = await adapter.db.getFirstAsync("SELECT * FROM user_profile");
    // Only this isolated in-memory fixture is rewound to simulate a schema-20 installation.
    adapter.database.exec(
      "DROP TABLE drk_training_month_confirmations; DROP TABLE drk_employee_month_confirmations; DROP TABLE tvoed_annex_a_premium_facts; DROP TABLE tvoed_sue_allowance_confirmations; DROP TABLE tvoed_sue_month_confirmations; DROP TABLE tvoed_annex_a_month_confirmations; DROP TABLE caritas_overtime; DROP TABLE caritas_month_facts; DROP TABLE caritas_work_days; DROP TABLE tvl_shift_work; DROP TABLE tariff_annual_claims; DELETE FROM schema_migrations WHERE version>=21",
    );
    adapter.fail = "VALUES(21,?)";
    await expect(migrateDatabase(adapter.db)).rejects.toThrow("injected");
    expect(adapter.database.inTransaction).toBe(false);
    expect(
      await adapter.db.getFirstAsync(
        "SELECT name FROM sqlite_master WHERE name='tariff_annual_claims'",
      ),
    ).toBeNull();
    expect(
      await adapter.db.getFirstAsync("SELECT MAX(version) version FROM schema_migrations"),
    ).toEqual({ version: 20 });
    adapter.fail = null;
    await migrateDatabase(adapter.db);
    await migrateDatabase(adapter.db);
    expect(await adapter.db.getFirstAsync("SELECT * FROM user_profile")).toEqual(profile);
    expect(await listTariffAnnualClaims(adapter.db)).toEqual([]);
    expect(
      await adapter.db.getAllAsync("SELECT version FROM schema_migrations WHERE version=21"),
    ).toHaveLength(1);
  });

  it("round-trips claims, zero, absent and next-year payments plus revoked records", async () => {
    const paid = await save();
    await save("zero", 0);
    await save("estimate", null);
    await revokeTariffAnnualClaim(adapter.db, await save("withdrawn"));
    const before = await loadLocalBackupSnapshot(adapter.db);
    const rows = await listTariffAnnualClaims(adapter.db);
    const exported = await backup();
    expect(exported.document).toMatchObject({ version: 19, databaseSchemaVersion: 31 });
    expect(exported.document.data.tariffAnnualClaims).toHaveLength(4);
    await revokeTariffAnnualClaim(adapter.db, paid);
    await save("destination-only", 1);
    await restoreLocalBackup(adapter.db, await validate(exported.serialized));
    expect(await loadLocalBackupSnapshot(adapter.db)).toEqual(before);
    expect(await listTariffAnnualClaims(adapter.db)).toEqual(rows);
  });

  it.each([1, 2, 3, 4, 5, 6, 7])(
    "restores original v%i without retaining or inventing tariff claims",
    async (version) => {
      await save();
      const legacy = await resign((await backup()).serialized, (root) => {
        root.version = version;
        root.databaseSchemaVersion = [0, 13, 15, 16, 17, 18, 19, 20][version];
        delete root.data.tariffAnnualClaims;
        delete root.data.tvlShiftWork;
        delete root.data.caritasWorkDays;
        delete root.data.caritasMonthFacts;
        delete root.data.caritasOvertime;
        delete root.data.tvoedAnnexAMonthConfirmations;
        delete root.data.tvoedSueMonthConfirmations;
        delete root.data.tvoedSueAllowanceConfirmations;
        if (version < 7) delete root.data.actualAnnualPayments;
        if (version < 6) {
          delete root.data.trainingProfiles;
          delete root.data.shiftTrainingDetails;
        }
        if (version < 5) delete root.data.paidAbsences;
        if (version < 4) delete root.data.overtimeAllocations;
        if (version < 3) delete root.data.allowanceDecisions;
        if (version < 2) delete root.data.remunerationProfiles;
      });
      const checked = await validate(legacy);
      expect(checked.document.data.tariffAnnualClaims).toBeUndefined();
      await restoreLocalBackup(adapter.db, checked);
      expect(await listTariffAnnualClaims(adapter.db)).toEqual([]);
      await expect(
        validate(legacy.replace('"appVersion":"0.1.0"', '"appVersion":"tampered"')),
      ).rejects.toThrow("Prüfwert");
    },
  );

  it.each([
    "missing",
    "duplicate",
    "row-key",
    "row-year",
    "row-extra",
    "nested-extra",
    "claim-version",
    "revision",
    "unsafe-revision",
    "revoked",
    "timestamp",
    "actual-extra",
    "actual-negative",
    "actual-invalid-month",
    "profile",
    "schema",
  ])("rejects invalid %s before restore", async (mutation) => {
    await save();
    const before = await loadLocalBackupSnapshot(adapter.db);
    const corrupted = await resign((await backup()).serialized, (root) => {
      const rows = root.data.tariffAnnualClaims as Record<string, unknown>[];
      const row = rows[0];
      const claim = JSON.parse(row.claim_json as string) as Record<string, unknown>;
      const actual = JSON.parse(row.actual_payment_json as string) as Record<string, unknown>;
      if (mutation === "missing") delete root.data.tariffAnnualClaims;
      if (mutation === "duplicate") rows.push({ ...row });
      if (mutation === "row-key") row.claim_id = "other";
      if (mutation === "row-year") row.entitlement_year = 2025;
      if (mutation === "row-extra") row.extra = true;
      if (mutation === "nested-extra") claim.extra = true;
      if (mutation === "claim-version") claim.version = 2;
      if (mutation === "revision") row.revision = 0;
      if (mutation === "unsafe-revision") row.revision = Number.MAX_SAFE_INTEGER + 1;
      if (mutation === "revoked") row.revoked = 2;
      if (mutation === "timestamp") row.updated_at = "not-an-instant";
      if (mutation === "actual-extra") actual.extra = true;
      if (mutation === "actual-negative") actual.grossCents = -1;
      if (mutation === "actual-invalid-month") actual.payoutMonth = "2027-13";
      if (mutation === "profile") {
        root.data.profile = null;
        root.data.remunerationProfiles = [];
      }
      if (mutation === "schema") root.databaseSchemaVersion = 20;
      row.claim_json = JSON.stringify(claim);
      row.actual_payment_json = JSON.stringify(actual);
    });
    await expect(validate(corrupted)).rejects.toThrow();
    expect(await loadLocalBackupSnapshot(adapter.db)).toEqual(before);
  });

  it("validates nested data without rewriting its bytes before checksum verification", async () => {
    const saved = await save();
    const claim = JSON.stringify(saved.claim, null, 2);
    const actual = JSON.stringify(saved.actualPayment, null, 2);
    await adapter.db.runAsync(
      "UPDATE tariff_annual_claims SET claim_json=?,actual_payment_json=?",
      claim,
      actual,
    );
    const exported = await backup();
    const checked = await validate(exported.serialized);
    expect(checked.document.data.tariffAnnualClaims![0]).toMatchObject({
      claim_json: claim,
      actual_payment_json: actual,
    });
    await restoreLocalBackup(adapter.db, checked);
    expect((await loadLocalBackupSnapshot(adapter.db)).tariffAnnualClaims[0]).toMatchObject({
      claim_json: claim,
      actual_payment_json: actual,
    });
    const changed = JSON.parse(exported.serialized) as MutableBackup;
    (changed.data.tariffAnnualClaims as Record<string, unknown>[])[0].actual_payment_json =
      JSON.stringify({ ...saved.actualPayment, grossCents: 1 });
    await expect(validate(JSON.stringify(changed))).rejects.toThrow("Prüfwert");
    await expect(
      validateLocalBackup(exported.serialized, { maxDatabaseSchemaVersion: 20, sha256 }),
    ).rejects.toThrow("neueren");
  });

  it.each(["DELETE FROM tariff_annual_claims", "INSERT INTO tariff_annual_claims"])(
    "rolls back all restored data after %s fails",
    async (failure) => {
      const saved = await save();
      const exported = await backup();
      await revokeTariffAnnualClaim(adapter.db, saved);
      await adapter.db.runAsync("UPDATE user_profile SET weekly_minutes=1200");
      const before = await loadLocalBackupSnapshot(adapter.db);
      adapter.fail = failure;
      await expect(
        restoreLocalBackup(adapter.db, await validate(exported.serialized)),
      ).rejects.toThrow("injected");
      expect(await loadLocalBackupSnapshot(adapter.db)).toEqual(before);
      expect(adapter.database.inTransaction).toBe(false);
      adapter.fail = null;
      await restoreLocalBackup(adapter.db, await validate(exported.serialized));
      expect(await listTariffAnnualClaims(adapter.db)).toEqual([saved]);
    },
  );

  it("rejects a stale edit after restoring different contents with the same revision", async () => {
    const stale = await save();
    const serialized = await resign((await backup()).serialized, (root) => {
      const row = (root.data.tariffAnnualClaims as Record<string, unknown>[])[0];
      row.actual_payment_json = JSON.stringify({ grossCents: 42, payoutMonth: "2027-01" });
    });
    await restoreLocalBackup(adapter.db, await validate(serialized));
    await expect(
      saveTariffAnnualClaim(adapter.db, {
        claim: stale.claim,
        actualPayment: null,
        expected: stale,
      }),
    ).rejects.toBeInstanceOf(ConcurrencyError);
    expect((await listTariffAnnualClaims(adapter.db))[0]).toMatchObject({
      revision: 1,
      actualPayment: { grossCents: 42 },
    });
  });

  it("keeps personal claims unchanged through test generation and restoration", async () => {
    const saved = await save();
    const checked = await validate((await backup()).serialized);
    const profile = await loadProfile(adapter.db);
    if (!profile) throw new Error("missing fixture profile");
    await setDeveloperMode(adapter.db, true);
    await generateTestRun(
      adapter.db,
      { startMonth: "2026-09", range: 1, scenario: "NORMAL_ROTATION" },
      profile,
    );
    expect(await listTariffAnnualClaims(adapter.db)).toEqual([saved]);
    await expect(backup()).rejects.toThrow("Testlabor");
    await expect(restoreLocalBackup(adapter.db, checked)).rejects.toThrow("Testlabor");
    await expect(revokeTariffAnnualClaim(adapter.db, saved)).rejects.toThrow("Testlabor");
    await restoreTestBackup(adapter.db, ["2026-09"]);
    expect(await listTariffAnnualClaims(adapter.db)).toEqual([saved]);
    await expect(backup()).resolves.toBeDefined();
  });
});
