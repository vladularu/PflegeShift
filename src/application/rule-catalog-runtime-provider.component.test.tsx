import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { AppState, Button, Text, type AppStateStatus } from "react-native";

import holidayPackageFixture from "../../rules/examples/holiday-package.valid.json";
import legalPackageFixture from "../../rules/examples/legal-package.valid.json";
import manifestFixture from "../../rules/examples/manifest.valid.json";
import tariffPackageFixture from "../../rules/examples/tariff-package.valid.json";
import {
  RuleCatalogRuntimeProvider,
  useRuleCatalogRuntime,
} from "@/application/rule-catalog-runtime-provider";
import type { StoredRuleCatalogSnapshot } from "@/application/rule-catalog-runtime";
import type {
  RuleCatalogSyncResult,
  SynchronizeRuleCatalog,
} from "@/application/rule-catalog-sync";
import { getPublicHolidays } from "@/engine/holidays";
import { getTariffVersion } from "@/engine/tariff";
import { requireResolvedPackage } from "@/rules/rule-resolver";
import { validateRuleCatalog } from "@/rules/validation";

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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function storedCatalog(input: {
  readonly generation: number;
  readonly monthlyCents: number;
  readonly maxDailyMinutes: number;
  readonly newYearName: string;
}): StoredRuleCatalogSnapshot {
  const manifest = clone(manifestFixture);
  const tariff = clone(tariffPackageFixture);
  const legal = clone(legalPackageFixture);
  const holiday = clone(holidayPackageFixture);
  manifest.generation = input.generation;
  tariff.rules.payTables[0].entries[0].monthlyCents = input.monthlyCents;
  legal.rules.workingTime.maxDailyMinutes = input.maxDailyMinutes;
  holiday.rules.holidays[0].name = input.newYearName;
  const validation = validateRuleCatalog(manifest, [tariff, legal, holiday]);
  if (!validation.ok) throw new Error("Expected the catalog fixture to be valid.");
  return {
    activeGeneration: input.generation,
    generation: input.generation,
    recoveredFromGeneration: null,
    catalog: validation.value,
  };
}

function CalculationHarness() {
  const { diagnosis, resolver } = useRuleCatalogRuntime();
  const tariff = getTariffVersion("2026-05-01", resolver)?.monthly.P7[2] ?? 0;
  const holiday = getPublicHolidays(2026, "NW", resolver)[0]?.name ?? "NONE";
  const legal = requireResolvedPackage(resolver.resolveLegal("2026-07-01"));
  return (
    <Text>
      {`${diagnosis.selectedGeneration}:${tariff}:${holiday}:${legal.rules.workingTime.maxDailyMinutes}`}
    </Text>
  );
}

function ManualRefreshHarness() {
  const { diagnosis, synchronizeNow } = useRuleCatalogRuntime();
  return (
    <>
      <Text>{`Generation ${diagnosis.selectedGeneration ?? "embedded"}`}</Text>
      <Button title="Jetzt prüfen" onPress={() => void synchronizeNow()} />
    </>
  );
}

describe("RuleCatalogRuntimeProvider", () => {
  const appStateListeners = new Set<(state: AppStateStatus) => void>();
  const originalAppState = AppState.currentState;
  const removeListener = jest.fn();

  beforeEach(() => {
    AppState.currentState = "active";
    appStateListeners.clear();
    removeListener.mockClear();
    jest.spyOn(AppState, "addEventListener").mockImplementation((event, listener) => {
      expect(event).toBe("change");
      const stateListener = listener as (state: AppStateStatus) => void;
      appStateListeners.add(stateListener);
      return {
        remove: () => {
          removeListener();
          appStateListeners.delete(stateListener);
        },
      };
    });
  });

  afterEach(() => {
    AppState.currentState = originalAppState;
    jest.restoreAllMocks();
  });

  async function changeAppState(state: AppStateStatus) {
    await act(async () => {
      AppState.currentState = state;
      for (const listener of appStateListeners) listener(state);
    });
  }

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

  it("replaces every calculation consumer with one newly loaded resolver generation", async () => {
    const initial = storedCatalog({
      generation: 1,
      monthlyCents: 367_500,
      maxDailyMinutes: 600,
      newYearName: "Neujahr",
    });
    const next = storedCatalog({
      generation: 2,
      monthlyCents: 400_000,
      maxDailyMinutes: 540,
      newYearName: "Jahresbeginn",
    });
    const pending = deferred<RuleCatalogSyncResult>();
    const loadStoredCatalog = jest
      .fn<() => Promise<StoredRuleCatalogSnapshot | null>>()
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(next);
    const screen = await render(
      <RuleCatalogRuntimeProvider
        loadStoredCatalog={loadStoredCatalog}
        synchronizeCatalog={() => pending.promise}
        recordDiagnostic={jest.fn()}
      >
        <CalculationHarness />
      </RuleCatalogRuntimeProvider>,
    );

    await waitFor(() => expect(screen.getByText("1:3675:Neujahr:600")).toBeTruthy());
    await act(async () =>
      pending.resolve({ status: "ACTIVATED", generation: 2, previousGeneration: 1 }),
    );

    await waitFor(() => expect(screen.getByText("2:4000:Jahresbeginn:540")).toBeTruthy());
    expect(loadStoredCatalog).toHaveBeenCalledTimes(2);
  });

  it("forces a manual check and replaces the mounted runtime without an app restart", async () => {
    const initial = storedCatalog({
      generation: 1,
      monthlyCents: 367_500,
      maxDailyMinutes: 600,
      newYearName: "Neujahr",
    });
    const next = storedCatalog({
      generation: 2,
      monthlyCents: 400_000,
      maxDailyMinutes: 540,
      newYearName: "Jahresbeginn",
    });
    const loadStoredCatalog = jest
      .fn<() => Promise<StoredRuleCatalogSnapshot | null>>()
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(next);
    const synchronizeCatalog = jest
      .fn<SynchronizeRuleCatalog>()
      .mockResolvedValueOnce({ status: "THROTTLED" })
      .mockResolvedValueOnce({ status: "ACTIVATED", generation: 2, previousGeneration: 1 });
    const screen = await render(
      <RuleCatalogRuntimeProvider
        loadStoredCatalog={loadStoredCatalog}
        synchronizeCatalog={synchronizeCatalog}
        recordDiagnostic={jest.fn()}
      >
        <ManualRefreshHarness />
      </RuleCatalogRuntimeProvider>,
    );

    await waitFor(() => expect(screen.getByText("Generation 1")).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Jetzt prüfen" }));
    });

    await waitFor(() => expect(screen.getByText("Generation 2")).toBeTruthy());
    expect(synchronizeCatalog).toHaveBeenNthCalledWith(2, 1, { force: true });
    expect(loadStoredCatalog).toHaveBeenCalledTimes(2);
  });

  it("keeps the mounted resolver when the activated generation cannot be reloaded", async () => {
    const initial = storedCatalog({
      generation: 1,
      monthlyCents: 367_500,
      maxDailyMinutes: 600,
      newYearName: "Neujahr",
    });
    const refreshError = Object.assign(new Error("catalog unavailable"), {
      activeGeneration: 2,
    });
    const loadStoredCatalog = jest
      .fn<() => Promise<StoredRuleCatalogSnapshot | null>>()
      .mockResolvedValueOnce(initial)
      .mockRejectedValueOnce(refreshError);
    const recordDiagnostic = jest.fn();
    const screen = await render(
      <RuleCatalogRuntimeProvider
        loadStoredCatalog={loadStoredCatalog}
        synchronizeCatalog={async () => ({
          status: "ACTIVATED",
          generation: 2,
          previousGeneration: 1,
        })}
        recordDiagnostic={recordDiagnostic}
      >
        <CalculationHarness />
      </RuleCatalogRuntimeProvider>,
    );

    await waitFor(() =>
      expect(recordDiagnostic).toHaveBeenCalledWith("RULE_CATALOG_REFRESH_FAILED", refreshError),
    );
    expect(screen.getByText("1:3675:Neujahr:600")).toBeTruthy();
  });

  it("automatically activates a new generation when returning from the background", async () => {
    const initial = storedCatalog({
      generation: 5,
      monthlyCents: 367_500,
      maxDailyMinutes: 600,
      newYearName: "Neujahr",
    });
    const next = storedCatalog({
      generation: 6,
      monthlyCents: 400_000,
      maxDailyMinutes: 540,
      newYearName: "Jahresbeginn",
    });
    const loadStoredCatalog = jest
      .fn<() => Promise<StoredRuleCatalogSnapshot | null>>()
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(next);
    const synchronizeCatalog = jest
      .fn<SynchronizeRuleCatalog>()
      .mockResolvedValueOnce({ status: "UP_TO_DATE", generation: 5 })
      .mockResolvedValueOnce({ status: "ACTIVATED", generation: 6, previousGeneration: 5 });
    const screen = await render(
      <RuleCatalogRuntimeProvider
        loadStoredCatalog={loadStoredCatalog}
        synchronizeCatalog={synchronizeCatalog}
        recordDiagnostic={jest.fn()}
      >
        <CalculationHarness />
      </RuleCatalogRuntimeProvider>,
    );
    await waitFor(() => expect(screen.getByText("5:3675:Neujahr:600")).toBeTruthy());
    await changeAppState("inactive");
    await changeAppState("background");
    expect(synchronizeCatalog).toHaveBeenCalledTimes(1);
    await changeAppState("active");
    await waitFor(() => expect(screen.getByText("6:4000:Jahresbeginn:540")).toBeTruthy());
    expect(synchronizeCatalog).toHaveBeenNthCalledWith(2, 5);
    await changeAppState("active");
    expect(synchronizeCatalog).toHaveBeenCalledTimes(2);
  });

  it("shares a pending startup check with foreground and manual checks", async () => {
    const initial = storedCatalog({
      generation: 5,
      monthlyCents: 367_500,
      maxDailyMinutes: 600,
      newYearName: "Neujahr",
    });
    const pending = deferred<RuleCatalogSyncResult>();
    const synchronizeCatalog = jest.fn<SynchronizeRuleCatalog>(() => pending.promise);
    const screen = await render(
      <RuleCatalogRuntimeProvider
        loadStoredCatalog={async () => initial}
        synchronizeCatalog={synchronizeCatalog}
        recordDiagnostic={jest.fn()}
      >
        <ManualRefreshHarness />
      </RuleCatalogRuntimeProvider>,
    );
    await waitFor(() => expect(screen.getByText("Generation 5")).toBeTruthy());
    await changeAppState("background");
    await changeAppState("active");
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Jetzt prüfen" }));
    });
    expect(synchronizeCatalog).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ status: "UP_TO_DATE", generation: 5 }));
    expect(screen.getByText("Generation 5")).toBeTruthy();
  });

  it("keeps the offline resolver usable after a foreground download failure", async () => {
    const initial = storedCatalog({
      generation: 6,
      monthlyCents: 400_000,
      maxDailyMinutes: 540,
      newYearName: "Jahresbeginn",
    });
    const error = new Error("offline");
    const recordDiagnostic = jest.fn();
    const synchronizeCatalog = jest
      .fn<SynchronizeRuleCatalog>()
      .mockResolvedValueOnce({ status: "UP_TO_DATE", generation: 6 })
      .mockRejectedValueOnce(error);
    const screen = await render(
      <RuleCatalogRuntimeProvider
        loadStoredCatalog={async () => initial}
        synchronizeCatalog={synchronizeCatalog}
        recordDiagnostic={recordDiagnostic}
      >
        <CalculationHarness />
      </RuleCatalogRuntimeProvider>,
    );
    await waitFor(() => expect(screen.getByText("6:4000:Jahresbeginn:540")).toBeTruthy());
    await changeAppState("background");
    await changeAppState("active");
    expect(recordDiagnostic).toHaveBeenCalledWith("RULE_CATALOG_SYNC_FAILED", error);
    expect(screen.getByText("6:4000:Jahresbeginn:540")).toBeTruthy();
  });

  it("defers startup download while backgrounded and removes the lifecycle listener on unmount", async () => {
    AppState.currentState = "background";
    const synchronizeCatalog = jest
      .fn<SynchronizeRuleCatalog>()
      .mockResolvedValue({ status: "THROTTLED" });
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
    expect(synchronizeCatalog).not.toHaveBeenCalled();
    await changeAppState("active");
    expect(synchronizeCatalog).toHaveBeenCalledTimes(1);
    await screen.unmount();
    expect(removeListener).toHaveBeenCalledTimes(1);
    await changeAppState("background");
    await changeAppState("active");
    expect(synchronizeCatalog).toHaveBeenCalledTimes(1);
  });

  it("does not reload a completed download after its provider has unmounted", async () => {
    const pending = deferred<RuleCatalogSyncResult>();
    const loadStoredCatalog = jest
      .fn<() => Promise<StoredRuleCatalogSnapshot | null>>()
      .mockResolvedValue(null);
    const recordDiagnostic = jest.fn();
    const screen = await render(
      <RuleCatalogRuntimeProvider
        loadStoredCatalog={loadStoredCatalog}
        synchronizeCatalog={() => pending.promise}
        recordDiagnostic={recordDiagnostic}
      >
        <Harness />
      </RuleCatalogRuntimeProvider>,
    );
    await waitFor(() => expect(screen.getByText("LEGACY_EMBEDDED:NO_STORED_CATALOG")).toBeTruthy());
    await screen.unmount();
    await act(async () =>
      pending.resolve({ status: "ACTIVATED", generation: 6, previousGeneration: null }),
    );
    expect(loadStoredCatalog).toHaveBeenCalledTimes(1);
    expect(recordDiagnostic).not.toHaveBeenCalled();
  });
});
