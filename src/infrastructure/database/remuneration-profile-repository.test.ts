import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import canonicalize from "canonicalize";
import type { SQLiteDatabase } from "expo-sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateDatabase } from "./migrations";
import { loadProfile, saveProfile } from "./profile-repository";
import {
  listRemunerationProfiles,
  saveDatedRemunerationProfile,
  RemunerationProfileConflictError,
} from "./remuneration-profile-repository";
import {
  remunerationDataFromLegacy,
  resolveRemunerationProfile,
} from "@/domain/remuneration-profile";
import { createLocalBackupDocument, loadLocalBackupSnapshot } from "./local-backup";
import { validateLocalBackup } from "./local-backup-validation";
import { restoreLocalBackup } from "./local-backup-restore";
import { ownRemunerationFixture } from "@/domain/own-remuneration-test-fixtures";
import trainingValue from "../../../rules/packages/reviewed/tvaoed-pflege-vka/2026-05.json";
import krValue from "../../../rules/packages/reviewed/tvl-kr-tdl/2026-04.json";
import tvalValue from "../../../rules/packages/reviewed/tval-pflege-tdl/2026-04.json";
import { resolveRemunerationContext } from "@/engine/remuneration-context";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  resolver as payResolver,
  candidate as employeeTariff,
  history as employeeHistory,
  work,
} from "@/engine/remuneration-test-fixtures";
import { calculateMonthlyBaseRemuneration } from "@/engine/remuneration-base";
import { calculateMonthlyDatedAllowances } from "@/engine/remuneration-allowances";

class TestDatabase {
  readonly database: Database.Database;
  constructor(snapshot?: Buffer) {
    this.database = new Database(snapshot ?? ":memory:");
  }
  failSqlIncludes: string | null = null;
  async execAsync(sql: string) {
    this.database.exec(sql);
  }
  async runAsync(sql: string, ...params: unknown[]) {
    if (this.failSqlIncludes !== null && sql.includes(this.failSqlIncludes))
      throw new Error("injected failure");
    const result = this.database.prepare(sql).run(...params);
    return { changes: result.changes, lastInsertRowId: Number(result.lastInsertRowid) };
  }
  async getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null> {
    return (this.database.prepare(sql).get(...params) as T | undefined) ?? null;
  }
  async getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    return this.database.prepare(sql).all(...params) as T[];
  }
}
const legacyInput = {
  federalState: "NW",
  weeklyMinutes: 1155,
  timeZone: "Europe/Berlin",
  manualMonthlyGrossCents: 200000,
} as const;
const data = {
  version: 1,
  weeklyMinutes: 1155,
  selection: { kind: "own-monthly", monthlyGrossCents: 210000 },
} as const;
const sha256 = async (value: string) => createHash("sha256").update(value).digest("hex");
async function backup(db: SQLiteDatabase) {
  return createLocalBackupDocument(await loadLocalBackupSnapshot(db), {
    appVersion: "0.1.0",
    createdAt: new Date("2026-09-21T00:00:00Z"),
    sha256,
  });
}
async function resign(serialized: string, mutate: (root: Record<string, unknown>) => void) {
  const root = JSON.parse(serialized) as Record<string, unknown>;
  delete root.integrity;
  mutate(root);
  if (typeof root.version === "number" && root.version < 17)
    delete (root.data as Record<string, unknown>).tvoedAnnexAPremiumFacts;
  if (typeof root.version === "number" && root.version < 18)
    delete (root.data as Record<string, unknown>).drkEmployeeMonthConfirmations;
  if (typeof root.version === "number" && root.version < 19)
    delete (root.data as Record<string, unknown>).drkTrainingMonthConfirmations;
  return JSON.stringify({
    ...root,
    integrity: {
      algorithm: "SHA-256",
      canonicalization: "RFC8785",
      scope: "document-without-integrity",
      value: await sha256(canonicalize(root)!),
    },
  });
}

describe("remuneration history persistence and backup", () => {
  let adapter: TestDatabase;
  let db: SQLiteDatabase;
  beforeEach(async () => {
    adapter = new TestDatabase();
    db = adapter as unknown as SQLiteDatabase;
    await migrateDatabase(db);
  });
  afterEach(() => adapter.database.close());

  it.each([null, "NONE", "LOWER", "HIGHER"] as const)(
    "persists dated TVA-L activity %s through restart, restore and corrupt-backup rejection",
    async (clinical) => {
      await saveProfile(db, legacyInput);
      const selection = {
        kind: "tariff" as const,
        packageId: "tval-pflege-tdl",
        variant: "CARE",
        region: "WEST_38_5",
        group: "regular",
        level: "1",
        fullTimeWeeklyMinutes: 2310,
        tvalEmployerScope: null,
        tvlEmploymentCategory: null,
      };
      await saveDatedRemunerationProfile(db, {
        effectiveFrom: "2026-08-01",
        expectedRevision: 0,
        data: { version: 7, weeklyMinutes: 1155, selection },
      });
      const facts = { paidEntitlement: true, clinical, burnCare: false };
      const claim = {
        version: 8 as const,
        weeklyMinutes: 1155,
        selection: { ...selection, tvalCareAllowances: facts },
      };
      const saved = await saveDatedRemunerationProfile(db, {
        effectiveFrom: "2026-09-01",
        data: claim,
        expectedRevision: 0,
      });
      const original = await listRemunerationProfiles(db);
      const catalog = payResolver([tvalValue as RuleTariffPackage]);
      const check = (profiles: typeof original) => {
        expect(profiles).toEqual(original);
        expect(resolveRemunerationContext("2026-08-31", profiles, catalog)).toMatchObject({
          kind: "tval-training",
          careAllowances: null,
        });
        expect(resolveRemunerationContext("2026-09-01", profiles, catalog)).toMatchObject({
          kind: "tval-training",
          careAllowances: facts,
        });
      };
      const reopened = new TestDatabase(adapter.database.serialize());
      try {
        check(await listRemunerationProfiles(reopened as unknown as SQLiteDatabase));
      } finally {
        reopened.database.close();
      }
      const exported = await backup(db);
      const validated = await validateLocalBackup(exported.serialized, {
        maxDatabaseSchemaVersion: 31,
        sha256,
      });
      await saveDatedRemunerationProfile(db, {
        effectiveFrom: "2026-09-01",
        data,
        expectedRevision: saved.revision,
      });
      await restoreLocalBackup(db, validated);
      check(await listRemunerationProfiles(db));
      const corrupt = await resign(exported.serialized, (root) => {
        const rows = (root.data as Record<string, unknown>).remunerationProfiles as Record<
          string,
          unknown
        >[];
        rows.find((row) => row.effective_from === "2026-09-01")!.data_json = JSON.stringify({
          ...claim,
          selection: {
            ...claim.selection,
            tvalCareAllowances: { ...facts, clinical: "LEADER_HIGHER" },
          },
        });
      });
      await expect(
        validateLocalBackup(corrupt, { maxDatabaseSchemaVersion: 31, sha256 }),
      ).rejects.toThrow();
      check(await listRemunerationProfiles(db));
    },
  );

  it.each(
    ([null, "GENERAL", "SECTION_43"] as const).flatMap((scope) =>
      ([null, "SALARIED_SECTION_38_5_1", "OTHER"] as const).map(
        (category) => [scope, category] as const,
      ),
    ),
  )(
    "preserves TVA-L scope %s / category %s across restart and backup without inventing legacy facts",
    async (tvalEmployerScope, tvlEmploymentCategory) => {
      await saveProfile(db, legacyInput);
      const selection = {
        kind: "tariff" as const,
        packageId: "tval-pflege-tdl",
        variant: "CARE",
        region: "WEST_38_5",
        group: "regular",
        level: "1",
        fullTimeWeeklyMinutes: 2310,
      };
      await saveDatedRemunerationProfile(db, {
        effectiveFrom: "2026-08-01",
        data: { version: 1, weeklyMinutes: 1155, selection },
        expectedRevision: 0,
      });
      const claim = {
        version: 7 as const,
        weeklyMinutes: 1155,
        selection: { ...selection, tvalEmployerScope, tvlEmploymentCategory },
      };
      const saved = await saveDatedRemunerationProfile(db, {
        effectiveFrom: "2026-09-01",
        data: claim,
        expectedRevision: 0,
      });
      const original = await listRemunerationProfiles(db);
      const catalog = payResolver([tvalValue as RuleTariffPackage]);
      const check = (profiles: typeof original) => {
        expect(profiles).toEqual(original);
        expect(resolveRemunerationContext("2026-08-31", profiles, catalog)).toMatchObject({
          kind: "tval-training",
          employerScope: null,
          employmentCategory: null,
        });
        expect(resolveRemunerationContext("2026-09-01", profiles, catalog)).toMatchObject({
          kind: "tval-training",
          employerScope: tvalEmployerScope,
          employmentCategory: tvlEmploymentCategory,
        });
      };
      const reopened = new TestDatabase(adapter.database.serialize());
      try {
        check(await listRemunerationProfiles(reopened as unknown as SQLiteDatabase));
      } finally {
        reopened.database.close();
      }
      const exported = await backup(db);
      const verified = await validateLocalBackup(exported.serialized, {
        maxDatabaseSchemaVersion: 31,
        sha256,
      });
      await saveDatedRemunerationProfile(db, {
        effectiveFrom: "2026-09-01",
        data,
        expectedRevision: saved.revision,
      });
      await restoreLocalBackup(db, verified);
      check(await listRemunerationProfiles(db));
      for (const bad of [undefined, true, "HOSPITAL"]) {
        const corrupt = await resign(exported.serialized, (root) => {
          const rows = (root.data as Record<string, unknown>).remunerationProfiles as Record<
            string,
            unknown
          >[];
          rows.find((row) => row.effective_from === "2026-09-01")!.data_json = JSON.stringify({
            ...claim,
            selection: { ...claim.selection, tvalEmployerScope: bad },
          });
        });
        await expect(
          validateLocalBackup(corrupt, { maxDatabaseSchemaVersion: 31, sha256 }),
        ).rejects.toThrow();
        check(await listRemunerationProfiles(db));
      }
    },
  );

  it.each([undefined, null, "NONE", "FUNCTION", "LEADERSHIP"] as const)(
    "preserves v5 function claim %s through restart/restore and rejects malformed backup claims",
    async (functionDuty) => {
      await saveProfile(db, legacyInput);
      const claimData = {
        version: 5 as const,
        weeklyMinutes: 2310,
        selection: {
          kind: "tariff" as const,
          packageId: "tvl-kr-tdl",
          variant: "SECTION_43",
          region: "WEST_38_5",
          group: "KR7",
          level: "2",
          fullTimeWeeklyMinutes: 2310,
          tvlEmploymentCategory: null,
          tvlCareAllowances: {
            paidEntitlement: true,
            nursing: true,
            instructor: true,
            clinical: "NONE" as const,
            leadershipAnnexFNumber: "NONE" as const,
            burnCare: false,
            ...(functionDuty === undefined ? {} : { functionDuty }),
          },
        },
      };
      const saved = await saveDatedRemunerationProfile(db, {
        effectiveFrom: "2026-09-01",
        data: claimData,
        expectedRevision: 0,
      });
      const original = await listRemunerationProfiles(db);
      const catalog = payResolver([krValue as RuleTariffPackage]);
      const amount = async (database: SQLiteDatabase) =>
        calculateMonthlyDatedAllowances(
          "2026-09",
          [],
          work,
          await listRemunerationProfiles(database),
          [],
          catalog,
        ).knownSubtotalCents;
      const expected = functionDuty === "FUNCTION" ? 30000 : 25500; // KR7 is not a leadership group.
      expect(await amount(db)).toBe(expected);
      const reopened = new TestDatabase(adapter.database.serialize());
      try {
        expect(await listRemunerationProfiles(reopened as unknown as SQLiteDatabase)).toEqual(
          original,
        );
        expect(await amount(reopened as unknown as SQLiteDatabase)).toBe(expected);
      } finally {
        reopened.database.close();
      }
      const exported = await backup(db);
      const verified = await validateLocalBackup(exported.serialized, {
        maxDatabaseSchemaVersion: 31,
        sha256,
      });
      await saveDatedRemunerationProfile(db, {
        effectiveFrom: "2026-09-01",
        data,
        expectedRevision: saved.revision,
      });
      await restoreLocalBackup(db, verified);
      expect(await listRemunerationProfiles(db)).toEqual(original);
      expect(await amount(db)).toBe(expected);
      const malformed = await resign(exported.serialized, (root) => {
        const rows = (root.data as Record<string, unknown>).remunerationProfiles as Record<
          string,
          unknown
        >[];
        rows.find((row) => row.effective_from === "2026-09-01")!.data_json = JSON.stringify({
          ...claimData,
          selection: {
            ...claimData.selection,
            tvlCareAllowances: { ...claimData.selection.tvlCareAllowances, functionDuty: "ALL" },
          },
        });
      });
      await expect(
        validateLocalBackup(malformed, { maxDatabaseSchemaVersion: 31, sha256 }),
      ).rejects.toThrow();
      expect(await amount(db)).toBe(expected);
    },
  );

  it.each([null, "SALARIED_SECTION_38_5_1", "OTHER"] as const)(
    "preserves dated v4 TV-L category %s across restart, correction and backup restore",
    async (tvlEmploymentCategory) => {
      await saveProfile(db, legacyInput);
      const krData = {
        version: 4 as const,
        weeklyMinutes: 1155,
        selection: {
          kind: "tariff" as const,
          packageId: "tvl-kr-tdl",
          variant: "SECTION_43",
          region: "WEST_38_5",
          group: "KR5",
          level: "1",
          fullTimeWeeklyMinutes: 2310,
          tvlEmploymentCategory,
        },
      };
      const { tvlEmploymentCategory: _, ...legacySelection } = krData.selection;
      await saveDatedRemunerationProfile(db, {
        effectiveFrom: "2026-08-01",
        data: { ...krData, version: 1, selection: legacySelection },
        expectedRevision: 0,
      });
      const saved = await saveDatedRemunerationProfile(db, {
        effectiveFrom: "2026-09-01",
        data: krData,
        expectedRevision: 0,
      });
      const original = await listRemunerationProfiles(db);
      const catalog = payResolver([krValue as RuleTariffPackage]);
      const assertHistory = (profiles: typeof original) => {
        expect(profiles).toEqual(original);
        expect(resolveRemunerationContext("2026-08-31", profiles, catalog)).toMatchObject({
          kind: "tvl-kr",
          employmentCategory: null,
        });
        expect(resolveRemunerationContext("2026-09-01", profiles, catalog)).toMatchObject({
          kind: "tvl-kr",
          employmentCategory: tvlEmploymentCategory,
        });
      };
      const reopened = new TestDatabase(adapter.database.serialize());
      try {
        assertHistory(await listRemunerationProfiles(reopened as unknown as SQLiteDatabase));
      } finally {
        reopened.database.close();
      }
      const exported = await backup(db);
      const verified = await validateLocalBackup(exported.serialized, {
        maxDatabaseSchemaVersion: 31,
        sha256,
      });
      await saveDatedRemunerationProfile(db, {
        effectiveFrom: "2026-09-01",
        data,
        expectedRevision: saved.revision,
      });
      await restoreLocalBackup(db, verified);
      assertHistory(await listRemunerationProfiles(db));
      for (const invalidCategory of [true, "OTHER_OR_MULTIPLE", undefined]) {
        const bad = await resign(exported.serialized, (root) => {
          const rows = (root.data as Record<string, unknown>).remunerationProfiles as Record<
            string,
            unknown
          >[];
          rows.find((row) => row.effective_from === "2026-09-01")!.data_json = JSON.stringify({
            ...krData,
            selection: { ...krData.selection, tvlEmploymentCategory: invalidCategory },
          });
        });
        await expect(
          validateLocalBackup(bad, {
            maxDatabaseSchemaVersion: 31,
            sha256,
          }),
        ).rejects.toThrow();
        assertHistory(await listRemunerationProfiles(db));
      }
    },
  );

  it("keeps training category, paid year and the transition to employment across restart and backup restore", async () => {
    await saveProfile(db, legacyInput);
    const trainingData = {
      version: 1,
      weeklyMinutes: 2310,
      selection: {
        kind: "tariff",
        packageId: "tvaoed-pflege-vka",
        variant: "BT_K",
        region: "KAV_BW",
        group: "b",
        level: "1",
        fullTimeWeeklyMinutes: 2310,
      },
    } as const;
    await saveDatedRemunerationProfile(db, {
      effectiveFrom: "2026-09-01",
      data: trainingData,
      expectedRevision: 0,
    });
    await saveDatedRemunerationProfile(db, {
      effectiveFrom: "2026-10-01",
      data: { ...trainingData, selection: { ...trainingData.selection, level: "2" } },
      expectedRevision: 0,
    });
    await saveDatedRemunerationProfile(db, {
      effectiveFrom: "2026-11-01",
      data: employeeHistory().data,
      expectedRevision: 0,
    });
    const original = await listRemunerationProfiles(db);
    const catalog = payResolver([trainingValue as RuleTariffPackage, employeeTariff]);
    const amounts = (profiles: typeof original) =>
      ["2026-09", "2026-10", "2026-11"].map(
        (month) => calculateMonthlyBaseRemuneration(month, profiles, catalog).totalCents,
      );
    const before = amounts(original);
    expect(before.slice(0, 2)).toEqual([149069, 155207]);
    expect(before[2]).toBeGreaterThan(155207);
    const reopened = new TestDatabase(adapter.database.serialize());
    try {
      const reloaded = await listRemunerationProfiles(reopened as unknown as SQLiteDatabase);
      expect(reloaded).toEqual(original);
      expect(amounts(reloaded)).toEqual(before);
    } finally {
      reopened.database.close();
    }
    const exported = await backup(db);
    const verified = await validateLocalBackup(exported.serialized, {
      maxDatabaseSchemaVersion: 31,
      sha256,
    });
    await saveDatedRemunerationProfile(db, {
      effectiveFrom: "2026-09-01",
      data,
      expectedRevision: 1,
    });
    await restoreLocalBackup(db, verified);
    const restored = await listRemunerationProfiles(db);
    expect(restored).toEqual(original);
    expect(amounts(restored)).toEqual(before);
  });

  it("preserves dated v3 special-duty eligibility through restart and backup, rejecting corrupted claims", async () => {
    await saveProfile(db, legacyInput);
    const trainingData = {
      version: 3,
      weeklyMinutes: 2310,
      selection: {
        kind: "tariff",
        packageId: "tvaoed-pflege-vka",
        variant: "BT_K",
        region: "OTHER",
        group: "b",
        level: "1",
        fullTimeWeeklyMinutes: 2310,
        specialDutyAllowance: "PE1_ONLY",
      },
    } as const;
    await saveDatedRemunerationProfile(db, {
      effectiveFrom: "2026-09-01",
      data: trainingData,
      expectedRevision: 0,
    });
    await saveDatedRemunerationProfile(db, {
      effectiveFrom: "2026-09-16",
      data: {
        ...trainingData,
        selection: { ...trainingData.selection, specialDutyAllowance: "NONE" },
      },
      expectedRevision: 0,
    });
    const original = await listRemunerationProfiles(db);
    const reopened = new TestDatabase(adapter.database.serialize());
    const catalog = payResolver([trainingValue as RuleTariffPackage]);
    const allowances = (profiles: typeof original) =>
      calculateMonthlyDatedAllowances(
        "2026-09",
        [],
        work,
        profiles,
        [
          {
            from: "2026-09-01",
            through: "2026-09-30",
            status: "NONE",
            origin: "confirmed",
            revision: 1,
          },
        ],
        catalog,
      ).totalCents;
    expect(allowances(original)).toBe(1151);
    try {
      const restored = await listRemunerationProfiles(reopened as unknown as SQLiteDatabase);
      expect(restored).toEqual(original);
      expect(allowances(restored)).toBe(1151);
    } finally {
      reopened.database.close();
    }
    const exported = await backup(db);
    const verified = await validateLocalBackup(exported.serialized, {
      maxDatabaseSchemaVersion: 31,
      sha256,
    });
    await saveDatedRemunerationProfile(db, {
      effectiveFrom: "2026-09-01",
      data,
      expectedRevision: 1,
    });
    await restoreLocalBackup(db, verified);
    expect(await listRemunerationProfiles(db)).toEqual(original);
    expect(allowances(await listRemunerationProfiles(db))).toBe(1151);
    const bad = await resign(exported.serialized, (root) => {
      const rows = (root.data as Record<string, unknown>).remunerationProfiles as Record<
        string,
        unknown
      >[];
      rows.find((row) => row.effective_from === "2026-09-01")!.data_json = JSON.stringify({
        ...trainingData,
        selection: { ...trainingData.selection, specialDutyAllowance: true },
      });
    });
    await expect(
      validateLocalBackup(bad, { maxDatabaseSchemaVersion: 31, sha256 }),
    ).rejects.toThrow();
    expect(await listRemunerationProfiles(db)).toEqual(original);
  });

  it("persists every v2 component across reopening a database image and a full backup restore", async () => {
    const employment = await saveProfile(db, legacyInput);
    const ownData = {
      version: 2,
      weeklyMinutes: 1155,
      selection: {
        kind: "own-configured",
        configuration: ownRemunerationFixture(),
      },
    } as const;
    await saveDatedRemunerationProfile(db, {
      effectiveFrom: "2026-10-01",
      data,
      expectedRevision: 0,
    });
    const saved = await saveDatedRemunerationProfile(db, {
      effectiveFrom: "2026-11-01",
      data: ownData,
      expectedRevision: 0,
    });
    expect(saved.data).toEqual(ownData);
    const original = await listRemunerationProfiles(db);
    const reopened = new TestDatabase(adapter.database.serialize());
    try {
      await migrateDatabase(reopened as unknown as SQLiteDatabase);
      expect(await listRemunerationProfiles(reopened as unknown as SQLiteDatabase)).toEqual(
        original,
      );
    } finally {
      reopened.database.close();
    }
    const exported = await backup(db);
    expect(exported.document.version).toBe(19);
    const verified = await validateLocalBackup(exported.serialized, {
      maxDatabaseSchemaVersion: 31,
      sha256,
    });
    await saveDatedRemunerationProfile(db, {
      effectiveFrom: "2026-11-01",
      data,
      expectedRevision: 1,
    });
    await expect(
      saveDatedRemunerationProfile(db, {
        effectiveFrom: "2026-11-01",
        data: ownData,
        expectedRevision: 1,
      }),
    ).rejects.toThrow(RemunerationProfileConflictError);
    await restoreLocalBackup(db, verified);
    expect(await listRemunerationProfiles(db)).toEqual(original);
    expect(await loadProfile(db)).toEqual(employment);
  });

  it("rejects corrupt v2 component data before backup restore or a profile write", async () => {
    await saveProfile(db, legacyInput);
    const ownData = {
      version: 2,
      weeklyMinutes: 1155,
      selection: {
        kind: "own-configured",
        configuration: ownRemunerationFixture(),
      },
    } as const;
    await saveDatedRemunerationProfile(db, {
      effectiveFrom: "2026-10-01",
      data: ownData,
      expectedRevision: 0,
    });
    const original = await listRemunerationProfiles(db);
    const exported = await backup(db);
    const malformed = {
      ...ownData,
      selection: {
        ...ownData.selection,
        configuration: {
          ...ownData.selection.configuration,
          timePremiums: { combination: "add" as const, rules: [] },
        },
      },
    };
    await expect(
      saveDatedRemunerationProfile(db, {
        effectiveFrom: "2026-10-01",
        data: malformed,
        expectedRevision: 1,
      }),
    ).rejects.toThrow();
    const badBackup = await resign(exported.serialized, (root) => {
      const rows = (root.data as Record<string, unknown>).remunerationProfiles as Record<
        string,
        unknown
      >[];
      rows.find((row) => row.effective_from === "2026-10-01")!.data_json =
        JSON.stringify(malformed);
    });
    await expect(
      validateLocalBackup(badBackup, { maxDatabaseSchemaVersion: 31, sha256 }),
    ).rejects.toThrow();
    expect(await listRemunerationProfiles(db)).toEqual(original);
  });

  it.each(["manual", "tariff", "none"])(
    "migrates an existing %s profile without inventing historical dates",
    async (mode) => {
      const original = await saveProfile(db, {
        ...legacyInput,
        manualMonthlyGrossCents: mode === "manual" ? 200000 : null,
        tariff:
          mode === "tariff"
            ? {
                payGroup: "P5",
                payLevel: 1,
                sector: "BT_K",
                tariffRegion: "OTHER",
                fullTimeWeeklyMinutes: 2310,
              }
            : null,
      });
      // Simulate the previous deployed schema, in this disposable in-memory DB only.
      adapter.database.exec(
        "DROP TABLE drk_training_month_confirmations; DROP TABLE drk_employee_month_confirmations; DROP TABLE tvoed_annex_a_premium_facts; DROP TABLE tvoed_sue_allowance_confirmations; DROP TABLE tvoed_sue_month_confirmations; DROP TABLE tvoed_annex_a_month_confirmations; DROP TABLE caritas_overtime; DROP TABLE caritas_month_facts; DROP TABLE caritas_work_days; DROP TABLE tvl_shift_work; DROP TABLE tariff_annual_claims; DROP TABLE actual_annual_payments; DROP TABLE shift_training_details; DROP TABLE training_profiles; DROP TABLE paid_absences; DROP TABLE overtime_allocations; DROP TABLE scoped_allowance_decisions; DROP TABLE remuneration_profiles; DELETE FROM schema_migrations WHERE version>=14;",
      );
      await migrateDatabase(db);
      await migrateDatabase(db);
      const history = await listRemunerationProfiles(db);
      expect(history).toEqual([
        {
          effectiveFrom: null,
          data: remunerationDataFromLegacy(original),
          revision: 1,
          createdAt: original.createdAt,
          updatedAt: original.updatedAt,
        },
      ]);
      expect(await loadProfile(db)).toEqual(original);
      expect(resolveRemunerationProfile(history, "2020-01-01").status).toBe(
        "unknown-effective-date",
      );
    },
  );

  it("keeps empty installations empty and requires an employment profile before writing", async () => {
    expect(await listRemunerationProfiles(db)).toEqual([]);
    await expect(
      saveDatedRemunerationProfile(db, { effectiveFrom: "2026-10-01", data, expectedRevision: 0 }),
    ).rejects.toThrow("Arbeitsprofil");
  });

  it("retries a failed data migration without a partial baseline or completion marker", async () => {
    await saveProfile(db, legacyInput);
    adapter.database.exec(
      "DROP TABLE drk_training_month_confirmations; DROP TABLE drk_employee_month_confirmations; DROP TABLE tvoed_annex_a_premium_facts; DROP TABLE tvoed_sue_allowance_confirmations; DROP TABLE tvoed_sue_month_confirmations; DROP TABLE tvoed_annex_a_month_confirmations; DROP TABLE caritas_overtime; DROP TABLE caritas_month_facts; DROP TABLE caritas_work_days; DROP TABLE tvl_shift_work; DROP TABLE tariff_annual_claims; DROP TABLE actual_annual_payments; DROP TABLE shift_training_details; DROP TABLE training_profiles; DROP TABLE paid_absences; DROP TABLE overtime_allocations; DROP TABLE scoped_allowance_decisions; DROP TABLE remuneration_profiles; DELETE FROM schema_migrations WHERE version>=14;",
    );
    adapter.failSqlIncludes = "INSERT INTO remuneration_profiles";
    await expect(migrateDatabase(db)).rejects.toThrow("injected failure");
    expect(await listRemunerationProfiles(db)).toEqual([]);
    expect(
      await db.getFirstAsync("SELECT version FROM schema_migrations WHERE version=14"),
    ).toEqual({ version: 14 });
    expect(
      await db.getFirstAsync("SELECT version FROM schema_migrations WHERE version=15"),
    ).toBeNull();
    adapter.failSqlIncludes = null;
    await migrateDatabase(db);
    expect(await listRemunerationProfiles(db)).toHaveLength(1);
  });

  it("does not overwrite a future-format profile with an old editor", async () => {
    await saveProfile(db, legacyInput);
    await saveDatedRemunerationProfile(db, {
      effectiveFrom: "2026-10-01",
      data,
      expectedRevision: 0,
    });
    await db.runAsync(
      "UPDATE remuneration_profiles SET data_json=? WHERE effective_from=?",
      JSON.stringify({ ...data, version: 99 }),
      "2026-10-01",
    );
    await expect(
      saveDatedRemunerationProfile(db, { effectiveFrom: "2026-10-01", data, expectedRevision: 1 }),
    ).rejects.toThrow("noch nicht unterstützt");
    expect(
      await db.getFirstAsync(
        "SELECT revision FROM remuneration_profiles WHERE effective_from='2026-10-01'",
      ),
    ).toEqual({ revision: 1 });
  });

  it("preserves old dates, detects concurrent corrections, and does not change the current legacy calculation", async () => {
    const original = await saveProfile(db, legacyInput);
    const first = await saveDatedRemunerationProfile(db, {
      effectiveFrom: "2026-10-01",
      data,
      expectedRevision: 0,
    });
    await saveDatedRemunerationProfile(db, {
      effectiveFrom: "2027-01-01",
      data: { ...data, weeklyMinutes: 2310 },
      expectedRevision: 0,
    });
    const results = await Promise.allSettled([
      saveDatedRemunerationProfile(db, { effectiveFrom: "2026-10-01", data, expectedRevision: 1 }),
      saveDatedRemunerationProfile(db, { effectiveFrom: "2026-10-01", data, expectedRevision: 1 }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: expect.any(RemunerationProfileConflictError),
    });
    const history = await listRemunerationProfiles(db);
    expect(history.map((item) => item.revision)).toEqual([1, 2, 1]);
    expect(history[1]?.createdAt).toEqual(first.createdAt);
    expect(await loadProfile(db)).toEqual(original);
  });

  it("rolls back baseline and new date together on failure", async () => {
    await saveProfile(db, legacyInput);
    adapter.failSqlIncludes = "VALUES(?,?,?,1,?,?)";
    await expect(
      saveDatedRemunerationProfile(db, { effectiveFrom: "2026-10-01", data, expectedRevision: 0 }),
    ).rejects.toThrow("injected failure");
    expect(await listRemunerationProfiles(db)).toEqual([]);
  });

  it("round-trips all dated profiles including unknown tariff identities without fallback", async () => {
    await saveProfile(db, legacyInput);
    await saveDatedRemunerationProfile(db, {
      effectiveFrom: "2026-10-01",
      data,
      expectedRevision: 0,
    });
    await saveDatedRemunerationProfile(db, {
      effectiveFrom: "2027-01-01",
      data: {
        version: 1,
        weeklyMinutes: 2310,
        selection: {
          kind: "tariff",
          packageId: "not-installed",
          variant: "FUTURE",
          region: "NORD",
          group: "KR5",
          level: "1",
          fullTimeWeeklyMinutes: 2310,
        },
      },
      expectedRevision: 0,
    });
    const original = await listRemunerationProfiles(db);
    const exported = await backup(db);
    expect(exported.document.version).toBe(19);
    const validated = await validateLocalBackup(exported.serialized, {
      maxDatabaseSchemaVersion: 31,
      sha256,
    });
    await saveDatedRemunerationProfile(db, {
      effectiveFrom: "2030-01-01",
      data,
      expectedRevision: 0,
    });
    await restoreLocalBackup(db, validated);
    expect(await listRemunerationProfiles(db)).toEqual(original);
    await migrateDatabase(db);
    expect(await listRemunerationProfiles(db)).toEqual(original);
  });

  it("validates original v1 checksum before importing an undated baseline and removes target history", async () => {
    await saveProfile(db, legacyInput);
    const exported = await backup(db);
    const old = await resign(exported.serialized, (root) => {
      root.version = 1;
      root.databaseSchemaVersion = 13;
      delete (root.data as Record<string, unknown>).remunerationProfiles;
      delete (root.data as Record<string, unknown>).allowanceDecisions;
      delete (root.data as Record<string, unknown>).overtimeAllocations;
      delete (root.data as Record<string, unknown>).paidAbsences;
      delete (root.data as Record<string, unknown>).trainingProfiles;
      delete (root.data as Record<string, unknown>).shiftTrainingDetails;
      delete (root.data as Record<string, unknown>).actualAnnualPayments;
      delete (root.data as Record<string, unknown>).tariffAnnualClaims;
      delete (root.data as Record<string, unknown>).tvlShiftWork;
      delete (root.data as Record<string, unknown>).caritasWorkDays;
      delete (root.data as Record<string, unknown>).caritasMonthFacts;
      delete (root.data as Record<string, unknown>).caritasOvertime;
      delete (root.data as Record<string, unknown>).tvoedAnnexAMonthConfirmations;
      delete (root.data as Record<string, unknown>).tvoedSueMonthConfirmations;
      delete (root.data as Record<string, unknown>).tvoedSueAllowanceConfirmations;
    });
    const validated = await validateLocalBackup(old, { maxDatabaseSchemaVersion: 31, sha256 });
    await saveDatedRemunerationProfile(db, {
      effectiveFrom: "2027-01-01",
      data,
      expectedRevision: 0,
    });
    await restoreLocalBackup(db, validated);
    expect(await listRemunerationProfiles(db)).toMatchObject([
      {
        effectiveFrom: null,
        data: { selection: { kind: "own-monthly", monthlyGrossCents: 200000 } },
      },
    ]);
    await expect(
      validateLocalBackup(old.replace('"version":1', '"version":2'), {
        maxDatabaseSchemaVersion: 31,
        sha256,
      }),
    ).rejects.toThrow();
  });

  it.each(["missing", "unknown-version", "duplicate", "invalid-date", "orphan", "extra-field"])(
    "rejects %s history even with a matching checksum",
    async (mutation) => {
      await saveProfile(db, legacyInput);
      await saveDatedRemunerationProfile(db, {
        effectiveFrom: "2026-10-01",
        data,
        expectedRevision: 0,
      });
      const exported = await backup(db);
      const bad = await resign(exported.serialized, (root) => {
        const body = root.data as Record<string, unknown>;
        const rows = body.remunerationProfiles as Record<string, unknown>[];
        if (mutation === "missing") delete body.remunerationProfiles;
        if (mutation === "orphan") body.profile = null;
        if (mutation === "duplicate") rows.push({ ...rows[0] });
        if (mutation === "invalid-date") {
          rows[1]!.effective_from = "2026-02-30";
          rows[1]!.id = "from:2026-02-30";
        }
        if (mutation === "extra-field") rows[0]!.hidden = 1;
        if (mutation === "unknown-version")
          rows[0]!.data_json = JSON.stringify({ ...data, version: 99 });
      });
      await expect(
        validateLocalBackup(bad, { maxDatabaseSchemaVersion: 31, sha256 }),
      ).rejects.toThrow();
    },
  );

  it("rolls back an entire restore if history insertion fails", async () => {
    await saveProfile(db, legacyInput);
    await saveDatedRemunerationProfile(db, {
      effectiveFrom: "2026-10-01",
      data,
      expectedRevision: 0,
    });
    const exported = await backup(db);
    const validated = await validateLocalBackup(exported.serialized, {
      maxDatabaseSchemaVersion: 31,
      sha256,
    });
    await saveDatedRemunerationProfile(db, {
      effectiveFrom: "2027-01-01",
      data,
      expectedRevision: 0,
    });
    const before = await loadLocalBackupSnapshot(db);
    adapter.failSqlIncludes = "INSERT INTO remuneration_profiles";
    await expect(restoreLocalBackup(db, validated)).rejects.toThrow("injected failure");
    expect(await loadLocalBackupSnapshot(db)).toEqual(before);
  });
});
