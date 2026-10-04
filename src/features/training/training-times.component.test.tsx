import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { ActionSheetIOS, Keyboard } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { PropsWithChildren } from "react";
import type { useTrainingData } from "@/application/training-provider";
import type { SavedShiftTraining, ShiftTrainingData } from "@/domain/training-data";
import type { CalendarEntry } from "@/domain/types";
import { ConcurrencyError } from "@/domain/errors";
import { shift as fixture, work as mockWork } from "@/engine/remuneration-test-fixtures";
import { LIGHT_PALETTE, DARK_PALETTE } from "@/theme/palette-values";
import { TrainingTimesScreen } from "./training-times-screen";
import { TrainingTimesForm, type TrainingTimesSession } from "./training-times-form";
import { pauseTotal } from "./training-times-model";

const shift = fixture({
  date: "2026-09-15",
  title: "Schule",
  type: "TRAINING",
  startTime: "08:00",
  endTime: "15:00",
  breakMinutes: 30,
});
let mockHistory: ReturnType<typeof useTrainingData>,
  mockPalette = LIGHT_PALETTE;
let mockEntries: readonly CalendarEntry[],
  mockRootError: string | null,
  mockSelection = "";
const mockReload = jest.fn<() => Promise<void>>(),
  mockSetMonth = jest.fn();
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock("@/application/training-provider", () => ({ useTrainingData: () => mockHistory }));
jest.mock("@/application/pflegeshift-provider", () => ({
  usePflegeShiftProfile: () => ({ profile: mockWork }),
  usePflegeShiftStatus: () => ({ ready: true, error: mockRootError, reload: mockReload }),
  usePflegeShiftEntries: () => ({ entries: mockEntries }),
}));
jest.mock("@/navigation/active-month", () => ({
  useActiveMonth: () => "2026-09",
  useActiveMonthCoordinator: () => ({ setMonth: mockSetMonth }),
}));
jest.mock("@/theme/palette", () => ({ usePalette: () => mockPalette }));
jest.mock("@/ui/haptics", () => ({ selectionFeedback: jest.fn(), successFeedback: jest.fn() }));
function Wrapper({ children }: PropsWithChildren) {
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
const session = (): TrainingTimesSession => ({ shift, saved: null, timeZone: mockWork.timeZone });
const saved = (data: ShiftTrainingData): SavedShiftTraining => ({
  shiftId: shift.id,
  shiftRevision: shift.revision,
  shiftDate: shift.date,
  shiftUpdatedAt: shift.updatedAt,
  timeZone: mockWork.timeZone,
  data,
  revision: 1,
  updatedAt: shift.updatedAt,
});
type UI = Awaited<ReturnType<typeof render>>;
async function choose(ui: UI, button: string, option: string) {
  mockSelection = option;
  await fireEvent.press(ui.getByRole("button", { name: button }));
}
async function pressSave(ui: UI) {
  await fireEvent.press(ui.getByRole("button", { name: "Zeiten und Pausensumme speichern" }));
}
beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  mockPalette = LIGHT_PALETTE;
  mockRootError = null;
  mockSelection = "";
  mockEntries = [shift];
  mockReload.mockResolvedValue(undefined);
  jest.spyOn(ActionSheetIOS, "showActionSheetWithOptions").mockImplementation((options, select) => {
    const index = options.options.indexOf(mockSelection);
    if (index >= 0) select(index);
  });
  mockHistory = {
    status: "ready",
    error: null,
    profiles: [],
    shifts: [],
    reload: mockReload,
    saveProfile: jest.fn<ReturnType<typeof useTrainingData>["saveProfile"]>(),
    saveShift: jest
      .fn<ReturnType<typeof useTrainingData>["saveShift"]>()
      .mockImplementation(async (input) => {
        const total = pauseTotal(input.data);
        const updated = {
          ...shift,
          breakMinutes: total ?? shift.breakMinutes,
          revision: shift.revision + (total !== null && total !== shift.breakMinutes ? 1 : 0),
          updatedAt: "2026-09-22T10:00:00Z",
        };
        const record = {
          ...saved(input.data),
          revision: input.expectedRevision + 1,
          shiftRevision: updated.revision,
          shiftUpdatedAt: updated.updatedAt,
        };
        mockEntries = [updated];
        mockHistory = { ...mockHistory, shifts: [record] };
        return record;
      }),
  };
});
describe("school and pause input", () => {
  it("opens timed entries without inferring facts from their title", async () => {
    const ui = await render(<TrainingTimesScreen />, { wrapper: Wrapper });
    expect(ui.getByText("08:00–15:00 · Optional ergänzen")).toBeTruthy();
    expect(mockHistory.saveShift).not.toHaveBeenCalled();
    await fireEvent.press(ui.getByRole("button", { name: /15.09.2026 · Schule/ }));
    expect(ui.getByRole("button", { name: "Schulzuordnung: Keine Schulzuordnung" })).toBeTruthy();
    expect(ui.getByRole("button", { name: "Pausenlage: Noch nicht erfasst" })).toBeTruthy();
    expect(ui.queryByLabelText("Unterrichtseinheit 1 Beginn")).toBeNull();
  });
  it("saves pauses, refreshes dependent views and reopens persisted times", async () => {
    const ui = await render(<TrainingTimesForm session={session()} onClose={() => {}} />, {
      wrapper: Wrapper,
    });
    await choose(ui, "Pausenlage: Noch nicht erfasst", "Pausenintervalle erfassen");
    await fireEvent.changeText(ui.getByLabelText("Pause 1 Beginn"), "10:00");
    await fireEvent.changeText(ui.getByLabelText("Pause 1 Ende"), "10:15");
    expect(ui.getByText(/15 Min. Pause im Dienst übernommen/)).toBeTruthy();
    await pressSave(ui);
    await waitFor(() =>
      expect(mockHistory.saveShift).toHaveBeenCalledWith(
        expect.objectContaining({
          synchronizeBreakMinutes: true,
          expectedRevision: 0,
          expectedShiftRevision: 1,
          data: {
            version: 1,
            school: null,
            pauses: [{ start: "2026-09-15T08:00:00Z", end: "2026-09-15T08:15:00Z" }],
          },
        }),
      ),
    );
    expect(mockReload).toHaveBeenCalled();
    expect(ui.getByText(/Zeiten gespeichert/)).toBeTruthy();
    await ui.unmount();
    const reopened = await render(
      <TrainingTimesForm
        session={{
          shift: mockEntries[0] as typeof shift,
          saved: mockHistory.shifts[0],
          timeZone: mockWork.timeZone,
        }}
        onClose={() => {}}
      />,
      { wrapper: Wrapper },
    );
    expect(reopened.getByLabelText("Pause 1 Beginn").props.value).toBe("10:00");
  });
  it("records school lessons, explicit zero travel and block dates", async () => {
    const ui = await render(<TrainingTimesForm session={session()} onClose={() => {}} />, {
      wrapper: Wrapper,
    });
    await choose(ui, "Schulzuordnung: Keine Schulzuordnung", "Als Berufsschule erfassen");
    await fireEvent.changeText(ui.getByLabelText("Unterrichtseinheit 1 Beginn"), "08:00");
    await fireEvent.changeText(ui.getByLabelText("Unterrichtseinheit 1 Ende"), "08:45");
    await fireEvent.changeText(ui.getByLabelText("Wegezeit Schule → Betrieb (Min.)"), "0");
    await choose(ui, "Blockunterricht: Kein Block zugeordnet", "Blockzeitraum erfassen");
    await fireEvent.changeText(ui.getByLabelText("Blockbeginn"), "14.09.2026");
    await fireEvent.changeText(ui.getByLabelText("Blockende"), "18.09.2026");
    await pressSave(ui);
    await waitFor(() =>
      expect(mockHistory.saveShift).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            version: 1,
            pauses: null,
            school: {
              lessons: [{ start: "2026-09-15T06:00:00Z", end: "2026-09-15T06:45:00Z" }],
              travelToWorkMinutes: 0,
              travelFromWorkMinutes: null,
              block: { startDate: "2026-09-14", endDate: "2026-09-18" },
            },
          },
        }),
      ),
    );
  });
  it("saves and reopens a located school route without inferring it from the service title", async () => {
    const ui = await render(<TrainingTimesForm session={session()} onClose={() => {}} />, {
      wrapper: Wrapper,
    });
    await choose(ui, "Schulzuordnung: Keine Schulzuordnung", "Als Berufsschule erfassen");
    await fireEvent.changeText(ui.getByLabelText("Unterrichtseinheit 1 Beginn"), "08:00");
    await fireEvent.changeText(ui.getByLabelText("Unterrichtseinheit 1 Ende"), "08:45");
    await fireEvent.changeText(ui.getByLabelText("Wegezeit Schule → Betrieb (Min.)"), "20");
    await choose(
      ui,
      "Schule → Betrieb zeitlich verortet: Noch nicht verortet",
      "Beginn und Ende erfassen",
    );
    await fireEvent.changeText(ui.getByLabelText("Weg Schule → Betrieb 1 Beginn"), "08:45");
    await fireEvent.changeText(ui.getByLabelText("Weg Schule → Betrieb 1 Ende"), "09:05");
    await fireEvent.changeText(ui.getByLabelText("Wegezeit Betrieb → Schule (Min.)"), "0");
    await pressSave(ui);
    await waitFor(() =>
      expect(mockHistory.saveShift).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            version: 3,
            school: expect.objectContaining({
              travelToWorkMinutes: 20,
              travelToWorkInterval: {
                start: "2026-09-15T06:45:00Z",
                end: "2026-09-15T07:05:00Z",
              },
              travelFromWorkInterval: null,
            }),
          }),
        }),
      ),
    );
    await ui.unmount();
    const reopened = await render(
      <TrainingTimesForm
        session={{
          shift: mockEntries[0] as typeof shift,
          saved: mockHistory.shifts[0],
          timeZone: mockWork.timeZone,
        }}
        onClose={() => {}}
      />,
      { wrapper: Wrapper },
    );
    expect(reopened.getByLabelText("Weg Schule → Betrieb 1 Beginn").props.value).toBe("08:45");
  });
  it("saves an explicitly classified final written exam without treating the title as evidence", async () => {
    const ui = await render(<TrainingTimesForm session={session()} onClose={() => {}} />, {
      wrapper: Wrapper,
    });
    expect(
      ui.getByRole("button", { name: "Prüfungszuordnung: Keine Prüfung zugeordnet" }),
    ).toBeTruthy();
    await choose(ui, "Prüfungszuordnung: Keine Prüfung zugeordnet", "Prüfung erfassen");
    await choose(
      ui,
      "Außerhalb der Ausbildungsstätte rechtlich oder vertraglich vorgeschrieben: Noch nicht geklärt",
      "Ja, bestätigt",
    );
    await choose(ui, "Schriftliche Abschlussprüfung: Noch nicht geklärt", "Ja, bestätigt");
    await fireEvent.changeText(
      ui.getByLabelText("Unmittelbar vorausgehender Arbeitstag"),
      "14.09.2026",
    );
    await fireEvent.changeText(ui.getByLabelText("Teilnahmezeit 1 Beginn"), "08:00");
    await fireEvent.changeText(ui.getByLabelText("Teilnahmezeit 1 Ende"), "10:00");
    await fireEvent.changeText(
      ui.getByLabelText("Notwendiger Weg Teilnahmeort → Betrieb (Min.)"),
      "0",
    );
    await pressSave(ui);
    await waitFor(() =>
      expect(mockHistory.saveShift).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            version: 2,
            pauses: null,
            school: null,
            exam: {
              kind: "EXAM",
              requiredByRuleOrContract: true,
              finalWritten: true,
              precedingWorkDate: "2026-09-14",
              participation: [{ start: "2026-09-15T06:00:00Z", end: "2026-09-15T08:00:00Z" }],
              travelToWorkMinutes: 0,
              travelFromWorkMinutes: null,
            },
          },
        }),
      ),
    );
    expect(ui.getByText(/gesetzliche Prüfungsbewertung ist noch nicht freigegeben/)).toBeTruthy();
  });
  it("saves a located examination route and reopens its exact time window", async () => {
    const ui = await render(<TrainingTimesForm session={session()} onClose={() => {}} />, {
      wrapper: Wrapper,
    });
    await choose(ui, "Prüfungszuordnung: Keine Prüfung zugeordnet", "Prüfung erfassen");
    await fireEvent.changeText(ui.getByLabelText("Teilnahmezeit 1 Beginn"), "08:00");
    await fireEvent.changeText(ui.getByLabelText("Teilnahmezeit 1 Ende"), "10:00");
    await fireEvent.changeText(
      ui.getByLabelText("Notwendiger Weg Teilnahmeort → Betrieb (Min.)"),
      "20",
    );
    await choose(
      ui,
      "Teilnahmeort → Betrieb zeitlich verortet: Noch nicht verortet",
      "Beginn und Ende erfassen",
    );
    await fireEvent.changeText(ui.getByLabelText("Weg Teilnahmeort → Betrieb 1 Beginn"), "10:00");
    await fireEvent.changeText(ui.getByLabelText("Weg Teilnahmeort → Betrieb 1 Ende"), "10:20");
    await fireEvent.changeText(
      ui.getByLabelText("Notwendiger Weg Betrieb → Teilnahmeort (Min.)"),
      "0",
    );
    await pressSave(ui);
    await waitFor(() =>
      expect(mockHistory.saveShift).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            version: 3,
            exam: expect.objectContaining({
              travelToWorkMinutes: 20,
              travelToWorkInterval: {
                start: "2026-09-15T08:00:00Z",
                end: "2026-09-15T08:20:00Z",
              },
              travelFromWorkInterval: null,
            }),
          }),
        }),
      ),
    );
    await ui.unmount();
    const reopened = await render(
      <TrainingTimesForm
        session={{
          shift: mockEntries[0] as typeof shift,
          saved: mockHistory.shifts[0],
          timeZone: mockWork.timeZone,
        }}
        onClose={() => {}}
      />,
      { wrapper: Wrapper },
    );
    expect(reopened.getByLabelText("Weg Teilnahmeort → Betrieb 1 Beginn").props.value).toBe(
      "10:00",
    );
  });
  it("retains drafts after conflicts and offers keyboard dismissal", async () => {
    jest.mocked(mockHistory.saveShift).mockRejectedValue(new ConcurrencyError("Bitte neu laden."));
    const dismiss = jest.spyOn(Keyboard, "dismiss");
    const ui = await render(<TrainingTimesForm session={session()} onClose={() => {}} />, {
      wrapper: Wrapper,
    });
    await choose(ui, "Pausenlage: Noch nicht erfasst", "Keine Pause bestätigt");
    await fireEvent.press(ui.getByRole("button", { name: "Tastatur schließen" }));
    expect(dismiss).toHaveBeenCalled();
    await pressSave(ui);
    await waitFor(() => expect(ui.getByText("Bitte neu laden.")).toBeTruthy());
    expect(ui.getByRole("button", { name: "Pausenlage: Keine Pause bestätigt" })).toBeTruthy();
  });
  it("does not transfer stale intervals to a changed service", async () => {
    const old = saved({
        version: 1,
        school: null,
        pauses: [{ start: "2026-09-15T08:00:00Z", end: "2026-09-15T08:30:00Z" }],
      }),
      changed = { ...shift, revision: 2 };
    mockEntries = [changed];
    mockHistory = { ...mockHistory, shifts: [old] };
    const ui = await render(
      <TrainingTimesForm
        session={{ shift: changed, saved: old, timeZone: mockWork.timeZone }}
        onClose={() => {}}
      />,
      { wrapper: Wrapper },
    );
    expect(ui.getByText(/Frühere Zeiten werden nicht automatisch übernommen/)).toBeTruthy();
    expect(ui.getByRole("button", { name: "Pausenlage: Noch nicht erfasst" })).toBeTruthy();
  });
  it("blocks a service changed during editing", async () => {
    const current = session(),
      ui = await render(<TrainingTimesForm session={current} onClose={() => {}} />, {
        wrapper: Wrapper,
      });
    mockEntries = [{ ...shift, revision: 2 }];
    await ui.rerender(<TrainingTimesForm session={current} onClose={() => {}} />);
    await pressSave(ui);
    expect(mockHistory.saveShift).not.toHaveBeenCalled();
    expect(ui.getByText(/inzwischen geändert/)).toBeTruthy();
  });
  it.each([
    { startTime: "09:00" },
    { endTime: "16:00" },
    { breakMinutes: 45 },
    { type: "EARLY" as const },
  ])("retains drafts and blocks a same-revision restored service: %p", async (patch) => {
    const current = session(),
      ui = await render(<TrainingTimesForm session={current} onClose={() => {}} />, {
        wrapper: Wrapper,
      });
    await choose(ui, "Pausenlage: Noch nicht erfasst", "Pausenintervalle erfassen");
    await fireEvent.changeText(ui.getByLabelText("Pause 1 Beginn"), "10:00");
    await fireEvent.changeText(ui.getByLabelText("Pause 1 Ende"), "10:15");
    mockEntries = [{ ...shift, ...patch }];
    await ui.rerender(<TrainingTimesForm session={current} onClose={() => {}} />);
    await pressSave(ui);
    expect(mockHistory.saveShift).not.toHaveBeenCalled();
    expect(ui.getByText(/inzwischen geändert/)).toBeTruthy();
    expect(ui.getByLabelText("Pause 1 Beginn").props.value).toBe("10:00");
    expect(ui.getByLabelText("Pause 1 Ende").props.value).toBe("10:15");
    expect(
      ui.getByRole("button", { name: "Zeiten und Pausensumme speichern" }).props.accessibilityState
        .disabled,
    ).toBe(true);
  });
  it("keeps drafts across themes and rejects invalid input", async () => {
    const current = session(),
      ui = await render(<TrainingTimesForm session={current} onClose={() => {}} />, {
        wrapper: Wrapper,
      });
    await choose(ui, "Pausenlage: Noch nicht erfasst", "Pausenintervalle erfassen");
    await fireEvent.changeText(ui.getByLabelText("Pause 1 Beginn"), "25:00");
    mockPalette = DARK_PALETTE;
    await ui.rerender(<TrainingTimesForm session={current} onClose={() => {}} />);
    expect(ui.getByLabelText("Pause 1 Beginn").props.value).toBe("25:00");
    await pressSave(ui);
    expect(ui.getByText(/Uhrzeit bitte als HH:MM/)).toBeTruthy();
    expect(mockHistory.saveShift).not.toHaveBeenCalled();
  });
  it("navigates months and explains empty results", async () => {
    mockEntries = [];
    const ui = await render(<TrainingTimesScreen />, { wrapper: Wrapper });
    expect(ui.getByText(/Keine Einträge mit Uhrzeiten/)).toBeTruthy();
    await fireEvent.press(ui.getByRole("button", { name: /Nächster Monat/ }));
    expect(mockSetMonth).toHaveBeenCalledWith("2026-10");
  });
  it("suppresses duplicate writes", async () => {
    let finish!: (value: SavedShiftTraining) => void;
    jest.mocked(mockHistory.saveShift).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const ui = await render(<TrainingTimesForm session={session()} onClose={() => {}} />, {
      wrapper: Wrapper,
    });
    await pressSave(ui);
    await fireEvent.press(ui.getByRole("button", { name: /Wird gespeichert/ }));
    expect(mockHistory.saveShift).toHaveBeenCalledTimes(1);
    await act(async () => finish(saved({ version: 1, pauses: null, school: null })));
  });
});
