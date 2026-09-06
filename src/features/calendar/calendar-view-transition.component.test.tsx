import { render } from "@testing-library/react-native";
import { describe, expect, it } from "@jest/globals";
import { Text } from "react-native";

import { CalendarViewTransition } from "@/features/calendar/calendar-view-transition";
import { MOTION } from "@/theme/motion";

describe("CalendarViewTransition", () => {
  it("uses a calm transform-free fade for calendar scene changes", async () => {
    const screen = await render(
      <CalendarViewTransition testID="calendar-scene">
        <Text>Kalender</Text>
      </CalendarViewTransition>,
    );
    const scene = screen.getByTestId("calendar-scene");

    expect(scene.props.entering.durationV).toBe(MOTION.duration.deliberate);
    expect(scene.props.entering.initialValues).toBeUndefined();
    expect(scene.props.exiting.durationV).toBe(MOTION.duration.deliberate);
    expect(scene.props.exiting.targetValues).toBeUndefined();
  });
});
