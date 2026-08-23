import { render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { StyleSheet } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { CalendarHeader } from "@/features/calendar/calendar-header";

function PlannerHeader() {
  const transition = useSharedValue(1);
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { height: 932, width: 430, x: 0, y: 0 },
        insets: { bottom: 34, left: 0, right: 0, top: 59 },
      }}
    >
      <CalendarHeader
        month="2026-08"
        onMoveYear={jest.fn()}
        onOpenDisplay={jest.fn()}
        onOpenYear={jest.fn()}
        plannerActive
        plannerTransition={transition}
        viewMode="MONTH"
      />
    </SafeAreaProvider>
  );
}

describe("CalendarHeader", () => {
  it("fades and disables the view controls while quick planning is active", async () => {
    const screen = await render(<PlannerHeader />);
    const toolbar = screen.getByTestId("calendar-header-actions", {
      includeHiddenElements: true,
    });

    expect(toolbar.props.pointerEvents).toBe("none");
    expect(toolbar.props.accessibilityElementsHidden).toBe(true);
    expect(toolbar.props.importantForAccessibility).toBe("no-hide-descendants");
    expect(StyleSheet.flatten(toolbar.props.style).opacity).toBe(0);
    expect(screen.getByRole("header", { name: "August" })).toHaveProp(
      "dynamicTypeRamp",
      "largeTitle",
    );
    expect(
      screen.getByRole("button", {
        name: "2026, Jahresansicht öffnen",
        includeHiddenElements: true,
      }),
    ).toHaveStyle({ width: 44, height: 44 });
  });
});
