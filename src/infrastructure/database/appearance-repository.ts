import type { SQLiteDatabase } from "expo-sqlite";
import {
  APPEARANCE_KEYS,
  DEFAULT_APPEARANCE,
  isAppearanceMode,
  isThemeId,
  type AppearancePreferences,
} from "@/domain/appearance";
import { withImmediateTransaction } from "./transaction";
export async function loadAppearancePreferences(
  db: SQLiteDatabase,
): Promise<AppearancePreferences> {
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    "SELECT key,value FROM app_preferences WHERE key IN (?,?)",
    APPEARANCE_KEYS.themeId,
    APPEARANCE_KEYS.mode,
  );
  const values = new Map(rows.map((row) => [row.key, row.value]));
  const themeId = values.get(APPEARANCE_KEYS.themeId);
  const mode = values.get(APPEARANCE_KEYS.mode);
  return Object.freeze({
    themeId: isThemeId(themeId) ? themeId : DEFAULT_APPEARANCE.themeId,
    mode: isAppearanceMode(mode) ? mode : DEFAULT_APPEARANCE.mode,
  });
}
export async function saveAppearancePreferences(
  db: SQLiteDatabase,
  input: AppearancePreferences,
): Promise<void> {
  if (!isThemeId(input.themeId) || !isAppearanceMode(input.mode))
    throw new Error("Ungültige Darstellung.");
  await withImmediateTransaction(db, async (transaction) => {
    const now = new Date().toISOString();
    for (const [key, value] of [
      [APPEARANCE_KEYS.themeId, input.themeId],
      [APPEARANCE_KEYS.mode, input.mode],
    ]) {
      await transaction.runAsync(
        "INSERT INTO app_preferences(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
        key,
        value,
        now,
      );
    }
  });
}
