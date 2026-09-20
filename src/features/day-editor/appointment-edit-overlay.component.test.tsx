import { fireEvent, render, within } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppointmentEditOverlay } from "@/features/day-editor/appointment-edit-overlay";

async function renderOverlay(
  overrides: Partial<React.ComponentProps<typeof AppointmentEditOverlay>> = {},
) {
  const props: React.ComponentProps<typeof AppointmentEditOverlay> = {
    allDay: false,
    appointmentColor: "#2F80ED",
    busy: false,
    date: "2026-08-22",
    durationMinutes: 60,
    endTime: "13:00",
    error: null,
    location: null,
    note: "",
    notification: null,
    onAllDayChange: jest.fn(),
    onDelete: jest.fn(),
    onDismiss: jest.fn(),
    onEndTimeChange: jest.fn(),
    onLocationPress: jest.fn(),
    onNoteChange: jest.fn(),
    onNotificationChange: jest.fn(),
    onNotificationPress: jest.fn(),
    onRecurrenceChange: jest.fn(),
    onRequestClose: jest.fn(async () => true),
    onStartTimeChange: jest.fn(),
    onTitleChange: jest.fn(),
    recurrence: null,
    startTime: "12:00",
    title: "Ohne Titel",
    ...overrides,
  };
  const screen = await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 430, height: 932 },
        insets: { top: 59, right: 0, bottom: 34, left: 0 },
      }}
    >
      <AppointmentEditOverlay {...props} />
    </SafeAreaProvider>,
  );
  return { props, screen };
}

describe("AppointmentEditOverlay", () => {
  it("shows the appointment map and preserves location selection", async () => {
    const { screen, props } = await renderOverlay({
      location: { name: "Heppenheim", latitude: 49.64, longitude: 8.64 },
    });
    expect(screen.getByRole("button", { name: "Heppenheim in Karten öffnen" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Ort: Heppenheim" }));
    expect(props.onLocationPress).toHaveBeenCalledTimes(1);
    expect(props.onRequestClose).not.toHaveBeenCalled();
  });

  it("retains a text-only appointment location without a map", async () => {
    const { screen } = await renderOverlay({ location: { name: "Besprechungsraum" } });
    expect(screen.getByRole("button", { name: "Ort: Besprechungsraum" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /in Karten öffnen/ })).toBeNull();
  });

  it("matches the compact appointment reference and keeps the accepted overlay behavior", async () => {
    const { props, screen } = await renderOverlay();

    expect(screen.getByTestId("appointment-edit-overlay")).toBeTruthy();
    expect(screen.getByTestId("appointment-edit-card")).toHaveStyle({
      borderRadius: 22,
      shadowOpacity: 0.28,
    });
    expect(screen.getByTestId("appointment-edit-drag-handle")).toHaveStyle({ minHeight: 56 });
    expect(screen.getByTestId("appointment-edit-sheet")).toHaveProp(
      "accessibilityViewIsModal",
      true,
    );
    expect(screen.getByText("Sa. 22. Aug.")).toBeTruthy();
    expect(screen.getByText("1h")).toBeTruthy();
    expect(screen.getByDisplayValue("Ohne Titel")).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Termin ganztägig" })).toBeTruthy();
    expect(screen.getByText("Start")).toBeTruthy();
    expect(screen.getByText("Ende")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Wiederholen: Niemals" })).toBeTruthy();
    expect(screen.getByText("Kalender")).toBeTruthy();
    expect(screen.getByText("Termine")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Benachrichtigung: Keine" })).toBeTruthy();
    expect(screen.getByPlaceholderText("Notizen")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ort: Nicht festgelegt" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Termin löschen" })).toBeTruthy();
    expect(screen.queryByText("Mehr hinzufügen")).toBeNull();

    await fireEvent.changeText(screen.getByLabelText("Titel"), "Arzttermin");
    expect(props.onTitleChange).toHaveBeenCalledWith("Arzttermin");
    await fireEvent(screen.getByRole("switch", { name: "Termin ganztägig" }), "valueChange", true);
    expect(props.onAllDayChange).toHaveBeenCalledWith(true);
    await fireEvent.press(screen.getByRole("button", { name: "Wiederholen: Niemals" }));
    expect(screen.getByTestId("appointment-recurrence-presets")).toBeTruthy();
    expect(screen.getByTestId("appointment-recurrence-sheet")).toHaveStyle({
      borderTopLeftRadius: 34,
      borderTopRightRadius: 34,
    });
    expect(screen.getByTestId("appointment-recurrence-preset-card")).toHaveStyle({
      borderRadius: 24,
    });
    expect(screen.getByTestId("appointment-recurrence-custom-row")).toHaveStyle({ minHeight: 58 });
    expect(screen.getByRole("radio", { name: "Nie" }).props.accessibilityState).toEqual({
      selected: true,
    });
    expect(screen.getByRole("radio", { name: "Benutzerdefiniert" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Wiederholung schließen" }));

    await fireEvent.press(screen.getByRole("button", { name: "Wiederholen: Niemals" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Alle 2 Wochen" }));
    expect(props.onRecurrenceChange).toHaveBeenCalledWith({ frequency: "WEEK", interval: 2 });
    expect(screen.queryByTestId("appointment-recurrence-presets")).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Benachrichtigung: Keine" }));
    expect(screen.getByTestId("shift-notification-presets")).toBeTruthy();
    expect(props.onNotificationPress).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Benachrichtigung schließen" }));

    await fireEvent.press(screen.getByRole("button", { name: "Ort: Nicht festgelegt" }));
    expect(props.onLocationPress).toHaveBeenCalledTimes(1);
    const deleteAction = screen.getByRole("button", { name: "Termin löschen" });
    expect(deleteAction).toHaveStyle({ minHeight: 44 });
    expect(within(deleteAction).getByText("Termin löschen")).toBeTruthy();
    const notes = screen.getByLabelText("Notizen");
    expect(notes).toHaveStyle({ minHeight: 88 });
    expect(within(notes.parent!).queryByRole("button", { name: "Termin löschen" })).toBeNull();
    await fireEvent.press(deleteAction);
    expect(props.onDelete).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", { name: "Schließen und speichern" }));
    expect(props.onRequestClose).toHaveBeenCalledTimes(1);
  });

  it("shows an all-day duration without time rows", async () => {
    const { screen } = await renderOverlay({ allDay: true, durationMinutes: null });

    expect(screen.getAllByText("Ganztägig")).toHaveLength(2);
    expect(screen.queryByText("Start")).toBeNull();
    expect(screen.queryByText("Ende")).toBeNull();
  });

  it("hides deletion while entering a new appointment", async () => {
    const { screen } = await renderOverlay({ onDelete: undefined });

    expect(screen.queryByRole("button", { name: "Termin löschen" })).toBeNull();
    expect(screen.getByRole("button", { name: "Ort: Nicht festgelegt" })).toBeTruthy();
  });

  it("keeps custom recurrence behind Benutzerdefiniert and applies its wheel selection", async () => {
    const { props, screen } = await renderOverlay();

    await fireEvent.press(screen.getByRole("button", { name: "Wiederholen: Niemals" }));
    expect(screen.getByRole("radio", { name: "Wöchentlich" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Alle 2 Wochen" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Monatlich" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Jährlich" })).toBeTruthy();
    expect(screen.queryByTestId("appointment-recurrence-custom")).toBeNull();

    await fireEvent.press(screen.getByRole("radio", { name: "Benutzerdefiniert" }));
    expect(screen.getByTestId("appointment-recurrence-custom")).toBeTruthy();
    await fireEvent.press(screen.getByRole("radio", { name: "Intervall: 3" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Einheit: Monate" }));
    await fireEvent.press(screen.getByRole("button", { name: "Fertig" }));

    expect(props.onRecurrenceChange).toHaveBeenCalledWith({
      frequency: "MONTH",
      interval: 3,
    });
    expect(screen.queryByTestId("appointment-recurrence-custom")).toBeNull();
  });
});
