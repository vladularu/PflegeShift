import type { SQLiteDatabase } from "expo-sqlite";

import {
  createLocalBackupDocument,
  loadLocalBackupSnapshot,
  type CreatedLocalBackup,
} from "@/infrastructure/database/local-backup";

export type LocalBackupShareResult = "dismissed" | "shared";

export async function exportLocalBackup(input: {
  readonly db: SQLiteDatabase;
  readonly appVersion: string | null;
  readonly createdAt: Date;
  readonly sha256: (value: string) => Promise<string>;
  readonly writeFile: (file: CreatedLocalBackup) => Promise<string>;
  readonly shareFile: (uri: string) => Promise<LocalBackupShareResult>;
}): Promise<LocalBackupShareResult> {
  const snapshot = await loadLocalBackupSnapshot(input.db);
  const file = await createLocalBackupDocument(snapshot, input);
  const uri = await input.writeFile(file);
  return input.shareFile(uri);
}
