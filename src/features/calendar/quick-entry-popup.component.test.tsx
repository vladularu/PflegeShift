import { fireEvent, render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { QuickEntryPopup } from "@/features/calendar/quick-entry-popup";

describe("QuickEntryPopup", () => {
  it("acts as a modal accessibility region with an explicit close action", async () => {
    const onClose = jest.fn();
    const screen = await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { height: 800, width: 400, x: 0, y: 0 },
          insets: { bottom: 0, left: 0, right: 0, top: 0 },
        }}
      >
        <QuickEntryPopup
          actions={[
            { kind: "CUSTOM_SHIFT", key: "editor:shift", label: "Dienst" },
            { kind: "APPOINTMENT", key: "editor:appointment", label: "Termin" },
          ]}
          anchor={{ height: 48, width: 48, x: 40, y: 100 }}
          busy={false}
          date="2026-08-04"
          entries={[]}
          onClose={onClose}
          onOpenDetails={jest.fn()}
          onOpenEntry={jest.fn()}
          onSelectAction={jest.fn()}
        />
      </SafeAreaProvider>,
    );

    expect(screen.getByTestId("quick-entry-popup")).toHaveProp("accessibilityViewIsModal", true);

    await fireEvent.press(screen.getByRole("button", { name: "Schnellauswahl schließen" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
