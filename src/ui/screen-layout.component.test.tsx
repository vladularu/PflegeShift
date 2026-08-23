import { render } from "@testing-library/react-native";
import { describe, expect, it } from "@jest/globals";
import { Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SCREEN_LAYOUT } from "@/theme/tokens";
import { ScreenScrollView, TabScreenHeader } from "@/ui/screen-layout";

const SAFE_AREA_METRICS = {
  frame: { height: 844, width: 390, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 47 },
};

describe("screen layout", () => {
  it("applies the shared content rhythm to scroll screens", async () => {
    const screen = await render(
      <ScreenScrollView bottomPadding={64} testID="screen-shell">
        <Text>Inhalt</Text>
      </ScreenScrollView>,
    );

    expect(screen.getByTestId("screen-shell").props.contentContainerStyle).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gap: SCREEN_LAYOUT.contentGap,
          paddingHorizontal: SCREEN_LAYOUT.horizontalPadding,
          paddingTop: SCREEN_LAYOUT.contentTopPadding,
          paddingBottom: 64,
        }),
      ]),
    );
  });

  it("keeps tab titles safe-area aware and Dynamic Type capable", async () => {
    const screen = await render(
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <TabScreenHeader
          accessory={<Text>Aktion</Text>}
          surface="groupedBackground"
          testID="tab-screen-header"
          title="Kalender"
          toolbar={
            <View accessibilityRole="toolbar" testID="header-toolbar">
              <Text>Zeitraum</Text>
            </View>
          }
        />
      </SafeAreaProvider>,
    );

    expect(screen.getByTestId("tab-screen-header")).toHaveStyle({
      minHeight: SAFE_AREA_METRICS.insets.top + SCREEN_LAYOUT.headerMinHeight,
      paddingHorizontal: SCREEN_LAYOUT.horizontalPadding,
      paddingBottom: SCREEN_LAYOUT.headerBottomPadding,
    });
    expect(screen.getByRole("header", { name: "Kalender" })).toHaveProp(
      "dynamicTypeRamp",
      "largeTitle",
    );
    expect(screen.getByTestId("header-toolbar")).toHaveTextContent("Zeitraum");
  });
});
