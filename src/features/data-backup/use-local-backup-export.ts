import Constants from "expo-constants";
import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from "expo-crypto";
import { File, Paths } from "expo-file-system";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { Platform, Share } from "react-native";

import { PRODUCT_NAME } from "@/brand";
import { withBackupTempFile } from "@/features/data-backup/backup-temp-file";
import {
  exportLocalBackup,
  type LocalBackupShareResult,
} from "@/features/data-backup/local-backup-export";

export function useLocalBackupExport(): {
  readonly busy: boolean;
  readonly createAndShare: () => Promise<LocalBackupShareResult>;
} {
  const db = useSQLiteContext();
  const [busy, setBusy] = useState(false);

  const createAndShare = useCallback(async () => {
    if (Platform.OS !== "ios") {
      throw new Error("Die Datensicherung wird zunächst auf dem iPhone unterstützt.");
    }
    setBusy(true);
    try {
      const file = new File(
        Paths.cache,
        `LUNA-Shift-Backup-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}-${randomUUID()}.json`,
      );
      let created = false;
      return await withBackupTempFile({
        cacheUri: Paths.cache.uri,
        uri: file.uri,
        kind: "export",
        remove: () => {
          if (created && file.exists) file.delete();
        },
        run: () =>
          exportLocalBackup({
            db,
            appVersion: Constants.expoConfig?.version ?? null,
            createdAt: new Date(),
            sha256: (value) => digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
            writeFile: async ({ serialized }) => {
              file.create();
              created = true;
              file.write(serialized);
              return file.uri;
            },
            shareFile: async (uri) => {
              const result = await Share.share(
                { url: uri },
                { subject: `${PRODUCT_NAME} Datensicherung` },
              );
              return result.action === Share.dismissedAction ? "dismissed" : "shared";
            },
          }),
      });
    } finally {
      setBusy(false);
    }
  }, [db]);

  return { busy, createAndShare };
}
