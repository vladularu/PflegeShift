import { act, renderHook, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { CalendarEntry } from "@/domain/types";
import { usePrototypeEntries } from "./use-prototype-entries";

const mockDb = {};
const mockList = jest.fn<(...args: unknown[]) => Promise<readonly CalendarEntry[]>>();
jest.mock("expo-sqlite", () => ({ useSQLiteContext: () => mockDb }));
jest.mock("@/infrastructure/database/repository", () => ({
  listCalendarEntries: (...args: unknown[]) => mockList(...args),
}));
const entry: CalendarEntry = {
  kind: "APPOINTMENT",
  id: "series",
  date: "2025-12-31",
  title: "Visite",
  allDay: true,
  startTime: null,
  endTime: null,
  color: "#123456",
  note: null,
  recurrence: { frequency: "WEEK", interval: 1 },
  revision: 1,
  createdAt: "2025-12-01T00:00:00Z",
  updatedAt: "2025-12-01T00:00:00Z",
  deletedAt: null,
};

describe("prototype read-only year loading", () => {
  beforeEach(() => {
    mockList.mockReset();
    mockList.mockResolvedValue([]);
  });
  it("queries once per year, expands old recurrence roots and reuses cached years", async () => {
    mockList.mockResolvedValue([entry]);
    const hook = await renderHook(({ year }: { year: string }) => usePrototypeEntries(year, true), {
      initialProps: { year: "2026" },
    });
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(mockList).toHaveBeenCalledWith(mockDb, "2026-01-01", "2026-12-31");
    expect(hook.result.current.entries[0].date).toBe("2026-01-07");
    expect(hook.result.current.entries).toHaveLength(52);
    const original = hook.result.current.entries;
    await hook.rerender({ year: "2026" });
    expect(mockList).toHaveBeenCalledTimes(1);
    await hook.rerender({ year: "2027" });
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    await hook.rerender({ year: "2026" });
    expect(hook.result.current.entries).toBe(original);
    expect(mockList).toHaveBeenCalledTimes(2);
  });
  it("discards late results after quick year changes and unmount", async () => {
    let resolveOld!: (entries: readonly CalendarEntry[]) => void;
    mockList.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    const hook = await renderHook(({ year }: { year: string }) => usePrototypeEntries(year, true), {
      initialProps: { year: "2026" },
    });
    expect(hook.result.current.loading).toBe(true);
    await hook.rerender({ year: "2027" });
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    await act(async () => resolveOld([entry]));
    expect(hook.result.current.entries).toEqual([]);
    await hook.unmount();
  });
  it("reports failure rather than an empty year and supports retry", async () => {
    mockList.mockRejectedValueOnce(new Error("private database error"));
    const hook = await renderHook(() => usePrototypeEntries("2026", true));
    await waitFor(() => expect(hook.result.current.error).toBe(true));
    await act(async () => hook.result.current.retry());
    await waitFor(() => expect(hook.result.current.error).toBe(false));
    expect(hook.result.current.loading).toBe(false);
    expect(mockList).toHaveBeenCalledTimes(2);
  });
  it("invalidates on background/re-entry and keeps only three years", async () => {
    const hook = await renderHook(
      ({ year, active }: { year: string; active: boolean }) => usePrototypeEntries(year, active),
      {
        initialProps: { year: "2026", active: true },
      },
    );
    for (const year of ["2027", "2028", "2029", "2026"]) {
      await hook.rerender({ year, active: true });
      await waitFor(() => expect(hook.result.current.loading).toBe(false));
    }
    expect(mockList).toHaveBeenCalledTimes(5);
    await hook.rerender({ year: "2026", active: false });
    expect(hook.result.current.loading).toBe(true);
    await hook.rerender({ year: "2026", active: true });
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(mockList).toHaveBeenCalledTimes(6);
  });
});
