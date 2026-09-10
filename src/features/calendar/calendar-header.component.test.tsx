import { fireEvent, render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { StyleSheet } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { CalendarHeader } from "@/features/calendar/calendar-header";
import { CALENDAR_VIEW_ZOOM } from "@/features/calendar/calendar-view-transition";
import { MOTION } from "@/theme/motion";
import { LIGHT_PALETTE } from "@/theme/palette-values";

function PlannerHeader({
  direction = "NEXT",
  month = "2026-08",
  referenceMonth = "2026-08",
  titleTransition = "SPATIAL",
  viewMode = "MONTH",
  synchronized = false,
  notice,
  plannerActive = true,
}: {
  direction?: "NEXT" | "PREVIOUS";
  month?: string;
  referenceMonth?: string;
  titleTransition?: "SPATIAL" | "CROSSFADE";
  viewMode?: "MONTH" | "YEAR";
  synchronized?: boolean;
  notice?: string;
  plannerActive?: boolean;
} = {}) {
  const plannerTransition = useSharedValue(plannerActive ? 1 : 0);
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { height: 932, width: 430, x: 0, y: 0 },
        insets: { bottom: 34, left: 0, right: 0, top: 59 },
      }}
    >
      <CalendarHeader
        synchronized={synchronized}
        notice={notice}
        direction={direction}
        month={month}
        onMoveYear={jest.fn()}
        onOpenDisplay={jest.fn()}
        onOpenYear={jest.fn()}
        plannerActive={plannerActive}
        plannerTransition={plannerTransition}
        referenceMonth={referenceMonth}
        transition={titleTransition}
        viewMode={viewMode}
      />
    </SafeAreaProvider>
  );
}

describe("CalendarHeader", () => {
  it("updates the controlled title in place and keeps the full warning accessible", async () => {
    const notice = "Feiertagsregeln für diesen Zeitraum noch nicht verfügbar.";
    const screen = await render(
      <PlannerHeader synchronized notice={notice} plannerActive={false} />,
    );
    const title = screen.getByRole("header", { name: "August" });
    expect(title.props.entering).toBeUndefined();
    expect(title.props.exiting).toBeUndefined();
    await screen.rerender(
      <PlannerHeader synchronized month="2026-09" notice={notice} plannerActive={false} />,
    );
    expect(screen.getByRole("header", { name: "September" })).toBe(title);
    await fireEvent.press(
      screen.getByRole("button", {
        name: `Kalenderdarstellung öffnen. Hinweis: ${notice}`,
        includeHiddenElements: true,
      }),
    );
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.queryByTestId("calendar-notice-control")).toBeNull();
    expect(screen.getByTestId("calendar-notice-badge")).toHaveStyle({ position: "absolute" });
  });
  it("keeps one title line and the same height for September 2027 and year view", async () => {
    const screen = await render(
      <PlannerHeader synchronized month="2027-09" referenceMonth="2026-09" plannerActive={false} />,
    );
    const title = screen.getByRole("header", { name: "September 2027" });
    const height = StyleSheet.flatten(title.props.style).height;
    expect(height).toBeGreaterThan(0);
    expect(title.props.numberOfLines).toBe(1);
    expect(title.props.adjustsFontSizeToFit).toBe(true);
    await screen.rerender(
      <PlannerHeader synchronized month="2027-09" viewMode="YEAR" plannerActive={false} />,
    );
    expect(screen.getByRole("header", { name: "2027" })).toHaveStyle({ height });
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });
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

    expect(title.props.entering.durationV).toBe(CALENDAR_VIEW_ZOOM.duration);
    expect(title).toHaveStyle({ color: LIGHT_PALETTE.calendarYearAccent });
    expect(title.props.entering.initialValues).toBeUndefined();
    expect(title.props.exiting.durationV).toBe(MOTION.duration.normal);
    expect(title.props.exiting.targetValues).toBeUndefined();
  });

  it("keeps the current year quiet and shows other years for orientation", async () => {
    const current = await render(<PlannerHeader month="2026-08" referenceMonth="2026-09" />);
    expect(current.getByRole("header", { name: "August" })).toBeTruthy();
    await current.unmount();

    for (const year of ["2025", "2027"]) {
      const other = await render(<PlannerHeader month={`${year}-08`} referenceMonth="2026-09" />);
      expect(other.getByRole("header", { name: `August ${year}` })).toBeTruthy();
      await other.unmount();
    }
  });

  it("crossfades the mode controls without moving the header pill", async () => {
    const screen = await render(<PlannerHeader viewMode="YEAR" />);
    const controls = screen.getByTestId("calendar-header-mode-actions", {
      includeHiddenElements: true,
    });

    expect(controls.props.entering.durationV).toBe(CALENDAR_VIEW_ZOOM.duration);
    expect(controls.props.entering.initialValues).toBeUndefined();
    expect(controls.props.exiting.durationV).toBe(MOTION.duration.normal);
    expect(controls.props.exiting.targetValues).toBeUndefined();
  });
});
