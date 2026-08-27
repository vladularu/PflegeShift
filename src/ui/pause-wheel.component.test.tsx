import { fireEvent, render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

import { PauseWheel } from "@/ui/pause-wheel";

describe("PauseWheel", () => {
  it("keeps the controlled five-step pause contract for taps and scrolling", async () => {
    const onChange = jest.fn();
    const screen = await render(
      <PauseWheel
        onChange={onChange}
        selectionTestID="pause-selection"
        testID="pause-wheel"
        value={30}
      />,
    );

    expect(screen.getByTestId("pause-selection")).toHaveStyle({ height: 44 });
    expect(screen.getAllByRole("radio")).toHaveLength(5);
    expect(
      screen.getByRole("radio", { name: "30 Minuten" }).props.accessibilityState,
    ).toMatchObject({ selected: true });

    const wheel = screen.getByTestId("pause-wheel");
    await fireEvent(wheel, "scrollEndDrag", {
      nativeEvent: {
        contentOffset: { x: 0, y: 88 },
        targetContentOffset: { x: 0, y: 88 },
      },
    });
    expect(onChange).toHaveBeenLastCalledWith(30);

    await fireEvent(wheel, "momentumScrollEnd", {
      nativeEvent: { contentOffset: { x: 0, y: 132 } },
    });
    expect(onChange).toHaveBeenLastCalledWith(45);
    expect(
      screen.getByRole("radio", { name: "45 Minuten" }).props.accessibilityState,
    ).toMatchObject({ selected: true });

    await fireEvent.press(screen.getByRole("radio", { name: "60 Minuten" }));
    expect(onChange).toHaveBeenLastCalledWith(60);
    expect(screen.queryByRole("radio", { name: "75 Minuten" })).toBeNull();
  });

  it("starts on the nearest supported step for a legacy custom value", async () => {
    const onChange = jest.fn();
    const screen = await render(<PauseWheel onChange={onChange} value={37} />);

    expect(
      screen.getByRole("radio", { name: "30 Minuten" }).props.accessibilityState,
    ).toMatchObject({ selected: true });

    await fireEvent(screen.getByLabelText("Pausendauer in 15-Minuten-Schritten"), "scrollEndDrag", {
      nativeEvent: { contentOffset: { x: 0, y: 44 } },
    });
    expect(onChange).toHaveBeenCalledWith(15);
  });
});
