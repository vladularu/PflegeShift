import type { SQLiteDatabase } from "expo-sqlite";

/**
 * Runs an atomic write on the connection that has already been unlocked with
 * SQLCipher's PRAGMA key. Expo's withExclusiveTransactionAsync creates a new
 * native connection, which does not inherit that connection-local key.
 */
export async function withImmediateTransaction(
  db: SQLiteDatabase,
  task: (transaction: SQLiteDatabase) => Promise<void>,
): Promise<void> {
  await db.execAsync("BEGIN IMMEDIATE;");
  try {
    await task(db);
    await db.execAsync("COMMIT;");
  } catch (error) {
    try {
      await db.execAsync("ROLLBACK;");
    } catch {
      // Preserve the operation error that caused the rollback.
    }
    throw error;
  }
}
