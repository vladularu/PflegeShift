import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { ActionSheetIOS, Keyboard } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { PropsWithChildren } from "react";
import type { useTrainingData } from "@/application/training-provider";
import type { SavedTrainingProfile, TrainingProfileData } from "@/domain/training-data";
import type { CalendarEntry } from "@/domain/types";
import { ConcurrencyError } from "@/domain/errors";
import { work as mockWork } from "@/engine/remuneration-test-fixtures";
import { LIGHT_PALETTE, DARK_PALETTE } from "@/theme/palette-values";
import { TrainingScreen } from "./training-screen";
import { TrainingProfileForm } from "./training-profile-form";
import { service } from "@/engine/youth-test-fixtures";

const profile: TrainingProfileData = {
  version: 1,
  effectiveFrom: "2026-09-01",
  birthDate: "2009-01-02",
  status: "training",
  fullTimeCompulsorySchooling: false,
  training: {
    profession: "Pflegefachperson",
    legalBasis: "PFLBG",
    startedOn: "2026-09-01",
    expectedEndOn: "2029-08-31",
    year: 1,
    yearConfirmedFrom: "2026-09-01",
    shorteningMonths: null,
  },
};
const saved: SavedTrainingProfile = {
  data: profile,
  revision: 1,
  updatedAt: "2026-09-01T00:00:00Z",
};
let mockHistory: ReturnType<typeof useTrainingData>,
  mockPalette = LIGHT_PALETTE;
let mockEntries: CalendarEntry[] = [];
let mockRootError: string | null = null;
let mockSelection = "";
const mockReload = jest.fn<() => Promise<void>>();
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock("@/application/training-provider", () => ({ useTrainingData: () => mockHistory }));
jest.mock("@/application/pflegeshift-provider", () => ({
  usePflegeShiftEntries: () => ({ entries: mockEntries }),
  usePflegeShiftProfile: () => ({ profile: mockWork }),
  usePflegeShiftStatus: () => ({ ready: true, error: mockRootError, reload: mockReload }),
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
beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  mockPalette = LIGHT_PALETTE;
  mockRootError = null;
  mockSelection = "";
  mockEntries = [];
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
    saveProfile: jest
      .fn<ReturnType<typeof useTrainingData>["saveProfile"]>()
      .mockImplementation(async (input) => {
        const record = {
          data: input.data,
          revision: input.expectedRevision + 1,
          updatedAt: "2026-09-22T10:00:00Z",
        };
        mockHistory = {
          ...mockHistory,
          profiles: [
            ...mockHistory.profiles.filter(
              (p) => p.data.effectiveFrom !== record.data.effectiveFrom,
            ),
            record,
          ],
        };
        return record;
      }),
    saveShift: jest.fn<ReturnType<typeof useTrainingData>["saveShift"]>(),
  };
});
describe("training profile input flow", () => {
  it("confirms one current extra training event in a recorded school block", async () => {
    const school = service("2026-09-14", "08:00", "13:00", [], true);
    const extra = service("2026-09-17", "14:00", "16:00", []);
    const schoolDetails = {
      ...school.details,
      data: {
        ...school.details.data,
        school: {
          lessons: [{ start: "2026-09-14T06:00:00Z", end: "2026-09-14T11:00:00Z" }],
          travelToWorkMinutes: 0,
          travelFromWorkMinutes: 0,
          block: { startDate: "2026-09-14", endDate: "2026-09-18" },
        },
      },
    };
    mockEntries = [school.entry, extra.entry];
    mockHistory = { ...mockHistory, shifts: [schoolDetails, extra.details] };
    const ui = await render(
      <TrainingProfileForm session={{ seed: profile, saved: null }} onClose={() => {}} />,
      { wrapper: Wrapper },
    );
    await fireEvent.press(ui.getByRole("button", { name: "Angaben zur Jugendprüfung ergänzen" }));
    mockSelection = `17.09.2026 · ${extra.entry.title} · 14:00–16:00`;
    await fireEvent.press(
      ui.getByRole("button", { name: "Dienst im bestätigten Schulblock: Bitte Dienst wählen" }),
    );
    mockSelection = "Ja, für diesen Dienst bestätigt";
    await fireEvent.press(
      ui.getByRole("button", {
        name: "War dies eine zusätzliche betriebliche Ausbildungsveranstaltung?: Nicht bestätigt",
      }),
    );
    await fireEvent.press(ui.getByRole("button", { name: "Ausbildungsprofil speichern" }));
    await waitFor(() =>
      expect(mockHistory.saveProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            youth: expect.objectContaining({
              blockTrainingShiftIds: [expect.stringContaining("youth-block-v1")],
            }),
          }),
        }),
      ),
    );
    const storedData = mockHistory.profiles[0]!.data;
    const binding = storedData.version === 2 ? storedData.youth?.blockTrainingShiftIds[0] : null;
    expect(binding).not.toBe(extra.entry.id);
    await ui.unmount();
    const record = mockHistory.profiles[0]!;
    const reopened = await render(
      <TrainingProfileForm session={{ seed: record.data, saved: record }} onClose={() => {}} />,
      { wrapper: Wrapper },
    );
    mockSelection = `17.09.2026 · ${extra.entry.title} · 14:00–16:00`;
    await fireEvent.press(
      reopened.getByRole("button", {
        name: "Dienst im bestätigten Schulblock: Bitte Dienst wählen",
      }),
    );
    expect(
      reopened.getByRole("button", {
        name: "War dies eine zusätzliche betriebliche Ausbildungsveranstaltung?: Ja, für diesen Dienst bestätigt",
      }),
    ).toBeTruthy();
  });
  it("saves, reopens and withdraws explicit day facts in light and dark mode", async () => {
    const ui = await render(
      <TrainingProfileForm session={{ seed: profile, saved: null }} onClose={() => {}} />,
      { wrapper: Wrapper },
    );
    await fireEvent.press(ui.getByRole("button", { name: "Angaben zur Jugendprüfung ergänzen" }));
    await fireEvent.changeText(ui.getByLabelText("Datum der Tagesangabe"), "14.09.2026");
    await fireEvent.press(ui.getByRole("button", { name: "Tagesangabe vormerken" }));
    mockSelection = "Arbeitsausfall am Feiertag";
    await fireEvent.press(
      ui.getByRole("button", {
        name: "Tagesbezogene Bestätigung: Verkürzter Arbeitstag",
      }),
    );
    await fireEvent.changeText(ui.getByLabelText("Datum der Tagesangabe"), "03.10.2026");
    await fireEvent.changeText(
      ui.getByLabelText("Tatsächlich ausgefallene Arbeitszeit (Minuten)"),
      "0",
    );
    await fireEvent.press(ui.getByRole("button", { name: "Tagesangabe vormerken" }));
    await fireEvent.press(ui.getByRole("button", { name: "Ausbildungsprofil speichern" }));
    await waitFor(() =>
      expect(mockHistory.saveProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            youth: expect.objectContaining({
              shortenedWorkingDays: ["2026-09-14"],
              holidayLostMinutes: { "2026-10-03": 0 },
            }),
          }),
        }),
      ),
    );
    await ui.unmount();
    mockPalette = DARK_PALETTE;
    const record = mockHistory.profiles[0]!;
    const reopened = await render(
      <TrainingProfileForm session={{ seed: record.data, saved: record }} onClose={() => {}} />,
      { wrapper: Wrapper },
    );
    expect(reopened.getByText(/1 verkürzte Tage und 1 Feiertagsangaben/)).toBeTruthy();
    mockSelection = "Arbeitsausfall am Feiertag";
    await fireEvent.press(
      reopened.getByRole("button", {
        name: "Tagesbezogene Bestätigung: Verkürzter Arbeitstag",
      }),
    );
    await fireEvent.changeText(reopened.getByLabelText("Datum der Tagesangabe"), "03.10.2026");
    expect(reopened.getByText(/0 Minuten Feiertagsausfall vorgemerkt/)).toBeTruthy();
    await fireEvent.press(
      reopened.getByRole("button", { name: "Tagesangabe für dieses Datum entfernen" }),
    );
    await fireEvent.press(reopened.getByRole("button", { name: "Ausbildungsprofil speichern" }));
    await waitFor(() =>
      expect(mockHistory.saveProfile).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            youth: expect.objectContaining({
              shortenedWorkingDays: ["2026-09-14"],
              holidayLostMinutes: {},
            }),
          }),
        }),
      ),
    );
  });
  it("saves explicit youth facts while leaving untouched facts unknown", async () => {
    const ui = await render(
      <TrainingProfileForm session={{ seed: profile, saved: null }} onClose={() => {}} />,
      { wrapper: Wrapper },
    );
    await fireEvent.press(ui.getByRole("button", { name: "Angaben zur Jugendprüfung ergänzen" }));
    mockSelection = "Ja";
    await fireEvent.press(
      ui.getByRole("button", { name: "Krankenhaus oder Pflegeeinrichtung: Noch nicht geklärt" }),
    );
    await fireEvent.changeText(
      ui.getByLabelText("Durchschnittliche tägliche Ausbildungszeit (Minuten)"),
      "462",
    );
    await fireEvent.changeText(
      ui.getByLabelText("Durchschnittliche wöchentliche Ausbildungszeit (Minuten)"),
      "2310",
    );
    await fireEvent.press(ui.getByRole("button", { name: "Ausbildungsprofil speichern" }));
    await waitFor(() =>
      expect(mockHistory.saveProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            version: 2,
            youth: expect.objectContaining({
              careInstitution: true,
              medicalEmergencyService: null,
              otherExceptions: null,
              averageDailyTrainingMinutes: 462,
              averageWeeklyTrainingMinutes: 2310,
            }),
          }),
        }),
      ),
    );
    await ui.unmount();
    const record = mockHistory.profiles[0]!;
    const reopened = await render(
      <TrainingProfileForm session={{ seed: record.data, saved: record }} onClose={() => {}} />,
      { wrapper: Wrapper },
    );
    expect(
      reopened.getByLabelText("Durchschnittliche wöchentliche Ausbildungszeit (Minuten)").props
        .value,
    ).toBe("2310");
    expect(
      reopened.getByRole("button", { name: "Krankenhaus oder Pflegeeinrichtung: Ja" }),
    ).toBeTruthy();
  });
  it("opens from an empty history without assuming a birthday, training or legal basis", async () => {
    const ui = await render(<TrainingScreen />, { wrapper: Wrapper });
    await fireEvent.press(ui.getByRole("button", { name: "Angaben erfassen" }));
    expect(ui.getByLabelText("Geburtsdatum (optional)").props.value).toBe("");
    expect(
      ui.getByRole("button", { name: "Beschäftigungsstatus: Noch nicht angegeben" }),
    ).toBeTruthy();
    expect(ui.queryByLabelText("Ausbildungsberuf")).toBeNull();
    mockSelection = "Ausbildung";
    await fireEvent.press(
      ui.getByRole("button", { name: "Beschäftigungsstatus: Noch nicht angegeben" }),
    );
    expect(ui.getByLabelText("Ausbildungsberuf")).toBeTruthy();
    expect(
      ui.getByRole("button", { name: "Ausbildungsgrundlage: Noch nicht geklärt" }),
    ).toBeTruthy();
  });
  it("saves all personal fields and reopens the exact saved profile", async () => {
    const close = jest.fn();
    const ui = await render(
      <TrainingProfileForm session={{ seed: profile, saved: null }} onClose={close} />,
      { wrapper: Wrapper },
    );
    await fireEvent.changeText(ui.getByLabelText("Verkürzung in Monaten (optional)"), "6");
    await fireEvent.press(ui.getByRole("button", { name: "Ausbildungsprofil speichern" }));
    await waitFor(() =>
      expect(
        ui.getByText("Ausbildungsprofil gespeichert. Der Tarif bleibt unverändert."),
      ).toBeTruthy(),
    );
    expect(mockHistory.saveProfile).toHaveBeenCalledWith({
      expectedRevision: 0,
      data: { ...profile, training: { ...profile.training, shorteningMonths: 6 } },
    });
    expect(ui.getByLabelText("Gültig ab").props.editable).toBe(false);
    await ui.unmount();
    const record = mockHistory.profiles[0]!;
    const reopened = await render(
      <TrainingProfileForm session={{ seed: record.data, saved: record }} onClose={close} />,
      { wrapper: Wrapper },
    );
    expect(reopened.getByLabelText("Verkürzung in Monaten (optional)").props.value).toBe("6");
  });
  it("edits selected history with its revision rather than overwriting another date", async () => {
    mockHistory = { ...mockHistory, profiles: [saved] };
    const ui = await render(<TrainingScreen />, { wrapper: Wrapper });
    mockSelection = "Ab 01.09.2026 · Ausbildung";
    await fireEvent.press(
      ui.getByRole("button", { name: "Ausbildungsstand: Neuen Stand anlegen" }),
    );
    await fireEvent.press(ui.getByRole("button", { name: "Stand bearbeiten" }));
    await fireEvent.changeText(ui.getByLabelText("Ausbildungsberuf"), "Pflegefachfrau");
    await fireEvent.press(ui.getByRole("button", { name: "Ausbildungsprofil speichern" }));
    await waitFor(() =>
      expect(mockHistory.saveProfile).toHaveBeenCalledWith(
        expect.objectContaining({ expectedRevision: 1 }),
      ),
    );
  });
  it("shows local input errors without calling persistence", async () => {
    const ui = await render(
      <TrainingProfileForm session={{ seed: profile, saved: null }} onClose={() => {}} />,
      { wrapper: Wrapper },
    );
    await fireEvent.changeText(ui.getByLabelText("Geburtsdatum (optional)"), "31.02.2009");
    await fireEvent.press(ui.getByRole("button", { name: "Ausbildungsprofil speichern" }));
    expect(ui.getByText(/Geburtsdatum: Bitte ein gültiges Datum/)).toBeTruthy();
    expect(mockHistory.saveProfile).not.toHaveBeenCalled();
  });
  it("retains unsaved input on conflicts and offers visible keyboard dismissal", async () => {
    const dismiss = jest.spyOn(Keyboard, "dismiss");
    jest
      .mocked(mockHistory.saveProfile)
      .mockRejectedValue(new ConcurrencyError("Bitte neu laden."));
    const ui = await render(
      <TrainingProfileForm session={{ seed: profile, saved: null }} onClose={() => {}} />,
      { wrapper: Wrapper },
    );
    await fireEvent.changeText(ui.getByLabelText("Ausbildungsberuf"), "Meine Ausbildung");
    await fireEvent.press(ui.getByRole("button", { name: "Tastatur schließen" }));
    expect(dismiss).toHaveBeenCalled();
    await fireEvent.press(ui.getByRole("button", { name: "Ausbildungsprofil speichern" }));
    await waitFor(() => expect(ui.getByText("Bitte neu laden.")).toBeTruthy());
    expect(ui.getByLabelText("Ausbildungsberuf").props.value).toBe("Meine Ausbildung");
  });
  it("blocks stale sessions without erasing the draft", async () => {
    mockHistory = { ...mockHistory, profiles: [saved] };
    const ui = await render(
      <TrainingProfileForm session={{ seed: profile, saved }} onClose={() => {}} />,
      { wrapper: Wrapper },
    );
    await fireEvent.changeText(ui.getByLabelText("Ausbildungsberuf"), "Entwurf");
    mockHistory = { ...mockHistory, profiles: [{ ...saved, revision: 2 }] };
    await ui.rerender(
      <TrainingProfileForm session={{ seed: profile, saved }} onClose={() => {}} />,
    );
    expect(ui.getByText(/Dieser Ausbildungsstand wurde inzwischen geändert/)).toBeTruthy();
    await fireEvent.press(ui.getByRole("button", { name: "Ausbildungsprofil speichern" }));
    expect(mockHistory.saveProfile).not.toHaveBeenCalled();
    expect(ui.getByLabelText("Ausbildungsberuf").props.value).toBe("Entwurf");
  });
  it("suppresses duplicate taps while a write is pending", async () => {
    let resolve!: (value: SavedTrainingProfile) => void;
    jest.mocked(mockHistory.saveProfile).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const ui = await render(
      <TrainingProfileForm session={{ seed: profile, saved: null }} onClose={() => {}} />,
      { wrapper: Wrapper },
    );
    const button = ui.getByRole("button", { name: "Ausbildungsprofil speichern" });
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(mockHistory.saveProfile).toHaveBeenCalledTimes(1);
    await act(async () => resolve(saved));
  });
  it("keeps fields and draft when the theme changes", async () => {
    const ui = await render(
      <TrainingProfileForm session={{ seed: profile, saved: null }} onClose={() => {}} />,
      { wrapper: Wrapper },
    );
    await fireEvent.changeText(ui.getByLabelText("Ausbildungsberuf"), "Entwurf");
    mockPalette = DARK_PALETTE;
    await ui.rerender(
      <TrainingProfileForm session={{ seed: profile, saved: null }} onClose={() => {}} />,
    );
    expect(ui.getByLabelText("Ausbildungsberuf").props.value).toBe("Entwurf");
    expect(ui.getByRole("button", { name: "Tastatur schließen" })).toBeTruthy();
  });
  it("offers retry instead of treating a failed read as an empty profile", async () => {
    mockHistory = { ...mockHistory, status: "error", error: "Ausbildungsdaten nicht verfügbar." };
    const ui = await render(<TrainingScreen />, { wrapper: Wrapper });
    expect(ui.queryByText("Angaben erfassen")).toBeNull();
    await fireEvent.press(ui.getByRole("button", { name: "Erneut versuchen" }));
    expect(mockReload).toHaveBeenCalled();
  });
});
