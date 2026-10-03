import { LATEST_DATABASE_SCHEMA_VERSION } from "./migrations";
import { createHash } from "node:crypto";
import canonicalize from "canonicalize";
import type { SaveTvlShiftWorkInput } from "@/domain/saved-tvl-shift-work";
import { shift as shiftFixture } from "@/engine/remuneration-test-fixtures";
import { TariffAnnualTestDatabase } from "./tariff-annual-test-database";
import { saveShift } from "./calendar-entry-repository";
import { saveDatedRemunerationProfile } from "./remuneration-profile-repository";
import { createLocalBackupDocument, loadLocalBackupSnapshot } from "./local-backup";
import { validateLocalBackup } from "./local-backup-validation";

export async function setupTvlShiftWork() {
  const adapter = new TariffAnnualTestDatabase();
  await adapter.setup();
  const db = adapter.db;
  const profile = await saveDatedRemunerationProfile(db, {
    effectiveFrom: "2026-09-01",
    expectedRevision: 0,
    data: {
      version: 4,
      weeklyMinutes: 2310,
      selection: {
        kind: "tariff",
        packageId: "tvl-kr-tdl",
        variant: "SECTION_43",
        region: "WEST_38_5",
        group: "KR5",
        level: "1",
        fullTimeWeeklyMinutes: 2310,
        tvlEmploymentCategory: "SALARIED_SECTION_38_5_1",
      },
    },
  });
  const shift = await saveShift(db, {
    ...shiftFixture({ date: "2026-09-19", startTime: "13:00", endTime: "21:00" }),
    id: undefined,
  });
  const input: SaveTvlShiftWorkInput = {
    shiftId: shift.id,
    expectedShiftRevision: shift.revision,
    expectedShiftUpdatedAt: shift.updatedAt,
    timeZone: "Europe/Berlin",
    profileEffectiveFrom: "2026-09-01",
    expectedProfileRevision: profile.revision,
    expectedRevision: 0,
    shiftWork: true,
  };
  return { adapter, db, shift, profile, input };
}
export type TvlShiftWorkFixture = Awaited<ReturnType<typeof setupTvlShiftWork>>;
export const tvlSha256 = async (value: string) => createHash("sha256").update(value).digest("hex");
export const validateTvlBackup = (serialized: string) =>
  validateLocalBackup(serialized, {
    maxDatabaseSchemaVersion: LATEST_DATABASE_SCHEMA_VERSION,
    sha256: tvlSha256,
  });
export const exportTvlBackup = async (fixture: TvlShiftWorkFixture) =>
  createLocalBackupDocument(await loadLocalBackupSnapshot(fixture.db), {
    appVersion: "0.1.0",
    createdAt: new Date("2026-09-22T00:00:00Z"),
    sha256: tvlSha256,
  });
interface MutableBackup {
  version: number;
  databaseSchemaVersion: number;
  data: Record<string, unknown>;
  integrity: { value: string };
}
export async function resignTvlBackup(serialized: string, change: (value: MutableBackup) => void) {
  const root = JSON.parse(serialized) as MutableBackup;
  change(root);
  if (root.version < 17) delete root.data.tvoedAnnexAPremiumFacts;
  if (root.version < 18) delete root.data.drkEmployeeMonthConfirmations;
  if (root.version < 19) delete root.data.drkTrainingMonthConfirmations;
  const { integrity: _, ...unsigned } = root;
  root.integrity.value = await tvlSha256(canonicalize(unsigned)!);
  return JSON.stringify(root);
}
