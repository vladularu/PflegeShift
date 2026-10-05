import { act, fireEvent, render, waitFor, within } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Platform } from "react-native";
import { State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import { getAnimatedStyle } from "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { DropdownField } from "@/ui/form-controls";

const originalOS = Platform.OS;
const metrics = {
  frame: { height: 852, width: 393, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 59 },
};
function picker(onChange: (value: string) => void) {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <DropdownField
        label="Bundesland"
        value="HE"
        onChange={onChange}
        options={[
          { value: "HE", label: "Hessen" },
          { value: "BW", label: "Baden-Württemberg" },
          ...Array.from({ length: 18 }, (_, index) => ({
            value: `state-${index}`,
            label: `Region ${index}`,
          })),
        ]}
      />
    </SafeAreaProvider>
  );
}
async function open(screen: Awaited<ReturnType<typeof render>>) {
  await fireEvent.press(screen.getByRole("button", { name: "Bundesland: Hessen" }));
  await fireEvent(screen.getByTestId("dropdown-modal-content"), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 393, height: 640 } },
  });
  await fireEvent(screen.getByTestId("dropdown-modal-content"), "show");
}
async function drag(
  part: "header" | "list",
  translationY: number,
  velocityY = 0,
  end: State = State.END,
) {
  await act(async () => {
    fireGestureHandler(getByGestureTestId(`selection-sheet-${part}-drag`), [
      { state: State.BEGAN, translationY: 0, velocityY: 0 },
      { state: State.ACTIVE, translationY, velocityY },
      { state: end, translationY, velocityY },
    ]);
  });
}

describe("shared dismissible selection sheet", () => {
  beforeEach(() => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });
  });
  afterEach(() => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: originalOS });
  });

  it("dismisses by pulling the header down without changing an existing value", async () => {
    const onChange = jest.fn<(value: string) => void>();
    const screen = await render(picker(onChange));
    await open(screen);
    expect(
      screen.getByTestId("selection-sheet-grabber", { includeHiddenElements: true }),
    ).toBeTruthy();
    await drag("header", 120);
    await waitFor(() => expect(screen.queryByTestId("dropdown-modal-content")).toBeNull());
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Bundesland: Hessen" })).toHaveProp(
      "accessibilityState",
      { expanded: false },
    );
  });

  it.each([
    [24, 0],
    [-120, -1200],
  ])("keeps the list open for a short or upward drag (%i)", async (distance, velocity) => {
    const onChange = jest.fn<(value: string) => void>();
    const screen = await render(picker(onChange));
    await open(screen);
    await drag("header", distance, velocity);
    expect(screen.getByTestId("dropdown-modal-content")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not close or select after an interrupted gesture", async () => {
    const onChange = jest.fn<(value: string) => void>();
    const screen = await render(picker(onChange));
    await open(screen);
    await drag("header", 120, 0, State.CANCELLED);
    expect(screen.getByTestId("dropdown-modal-content")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("allows a deliberate downward fling from the header", async () => {
    const screen = await render(picker(jest.fn()));
    await open(screen);
    await drag("header", 30, 1200);
    await waitFor(() => expect(screen.queryByTestId("dropdown-modal-content")).toBeNull());
  });

  it("allows pulling the list down to close when it starts at the top", async () => {
    const onChange = jest.fn<(value: string) => void>();
    const screen = await render(picker(onChange));
    await open(screen);
    await drag("list", 120);
    await waitFor(() => expect(screen.queryByTestId("dropdown-modal-content")).toBeNull());
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps a scrolled list open while returning towards its first rows", async () => {
    const onChange = jest.fn<(value: string) => void>();
    const screen = await render(picker(onChange));
    await open(screen);
    await fireEvent.scroll(screen.getByTestId("selection-sheet-list"), {
      nativeEvent: { contentOffset: { y: 180, x: 0 } },
    });
    await drag("list", 120);
    expect(screen.getByTestId("dropdown-modal-content")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    // The title remains draggable even when the options are scrolled.
    await drag("header", 120);
    await waitFor(() => expect(screen.queryByTestId("dropdown-modal-content")).toBeNull());
  });

  it("scrolls upwards without closing or changing the selection", async () => {
    const onChange = jest.fn<(value: string) => void>();
    const screen = await render(picker(onChange));
    await open(screen);
    await drag("list", -120, -1200);
    expect(screen.getByTestId("dropdown-modal-content")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each(["cancel", "backdrop", "back", "escape"])(
    "dismisses through %s without changing the selection",
    async (action) => {
      const onChange = jest.fn<(value: string) => void>();
      const screen = await render(picker(onChange));
      await open(screen);
      if (action === "cancel")
        await fireEvent.press(screen.getByRole("button", { name: "Auswahl abbrechen" }));
      if (action === "backdrop")
        await fireEvent.press(
          screen.getByTestId("selection-sheet-backdrop", { includeHiddenElements: true }),
        );
      if (action === "back")
        await fireEvent(screen.getByTestId("dropdown-modal-content"), "requestClose");
      if (action === "escape")
        await fireEvent(screen.getByTestId("dropdown-modal-content"), "accessibilityEscape");
      await waitFor(() => expect(screen.queryByTestId("dropdown-modal-content")).toBeNull());
      expect(onChange).not.toHaveBeenCalled();
    },
  );

  it("reopens after a drag and adopts an option exactly once", async () => {
    const onChange = jest.fn<(value: string) => void>();
    const screen = await render(picker(onChange));
    await open(screen);
    await drag("header", 120);
    await waitFor(() => expect(screen.queryByTestId("dropdown-modal-content")).toBeNull());
    await open(screen);
    const dialog = within(screen.getByTestId("dropdown-modal-content"));
    await fireEvent.press(dialog.getByRole("button", { name: "Baden-Württemberg" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("BW");
    await waitFor(() => expect(screen.queryByTestId("dropdown-modal-content")).toBeNull());
  });

  describe("matched opening and closing motion", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    async function advance(milliseconds: number) {
      await act(async () => {
        await jest.advanceTimersByTimeAsync(milliseconds);
      });
    }

    it.each(["missing", "zero"])(
      "opens and can be cancelled when the native layout callback is %s",
      async (layout) => {
        const onChange = jest.fn<(value: string) => void>();
        const screen = await render(picker(onChange));
        await fireEvent.press(screen.getByRole("button", { name: "Bundesland: Hessen" }));
        const sheet = screen.getByTestId("dropdown-modal-content");
        await fireEvent(sheet, "show");
        if (layout === "zero")
          await fireEvent(sheet, "layout", {
            nativeEvent: { layout: { x: 0, y: 0, width: 393, height: 0 } },
          });
        await advance(300);
        expect((getAnimatedStyle(sheet).transform as { translateY: number }[])[0].translateY).toBe(
          0,
        );
        const backdrop = screen.getByTestId("selection-sheet-backdrop", {
          includeHiddenElements: true,
        }).parent!;
        expect(getAnimatedStyle(backdrop).opacity).toBe(1);
        await fireEvent.press(screen.getByRole("button", { name: "Auswahl abbrechen" }));
        await advance(300);
        expect(screen.queryByTestId("dropdown-modal-content")).toBeNull();
        expect(onChange).not.toHaveBeenCalled();
      },
    );

    it("does not restart opening when layout arrives after the sheet is already visible", async () => {
      const screen = await render(picker(jest.fn()));
      await fireEvent.press(screen.getByRole("button", { name: "Bundesland: Hessen" }));
      const sheet = screen.getByTestId("dropdown-modal-content");
      await fireEvent(sheet, "show");
      await advance(300);
      await fireEvent(sheet, "layout", {
        nativeEvent: { layout: { x: 0, y: 0, width: 393, height: 240 } },
      });
      await advance(20);
      expect((getAnimatedStyle(sheet).transform as { translateY: number }[])[0].translateY).toBe(0);
    });

    it("selects once and reopens without requiring any layout callback", async () => {
      const onChange = jest.fn<(value: string) => void>();
      const screen = await render(picker(onChange));
      for (const select of [true, false]) {
        await fireEvent.press(screen.getByRole("button", { name: "Bundesland: Hessen" }));
        const sheet = screen.getByTestId("dropdown-modal-content");
        await fireEvent(sheet, "show");
        await advance(300);
        expect((getAnimatedStyle(sheet).transform as { translateY: number }[])[0].translateY).toBe(
          0,
        );
        await fireEvent.press(
          select
            ? within(sheet).getByRole("button", { name: "Baden-W\u00fcrttemberg" })
            : screen.getByRole("button", { name: "Auswahl abbrechen" }),
        );
        await advance(300);
        expect(screen.queryByTestId("dropdown-modal-content")).toBeNull();
      }
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith("BW");
    });

    it.each([240, 640])(
      "keeps a %i-point sheet and its backdrop visible until the exit finishes",
      async (height) => {
        const screen = await render(picker(jest.fn()));
        await open(screen);
        const sheet = screen.getByTestId("dropdown-modal-content");
        await fireEvent(sheet, "layout", {
          nativeEvent: { layout: { x: 0, y: 0, width: 393, height } },
        });
        await advance(300);
        await fireEvent.press(screen.getByRole("button", { name: "Auswahl abbrechen" }));
        await advance(120);
        const position = (getAnimatedStyle(sheet).transform as { translateY: number }[])[0]
          .translateY;
        const backdrop = screen.getByTestId("selection-sheet-backdrop", {
          includeHiddenElements: true,
        }).parent!;
        const opacity = getAnimatedStyle(backdrop).opacity as number;
        expect(position).toBeGreaterThan(0);
        // Even a short picker must still be on screen halfway through dismissal.
        expect(position).toBeLessThan(height / 2);
        expect(opacity).toBeGreaterThan(0.5);
        expect(screen.getByTestId("dropdown-modal-content")).toBeTruthy();
        await advance(180);
        expect(screen.queryByTestId("dropdown-modal-content")).toBeNull();
      },
    );

    it.each(["cancel", "option", "backdrop", "back", "escape"])(
      "finishes the animation before unmounting through %s",
      async (action) => {
        const onChange = jest.fn<(value: string) => void>();
        const screen = await render(picker(onChange));
        await open(screen);
        await advance(300);
        const sheet = screen.getByTestId("dropdown-modal-content");
        if (action === "cancel")
          await fireEvent.press(screen.getByRole("button", { name: "Auswahl abbrechen" }));
        if (action === "option")
          await fireEvent.press(
            within(sheet).getByRole("button", { name: "Baden-W\u00fcrttemberg" }),
          );
        if (action === "backdrop")
          await fireEvent.press(
            screen.getByTestId("selection-sheet-backdrop", {
              includeHiddenElements: true,
            }),
          );
        if (action === "back") await fireEvent(sheet, "requestClose");
        if (action === "escape") await fireEvent(sheet, "accessibilityEscape");
        await advance(200);
        expect(screen.getByTestId("dropdown-modal-content")).toBeTruthy();
        await advance(100);
        expect(screen.queryByTestId("dropdown-modal-content")).toBeNull();
        expect(onChange).toHaveBeenCalledTimes(action === "option" ? 1 : 0);
      },
    );

    it.each(["show-first", "layout-first"])(
      "opens with a measured or safe fallback distance when %s",
      async (order) => {
        const screen = await render(picker(jest.fn()));
        await fireEvent.press(screen.getByRole("button", { name: "Bundesland: Hessen" }));
        const sheet = screen.getByTestId("dropdown-modal-content");
        if (order === "show-first") await fireEvent(sheet, "show");
        await fireEvent(sheet, "layout", {
          nativeEvent: { layout: { x: 0, y: 0, width: 393, height: 240 } },
        });
        if (order === "layout-first") await fireEvent(sheet, "show");
        await advance(20);
        const initialPosition = (getAnimatedStyle(sheet).transform as { translateY: number }[])[0]
          .translateY;
        expect(initialPosition).toBeGreaterThan(0);
        expect(initialPosition).toBeLessThan(order === "layout-first" ? 280 : 780);
        await advance(300);
        expect((getAnimatedStyle(sheet).transform as { translateY: number }[])[0].translateY).toBe(
          0,
        );
      },
    );
  });
});
