import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert, Keyboard, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { PropsWithChildren } from "react";
import { router } from "expo-router";
import type { useRemunerationData } from "@/application/remuneration-provider";
import type { CalendarEntry, UserProfile } from "@/domain/types";
import type { SavedOvertimeAllocation } from "@/domain/overtime-allocation";
import { ConcurrencyError } from "@/domain/errors";
import { shift, work } from "@/engine/remuneration-test-fixtures";
import { LIGHT_PALETTE, DARK_PALETTE } from "@/theme/palette-values";
import { successFeedback } from "@/ui/haptics";
import { OvertimeAllocationScreen } from "./overtime-allocation-screen";

const service = shift({ date: "2026-09-30", overtimeMinutes: 60, tariffOvertimeConfirmed: true });
let mockMonth: string | string[] | undefined;
let mockHistory: ReturnType<typeof useRemunerationData>;
let mockEntries: readonly CalendarEntry[];
let mockProfile: UserProfile | null;
let mockReady: boolean;
let mockError: string | null;
let mockPalette = LIGHT_PALETTE;
const mockReload = jest.fn<() => Promise<void>>();
function TestContext({ children }: PropsWithChildren) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { width: 430, height: 932, x: 0, y: 0 },
        insets: { top: 59, bottom: 34, left: 0, right: 0 },
      }}
    >
      {children}
    </SafeAreaProvider>
  );
}
jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({ month: mockMonth }),
}));
jest.mock("@/application/remuneration-provider", () => ({
  useRemunerationData: () => mockHistory,
}));
jest.mock("@/application/pflegeshift-provider", () => ({
  usePflegeShiftEntries: () => ({ entries: mockEntries }),
  usePflegeShiftProfile: () => ({ profile: mockProfile }),
  usePflegeShiftStatus: () => ({ ready: mockReady, error: mockError, reload: mockReload }),
}));
jest.mock("@/theme/palette", () => ({ usePalette: () => mockPalette }));
jest.mock("@/ui/haptics", () => ({ successFeedback: jest.fn() }));
const record: SavedOvertimeAllocation = {
  shiftId: service.id,
  shiftRevision: service.revision,
  timeZone: work.timeZone,
  allocations: [
    { date: "2026-09-30", minutes: 20 },
    { date: "2026-10-01", minutes: 40 },
  ],
  revision: 1,
  confirmedAt: work.updatedAt,
  updatedAt: work.updatedAt,
};
beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  mockMonth = "2026-10";
  mockEntries = [service];
  mockProfile = work;
  mockReady = true;
  mockError = null;
  mockPalette = LIGHT_PALETTE;
  mockReload.mockResolvedValue(undefined);
  mockHistory = {
    status: "ready",
    error: null,
    profiles: [],
    allowanceDecisions: [],
    overtimeAllocations: [],
    paidAbsences: [],
    actualAnnualPayments: [],
    tariffAnnualClaims: [],
    tvlShiftWork: [],
    caritasMonthFacts: [],
    tvoedAnnexAMonthConfirmations: [],
    drkEmployeeMonthConfirmations: [],
    drkTrainingMonthConfirmations: [],
    tvoedAnnexAPremiumFacts: [],
    tvoedSueMonthConfirmations: [],
    tvoedSueAllowanceConfirmations: [],
    saveTvlShiftWork: jest.fn<ReturnType<typeof useRemunerationData>["saveTvlShiftWork"]>(),
    saveTvoedAnnexAMonthConfirmation:
      jest.fn<ReturnType<typeof useRemunerationData>["saveTvoedAnnexAMonthConfirmation"]>(),
    saveDrkEmployeeMonthConfirmation:
      jest.fn<ReturnType<typeof useRemunerationData>["saveDrkEmployeeMonthConfirmation"]>(),
    saveDrkTrainingMonthConfirmation:
      jest.fn<ReturnType<typeof useRemunerationData>["saveDrkTrainingMonthConfirmation"]>(),
    saveTvoedAnnexAPremiumFacts:
      jest.fn<ReturnType<typeof useRemunerationData>["saveTvoedAnnexAPremiumFacts"]>(),
    saveTvoedSueMonthConfirmation:
      jest.fn<ReturnType<typeof useRemunerationData>["saveTvoedSueMonthConfirmation"]>(),
    saveTvoedSueAllowanceConfirmation:
      jest.fn<ReturnType<typeof useRemunerationData>["saveTvoedSueAllowanceConfirmation"]>(),
    saveCaritasMonthFacts:
      jest.fn<ReturnType<typeof useRemunerationData>["saveCaritasMonthFacts"]>(),
    saveTariffAnnualClaim:
      jest.fn<ReturnType<typeof useRemunerationData>["saveTariffAnnualClaim"]>(),
    revokeTariffAnnualClaim:
      jest.fn<ReturnType<typeof useRemunerationData>["revokeTariffAnnualClaim"]>(),
    saveActualAnnualPayment:
      jest.fn<ReturnType<typeof useRemunerationData>["saveActualAnnualPayment"]>(),
    revokeActualAnnualPayment:
      jest.fn<ReturnType<typeof useRemunerationData>["revokeActualAnnualPayment"]>(),
    savePaidAbsence: jest.fn<ReturnType<typeof useRemunerationData>["savePaidAbsence"]>(),
    reload: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    saveProfile: jest.fn<ReturnType<typeof useRemunerationData>["saveProfile"]>(),
    saveAllowanceDecisions:
      jest.fn<ReturnType<typeof useRemunerationData>["saveAllowanceDecisions"]>(),
    saveOvertimeAllocation: jest
      .fn<ReturnType<typeof useRemunerationData>["saveOvertimeAllocation"]>()
      .mockImplementation(async (input) => {
        const saved = {
          ...record,
          allocations: input.allocations,
          revision: input.expectedRevision + 1,
        };
        mockHistory = { ...mockHistory, overtimeAllocations: [saved] };
        return saved;
      }),
  };
});
async function open() {
  const screen = await render(<OvertimeAllocationScreen />, { wrapper: TestContext });
  await fireEvent.press(screen.getByRole("button", { name: /30.09.2026.*Nacht/ }));
  return screen;
}
async function fill(screen: Awaited<ReturnType<typeof open>>) {
  await fireEvent.changeText(screen.getByLabelText("30.09.2026 · Minuten"), "20");
  await fireEvent.changeText(screen.getByLabelText("01.10.2026 · Minuten"), "40");
}
describe("overtime allocation screen", () => {
  it.each([undefined, "2026-13", ["2026-09", "2026-10"]])(
    "rejects invalid/missing routes: %j",
    async (month) => {
      mockMonth = month;
      const screen = await render(<OvertimeAllocationScreen />, { wrapper: TestContext });
      expect(screen.getByText("Der Link enthält keinen gültigen Monat.")).toBeTruthy();
      expect(screen.queryByTestId("overtime-allocation-list")).toBeNull();
      await fireEvent.press(screen.getByRole("button", { name: "Schließen" }));
      expect(router.back).toHaveBeenCalled();
      expect(mockHistory.saveOvertimeAllocation).not.toHaveBeenCalled();
    },
  );
  it("distinguishes loading, failed and successfully empty snapshots", async () => {
    mockHistory = { ...mockHistory, status: "loading" };
    const screen = await render(<OvertimeAllocationScreen />, { wrapper: TestContext });
    expect(screen.queryByTestId("overtime-allocation-list")).toBeNull();
    mockHistory = { ...mockHistory, status: "error", error: "Lesefehler" };
    await screen.rerender(<OvertimeAllocationScreen />);
    expect(screen.getByText("Lesefehler")).toBeTruthy();
    mockHistory = { ...mockHistory, status: "ready", error: null };
    mockEntries = [];
    await screen.rerender(<OvertimeAllocationScreen />);
    expect(screen.getByText(/Keine bestätigten Überstunden/)).toBeTruthy();
  });
  it("validates before writing, saves both days once and offers visible keyboard dismissal", async () => {
    const dismiss = jest.spyOn(Keyboard, "dismiss");
    const screen = await open();
    await fireEvent.press(screen.getByRole("button", { name: "Aufteilung bestätigen" }));
    expect(screen.getByText(/Bitte für jeden Diensttag ganze Minuten/)).toBeTruthy();
    expect(mockHistory.saveOvertimeAllocation).not.toHaveBeenCalled();
    await fill(screen);
    await fireEvent.press(screen.getByRole("button", { name: "Tastatur schließen" }));
    expect(dismiss).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Aufteilung bestätigen" }));
    await waitFor(() => expect(screen.getByText("Tagesaufteilung gespeichert.")).toBeTruthy());
    expect(mockHistory.saveOvertimeAllocation).toHaveBeenCalledWith({
      shiftId: service.id,
      expectedShiftRevision: service.revision,
      expectedRevision: 0,
      timeZone: work.timeZone,
      allocations: record.allocations,
    });
    expect(mockHistory.saveProfile).not.toHaveBeenCalled();
  });
  it.each(["shift", "timezone", "confirmation"] as const)(
    "preserves the draft and blocks a changed %s",
    async (kind) => {
      const screen = await open();
      await fill(screen);
      if (kind === "shift") mockEntries = [{ ...service, revision: 2 }];
      if (kind === "timezone") mockProfile = { ...work, timeZone: "Europe/London" };
      if (kind === "confirmation") mockHistory = { ...mockHistory, overtimeAllocations: [record] };
      await screen.rerender(<OvertimeAllocationScreen />);
      expect(screen.getByText(/haben sich geändert/)).toBeTruthy();
      expect(screen.getByLabelText("30.09.2026 · Minuten").props.value).toBe("20");
      await fireEvent.press(screen.getByRole("button", { name: "Aufteilung bestätigen" }));
      expect(mockHistory.saveOvertimeAllocation).not.toHaveBeenCalled();
      await fireEvent.press(screen.getByRole("button", { name: "Aktuellen Stand laden" }));
      expect(mockReload).toHaveBeenCalled();
    },
  );
  it("requires explicit confirmation for stale values and explicit permission to clear them", async () => {
    mockHistory = { ...mockHistory, overtimeAllocations: [{ ...record, shiftRevision: 9 }] };
    const alert = jest.spyOn(Alert, "alert");
    const screen = await open();
    expect(screen.getByLabelText("30.09.2026 · Minuten").props.value).toBe("");
    await fireEvent.press(screen.getByRole("button", { name: "Aufteilung aufheben" }));
    expect(mockHistory.saveOvertimeAllocation).not.toHaveBeenCalled();
    const confirm = alert.mock.calls[0][2]!.find((item) => item.style === "destructive")!;
    await act(async () => {
      confirm.onPress?.();
    });
    await waitFor(() =>
      expect(mockHistory.saveOvertimeAllocation).toHaveBeenCalledWith({
        shiftId: service.id,
        expectedShiftRevision: service.revision,
        timeZone: work.timeZone,
        expectedRevision: 1,
        allocations: null,
      }),
    );
    expect(screen.getByText(/Aufteilung aufgehoben/)).toBeTruthy();
  });
  it("retains inputs after a revision conflict without leaking technical error data", async () => {
    jest.mocked(mockHistory.saveOvertimeAllocation).mockRejectedValueOnce(new ConcurrencyError());
    const screen = await open();
    await fill(screen);
    await fireEvent.press(screen.getByRole("button", { name: "Aufteilung bestätigen" }));
    await waitFor(() => expect(screen.getByText(/zwischenzeitlich geändert/)).toBeTruthy());
    expect(screen.getByLabelText("01.10.2026 · Minuten").props.value).toBe("40");
    jest.mocked(mockHistory.saveOvertimeAllocation).mockRejectedValueOnce(new Error("private SQL"));
    await fireEvent.press(screen.getByRole("button", { name: "Aufteilung bestätigen" }));
    await waitFor(() => expect(screen.getByText(/Speichern fehlgeschlagen/)).toBeTruthy());
    expect(screen.queryByText(/private SQL/)).toBeNull();
  });
  it("separates a committed write from failed refresh", async () => {
    jest.mocked(mockHistory.saveOvertimeAllocation).mockImplementationOnce(async () => {
      mockHistory = { ...mockHistory, status: "error", error: "Neuladen fehlgeschlagen" };
      return record;
    });
    const screen = await open();
    await fill(screen);
    await fireEvent.press(screen.getByRole("button", { name: "Aufteilung bestätigen" }));
    await waitFor(() => expect(screen.getByText("Tagesaufteilung gespeichert.")).toBeTruthy());
    expect(screen.getByText("Neuladen fehlgeschlagen")).toBeTruthy();
    expect(screen.queryByText(/Speichern fehlgeschlagen/)).toBeNull();
  });
  it("locks concurrent presses and ignores late completion after unmount", async () => {
    let resolve!: (value: SavedOvertimeAllocation) => void;
    jest.mocked(mockHistory.saveOvertimeAllocation).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const screen = await open();
    await fill(screen);
    const button = screen.getByRole("button", { name: "Aufteilung bestätigen" });
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(mockHistory.saveOvertimeAllocation).toHaveBeenCalledTimes(1);
    await screen.unmount();
    await act(async () => resolve(record));
    expect(successFeedback).not.toHaveBeenCalled();
  });
  it.each([LIGHT_PALETTE, DARK_PALETTE])(
    "uses current theme and untruncated accessible fields %#",
    async (palette) => {
      mockPalette = palette;
      jest
        .spyOn(
          jest.requireActual<typeof import("react-native")>("react-native"),
          "useWindowDimensions",
        )
        .mockReturnValue({ width: 430, height: 932, scale: 3, fontScale: 2.8 });
      const screen = await open();
      const field = screen.getByLabelText("30.09.2026 · Minuten");
      expect(StyleSheet.flatten(field.props.style).color).toBe(palette.text);
      expect(field.props.accessibilityHint).toContain("höchstens 60");
      expect(field.props.numberOfLines).toBeUndefined();
      expect(screen.getByRole("button", { name: "Tastatur schließen" })).toBeTruthy();
    },
  );
});
