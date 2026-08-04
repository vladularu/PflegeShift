import type { SQLiteDatabase } from "expo-sqlite";

export async function listTestBackupMonths(db: SQLiteDatabase): Promise<readonly string[]> {
  const rows = await db.getAllAsync<{ month: string }>(
    "SELECT month FROM dev_test_backups ORDER BY month",
  );
  return Object.freeze(rows.map((row) => row.month));
}
