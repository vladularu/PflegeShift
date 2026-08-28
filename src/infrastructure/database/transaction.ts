import type { SQLiteDatabase } from "expo-sqlite";

const transactionTails = new WeakMap<SQLiteDatabase, Promise<void>>();

/**
 * Runs an atomic write on the connection that has already been unlocked with
 * SQLCipher's PRAGMA key. Expo's withExclusiveTransactionAsync creates a new
 * native connection, which does not inherit that connection-local key. Writes
 * are serialized per connection so concurrent callers cannot nest BEGIN calls.
 */
export async function withImmediateTransaction<T>(
  db: SQLiteDatabase,
  task: (transaction: SQLiteDatabase) => Promise<T>,
): Promise<T> {
  const previous = transactionTails.get(db) ?? Promise.resolve();
  let releaseTurn = () => {};
  const currentTurn = new Promise<void>((resolve) => {
    releaseTurn = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => currentTurn);
  transactionTails.set(db, tail);

  await previous.catch(() => undefined);
  try {
    await db.execAsync("BEGIN IMMEDIATE;");
    try {
      const result = await task(db);
      await db.execAsync("COMMIT;");
      return result;
    } catch (error) {
      try {
        await db.execAsync("ROLLBACK;");
      } catch {
        // Preserve the operation error that caused the rollback.
      }
      throw error;
    }
  } finally {
    releaseTurn();
    if (transactionTails.get(db) === tail) transactionTails.delete(db);
  }
}
