import { render } from "@testing-library/react-native";
import { describe, expect, it } from "@jest/globals";
import { Text } from "react-native";

import {
  CALENDAR_VIEW_ZOOM,
  CalendarViewTransition,
  calendarViewEntering,
  calendarViewExiting,
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
    const exiting = calendarViewExiting("MONTH")({} as never);
    expect(entering.initialValues).toMatchObject({
      opacity: CALENDAR_VIEW_ZOOM.edgeOpacity,
      transform: [{ scale: CALENDAR_VIEW_ZOOM.monthScale }],
    });
    expect(exiting.initialValues).toMatchObject({ opacity: 1, transform: [{ scale: 1 }] });
    expect(typeof scene.props.entering).toBe("function");
    expect(typeof scene.props.exiting).toBe("function");
  });
});
