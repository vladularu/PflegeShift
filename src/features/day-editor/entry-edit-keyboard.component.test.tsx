import { act, fireEvent, render, within } from "@testing-library/react-native";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { useState } from "react";
import { Keyboard, Platform, TextInput } from "react-native";
import type { KeyboardEvent, KeyboardEventName } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { EntryEditOverlayFrame } from "@/features/day-editor/entry-edit-overlay-frame";

const keyboardEvent: KeyboardEvent = {
  duration: 250,
  easing: "keyboard",
  endCoordinates: { screenX: 0, screenY: 600, width: 430, height: 332 },
};

async function setup(visible = false) {
  jest.spyOn(Keyboard, "isVisible").mockReturnValue(visible);
  const listeners = jest.spyOn(Keyboard, "addListener");
  const scheduleAnimation = jest
    .spyOn(Keyboard, "scheduleLayoutAnimation")
    .mockImplementation(() => {});
  const dismiss = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => {});
  const onRequestClose = jest.fn(async () => true);
  const onDismiss = jest.fn();
  function Harness() {
    const [note, setNote] = useState("Erste Zeile\nZweite Zeile");
    return (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 430, height: 932 },
          insets: { top: 59, right: 0, bottom: 34, left: 0 },
        }}
      >
        <EntryEditOverlayFrame
          busy={false}
          cardContent={
            <TextInput accessibilityLabel="Notiz" multiline value={note} onChangeText={setNote} />
          }
          date="2026-09-20"
          durationMinutes={60}
          error={null}
          headerColor="#C93443"
          headerForeground="#FFFFFF"
          onDismiss={onDismiss}
          onRequestClose={onRequestClose}
          testIDPrefix="test-edit"
        />
      </SafeAreaProvider>
    );
  }
  const screen = await render(<Harness />);
  async function emit(name: KeyboardEventName) {
    await act(() => {
      for (const [eventName, callback] of listeners.mock.calls) {
        if (eventName === name) callback(keyboardEvent);
      }
    });
  }
  return { screen, emit, dismiss, onRequestClose, onDismiss, listeners, scheduleAnimation };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("Entry editor keyboard action", () => {
  it("keeps the header and toolbar outside the bounded form scroller", async () => {
    const { screen } = await setup(true);
    const fields = screen.getByTestId("test-edit-fields");
    expect(screen.getByTestId("test-edit-safe-viewport")).toHaveStyle({
      flex: 1,
      paddingTop: 59,
      paddingBottom: 0,
    });
    expect(fields).toHaveStyle({ flexGrow: 0, flexShrink: 1 });
    expect(fields).toHaveProp("contentContainerStyle", { paddingBottom: 72 });
    expect(screen.getByTestId("test-edit-card")).toHaveStyle({
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
    });
    expect(fields).toHaveProp("automaticallyAdjustKeyboardInsets", false);
    expect(fields).toHaveProp("contentInsetAdjustmentBehavior", "never");
    expect(within(fields).getByLabelText("Notiz")).toBeTruthy();
    expect(within(fields).queryByTestId("test-edit-drag-handle")).toBeNull();
    expect(within(fields).queryByTestId("test-edit-keyboard-toolbar")).toBeNull();
    expect(screen.getByTestId("test-edit-drag-handle")).toHaveStyle({ flexShrink: 0 });
    expect(screen.getByTestId("test-edit-keyboard-toolbar").parent).toBe(
      screen.getByTestId("test-edit-card"),
    );
  });

  it("offers only keyboard dismissal while typing and restores the save action afterward", async () => {
    const { screen, emit, onRequestClose } = await setup();
    expect(screen.getByRole("button", { name: "Schließen und speichern" })).toBeTruthy();
    await emit("keyboardWillShow");
    expect(screen.queryByRole("button", { name: "Schließen und speichern" })).toBeNull();
    expect(screen.getByRole("button", { name: "Fertig, Tastatur schließen" })).toBeTruthy();
    await emit("keyboardWillHide");
    expect(screen.queryByRole("button", { name: "Fertig, Tastatur schließen" })).toBeNull();
    expect(screen.getByRole("button", { name: "Schließen und speichern" })).toBeTruthy();
    expect(screen.getByTestId("test-edit-safe-viewport")).toHaveStyle({ paddingBottom: 34 });
    expect(screen.getByTestId("test-edit-card")).toHaveStyle({ borderRadius: 22 });
    expect(screen.getByTestId("test-edit-fields").props.contentContainerStyle).toBeUndefined();
    expect(onRequestClose).not.toHaveBeenCalled();
  });

  it("shows an accessible action only while the keyboard is visible", async () => {
    const { screen, emit } = await setup();
    expect(screen.queryByRole("button", { name: "Fertig, Tastatur schließen" })).toBeNull();
    await emit(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow");
    expect(screen.getByRole("button", { name: "Fertig, Tastatur schließen" })).toHaveStyle({
      minHeight: 44,
      minWidth: 44,
    });
    expect(screen.getByTestId("test-edit-sheet")).toHaveProp("accessibilityViewIsModal", true);
    await emit(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide");
    expect(screen.queryByRole("button", { name: "Fertig, Tastatur schließen" })).toBeNull();
  });

  it("dismisses only the keyboard and preserves the multiline draft without saving", async () => {
    const { screen, emit, dismiss, onRequestClose, onDismiss } = await setup(true);
    await fireEvent.changeText(screen.getByLabelText("Notiz"), "Geändert\nNotiz bleibt");
    await fireEvent.press(screen.getByRole("button", { name: "Fertig, Tastatur schließen" }));
    expect(dismiss).toHaveBeenCalledTimes(1);
    await emit(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide");
    expect(screen.getByDisplayValue("Geändert\nNotiz bleibt")).toBeTruthy();
    expect(screen.getByTestId("test-edit-sheet")).toBeTruthy();
    expect(onRequestClose).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Schließen und speichern" }));
    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  it("synchronizes the iOS toolbar before hide finishes and supports reopening", async () => {
    const { screen, emit, scheduleAnimation, onRequestClose, onDismiss } = await setup(true);
    expect(Platform.OS).toBe("ios");
    await emit("keyboardWillHide");
    expect(screen.queryByRole("button", { name: "Fertig, Tastatur schließen" })).toBeNull();
    expect(scheduleAnimation).toHaveBeenLastCalledWith(keyboardEvent);
    const scheduled = scheduleAnimation.mock.calls.length;
    await emit("keyboardDidHide");
    expect(scheduleAnimation).toHaveBeenCalledTimes(scheduled);
    await emit("keyboardWillShow");
    expect(screen.getByRole("button", { name: "Fertig, Tastatur schließen" })).toBeTruthy();
    expect(scheduleAnimation).toHaveBeenCalledTimes(scheduled + 1);
    expect(screen.getByDisplayValue("Erste Zeile\nZweite Zeile")).toBeTruthy();
    expect(onRequestClose).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("removes its keyboard listeners when the editor unmounts", async () => {
    const { screen, listeners } = await setup();
    const subscriptions = listeners.mock.results
      .filter((result) => result.type === "return")
      .map((result) => jest.spyOn(result.value as { remove: () => void }, "remove"));
    await screen.unmount();
    expect(subscriptions.length).toBeGreaterThanOrEqual(2);
    for (const remove of subscriptions) expect(remove).toHaveBeenCalled();
  });
});
