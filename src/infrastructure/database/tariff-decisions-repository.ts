import type { SQLiteDatabase } from "expo-sqlite";

import { ConcurrencyError } from "@/domain/errors";
import type { MonthlyTariffDecision, SaveMonthlyTariffDecisionInput } from "@/domain/types";
import {
  requireAllowanceStatus,
  requireLocalMonth,
  validateMonthlyTariffDecision,
} from "@/domain/validation";

interface TariffDecisionRow {
  month: string;
  allowance_status: string;
  revision: number;
  confirmed_at: string;
  updated_at: string;
}

function mapTariffDecision(row: TariffDecisionRow): MonthlyTariffDecision {
  return validateMonthlyTariffDecision({
    month: row.month,
    allowanceStatus: row.allowance_status,
    revision: row.revision,
    confirmedAt: row.confirmed_at,
    updatedAt: row.updated_at,
  });
}

export async function listMonthlyTariffDecisions(
  db: SQLiteDatabase,
): Promise<readonly MonthlyTariffDecision[]> {
  const rows = await db.getAllAsync<TariffDecisionRow>(
    `SELECT month,allowance_status,revision,confirmed_at,updated_at
     FROM monthly_tariff_decisions ORDER BY month`,
  );
  return Object.freeze(rows.map(mapTariffDecision));
}

export async function saveMonthlyTariffDecision(
  db: SQLiteDatabase,
  input: SaveMonthlyTariffDecisionInput,
): Promise<MonthlyTariffDecision> {
  const month = requireLocalMonth(input.month);
  const allowanceStatus = requireAllowanceStatus(input.allowanceStatus);
  const now = new Date().toISOString();
  const existing = await db.getFirstAsync<TariffDecisionRow>(
    `SELECT month,allowance_status,revision,confirmed_at,updated_at
     FROM monthly_tariff_decisions WHERE month=?`,
    month,
  );
  if (existing === null) {
    await db.runAsync(
      `INSERT INTO monthly_tariff_decisions(
        month,allowance_status,revision,confirmed_at,updated_at
      ) VALUES(?,?,1,?,?)`,
      month,
      allowanceStatus,
      now,
      now,
    );
  } else {
    const result = await db.runAsync(
      `UPDATE monthly_tariff_decisions SET allowance_status=?,
       revision=revision+1,confirmed_at=?,updated_at=?
       WHERE month=? AND revision=?`,
      allowanceStatus,
      now,
      now,
      month,
      input.expectedRevision ?? existing.revision,
    );
    if (result.changes === 0) {
      throw new ConcurrencyError();
    }
  }
  const saved = await db.getFirstAsync<TariffDecisionRow>(
    `SELECT month,allowance_status,revision,confirmed_at,updated_at
     FROM monthly_tariff_decisions WHERE month=?`,
    month,
  );
  if (saved === null) throw new Error("Tarifentscheidung konnte nicht gespeichert werden.");
  return mapTariffDecision(saved);
}
