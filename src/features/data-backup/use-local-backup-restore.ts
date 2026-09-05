import { reloadAppAsync } from "expo";
import * as DocumentPicker from "expo-document-picker";
import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";
import { File } from "expo-file-system";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { Platform } from "react-native";

import {
  loadLocalBackupRestoreCandidate,
  performLocalBackupRestore,
  type LocalBackupRestoreCandidate,
} from "@/features/data-backup/local-backup-restore-flow";
import { restoreLocalBackup } from "@/infrastructure/database/local-backup-restore";
import { loadCurrentDatabaseSchemaVersion } from "@/infrastructure/database/local-backup-validation";
import { listCalendarEntries, loadProfile } from "@/infrastructure/database/repository";
import {
  cancelAllEntryNotifications,
  syncEntryNotifications,
} from "@/infrastructure/notifications/entry-notifications";

function needsNotification(
  entry: Awaited<ReturnType<typeof listCalendarEntries>>[number],
): boolean {
  return entry.notification !== null || (entry.kind === "SHIFT" && entry.alarmEnabled === true);
}

async function recoverCurrentNotifications(db: ReturnType<typeof useSQLiteContext>): Promise<void> {
  const [profile, entries] = await Promise.all([loadProfile(db), listCalendarEntries(db)]);
  const timeZone = profile?.timeZone ?? "Europe/Berlin";
  const results = await Promise.allSettled(
    entries.filter(needsNotification).map((entry) => syncEntryNotifications(db, entry, timeZone)),
  );
  if (results.some((result) => result.status === "rejected")) {
    throw new Error("Notification recovery failed");
  }
}

export function useLocalBackupRestore(): {
  readonly busy: boolean;
  readonly candidate: LocalBackupRestoreCandidate | null;
  readonly selectBackup: () => Promise<"canceled" | "selected">;
  readonly restoreSelected: () => Promise<void>;
} {
  const db = useSQLiteContext();
  const [busy, setBusy] = useState(false);
  const [candidate, setCandidate] = useState<LocalBackupRestoreCandidate | null>(null);

  const selectBackup = useCallback(async () => {
    if (Platform.OS !== "ios") {
      throw new Error("Die Wiederherstellung wird zunächst auf dem iPhone unterstützt.");
    }
    setBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: ["application/json", "text/json", "text/plain"],
      });
      if (result.canceled) return "canceled" as const;
      const asset = result.assets[0];
      if (asset === undefined) throw new Error("No document selected");
      const file = new File(asset.uri);
      setCandidate(null);
      const selected = await loadLocalBackupRestoreCandidate({
        selection: {
          name: asset.name,
          size: asset.size ?? file.size,
          mimeType: asset.mimeType ?? null,
        },
        maxDatabaseSchemaVersion: await loadCurrentDatabaseSchemaVersion(db),
        readText: () => file.text(),
        sha256: (value) => digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
      });
      setCandidate(selected);
      return "selected" as const;
    } finally {
      setBusy(false);
    }
  }, [db]);

  const restoreSelected = useCallback(async () => {
    if (candidate === null) throw new Error("No validated backup selected");
    setBusy(true);
    try {
      await performLocalBackupRestore({
        candidate,
        cancelCurrentNotifications: () => cancelAllEntryNotifications(db),
        restore: (backup) => restoreLocalBackup(db, backup),
        recoverCurrentNotifications: () => recoverCurrentNotifications(db),
        reloadApp: () => reloadAppAsync("local-backup-restored"),
      });
    } finally {
      setBusy(false);
    }
  }, [candidate, db]);

  return { busy, candidate, selectBackup, restoreSelected };
}
