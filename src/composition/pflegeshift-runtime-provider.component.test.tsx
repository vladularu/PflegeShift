import { act, render, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Text } from "react-native";
import type { PropsWithChildren } from "react";
import type { UserProfile } from "@/domain/types";
import type { LoadStoredRuleCatalog } from "@/application/rule-catalog-runtime";
import type { PflegeShiftPorts } from "@/application/pflegeshift-ports";
import { usePflegeShiftStatus } from "@/application/pflegeshift-provider";
import { useRuleCatalogRuntime } from "@/application/rule-catalog-runtime-provider";
import { PflegeShiftRuntimeProvider } from "./pflegeshift-runtime-provider";

const mockDb = {};
const mockLoadCatalog = jest.fn<LoadStoredRuleCatalog>();
const mockLoadProfile = jest.fn<() => Promise<UserProfile | null>>();
const mockPorts = {
  repository: {
    loadProfile: mockLoadProfile,
    listTemplates: async () => [],
    listCalendarEntries: async () => [],
    listMonthlyTariffDecisions: async () => [],
    loadTvoedWorkPatternSettings: async () => ({
      workplaceCoverage: "UNKNOWN",
      assignment: "UNKNOWN",
      updatedAt: null,
    }),
  },
  notifications: { syncEntry: async () => undefined, cancelEntry: async () => undefined },
  diagnostics: { record: jest.fn() },
  devTools: { shouldLoadState: () => false },
} as unknown as PflegeShiftPorts;
const mockRules = {
  loadStoredCatalog: mockLoadCatalog,
  synchronizeCatalog: async () => ({ status: "DISABLED" as const }),
  recordDiagnostic: jest.fn(),
};
jest.mock("expo-sqlite", () => ({ useSQLiteContext: () => mockDb }));
jest.mock("@/composition/create-pflegeshift-ports", () => ({
  createPflegeShiftPorts: () => mockPorts,
}));
jest.mock("@/composition/create-rule-catalog-runtime-port", () => ({
  createRuleCatalogRuntimePort: () => mockRules,
}));
jest.mock("@/navigation/active-month", () => ({ useActiveMonth: () => "2026-10" }));
jest.mock("@/application/remuneration-provider", () => ({
  RemunerationProvider: ({ children }: PropsWithChildren) => children,
}));
jest.mock("@/application/training-provider", () => ({
  TrainingProvider: ({ children }: PropsWithChildren) => children,
}));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function Harness() {
  const { ready } = usePflegeShiftStatus();
  const { resolver } = useRuleCatalogRuntime();
  return <Text>{ready && resolver ? "ready" : "loading-data"}</Text>;
}
beforeEach(() => {
  mockLoadCatalog.mockReset();
  mockLoadProfile.mockReset();
});
describe("parallel local app startup", () => {
  it.each(["catalog", "data"] as const)(
    "loads both before waiting for %s and keeps consumers gated",
    async (first) => {
      const catalog = deferred<Awaited<ReturnType<LoadStoredRuleCatalog>>>();
      const data = deferred<UserProfile | null>();
      mockLoadCatalog.mockReturnValue(catalog.promise);
      mockLoadProfile.mockReturnValue(data.promise);
      const screen = await render(
        <PflegeShiftRuntimeProvider>
          <Harness />
        </PflegeShiftRuntimeProvider>,
      );
      expect(mockLoadCatalog).toHaveBeenCalledTimes(1);
      expect(mockLoadProfile).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("ready")).toBeNull();
      await act(async () => {
        if (first === "catalog") catalog.resolve(null);
        else data.resolve(null);
      });
      expect(screen.queryByText("ready")).toBeNull();
      await act(async () => {
        if (first === "catalog") data.resolve(null);
        else catalog.resolve(null);
      });
      await waitFor(() => expect(screen.getByText("ready")).toBeTruthy());
      expect(mockLoadProfile).toHaveBeenCalledTimes(1);
      await screen.unmount();
    },
  );
});
