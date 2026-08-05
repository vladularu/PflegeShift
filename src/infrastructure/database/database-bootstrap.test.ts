import { describe, expect, it } from "vitest";

import {
  createSingleFlight,
  databaseArtifactNames,
  decideDatabaseBootstrap,
  type DatabaseBootstrapState,
} from "@/infrastructure/database/database-bootstrap";

function state(overrides: Partial<DatabaseBootstrapState>): DatabaseBootstrapState {
  return {
    legacyExists: false,
    secureExists: false,
    temporaryExists: false,
    keyExists: false,
    ...overrides,
  };
}

describe("database encryption bootstrap state machine", () => {
  it("creates a key and a fresh encrypted database for a new installation", () => {
    expect(decideDatabaseBootstrap(state({}))).toBe("create-secure");
  });

  it("rotates a stale key when no database exists", () => {
    expect(decideDatabaseBootstrap(state({ keyExists: true }))).toBe("rotate-key-and-create");
  });

  it("migrates a legacy database and reuses an already persisted key", () => {
    expect(decideDatabaseBootstrap(state({ legacyExists: true, keyExists: true }))).toBe(
      "migrate-legacy",
    );
  });

  it("migrates a legacy database after creating a key", () => {
    expect(decideDatabaseBootstrap(state({ legacyExists: true }))).toBe("create-key-and-migrate");
  });

  it("requires the existing key before opening an encrypted database", () => {
    expect(decideDatabaseBootstrap(state({ secureExists: true, keyExists: false }))).toBe(
      "block-missing-key",
    );
  });

  it("validates an encrypted database before cleaning legacy or temporary files", () => {
    expect(
      decideDatabaseBootstrap(
        state({
          secureExists: true,
          legacyExists: true,
          temporaryExists: true,
          keyExists: true,
        }),
      ),
    ).toBe("validate-secure-and-clean");
  });

  it("runs concurrent bootstrap requests only once", async () => {
    let executions = 0;
    let release: (() => void) | undefined;
    const task = createSingleFlight(
      () =>
        new Promise<void>((resolve) => {
          executions += 1;
          release = resolve;
        }),
    );

    const first = task();
    const second = task();
    expect(second).toBe(first);
    expect(executions).toBe(1);

    release?.();
    await first;
  });

  it("allows a retry after a failed bootstrap", async () => {
    let executions = 0;
    const task = createSingleFlight(async () => {
      executions += 1;
      if (executions === 1) throw new Error("first attempt failed");
    });

    await expect(task()).rejects.toThrow("first attempt failed");
    await expect(task()).resolves.toBeUndefined();
    expect(executions).toBe(2);
  });

  it("removes plaintext sidecars before the main database file", () => {
    expect(databaseArtifactNames("pflegeshift.db")).toEqual([
      "pflegeshift.db-wal",
      "pflegeshift.db-shm",
      "pflegeshift.db-journal",
      "pflegeshift.db",
    ]);
  });
});
