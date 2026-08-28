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
    const screen = await render(
      <RuleCatalogRuntimeProvider
        loadStoredCatalog={() => pending.promise}
        recordDiagnostic={recordDiagnostic}
      >
        <Harness />
      </RuleCatalogRuntimeProvider>,
    );

    expect(screen.queryByText(/LEGACY_EMBEDDED/)).toBeNull();
    await act(async () => pending.resolve(null));

    expect(screen.getByText("LEGACY_EMBEDDED:NO_STORED_CATALOG")).toBeTruthy();
    expect(recordDiagnostic).not.toHaveBeenCalled();
  });

  it("records a failed stored-catalog load and still exposes the safe legacy snapshot", async () => {
    const error = Object.assign(new Error("catalog corrupt"), { activeGeneration: 4 });
    const recordDiagnostic = jest.fn();
    const screen = await render(
      <RuleCatalogRuntimeProvider
        loadStoredCatalog={async () => {
          throw error;
        }}
        recordDiagnostic={recordDiagnostic}
      >
        <Harness />
      </RuleCatalogRuntimeProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText("LEGACY_EMBEDDED:NO_VALID_STORED_CATALOG")).toBeTruthy(),
    );
    expect(recordDiagnostic).toHaveBeenCalledWith("RULE_CATALOG_LOAD_FAILED", error);
  });
});
