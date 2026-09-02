import Constants from "expo-constants";
import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";
import { File, Paths } from "expo-file-system";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { Platform, Share } from "react-native";

import { PRODUCT_NAME } from "@/brand";
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
      return await exportLocalBackup({
        db,
        appVersion: Constants.expoConfig?.version ?? null,
        createdAt: new Date(),
        sha256: (value) => digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
        writeFile: async ({ fileName, serialized }) => {
          const file = new File(Paths.cache, fileName);
          file.create({ overwrite: true });
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
      });
    } finally {
      setBusy(false);
    }
  }, [db]);

  return { busy, createAndShare };
}
