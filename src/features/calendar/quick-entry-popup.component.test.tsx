import { fireEvent, render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type { ShiftEntry } from "@/domain/types";
import { QuickEntryPopup } from "@/features/calendar/quick-entry-popup";

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
});
