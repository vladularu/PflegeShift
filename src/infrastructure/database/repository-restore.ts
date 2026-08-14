import type { SQLiteDatabase } from "expo-sqlite";

import type { CalendarEntry, ShiftTemplate } from "@/domain/types";
import { ConcurrencyError } from "@/domain/errors";

async function requireRestored(changes: number): Promise<void> {
  if (changes !== 1) throw new ConcurrencyError();
}

export async function restoreTemplate(
  db: SQLiteDatabase,
  template: ShiftTemplate,
): Promise<ShiftTemplate> {
  const now = new Date().toISOString();
  const result = await db.runAsync(
    `UPDATE shift_templates SET revision=revision+1,updated_at=?,deleted_at=NULL
     WHERE id=? AND revision=? AND deleted_at IS NOT NULL`,
    now,
    template.id,
    template.revision + 1,
  );
  await requireRestored(result.changes);
  return Object.freeze({
    ...template,
    revision: template.revision + 2,
    updatedAt: now,
    deletedAt: null,
  });
}

export async function restoreCalendarEntry(
  db: SQLiteDatabase,
  entry: CalendarEntry,
): Promise<CalendarEntry> {
  const table = entry.kind === "SHIFT" ? "shift_entries" : "appointments";
  const now = new Date().toISOString();
  const result = await db.runAsync(
    `UPDATE ${table} SET revision=revision+1,updated_at=?,deleted_at=NULL
     WHERE id=? AND revision=? AND deleted_at IS NOT NULL`,
    now,
    entry.id,
    entry.revision + 1,
  );
  await requireRestored(result.changes);
  return Object.freeze({
    ...entry,
    revision: entry.revision + 2,
    updatedAt: now,
    deletedAt: null,
  });
}
