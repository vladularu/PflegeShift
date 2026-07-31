import type { SQLiteDatabase, SQLiteStatement } from "expo-sqlite";

import type {
  TestBackupSummary,
  TestRunPreview,
  TestRunRequest,
  TestRunResult,
  UserProfile,
} from "@/domain/types";
import { generateTestPlan } from "@/engine/test-data-generator";

interface RawShiftRow {
  id: string; date: string; template_id: string | null; title: string; type: string;
  start_time: string | null; end_time: string | null; break_minutes: number; color: string;
  symbol: string; note: string | null; overtime_minutes: number; holiday_premium_mode: string;
  revision: number; created_at: string; updated_at: string; deleted_at: string | null;
  test_run_id: string | null;
}
interface RawAppointmentRow {
  id: string; date: string; title: string; all_day: number; start_time: string | null;
  end_time: string | null; color: string; note: string | null; revision: number;
  created_at: string; updated_at: string; deleted_at: string | null; test_run_id: string | null;
}
interface RawDecisionRow {
  month: string; allowance_status: string; revision: number; confirmed_at: string; updated_at: string;
}
interface BackupPayload {
  shifts: RawShiftRow[];
  appointments: RawAppointmentRow[];
  decision: RawDecisionRow | null;
}
interface BackupRow {
  month: string;
  payload: string;
  run_id: string;
  created_at: string;
}
interface BackupSummaryRow {
  month: string;
  run_id: string;
  created_at: string;
  current_entry_count: number;
}

function assertMonth(month: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Ungültiger Startmonat.");
}

async function transaction(db: SQLiteDatabase, task: (tx: SQLiteDatabase) => Promise<void>) {
  if (process.env.EXPO_OS === "web") await db.withTransactionAsync(() => task(db));
  else await db.withExclusiveTransactionAsync(task);
}

export async function isDeveloperModeEnabled(db: SQLiteDatabase): Promise<boolean> {
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_preferences WHERE key='developer_mode'",
  );
  return row?.value === "1";
}

export async function setDeveloperMode(db: SQLiteDatabase, enabled: boolean): Promise<void> {
  await db.runAsync(
    `INSERT INTO app_preferences(key,value,updated_at) VALUES('developer_mode',?,?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`,
    enabled ? "1" : "0",
    new Date().toISOString(),
  );
}

async function snapshotMonth(db: SQLiteDatabase, month: string): Promise<BackupPayload> {
  return {
    shifts: await db.getAllAsync<RawShiftRow>(
      "SELECT * FROM shift_entries WHERE substr(date,1,7)=? ORDER BY id",
      month,
    ),
    appointments: await db.getAllAsync<RawAppointmentRow>(
      "SELECT * FROM appointments WHERE substr(date,1,7)=? ORDER BY id",
      month,
    ),
    decision: await db.getFirstAsync<RawDecisionRow>(
      "SELECT * FROM monthly_tariff_decisions WHERE month=?",
      month,
    ),
  };
}

export async function previewTestRun(
  db: SQLiteDatabase,
  request: TestRunRequest,
  profile: UserProfile,
): Promise<TestRunPreview> {
  assertMonth(request.startMonth);
  const plan = generateTestPlan(request, profile.federalState);
  const placeholders = plan.months.map(() => "?").join(",");
  const existing = await db.getFirstAsync<{ count: number }>(
    `SELECT (
      (SELECT COUNT(*) FROM shift_entries WHERE deleted_at IS NULL AND substr(date,1,7) IN (${placeholders}))
      + (SELECT COUNT(*) FROM appointments WHERE deleted_at IS NULL AND substr(date,1,7) IN (${placeholders}))
    ) count`,
    ...plan.months,
    ...plan.months,
  );
  const backups = await db.getAllAsync<{ month: string }>(
    `SELECT month FROM dev_test_backups WHERE month IN (${placeholders}) ORDER BY month`,
    ...plan.months,
  );
  return Object.freeze({
    request,
    months: plan.months,
    existingEntryCount: existing?.count ?? 0,
    plannedShiftCount: plan.shifts.length,
    plannedAppointmentCount: plan.appointments.length,
    plannedDecisionCount: plan.decisions.length,
    backedUpMonths: Object.freeze(backups.map((item) => item.month)),
    warnings: plan.warnings,
  });
}

async function finalize(statement: SQLiteStatement | null): Promise<void> {
  if (statement) await statement.finalizeAsync();
}

export async function generateTestRun(
  db: SQLiteDatabase,
  request: TestRunRequest,
  profile: UserProfile,
): Promise<TestRunResult> {
  assertMonth(request.startMonth);
  const plan = generateTestPlan(request, profile.federalState);
  const runId = `test-${Date.now().toString(36)}-${request.scenario.toLowerCase()}`;
  const now = new Date().toISOString();

  await transaction(db, async (tx) => {
    for (const month of plan.months) {
      const existingBackup = await tx.getFirstAsync<{ month: string }>(
        "SELECT month FROM dev_test_backups WHERE month=?",
        month,
      );
      if (!existingBackup) {
        const payload = await snapshotMonth(tx, month);
        await tx.runAsync(
          "INSERT INTO dev_test_backups(month,payload,run_id,created_at) VALUES(?,?,?,?)",
          month, JSON.stringify(payload), runId, now,
        );
      }
      await tx.runAsync("DELETE FROM shift_entries WHERE substr(date,1,7)=?", month);
      await tx.runAsync("DELETE FROM appointments WHERE substr(date,1,7)=?", month);
      await tx.runAsync("DELETE FROM monthly_tariff_decisions WHERE month=?", month);
    }

    let shiftStatement: SQLiteStatement | null = null;
    let appointmentStatement: SQLiteStatement | null = null;
    try {
      shiftStatement = await tx.prepareAsync(
        `INSERT INTO shift_entries(
          id,date,template_id,title,type,start_time,end_time,break_minutes,color,symbol,note,
          overtime_minutes,holiday_premium_mode,revision,created_at,updated_at,deleted_at,test_run_id
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,NULL,?)`,
      );
      appointmentStatement = await tx.prepareAsync(
        `INSERT INTO appointments(
          id,date,title,all_day,start_time,end_time,color,note,revision,created_at,updated_at,deleted_at,test_run_id
        ) VALUES(?,?,?,?,?,?,?,?,1,?,?,NULL,?)`,
      );
      for (const [index, item] of plan.shifts.entries()) {
        await shiftStatement.executeAsync([
          `${runId}-shift-${String(index).padStart(4, "0")}`, item.date, item.templateId ?? null,
          item.title, item.type, item.startTime ?? null, item.endTime ?? null, item.breakMinutes ?? 0,
          item.color, item.symbol, item.note ?? "Testlabor", item.overtimeMinutes ?? 0,
          item.holidayPremiumMode ?? "WITH_TIME_OFF", now, now, runId,
        ]);
      }
      for (const [index, item] of plan.appointments.entries()) {
        await appointmentStatement.executeAsync([
          `${runId}-appointment-${String(index).padStart(4, "0")}`, item.date, item.title,
          item.allDay ? 1 : 0, item.startTime ?? null, item.endTime ?? null, item.color,
          item.note ?? "Testlabor", now, now, runId,
        ]);
      }
    } finally {
      await finalize(shiftStatement);
      await finalize(appointmentStatement);
    }
    for (const decision of plan.decisions) {
      await tx.runAsync(
        `INSERT INTO monthly_tariff_decisions(month,allowance_status,revision,confirmed_at,updated_at)
         VALUES(?,?,1,?,?)`,
        decision.month, decision.allowanceStatus, now, now,
      );
    }
  });

  return Object.freeze({
    runId,
    months: plan.months,
    shiftCount: plan.shifts.length,
    appointmentCount: plan.appointments.length,
  });
}

export async function listTestBackupMonths(
  db: SQLiteDatabase,
): Promise<readonly string[]> {
  const rows = await db.getAllAsync<{ month: string }>(
    "SELECT month FROM dev_test_backups ORDER BY month",
  );
  return Object.freeze(rows.map((row) => row.month));
}

export async function listTestBackups(db: SQLiteDatabase): Promise<readonly TestBackupSummary[]> {
  const rows = await db.getAllAsync<BackupSummaryRow>(
    `WITH entry_counts AS (
       SELECT substr(date,1,7) month, COUNT(*) count
       FROM shift_entries
       WHERE deleted_at IS NULL
       GROUP BY substr(date,1,7)
       UNION ALL
       SELECT substr(date,1,7) month, COUNT(*) count
       FROM appointments
       WHERE deleted_at IS NULL
       GROUP BY substr(date,1,7)
     ),
     monthly_counts AS (
       SELECT month, SUM(count) current_entry_count
       FROM entry_counts
       GROUP BY month
     )
     SELECT backup.month,backup.run_id,backup.created_at,
       COALESCE(monthly.current_entry_count,0) current_entry_count
     FROM dev_test_backups backup
     LEFT JOIN monthly_counts monthly ON monthly.month=backup.month
     ORDER BY backup.month`,
  );
  return Object.freeze(rows.map((row) =>
    Object.freeze({
      month: row.month,
      runId: row.run_id,
      createdAt: row.created_at,
      currentEntryCount: row.current_entry_count,
    }),
  ));
}

const SHIFT_COLUMNS = "id,date,template_id,title,type,start_time,end_time,break_minutes,color,symbol,note,overtime_minutes,holiday_premium_mode,revision,created_at,updated_at,deleted_at,test_run_id";
const APPOINTMENT_COLUMNS = "id,date,title,all_day,start_time,end_time,color,note,revision,created_at,updated_at,deleted_at,test_run_id";

export async function restoreTestBackup(db: SQLiteDatabase, months: readonly string[]): Promise<void> {
  await transaction(db, async (tx) => {
    for (const month of months) {
      assertMonth(month);
      const backup = await tx.getFirstAsync<BackupRow>(
        "SELECT month,payload,run_id,created_at FROM dev_test_backups WHERE month=?",
        month,
      );
      if (!backup) throw new Error(`Für ${month} ist kein Backup vorhanden.`);
      const payload = JSON.parse(backup.payload) as BackupPayload;
      await tx.runAsync("DELETE FROM shift_entries WHERE substr(date,1,7)=?", month);
      await tx.runAsync("DELETE FROM appointments WHERE substr(date,1,7)=?", month);
      await tx.runAsync("DELETE FROM monthly_tariff_decisions WHERE month=?", month);
      for (const row of payload.shifts) {
        await tx.runAsync(
          `INSERT INTO shift_entries(${SHIFT_COLUMNS}) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          row.id,row.date,row.template_id,row.title,row.type,row.start_time,row.end_time,row.break_minutes,
          row.color,row.symbol,row.note,row.overtime_minutes,row.holiday_premium_mode,row.revision,
          row.created_at,row.updated_at,row.deleted_at,row.test_run_id,
        );
      }
      for (const row of payload.appointments) {
        await tx.runAsync(
          `INSERT INTO appointments(${APPOINTMENT_COLUMNS}) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          row.id,row.date,row.title,row.all_day,row.start_time,row.end_time,row.color,row.note,
          row.revision,row.created_at,row.updated_at,row.deleted_at,row.test_run_id,
        );
      }
      if (payload.decision) {
        const row = payload.decision;
        await tx.runAsync(
          `INSERT INTO monthly_tariff_decisions(month,allowance_status,revision,confirmed_at,updated_at)
           VALUES(?,?,?,?,?)`,
          row.month,row.allowance_status,row.revision,row.confirmed_at,row.updated_at,
        );
      }
      await tx.runAsync("DELETE FROM dev_test_backups WHERE month=?", month);
    }
  });
}

export async function acceptTestRun(db: SQLiteDatabase, months: readonly string[]): Promise<void> {
  await transaction(db, async (tx) => {
    for (const month of months) {
      assertMonth(month);
      await tx.runAsync("UPDATE shift_entries SET test_run_id=NULL WHERE substr(date,1,7)=?", month);
      await tx.runAsync("UPDATE appointments SET test_run_id=NULL WHERE substr(date,1,7)=?", month);
      await tx.runAsync("DELETE FROM dev_test_backups WHERE month=?", month);
    }
  });
}
