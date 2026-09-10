import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as Notifications from "expo-notifications";
import { Linking } from "react-native";
import { State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import { SafeAreaProvider } from "react-native-safe-area-context";

import {
  ShiftEditOverlay,
  shouldDismissShiftEditOverlay,
} from "@/features/day-editor/shift-edit-overlay";

async function renderOverlay(
  overrides: Partial<React.ComponentProps<typeof ShiftEditOverlay>> = {},
) {
  const props: React.ComponentProps<typeof ShiftEditOverlay> = {
    alarmEnabled: false,
    breakMinutes: "0",
    busy: false,
    date: "2026-08-20",
    durationMinutes: 510,
    endTime: "21:30",
    error: null,
    location: null,
    note: "",
    notification: null,
    onAlarmPress: jest.fn(),
    onBreakMinutesChange: jest.fn(),
    onBreakPress: jest.fn(),
    onDelete: jest.fn(),
    onDismiss: jest.fn(),
    onEndTimeChange: jest.fn(),
    onLocationPress: jest.fn(),
    onNoteChange: jest.fn(),
    onNotificationChange: jest.fn(),
    onNotificationPress: jest.fn(),
    onOvertimeMinutesChange: jest.fn(),
    onRequestClose: jest.fn(async () => true),
    onShiftTypeChange: jest.fn(),
    onStartTimeChange: jest.fn(),
    onTariffOvertimeConfirmedChange: jest.fn(),
    overtimeInputRef: { current: null },
    overtimeMinutes: "0",
    shiftColor: "#D94E60",
    shiftIsTimed: true,
    shiftSymbol: "S",
    shiftTitle: "Dienst",
    shiftType: "LATE",
    startTime: "13:00",
    tariffOvertimeConfirmed: false,
    ...overrides,
  };
  const screen = await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 430, height: 932 },
        insets: { top: 59, right: 0, bottom: 34, left: 0 },
      }}
    >
      <ShiftEditOverlay {...props} />
    </SafeAreaProvider>,
  );
  return { screen, props };
}

describe("ShiftEditOverlay", () => {
  it("shows the saved location map without changing the location action", async () => {
    const { screen, props } = await renderOverlay({
      location: { name: "Heppenheim", latitude: 49.64, longitude: 8.64 },
    });
    expect(screen.getByRole("button", { name: "Heppenheim in Karten öffnen" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Ort: Heppenheim" }));
    expect(props.onLocationPress).toHaveBeenCalledTimes(1);
    expect(props.onRequestClose).not.toHaveBeenCalled();
  });

  it("retains a text-only location without displaying a map", async () => {
    const { screen } = await renderOverlay({ location: { name: "Station 3" } });
    expect(screen.getByRole("button", { name: "Ort: Station 3" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /in Karten öffnen/ })).toBeNull();
  });

  beforeEach(() => {
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
      granted: true,
    } as Notifications.NotificationPermissionsStatus);
    jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({
      granted: true,
    } as Notifications.NotificationPermissionsStatus);
  });

  it("supports the complete compact shift editing surface", async () => {
    const { screen, props } = await renderOverlay({ location: { name: "Station 3" } });

    expect(screen.getByText("Do. 20. Aug.")).toBeTruthy();
    expect(screen.getByText("8h 30min")).toBeTruthy();
    expect(screen.getByText("Spät")).toBeTruthy();
    expect(screen.queryByText("Mein Job")).toBeNull();
    expect(screen.queryByText("Mehr hinzufügen")).toBeNull();
    expect(screen.getByRole("button", { name: "Pause: 0 Minuten" })).toBeTruthy();
    expect(screen.queryByLabelText("Pausendauer in 15-Minuten-Schritten")).toBeNull();
    expect(screen.getByRole("button", { name: "Wecker: Aus" })).toBeTruthy();
    expect(screen.getByTestId("shift-edit-sheet")).toHaveStyle({ gap: 10 });
    expect(screen.getByTestId("shift-edit-sheet")).toHaveProp("accessibilityViewIsModal", true);
    expect(screen.getByTestId("shift-edit-card")).toHaveStyle({
      borderRadius: 22,
      shadowOpacity: 0.28,
    });
    expect(screen.getByTestId("shift-edit-drag-handle")).toHaveStyle({ minHeight: 56 });
    expect(screen.getByRole("button", { name: "Schließen und speichern" })).toHaveStyle({
      minHeight: 50,
    });

    await fireEvent.press(screen.getByRole("button", { name: "Pause: 0 Minuten" }));
    expect(screen.getByTestId("shift-edit-pause-popover")).toHaveStyle({ height: 220, width: 210 });
    const pauseWheel = screen.getByTestId("shift-edit-pause-wheel");
    expect(pauseWheel.props).toMatchObject({
      decelerationRate: 0.97,
      scrollEventThrottle: 16,
    });
    expect(pauseWheel.props.disableIntervalMomentum).toBeUndefined();
    expect(screen.getByTestId("shift-edit-pause-selection")).toHaveStyle({ height: 44 });
    expect(screen.getAllByRole("radio")).toHaveLength(5);
    expect(screen.getByRole("radio", { name: "60 Minuten" })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "75 Minuten" })).toBeNull();

    await fireEvent.scroll(pauseWheel, {
      nativeEvent: { contentOffset: { x: 0, y: 88 } },
    });
    expect(screen.getByRole("radio", { name: "0 Minuten" }).props.accessibilityState).toMatchObject(
      { selected: true },
    );
    expect(props.onBreakMinutesChange).not.toHaveBeenCalled();
    await fireEvent(pauseWheel, "scrollEndDrag", {
      nativeEvent: {
        contentOffset: { x: 0, y: 88 },
        targetContentOffset: { x: 0, y: 88 },
      },
    });
    expect(props.onBreakMinutesChange).toHaveBeenCalledWith(30);

    await fireEvent(pauseWheel, "momentumScrollEnd", {
      nativeEvent: { contentOffset: { x: 0, y: 132 } },
    });
    expect(props.onBreakMinutesChange).toHaveBeenLastCalledWith(45);

    await fireEvent.press(screen.getByRole("radio", { name: "60 Minuten" }));
    expect(screen.getByTestId("shift-edit-pause-popover")).toBeTruthy();
    expect(props.onBreakMinutesChange).toHaveBeenCalledWith(60);
    expect(props.onBreakPress).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText("Auswahl schließen"));
    expect(screen.queryByTestId("shift-edit-pause-popover")).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Benachrichtigung: Keine" }));
    expect(screen.getByTestId("shift-notification-presets")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Zum Ereigniszeitpunkt" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "5 Minuten vor Beginn" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "1 Stunde vor Beginn" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "1 Tag vor Beginn" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("radio", { name: "Benutzerdefiniert" }));
    expect(screen.getByTestId("shift-notification-custom")).toBeTruthy();
    await fireEvent.press(screen.getByRole("radio", { name: "Abstand: 2" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Einheit: Stunden" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Richtung: nach" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Bezug: Ende" }));
    await fireEvent.press(screen.getByRole("button", { name: "Fertig" }));
    expect(props.onNotificationChange).toHaveBeenCalledWith({
      amount: 2,
      unit: "HOUR",
      direction: "AFTER",
      reference: "END",
    });
    expect(props.onNotificationPress).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId("shift-notification-custom")).toBeNull());

    await fireEvent.press(screen.getByRole("button", { name: "Wecker: Aus" }));
    expect(props.onAlarmPress).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByRole("button", { name: "Dienst: Spät" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Nacht" }));
    expect(props.onShiftTypeChange).toHaveBeenCalledWith("NIGHT");

    await fireEvent.press(screen.getByRole("button", { name: "Ort: Station 3" }));
    await fireEvent.press(screen.getByRole("button", { name: "Dienst löschen" }));
    expect(props.onLocationPress).toHaveBeenCalledTimes(1);
    expect(props.onDelete).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByRole("button", { name: "Schließen und speichern" }));
    expect(props.onRequestClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(props.onDismiss).toHaveBeenCalledTimes(1));
  });

  it("hides deletion while entering a new shift", async () => {
    const { screen } = await renderOverlay({ onDelete: undefined });

    expect(screen.queryByRole("button", { name: "Dienst löschen" })).toBeNull();
    expect(screen.getByRole("button", { name: "Ort: Kein Ort" })).toBeTruthy();
  });

  it("shows the iOS settings action when notifications are denied", async () => {
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
      canAskAgain: false,
      granted: false,
      ios: { status: Notifications.IosAuthorizationStatus.DENIED },
    } as Notifications.NotificationPermissionsStatus);
    const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue();
    const { screen, props } = await renderOverlay();

    await fireEvent.press(screen.getByRole("button", { name: "Benachrichtigung: Keine" }));
    const settingsButton = await screen.findByRole("button", { name: "iOS Einstellungen" });
    await fireEvent.press(screen.getByRole("radio", { name: "1 Stunde vor Beginn" }));

    expect(props.onNotificationChange).toHaveBeenCalledWith({
      amount: 1,
      unit: "HOUR",
      direction: "BEFORE",
      reference: "START",
    });
    expect(screen.getByTestId("shift-notification-presets")).toBeTruthy();

    await fireEvent.press(settingsButton);
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it("requests an undecided iOS permission after choosing a reminder", async () => {
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
      canAskAgain: true,
      granted: false,
      ios: { status: Notifications.IosAuthorizationStatus.NOT_DETERMINED },
    } as Notifications.NotificationPermissionsStatus);
    jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({
      granted: true,
      ios: { status: Notifications.IosAuthorizationStatus.AUTHORIZED },
    } as Notifications.NotificationPermissionsStatus);
    const { screen, props } = await renderOverlay();

    await fireEvent.press(screen.getByRole("button", { name: "Benachrichtigung: Keine" }));
    await screen.findByTestId("shift-notification-presets");
    await fireEvent.press(screen.getByRole("radio", { name: "5 Minuten vor Beginn" }));

    await waitFor(() => expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1));
    expect(props.onNotificationChange).toHaveBeenCalledWith({
      amount: 5,
      unit: "MINUTE",
      direction: "BEFORE",
      reference: "START",
    });
    await waitFor(() => expect(screen.queryByTestId("shift-notification-presets")).toBeNull());
  });

  it("discards custom changes when cancelling", async () => {
    const { screen, props } = await renderOverlay();

    await fireEvent.press(screen.getByRole("button", { name: "Benachrichtigung: Keine" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Benutzerdefiniert" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Abstand: 30" }));
    await fireEvent.press(screen.getByRole("button", { name: "Abbrechen" }));

    expect(screen.getByTestId("shift-notification-presets")).toBeTruthy();
    expect(props.onNotificationChange).not.toHaveBeenCalled();
  });

  it("keeps the sheet open when saving fails", async () => {
    const onDismiss = jest.fn();
    const onRequestClose = jest.fn(async () => false);
    const { screen } = await renderOverlay({ onDismiss, onRequestClose });

    await fireEvent.press(screen.getByRole("button", { name: "Schließen und speichern" }));

    await waitFor(() => expect(onRequestClose).toHaveBeenCalledTimes(1));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("dismisses after a deliberate drag distance or downward fling", () => {
    expect(shouldDismissShiftEditOverlay(87, 899)).toBe(false);
    expect(shouldDismissShiftEditOverlay(88, 0)).toBe(true);
    expect(shouldDismissShiftEditOverlay(12, 900)).toBe(true);
  });

  it("saves and dismisses after dragging the header down", async () => {
    const { props } = await renderOverlay();

    fireGestureHandler(getByGestureTestId("shift-edit-dismiss-gesture"), [
      { state: State.BEGAN, translationY: 0, velocityY: 0 },
      { state: State.ACTIVE, translationY: 104, velocityY: 280 },
      { state: State.END, translationY: 104, velocityY: 280 },
    ]);

    await waitFor(() => expect(props.onRequestClose).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(props.onDismiss).toHaveBeenCalledTimes(1));
  });
});
