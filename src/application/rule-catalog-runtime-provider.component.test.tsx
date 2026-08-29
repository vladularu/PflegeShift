import { act, render, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { Text } from "react-native";

import {
  RuleCatalogRuntimeProvider,
  useRuleCatalogRuntime,
} from "@/application/rule-catalog-runtime-provider";
import type { StoredRuleCatalogSnapshot } from "@/application/rule-catalog-runtime";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function Harness() {
  const { diagnosis } = useRuleCatalogRuntime();
  return <Text>{`${diagnosis.source}:${diagnosis.fallbackReason ?? "NONE"}`}</Text>;
}

describe("RuleCatalogRuntimeProvider", () => {
  it("does not mount calculation consumers before the startup snapshot is selected", async () => {
    const pending = deferred<StoredRuleCatalogSnapshot | null>();
    const recordDiagnostic = jest.fn();
    const synchronizeCatalog = jest.fn(async () => ({ status: "THROTTLED" as const }));
    const screen = await render(
      <RuleCatalogRuntimeProvider
        loadStoredCatalog={() => pending.promise}
        synchronizeCatalog={synchronizeCatalog}
        recordDiagnostic={recordDiagnostic}
      >
        <Harness />
      </RuleCatalogRuntimeProvider>,
    );

    expect(screen.queryByText(/LEGACY_EMBEDDED/)).toBeNull();
    await act(async () => pending.resolve(null));

    expect(screen.getByText("LEGACY_EMBEDDED:NO_STORED_CATALOG")).toBeTruthy();
    expect(synchronizeCatalog).toHaveBeenCalledWith(null);
    expect(recordDiagnostic).not.toHaveBeenCalled();
  });

  it("records a failed stored-catalog load and still exposes the safe legacy snapshot", async () => {
    const error = Object.assign(new Error("catalog corrupt"), { activeGeneration: 4 });
    const recordDiagnostic = jest.fn();
    const synchronizeCatalog = jest.fn(async () => ({ status: "THROTTLED" as const }));
    const screen = await render(
      <RuleCatalogRuntimeProvider
        loadStoredCatalog={async () => {
          throw error;
        }}
        synchronizeCatalog={synchronizeCatalog}
        recordDiagnostic={recordDiagnostic}
      >
        <Harness />
      </RuleCatalogRuntimeProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText("LEGACY_EMBEDDED:NO_VALID_STORED_CATALOG")).toBeTruthy(),
    );
    expect(recordDiagnostic).toHaveBeenCalledWith("RULE_CATALOG_LOAD_FAILED", error);
    expect(synchronizeCatalog).toHaveBeenCalledWith(4);
  });

  it("keeps the selected runtime mounted while synchronization remains pending", async () => {
    const synchronizeCatalog = jest.fn(() => new Promise<never>(() => undefined));
    const screen = await render(
      <RuleCatalogRuntimeProvider
        loadStoredCatalog={async () => null}
        synchronizeCatalog={synchronizeCatalog}
        recordDiagnostic={jest.fn()}
      >
        <Harness />
      </RuleCatalogRuntimeProvider>,
    );

    await waitFor(() => expect(screen.getByText("LEGACY_EMBEDDED:NO_STORED_CATALOG")).toBeTruthy());
    expect(synchronizeCatalog).toHaveBeenCalledWith(null);
  });

  it("records synchronization failures without replacing the selected runtime", async () => {
    const error = new Error("offline");
    const recordDiagnostic = jest.fn();
    const screen = await render(
      <RuleCatalogRuntimeProvider
        loadStoredCatalog={async () => null}
        synchronizeCatalog={async () => {
          throw error;
        }}
        recordDiagnostic={recordDiagnostic}
      >
        <Harness />
      </RuleCatalogRuntimeProvider>,
    );

    await waitFor(() =>
      expect(recordDiagnostic).toHaveBeenCalledWith("RULE_CATALOG_SYNC_FAILED", error),
    );
    expect(screen.getByText("LEGACY_EMBEDDED:NO_STORED_CATALOG")).toBeTruthy();
  });
});
