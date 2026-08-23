import { render } from "@testing-library/react-native";
import { describe, expect, it } from "@jest/globals";
import { Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { FadeIn, FadeOut } from "react-native-reanimated";

import { SCREEN_LAYOUT, SPACING } from "@/theme/tokens";
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
    expect(screen.getByTestId("tab-screen-header-title-area")).toHaveStyle({
      minHeight:
        SCREEN_LAYOUT.headerMinHeight -
        SCREEN_LAYOUT.headerTopPadding -
        SCREEN_LAYOUT.headerBottomPadding,
      justifyContent: "flex-end",
    });
    expect(screen.getByTestId("tab-screen-header-toolbar-area")).toHaveStyle({
      marginTop: SPACING.xs,
    });
    expect(screen.getByRole("header", { name: "Kalender" })).toHaveProp(
      "dynamicTypeRamp",
      "largeTitle",
    );
    expect(screen.getByTestId("header-toolbar")).toHaveTextContent("Zeitraum");
  });

  it("keeps the title anchor identical with and without a toolbar", async () => {
    const screen = await render(
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <TabScreenHeader testID="calendar-header" title="August" />
        <TabScreenHeader
          testID="analysis-header"
          title="Auswertung"
          toolbar={
            <View accessibilityRole="toolbar">
              <Text>Zeitraum</Text>
            </View>
          }
        />
      </SafeAreaProvider>,
    );

    expect(screen.getByTestId("analysis-header-title-area").props.style).toEqual(
      screen.getByTestId("calendar-header-title-area").props.style,
    );
  });

  it("forwards a complete title enter and exit contract", async () => {
    const entering = FadeIn.duration(300);
    const exiting = FadeOut.duration(300);
    const screen = await render(
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <TabScreenHeader
          title="August"
          titleEntering={entering}
          titleExiting={exiting}
          titleKey="2026-08"
        />
      </SafeAreaProvider>,
    );

    expect(screen.getByRole("header", { name: "August" })).toHaveProp("entering", entering);
    expect(screen.getByRole("header", { name: "August" })).toHaveProp("exiting", exiting);
  });
});
