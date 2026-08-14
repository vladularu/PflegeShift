import { render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { Text } from "react-native";

import { AccessibleTabScreen } from "@/ui/accessible-tab-screen";

jest.mock("expo-router", () => ({
  useIsFocused: () => true,
}));

describe("accessible tab screen layout", () => {
  it("keeps the native tab screen full-height while exposing the focused content", async () => {
    const screen = await render(
      <AccessibleTabScreen>
        <Text>Inhalt</Text>
      </AccessibleTabScreen>,
    );

    expect(screen.getByText("Inhalt").parent).toHaveStyle({ flex: 1 });
  });
});
