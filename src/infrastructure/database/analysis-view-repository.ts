import type { SQLiteDatabase } from "expo-sqlite";
import {
  ANALYSIS_VIEW_KEY,
  DEFAULT_ANALYSIS_VIEW,
  parseAnalysisView,
  type AnalysisViewPreferences,
} from "@/domain/analysis-view";
import { withImmediateTransaction } from "./transaction";

export async function loadAnalysisView(db: SQLiteDatabase): Promise<AnalysisViewPreferences> {
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_preferences WHERE key = ?",
    ANALYSIS_VIEW_KEY,
  );
  return row === null ? DEFAULT_ANALYSIS_VIEW : parseAnalysisView(row.value);
}
export async function saveAnalysisView(
  db: SQLiteDatabase,
  preferences: AnalysisViewPreferences,
): Promise<void> {
  const value = JSON.stringify(parseAnalysisView(JSON.stringify(preferences)));
  await withImmediateTransaction(db, async (transaction) => {
    await transaction.runAsync(
      "INSERT INTO app_preferences(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
      ANALYSIS_VIEW_KEY,
      value,
      new Date().toISOString(),
    );
  });
}
