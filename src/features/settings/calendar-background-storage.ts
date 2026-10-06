import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import type { SQLiteDatabase } from "expo-sqlite";
import { withImmediateTransaction } from "@/infrastructure/database/transaction";

import {
  DEFAULT_CALENDAR_IMAGE_STRENGTH,
  parseCalendarImageStrength,
  type CalendarImageStrength,
} from "@/theme/calendar-image";

export const CALENDAR_BACKGROUND_STRENGTH_KEY = "calendar_background_strength";
export const CALENDAR_BACKGROUND_KEY = "calendar_background_image";
export const CALENDAR_BACKGROUND_REMOVED_KEY = "calendar_background_removed_image";
const validName = /^calendar-[a-z0-9-]+\.jpg$/;
const directory = () => new Directory(Paths.document, "calendar-backgrounds");

async function loadImageReference(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_preferences WHERE key=?",
    key,
  );
  if (!row || !validName.test(row.value)) return null;
  const file = new File(directory(), row.value);
  return file.exists ? file.uri : null;
}

export const loadCalendarBackground = (db: SQLiteDatabase) =>
  loadImageReference(db, CALENDAR_BACKGROUND_KEY);
export const loadRemovedCalendarBackground = (db: SQLiteDatabase) =>
  loadImageReference(db, CALENDAR_BACKGROUND_REMOVED_KEY);

export async function importCalendarBackground(asset: {
  uri: string;
  width: number;
  height: number;
}): Promise<string> {
  const source = new File(asset.uri);
  if (!source.exists || source.size > 20 * 1024 * 1024)
    throw new Error("Bitte wähle ein Bild mit höchstens 20 MB.");
  if (
    !Number.isFinite(asset.width) ||
    !Number.isFinite(asset.height) ||
    asset.width <= 0 ||
    asset.height <= 0
  )
    throw new Error("Dieses Bild kann nicht verwendet werden.");
  const context = ImageManipulator.manipulate(asset.uri);
  try {
    if (Math.max(asset.width, asset.height) > 1600) {
      context.resize(asset.width >= asset.height ? { width: 1600 } : { height: 1600 });
    }
    const image = await context.renderAsync();
    try {
      const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
      const temporary = new File(result.uri);
      try {
        const folder = directory();
        folder.create({ intermediates: true, idempotent: true });
        const destination = new File(
          folder,
          `calendar-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.jpg`,
        );
        await temporary.copy(destination);
        return destination.uri;
      } finally {
        if (temporary.exists) temporary.delete();
      }
    } finally {
      image.release();
    }
  } finally {
    context.release();
  }
}

async function saveImageReference(db: SQLiteDatabase, key: string, uri: string | null) {
  if (uri === null) {
    await db.runAsync("DELETE FROM app_preferences WHERE key=?", key);
    return;
  }
  const file = new File(uri);
  if (file.parentDirectory.uri !== directory().uri || !validName.test(file.name) || !file.exists)
    throw new Error("Ungültiges Kalenderbild.");
  // Relative name survives changes to the iOS sandbox path after app updates.
  await db.runAsync(
    "INSERT INTO app_preferences(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
    key,
    file.name,
    new Date().toISOString(),
  );
}

export const saveCalendarBackground = (db: SQLiteDatabase, uri: string | null) =>
  saveImageReference(db, CALENDAR_BACKGROUND_KEY, uri);

/** Keep one removable photo across navigation and app restarts; commit both pointers together. */
export async function saveCalendarBackgroundChange(
  db: SQLiteDatabase,
  uri: string | null,
  removedUri: string | null,
  resetStrength = false,
) {
  await withImmediateTransaction(db, async (transaction) => {
    await saveImageReference(transaction, CALENDAR_BACKGROUND_KEY, uri);
    await saveImageReference(transaction, CALENDAR_BACKGROUND_REMOVED_KEY, removedUri);
    if (resetStrength)
      await saveCalendarBackgroundStrength(transaction, DEFAULT_CALENDAR_IMAGE_STRENGTH);
  });
}

export function deleteCalendarBackground(uri: string) {
  const file = new File(uri);
  if (file.parentDirectory.uri !== directory().uri || !validName.test(file.name)) return;
  if (file.exists) file.delete();
}

export async function loadCalendarBackgroundStrength(
  db: SQLiteDatabase,
): Promise<CalendarImageStrength> {
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_preferences WHERE key=?",
    CALENDAR_BACKGROUND_STRENGTH_KEY,
  );
  return parseCalendarImageStrength(row?.value);
}
export async function saveCalendarBackgroundStrength(
  db: SQLiteDatabase,
  strength: CalendarImageStrength,
) {
  if (parseCalendarImageStrength(strength) !== strength) throw new Error("Ungültige Bildstärke.");
  await db.runAsync(
    "INSERT INTO app_preferences(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
    CALENDAR_BACKGROUND_STRENGTH_KEY,
    strength,
    new Date().toISOString(),
  );
}
