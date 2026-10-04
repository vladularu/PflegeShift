import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert, Keyboard } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { PropsWithChildren } from "react";
import { router } from "expo-router";
import type { useRemunerationData } from "@/application/remuneration-provider";
import type { CalendarEntry, UserProfile } from "@/domain/types";
import type { SavedPaidAbsence } from "@/domain/paid-absence";
import { ConcurrencyError } from "@/domain/errors";
import { shift, work, history as payHistory, resolver } from "@/engine/remuneration-test-fixtures";
import { calculateDatedMonthlyRemuneration } from "@/engine/remuneration-month";
import { LIGHT_PALETTE, DARK_PALETTE } from "@/theme/palette-values";
import { PaidAbsenceScreen } from "./paid-absence-screen";

const absence = shift({
  type: "VACATION",
  title: "Urlaub",
  allDay: true,
  startTime: null,
  endTime: null,
});
const record: SavedPaidAbsence = {
  shiftId: absence.id,
  shiftRevision: absence.revision,
  shiftDate: absence.date,
  shiftUpdatedAt: absence.updatedAt,
  timeZone: work.timeZone,
  paidMinutes: 462,
  revision: 1,
  confirmedAt: work.updatedAt,
  updatedAt: work.updatedAt,
};
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
beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  mockMonth = "2026-09";
  mockEntries = [absence];
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
    reload: mockReload,
    saveProfile: jest.fn<ReturnType<typeof useRemunerationData>["saveProfile"]>(),
    saveAllowanceDecisions:
      jest.fn<ReturnType<typeof useRemunerationData>["saveAllowanceDecisions"]>(),
    saveOvertimeAllocation:
      jest.fn<ReturnType<typeof useRemunerationData>["saveOvertimeAllocation"]>(),
    savePaidAbsence: jest
      .fn<ReturnType<typeof useRemunerationData>["savePaidAbsence"]>()
      .mockImplementation(async (input) => {
        const saved = {
          ...record,
          paidMinutes: input.paidMinutes,
          revision: input.expectedRevision + 1,
        };
        mockHistory = { ...mockHistory, paidAbsences: [saved] };
        return saved;
      }),
  };
});
async function open() {
  const screen = await render(<PaidAbsenceScreen />, { wrapper: TestContext });
  await fireEvent.press(screen.getByRole("button", { name: /15.09.2026.*Urlaub/ }));
  return screen;
}
describe("paid absence entry", () => {
  it.each([undefined, "2026-13", ["2026-09", "2026-10"]])(
    "rejects invalid route %j",
    async (month) => {
      mockMonth = month;
      const screen = await render(<PaidAbsenceScreen />, { wrapper: TestContext });
      expect(screen.getByText("Der Link enthält keinen gültigen Monat.")).toBeTruthy();
      expect(screen.queryByTestId("paid-absence-list")).toBeNull();
      await fireEvent.press(screen.getByRole("button", { name: "Schließen" }));
      expect(router.back).toHaveBeenCalled();
      expect(mockHistory.savePaidAbsence).not.toHaveBeenCalled();
    },
  );
  it("distinguishes loading, failure and a truly empty month", async () => {
    mockHistory = { ...mockHistory, status: "loading" };
    const screen = await render(<PaidAbsenceScreen />, { wrapper: TestContext });
    expect(screen.queryByTestId("paid-absence-list")).toBeNull();
    mockHistory = { ...mockHistory, status: "error", error: "Lesefehler" };
    await screen.rerender(<PaidAbsenceScreen />);
    expect(screen.getByText("Lesefehler")).toBeTruthy();
    mockHistory = { ...mockHistory, status: "ready", error: null };
    mockEntries = [];
    await screen.rerender(<PaidAbsenceScreen />);
    expect(screen.getByText("Keine Abwesenheiten in diesem Monat.")).toBeTruthy();
  });
  it("requires explicit hours and connects the confirmed time to the actual wage calculation", async () => {
    const dismiss = jest.spyOn(Keyboard, "dismiss");
    const screen = await open();
    expect(screen.getByLabelText("Bezahlte Zeit (Stunden:Minuten)").props.value).toBe("");
    await fireEvent.press(screen.getByRole("button", { name: "Bezahlte Zeit bestätigen" }));
    expect(mockHistory.savePaidAbsence).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("Bezahlte Zeit (Stunden:Minuten)"), "7:42");
    await fireEvent.press(screen.getByRole("button", { name: "Tastatur schließen" }));
    expect(dismiss).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Bezahlte Zeit bestätigen" }));
    expect(mockHistory.savePaidAbsence).toHaveBeenCalledWith({
      shiftId: absence.id,
      expectedShiftRevision: absence.revision,
      expectedShiftDate: absence.date,
      expectedShiftUpdatedAt: absence.updatedAt,
      timeZone: work.timeZone,
      expectedRevision: 0,
      paidMinutes: 462,
    });
    const calculation = calculateDatedMonthlyRemuneration({
      month: "2026-09",
      shifts: [absence],
      workProfile: work,
      resolver: resolver([]),
      allowanceEntitlements: [],
      history: [
        {
          ...payHistory(),
          data: {
            version: 2,
            weeklyMinutes: 1155,
            selection: {
              kind: "own-configured",
              configuration: {
                base: { kind: "hourly", centsPerHour: 2000 },
                percentageBasisHourlyCents: null,
                timePremiums: null,
                overtime: null,
                fixedAllowances: [],
                specialPayments: [],
              },
            },
          },
        },
      ],
      paidAbsences: mockHistory.paidAbsences,
    });
    expect(calculation.estimatedGrossCents).toBe(15400);
    expect(mockHistory.saveProfile).not.toHaveBeenCalled();
    expect(mockEntries).toEqual([absence]);
    await fireEvent.press(screen.getByRole("button", { name: "Zurück zur Auswahl" }));
    expect(screen.getByRole("button", { name: /7:42 h bestätigt/ })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: /7:42 h bestätigt/ }));
    expect(screen.getByLabelText("Bezahlte Zeit (Stunden:Minuten)").props.value).toBe("7:42");
  });
  it("distinguishes zero paid time and explicitly revoked confirmation", async () => {
    mockHistory = { ...mockHistory, paidAbsences: [{ ...record, paidMinutes: 0 }] };
    const alert = jest.spyOn(Alert, "alert");
    const screen = await open();
    expect(screen.getByLabelText("Bezahlte Zeit (Stunden:Minuten)").props.value).toBe("0:00");
    await fireEvent.press(screen.getByRole("button", { name: "Bestätigung aufheben" }));
    expect(mockHistory.savePaidAbsence).not.toHaveBeenCalled();
    await act(async () => {
      alert.mock.calls[0][2]!.find((item) => item.style === "destructive")!.onPress?.();
    });
    await waitFor(() =>
      expect(mockHistory.savePaidAbsence).toHaveBeenCalledWith(
        expect.objectContaining({ expectedRevision: 1, paidMinutes: null }),
      ),
    );
    expect(screen.getByLabelText("Bezahlte Zeit (Stunden:Minuten)").props.value).toBe("");
    await fireEvent.changeText(screen.getByLabelText("Bezahlte Zeit (Stunden:Minuten)"), "0:00");
    await fireEvent.press(screen.getByRole("button", { name: "Bezahlte Zeit bestätigen" }));
    expect(mockHistory.savePaidAbsence).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedRevision: 2, paidMinutes: 0 }),
    );
  });
  it.each(["entry", "timezone", "restore"] as const)(
    "retains the draft but blocks a changed %s",
    async (kind) => {
      const screen = await open();
      await fireEvent.changeText(screen.getByLabelText("Bezahlte Zeit (Stunden:Minuten)"), "7:42");
      if (kind === "entry") mockEntries = [{ ...absence, revision: 2 }];
      if (kind === "timezone") mockProfile = { ...work, timeZone: "Europe/London" };
      if (kind === "restore") mockHistory = { ...mockHistory, paidAbsences: [record] };
      await screen.rerender(<PaidAbsenceScreen />);
      expect(screen.getByText(/haben sich geändert/)).toBeTruthy();
      expect(screen.getByLabelText("Bezahlte Zeit (Stunden:Minuten)").props.value).toBe("7:42");
      await fireEvent.press(screen.getByRole("button", { name: "Bezahlte Zeit bestätigen" }));
      expect(mockHistory.savePaidAbsence).not.toHaveBeenCalled();
      await fireEvent.press(screen.getByRole("button", { name: "Aktuellen Stand laden" }));
      expect(mockReload).toHaveBeenCalled();
    },
  );
  it("does not prefill a stale confirmation after the entry has changed", async () => {
    mockHistory = { ...mockHistory, paidAbsences: [{ ...record, shiftRevision: 8 }] };
    const screen = await open();
    expect(screen.getByLabelText("Bezahlte Zeit (Stunden:Minuten)").props.value).toBe("");
  });
  it("keeps the draft on a revision conflict and hides internal errors", async () => {
    const screen = await open();
    await fireEvent.changeText(screen.getByLabelText("Bezahlte Zeit (Stunden:Minuten)"), "7:42");
    jest.mocked(mockHistory.savePaidAbsence).mockRejectedValueOnce(new ConcurrencyError());
    await fireEvent.press(screen.getByRole("button", { name: "Bezahlte Zeit bestätigen" }));
    expect(screen.getByText(/zwischenzeitlich geändert/)).toBeTruthy();
    expect(screen.getByLabelText("Bezahlte Zeit (Stunden:Minuten)").props.value).toBe("7:42");
    jest.mocked(mockHistory.savePaidAbsence).mockRejectedValueOnce(new Error("private SQL"));
    await fireEvent.press(screen.getByRole("button", { name: "Bezahlte Zeit bestätigen" }));
    expect(screen.getByText(/Speichern fehlgeschlagen/)).toBeTruthy();
    expect(screen.queryByText(/private SQL/)).toBeNull();
  });
  it("prevents duplicate writes and selection changes while saving", async () => {
    let finish!: (value: SavedPaidAbsence) => void;
    jest.mocked(mockHistory.savePaidAbsence).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const screen = await open();
    await fireEvent.changeText(screen.getByLabelText("Bezahlte Zeit (Stunden:Minuten)"), "7:42");
    await fireEvent.press(screen.getByRole("button", { name: "Bezahlte Zeit bestätigen" }));
    await fireEvent.press(screen.getByRole("button", { name: /speicher/i }));
    await fireEvent.press(screen.getByRole("button", { name: "Zurück zur Auswahl" }));
    expect(screen.getByTestId("paid-absence-form")).toBeTruthy();
    expect(mockHistory.savePaidAbsence).toHaveBeenCalledTimes(1);
    await act(async () => {
      mockHistory = { ...mockHistory, paidAbsences: [record] };
      finish(record);
    });
    expect(screen.getByText("Bezahlte Abwesenheitszeit gespeichert.")).toBeTruthy();
  });
  it("keeps the input while switching themes and after a committed write with failed reload", async () => {
    const screen = await open();
    await fireEvent.changeText(screen.getByLabelText("Bezahlte Zeit (Stunden:Minuten)"), "7:42");
    for (const palette of [DARK_PALETTE, LIGHT_PALETTE]) {
      mockPalette = palette;
      await screen.rerender(<PaidAbsenceScreen />);
      expect(screen.getByLabelText("Bezahlte Zeit (Stunden:Minuten)").props.value).toBe("7:42");
    }
    jest.mocked(mockHistory.savePaidAbsence).mockImplementationOnce(async () => {
      mockHistory = { ...mockHistory, status: "error", error: "Neuladen fehlgeschlagen" };
      return record;
    });
    await fireEvent.press(screen.getByRole("button", { name: "Bezahlte Zeit bestätigen" }));
    expect(screen.getByText("Bezahlte Abwesenheitszeit gespeichert.")).toBeTruthy();
    expect(screen.getByText("Neuladen fehlgeschlagen")).toBeTruthy();
  });
});
