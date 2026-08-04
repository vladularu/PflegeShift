import { fireEvent, render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

import { LoadFailureView, LoadingView } from "@/ui/loading-view";

describe("loading and failure states", () => {
  it("announces loading progress", async () => {
    const screen = await render(<LoadingView label="Daten werden geladen" />);

    expect(screen.getByRole("progressbar", { name: "Daten werden geladen" })).toBeTruthy();
  });

  it("offers a reachable retry action", async () => {
    const onRetry = jest.fn();
    const screen = await render(
      <LoadFailureView message="Bitte erneut versuchen." onRetry={onRetry} />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Daten konnten nicht geladen werden");
    await fireEvent.press(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
