import { fireEvent, render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

import { SmallButton } from "@/features/dev-tools/dev-tools-screen";

jest.mock("expo-sqlite", () => ({ useSQLiteContext: jest.fn() }));

describe("dev tool controls", () => {
  it("exposes secondary actions as named buttons", async () => {
    const onPress = jest.fn();
    const screen = await render(<SmallButton label="Original laden" onPress={onPress} />);

    await fireEvent.press(screen.getByRole("button", { name: "Original laden" }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
