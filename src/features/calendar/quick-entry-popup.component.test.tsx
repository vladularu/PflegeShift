import { act, fireEvent, render } from "@testing-library/react-native";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type { ShiftEntry } from "@/domain/types";
import { QuickEntryPopup } from "@/features/calendar/quick-entry-popup";
import { MOTION } from "@/theme/motion";
import { DARK_PALETTE, LIGHT_PALETTE } from "@/theme/palette-values";

const earlyTemplateAction = {
  kind: "TEMPLATE" as const,
  key: "template:early",
  label: "Früh",
  color: "#7C4DCC",
  symbol: "F",
  template: {
    id: "early",
    name: "Früh",
    type: "EARLY" as const,
    startTime: "06:00",
    endTime: "14:12",
    breakMinutes: 30,
    color: "#7C4DCC",
    symbol: "F",
    sortOrder: 0,
    revision: 1,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    deletedAt: null,
  },
};

const existingShift: ShiftEntry = {
  kind: "SHIFT",
  id: "shift-night",
  date: "2026-08-04",
  templateId: "night",
  title: "Nacht",
  type: "NIGHT",
  startTime: "21:00",
  endTime: "07:30",
  breakMinutes: 60,
  color: "#D94F4F",
  symbol: "N",
  note: null,
  overtimeMinutes: 0,
  holidayPremiumMode: "WITH_TIME_OFF",
  revision: 1,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  deletedAt: null,
};

describe("QuickEntryPopup", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it.each([false, true])("inverts surface and text together for dark=%s", async (dark) => {
    jest
      .spyOn(jest.requireActual<typeof import("react-native")>("react-native"), "useColorScheme")
      .mockReturnValue(dark ? "dark" : "light");
    const expected = dark ? LIGHT_PALETTE : DARK_PALETTE;
    const screen = await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { height: 800, width: 400, x: 0, y: 0 },
          insets: { bottom: 0, left: 0, right: 0, top: 0 },
        }}
      >
        <QuickEntryPopup
          actions={[]}
          anchor={{ height: 48, width: 48, x: 40, y: 100 }}
          busy={false}
          date="2026-08-04"
          entries={[existingShift]}
          onClose={jest.fn()}
          onOpenDetails={jest.fn()}
          onOpenEntry={jest.fn()}
          onOpenShiftPicker={jest.fn()}
          onSelectAction={jest.fn()}
        />
      </SafeAreaProvider>,
    );
    expect(screen.getByTestId("quick-entry-popup")).toHaveStyle({
      backgroundColor: expected.surfaceRaised,
    });
    expect(screen.getByText("Nacht")).toHaveStyle({ color: expected.text });
  });

  it("opens the stacked shift selection from the compact day popup", async () => {
    const onSelectAction = jest.fn();
    const onOpenShiftPicker = jest.fn();
    const screen = await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { height: 800, width: 400, x: 0, y: 0 },
          insets: { bottom: 0, left: 0, right: 0, top: 0 },
        }}
      >
        <QuickEntryPopup
          actions={[
            earlyTemplateAction,
            { kind: "CUSTOM_SHIFT", key: "editor:shift", label: "Dienst" },
            { kind: "APPOINTMENT", key: "editor:appointment", label: "Termin" },
          ]}
          anchor={{ height: 48, width: 48, x: 40, y: 100 }}
          busy={false}
          date="2026-08-04"
          entries={[existingShift]}
          onClose={jest.fn()}
          onOpenDetails={jest.fn()}
          onOpenEntry={jest.fn()}
          onOpenShiftPicker={onOpenShiftPicker}
          onSelectAction={onSelectAction}
        />
      </SafeAreaProvider>,
    );

    expect(screen.getByTestId("quick-entry-popup")).toHaveProp("accessibilityViewIsModal", true);
    expect(screen.getByTestId("quick-entry-overlay")).toBeVisible();
    expect(screen.queryByTestId("quick-entry-native-modal")).toBeNull();
    expect(screen.getByText("Nacht")).toBeVisible();
    expect(screen.getByRole("button", { name: "Schicht hinzufügen" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Termin hinzufügen" })).toBeVisible();
    expect(screen.queryByTestId("shift-selection-panel")).toBeNull();
    expect(screen.queryByText("Früh")).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Schicht hinzufügen" }));
    expect(onOpenShiftPicker).toHaveBeenCalledWith("2026-08-04");
    expect(screen.queryByTestId("shift-selection-panel")).toBeNull();
  });

  it("can stay mounted without replaying its entering animation", async () => {
    const screen = await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { height: 800, width: 400, x: 0, y: 0 },
          insets: { bottom: 0, left: 0, right: 0, top: 0 },
        }}
      >
        <QuickEntryPopup
          actions={[
            earlyTemplateAction,
            { kind: "CUSTOM_SHIFT", key: "editor:shift", label: "Dienst" },
            { kind: "APPOINTMENT", key: "editor:appointment", label: "Termin" },
          ]}
          anchor={{ height: 48, width: 48, x: 40, y: 100 }}
          busy={false}
          date="2026-08-04"
          entries={[existingShift]}
          animateEntry={false}
          onClose={jest.fn()}
          onOpenDetails={jest.fn()}
          onOpenEntry={jest.fn()}
          onOpenShiftPicker={jest.fn()}
          onSelectAction={jest.fn()}
        />
      </SafeAreaProvider>,
    );

    expect(screen.getByTestId("quick-entry-popup").props.entering).toBeUndefined();
    expect(screen.getByTestId("quick-entry-popup")).toBeVisible();
    expect(screen.getByText("Nacht")).toBeVisible();
  });

  it("moves subtly from the calendar day and exits faster", async () => {
    const screen = await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { height: 800, width: 400, x: 0, y: 0 },
          insets: { bottom: 0, left: 0, right: 0, top: 0 },
        }}
      >
        <QuickEntryPopup
          actions={[{ kind: "CUSTOM_SHIFT", key: "editor:shift", label: "Dienst" }]}
          anchor={{ height: 48, width: 48, x: 40, y: 100 }}
          busy={false}
          date="2026-08-04"
          entries={[]}
          onClose={jest.fn()}
          onOpenDetails={jest.fn()}
          onOpenEntry={jest.fn()}
          onOpenShiftPicker={jest.fn()}
          onSelectAction={jest.fn()}
        />
      </SafeAreaProvider>,
    );
    const popup = screen.getByTestId("quick-entry-popup");

    expect(popup.props.entering.durationV).toBe(MOTION.duration.normal);
    expect(popup.props.entering.definitions[0].transform).toEqual([
      { translateY: -MOTION.distance.subtle },
      { scale: MOTION.scale.enter },
    ]);
    expect(popup.props.exiting.durationV).toBe(MOTION.duration.fast);
    expect(popup.props.exiting.definitions[100].transform).toEqual([
      { translateY: -MOTION.distance.subtle },
      { scale: MOTION.scale.enter },
    ]);
  });

  it("reverses its origin when it opens above the calendar day", async () => {
    const screen = await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { height: 800, width: 400, x: 0, y: 0 },
          insets: { bottom: 0, left: 0, right: 0, top: 0 },
        }}
      >
        <QuickEntryPopup
          actions={[{ kind: "CUSTOM_SHIFT", key: "editor:shift", label: "Dienst" }]}
          anchor={{ height: 48, width: 48, x: 40, y: 10_000 }}
          busy={false}
          date="2026-08-04"
          entries={[]}
          onClose={jest.fn()}
          onOpenDetails={jest.fn()}
          onOpenEntry={jest.fn()}
          onOpenShiftPicker={jest.fn()}
          onSelectAction={jest.fn()}
        />
      </SafeAreaProvider>,
    );

    expect(screen.getByTestId("quick-entry-popup").props.entering.definitions[0].transform).toEqual(
      [{ translateY: MOTION.distance.subtle }, { scale: MOTION.scale.enter }],
    );
  });

  it("releases the touch overlay immediately while its exit finishes", async () => {
    jest.useFakeTimers();
    const onClose = jest.fn();
    const screen = await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { height: 800, width: 400, x: 0, y: 0 },
          insets: { bottom: 0, left: 0, right: 0, top: 0 },
        }}
      >
        <QuickEntryPopup
          actions={[{ kind: "CUSTOM_SHIFT", key: "editor:shift", label: "Dienst" }]}
          anchor={{ height: 48, width: 48, x: 40, y: 100 }}
          busy={false}
          date="2026-08-04"
          entries={[]}
          onClose={onClose}
          onOpenDetails={jest.fn()}
          onOpenEntry={jest.fn()}
          onOpenShiftPicker={jest.fn()}
          onSelectAction={jest.fn()}
        />
      </SafeAreaProvider>,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Schnellauswahl schließen" }));

    expect(screen.getByTestId("quick-entry-overlay")).toHaveProp("pointerEvents", "none");
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(MOTION.duration.fast);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
