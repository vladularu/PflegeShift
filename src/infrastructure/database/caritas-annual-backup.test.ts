import { createHash } from "node:crypto";
import canonicalize from "canonicalize";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tariffAnnualFixture } from "@/engine/tariff-annual-test-fixtures";
import { createLocalBackupDocument, loadLocalBackupSnapshot } from "./local-backup";
import { validateLocalBackup } from "./local-backup-validation";
import { restoreLocalBackup } from "./local-backup-restore";
import { LATEST_DATABASE_SCHEMA_VERSION } from "./migrations";
import {
  listTariffAnnualClaims,
  revokeTariffAnnualClaim,
  saveTariffAnnualClaim,
} from "./tariff-annual-claim-repository";
import { TariffAnnualTestDatabase } from "./tariff-annual-test-database";

const sha256 = async (value: string) => createHash("sha256").update(value).digest("hex");
const claimFixture = () => {
  const { claim } = tariffAnnualFixture();
  claim.version = 3;
  claim.selection = {
    packageId: "avr-caritas-p-bw",
    variant: "ANLAGE_31",
    region: "BW",
    group: "p7",
    confirmed: false,
    groupAtSeptember1Confirmed: false,
  };
  return claim;
};
describe("Caritas annual confirmation backup v12", () => {
  let adapter: TariffAnnualTestDatabase;
  beforeEach(async () => {
    adapter = new TariffAnnualTestDatabase();
    await adapter.setup();
  });
  afterEach(() => adapter.database.close());
  const backup = async () =>
    createLocalBackupDocument(await loadLocalBackupSnapshot(adapter.db), {
      createdAt: new Date("2026-10-04T00:00:00Z"),
      appVersion: "0.1.0",
      sha256,
    });
  const validate = (serialized: string) =>
    validateLocalBackup(serialized, {
      maxDatabaseSchemaVersion: LATEST_DATABASE_SCHEMA_VERSION,
      sha256,
    });
  it("retains unconfirmed selection, incomplete evidence and revoked zero payment without inventing an entitlement", async () => {
    const claim = claimFixture();
    claim.employment.confirmed = false;
    claim.basis.months = [];
    claim.entitlements.forEach((row) => {
      row.reason = "UNKNOWN";
    });
    const saved = await saveTariffAnnualClaim(adapter.db, {
      claim,
      actualPayment: { grossCents: 0, payoutMonth: "2027-01" },
      expected: null,
    });
    const revoked = await revokeTariffAnnualClaim(adapter.db, saved);
    const exported = await backup();
    await saveTariffAnnualClaim(adapter.db, { claim, actualPayment: null, expected: revoked });
    await restoreLocalBackup(adapter.db, await validate(exported.serialized));
    expect(await listTariffAnnualClaims(adapter.db)).toEqual([revoked]);
    expect(revoked.claim.selection.groupAtSeptember1Confirmed).toBe(false);
  });
  it.each([8, 9, 10, 11])(
    "rejects a checksum-valid V3 claim relabeled as backup v%i",
    async (version) => {
      const saved = await saveTariffAnnualClaim(adapter.db, {
        claim: claimFixture(),
        actualPayment: null,
        expected: null,
      });
      const root = JSON.parse((await backup()).serialized);
      root.version = version;
      if (version < 9) delete root.data.tvlShiftWork;
      if (version < 10) delete root.data.caritasWorkDays;
      if (version < 11) delete root.data.caritasMonthFacts;
      const { integrity: _integrity, ...unsigned } = root;
      root.integrity.value = await sha256(canonicalize(unsigned)!);
      await expect(validate(JSON.stringify(root))).rejects.toThrow();
      expect(await listTariffAnnualClaims(adapter.db)).toEqual([saved]);
    },
  );
  it.each(["missing", "non-boolean", "wrong-family"])(
    "rejects malformed V3 evidence %s before writing and restoring",
    async (kind) => {
      const saved = await saveTariffAnnualClaim(adapter.db, {
        claim: claimFixture(),
        actualPayment: null,
        expected: null,
      });
      const root = JSON.parse((await backup()).serialized);
      const malformed = JSON.parse(root.data.tariffAnnualClaims[0].claim_json);
      if (kind === "missing") delete malformed.selection.groupAtSeptember1Confirmed;
      if (kind === "non-boolean") malformed.selection.groupAtSeptember1Confirmed = "yes";
      if (kind === "wrong-family") malformed.selection.packageId = "tvl-kr-tdl";
      await expect(
        saveTariffAnnualClaim(adapter.db, {
          claim: malformed,
          actualPayment: null,
          expected: saved,
        }),
      ).rejects.toThrow();
      root.data.tariffAnnualClaims[0].claim_json = JSON.stringify(malformed);
      const { integrity: _integrity, ...unsigned } = root;
      root.integrity.value = await sha256(canonicalize(unsigned)!);
      await expect(validate(JSON.stringify(root))).rejects.toThrow();
      expect(await listTariffAnnualClaims(adapter.db)).toEqual([saved]);
    },
  );
  it("rolls back an interrupted restore and retains the current revision and payment", async () => {
    const saved = await saveTariffAnnualClaim(adapter.db, {
      claim: claimFixture(),
      actualPayment: null,
      expected: null,
    });
    const exported = await backup();
    const current = await saveTariffAnnualClaim(adapter.db, {
      claim: saved.claim,
      actualPayment: { grossCents: 432100, payoutMonth: "2027-01" },
      expected: saved,
    });
    adapter.fail = "INSERT INTO tariff_annual_claims";
    await expect(
      restoreLocalBackup(adapter.db, await validate(exported.serialized)),
    ).rejects.toThrow("injected");
    adapter.fail = null;
    expect(await listTariffAnnualClaims(adapter.db)).toEqual([current]);
    await restoreLocalBackup(adapter.db, await validate(exported.serialized));
    expect(await listTariffAnnualClaims(adapter.db)).toEqual([saved]);
  });
});
