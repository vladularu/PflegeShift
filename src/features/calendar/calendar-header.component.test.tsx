import { render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { StyleSheet } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { CalendarHeader } from "@/features/calendar/calendar-header";
import { MOTION } from "@/theme/motion";

function PlannerHeader({
  direction = "NEXT",
  month = "2026-08",
  titleTransition = "SPATIAL",
  viewMode = "MONTH",
}: {
  direction?: "NEXT" | "PREVIOUS";
  month?: string;
  titleTransition?: "SPATIAL" | "CROSSFADE";
  viewMode?: "MONTH" | "YEAR";
} = {}) {
  const plannerTransition = useSharedValue(1);
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { height: 932, width: 430, x: 0, y: 0 },
        insets: { bottom: 34, left: 0, right: 0, top: 59 },
      }}
    >
      <CalendarHeader
        direction={direction}
        month={month}
        onMoveYear={jest.fn()}
        onOpenDisplay={jest.fn()}
        onOpenYear={jest.fn()}
        plannerActive
        plannerTransition={plannerTransition}
        transition={titleTransition}
        viewMode={viewMode}
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

  it("uses complete eight-point title swaps in both time directions", async () => {
    const nextScreen = await render(<PlannerHeader direction="NEXT" />);
    const nextTitle = nextScreen.getByRole("header", { name: "August" });

    expect(nextTitle.props.entering.durationV).toBe(MOTION.duration.normal);
    expect(nextTitle.props.entering.initialValues).toMatchObject({ translateY: 8 });
    expect(nextTitle.props.exiting.durationV).toBe(MOTION.duration.normal);
    expect(nextTitle.props.exiting.targetValues).toMatchObject({ translateY: -8 });
    await nextScreen.unmount();

    const previousScreen = await render(<PlannerHeader direction="PREVIOUS" />);
    const previousTitle = previousScreen.getByRole("header", { name: "August" });

    expect(previousTitle.props.entering.initialValues).toMatchObject({ translateY: -8 });
    expect(previousTitle.props.exiting.targetValues).toMatchObject({ translateY: 8 });
  });

  it("uses a transform-free deliberate crossfade between month and year", async () => {
    const screen = await render(
      <PlannerHeader month="2026-08" titleTransition="CROSSFADE" viewMode="YEAR" />,
    );
    const title = screen.getByRole("header", { name: "2026" });

    expect(title.props.entering.durationV).toBe(MOTION.duration.deliberate);
    expect(title.props.entering.initialValues).toBeUndefined();
    expect(title.props.exiting.durationV).toBe(MOTION.duration.deliberate);
    expect(title.props.exiting.targetValues).toBeUndefined();
  });
});
