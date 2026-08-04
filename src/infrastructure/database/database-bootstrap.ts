export interface DatabaseBootstrapState {
  legacyExists: boolean;
  secureExists: boolean;
  temporaryExists: boolean;
  keyExists: boolean;
}

export type DatabaseBootstrapAction =
  | "create-secure"
  | "rotate-key-and-create"
  | "create-key-and-migrate"
  | "migrate-legacy"
  | "block-missing-key"
  | "validate-secure-and-clean";

export function createSingleFlight<T>(task: () => Promise<T>): () => Promise<T> {
  let current: Promise<T> | undefined;
  return () => {
    if (current === undefined) {
      const attempt = task();
      current = attempt;
      void attempt.catch(() => {
        if (current === attempt) current = undefined;
      });
    }
    return current;
  };
}

export function databaseArtifactNames(databaseName: string): readonly string[] {
  return [`${databaseName}-wal`, `${databaseName}-shm`, `${databaseName}-journal`, databaseName];
}

export function decideDatabaseBootstrap(state: DatabaseBootstrapState): DatabaseBootstrapAction {
  if (state.secureExists) {
    return state.keyExists ? "validate-secure-and-clean" : "block-missing-key";
  }
  if (state.legacyExists) {
    return state.keyExists ? "migrate-legacy" : "create-key-and-migrate";
  }
  return state.keyExists ? "rotate-key-and-create" : "create-secure";
}
