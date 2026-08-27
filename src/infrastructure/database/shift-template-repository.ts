import type { SQLiteDatabase } from "expo-sqlite";

import type {
  EntryLocation,
  EntryNotification,
  SaveShiftTemplateInput,
  ShiftTemplate,
} from "@/domain/types";
import { ConcurrencyError } from "@/domain/errors";
import { createId, ValidationError, validateTemplate } from "@/domain/validation";
import {
  parseJson,
  requireChanged,
  serializeJson,
} from "@/infrastructure/database/repository-shared";
import { withImmediateTransaction } from "@/infrastructure/database/transaction";

interface TemplateRow {
  id: string;
  name: string;
  type: ShiftTemplate["type"];
  all_day: number;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number;
  color: string;
  symbol: string;
  notification_json: string | null;
  location_json: string | null;
  sort_order: number;
  revision: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function mapTemplate(row: TemplateRow): ShiftTemplate {
  if (!Number.isInteger(row.sort_order) || !Number.isInteger(row.revision)) {
    throw new ValidationError("Gespeicherte Vorlagendaten sind ungültig.");
  }
  const validated = validateTemplate({
    id: row.id,
    name: row.name,
    type: row.type,
    allDay: row.all_day === 1 || row.start_time === null,
    startTime: row.start_time,
    endTime: row.end_time,
    breakMinutes: row.break_minutes,
    color: row.color,
    symbol: row.symbol,
    notification: parseJson<EntryNotification>(row.notification_json, "Benachrichtigung"),
    location: parseJson<EntryLocation>(row.location_json, "Ort"),
    sortOrder: row.sort_order,
  });
  return Object.freeze({
    id: row.id,
    name: validated.name,
    type: validated.type,
    allDay: validated.allDay ?? false,
    startTime: validated.startTime ?? null,
    endTime: validated.endTime ?? null,
    breakMinutes: validated.breakMinutes,
    color: validated.color,
    symbol: validated.symbol,
    notification: validated.notification ?? null,
    location: validated.location ?? null,
    sortOrder: validated.sortOrder,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  });
}

export async function listTemplates(db: SQLiteDatabase): Promise<readonly ShiftTemplate[]> {
  const rows = await db.getAllAsync<TemplateRow>(
    `SELECT id,name,type,all_day,start_time,end_time,break_minutes,color,symbol,
      notification_json,location_json,sort_order,
      revision,created_at,updated_at,deleted_at
     FROM shift_templates WHERE deleted_at IS NULL ORDER BY sort_order,name`,
  );
  return Object.freeze(rows.map(mapTemplate));
}

export async function saveTemplate(
  db: SQLiteDatabase,
  rawInput: SaveShiftTemplateInput,
): Promise<ShiftTemplate> {
  const input = validateTemplate(rawInput);
  const id = input.id ?? createId("template");
  const now = new Date().toISOString();

  if (input.id === undefined) {
    await db.runAsync(
      `INSERT INTO shift_templates(
        id,name,type,all_day,start_time,end_time,break_minutes,color,symbol,
        notification_json,location_json,sort_order,
        revision,created_at,updated_at,deleted_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,NULL)`,
      id,
      input.name,
      input.type,
      input.allDay ? 1 : 0,
      input.startTime,
      input.endTime,
      input.breakMinutes,
      input.color,
      input.symbol,
      serializeJson(input.notification),
      serializeJson(input.location),
      input.sortOrder,
      now,
      now,
    );
  } else {
    const result = await db.runAsync(
      `UPDATE shift_templates SET
        name=?,type=?,all_day=?,start_time=?,end_time=?,break_minutes=?,color=?,symbol=?,
        notification_json=?,location_json=?,sort_order=?,revision=revision+1,updated_at=?
       WHERE id=? AND revision=? AND deleted_at IS NULL`,
      input.name,
      input.type,
      input.allDay ? 1 : 0,
      input.startTime,
      input.endTime,
      input.breakMinutes,
      input.color,
      input.symbol,
      serializeJson(input.notification),
      serializeJson(input.location),
      input.sortOrder,
      now,
      id,
      input.expectedRevision ?? -1,
    );
    await requireChanged(result.changes);
  }

  const row = await db.getFirstAsync<TemplateRow>(
    `SELECT id,name,type,all_day,start_time,end_time,break_minutes,color,symbol,
      notification_json,location_json,sort_order,
      revision,created_at,updated_at,deleted_at FROM shift_templates WHERE id=?`,
    id,
  );
  if (row === null) throw new Error("Vorlage konnte nicht gespeichert werden.");
  return mapTemplate(row);
}

export async function deleteTemplate(
  db: SQLiteDatabase,
  id: string,
  expectedRevision: number,
): Promise<void> {
  const result = await db.runAsync(
    `UPDATE shift_templates SET revision=revision+1,updated_at=?,deleted_at=?
     WHERE id=? AND revision=? AND deleted_at IS NULL`,
    new Date().toISOString(),
    new Date().toISOString(),
    id,
    expectedRevision,
  );
  await requireChanged(result.changes);
}

export async function swapTemplateSortOrder(
  db: SQLiteDatabase,
  first: ShiftTemplate,
  second: ShiftTemplate,
): Promise<readonly [ShiftTemplate, ShiftTemplate]> {
  let swapped: readonly [ShiftTemplate, ShiftTemplate] | null = null;

  await withImmediateTransaction(db, async (transaction) => {
    const now = new Date().toISOString();
    const firstResult = await transaction.runAsync(
      `UPDATE shift_templates SET sort_order=?,revision=revision+1,updated_at=?
       WHERE id=? AND revision=? AND deleted_at IS NULL`,
      second.sortOrder,
      now,
      first.id,
      first.revision,
    );
    await requireChanged(firstResult.changes);

    const secondResult = await transaction.runAsync(
      `UPDATE shift_templates SET sort_order=?,revision=revision+1,updated_at=?
       WHERE id=? AND revision=? AND deleted_at IS NULL`,
      first.sortOrder,
      now,
      second.id,
      second.revision,
    );
    await requireChanged(secondResult.changes);

    const rows = await transaction.getAllAsync<TemplateRow>(
      `SELECT id,name,type,all_day,start_time,end_time,break_minutes,color,symbol,
        notification_json,location_json,sort_order,
        revision,created_at,updated_at,deleted_at
       FROM shift_templates WHERE id IN (?,?)`,
      first.id,
      second.id,
    );
    if (rows.length !== 2) throw new ConcurrencyError();
    const mapped = rows.map(mapTemplate);
    const savedFirst = mapped.find((template) => template.id === first.id);
    const savedSecond = mapped.find((template) => template.id === second.id);
    if (!savedFirst || !savedSecond) throw new ConcurrencyError();
    swapped = Object.freeze([savedFirst, savedSecond]);
  });

  if (swapped === null) throw new ConcurrencyError();
  return swapped;
}
