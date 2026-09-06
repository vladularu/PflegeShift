import { render } from "@testing-library/react-native";
import { describe, expect, it } from "@jest/globals";
import { Text } from "react-native";

import {
  CALENDAR_VIEW_ZOOM,
  CalendarViewTransition,
  calendarViewEntering,
} from "@/features/calendar/calendar-view-transition";

describe("CalendarViewTransition", () => {
  it("zooms the selected mini-month into the month view and reverses the motion", async () => {
    const screen = await render(
      <CalendarViewTransition month="2026-09" testID="calendar-scene" viewMode="MONTH">
        <Text>Kalender</Text>
      </CalendarViewTransition>,
    );
    const scene = screen.getByTestId("calendar-scene");

    const entering = calendarViewEntering("MONTH")({} as never);
    expect(entering.initialValues).toMatchObject({
      opacity: CALENDAR_VIEW_ZOOM.edgeOpacity,
      transform: [{ scale: CALENDAR_VIEW_ZOOM.monthScale }],
    });
    expect(typeof scene.props.entering).toBe("function");
    expect(scene.props.exiting).toBeUndefined();
    expect(scene).toHaveProp("collapsable", false);
  });

  it("compiles both zoom directions as UI-thread worklets", () => {
    expect(calendarViewEntering("MONTH")).toHaveProperty("__workletHash");
    expect(calendarViewEntering("YEAR")).toHaveProperty("__workletHash");
  });
});
