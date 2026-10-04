import type { SQLiteDatabase } from "expo-sqlite";
import { createProfilePorts } from "./create-profile-ports";
import { projectStoredSimpleProfile } from "@/infrastructure/database/simple-app-profile";

/** Normal app reads only the simple view; archived repositories remain unchanged. */
export function createSimpleProfilePorts(db: SQLiteDatabase) {
  const ports = createProfilePorts(db);
  return {
    ...ports,
    repository: {
      ...ports.repository,
      loadProfile: async () => projectStoredSimpleProfile(db, await ports.repository.loadProfile()),
    },
  };
}
