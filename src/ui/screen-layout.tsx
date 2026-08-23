import type { ComponentProps, Key, PropsWithChildren, ReactNode } from "react";
import { useContext } from "react";
import {
  ScrollView,
  View,
  useWindowDimensions,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import Animated from "react-native-reanimated";

import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { SCREEN_LAYOUT, SPACING } from "@/theme/tokens";

export type ScreenSurface = "background" | "groupedBackground";

export function ScreenScrollView({
  bottomPadding = SCREEN_LAYOUT.contentBottomPadding,
  children,
  contentContainerStyle,
  contentGap = SCREEN_LAYOUT.contentGap,
  contentInsetAdjustmentBehavior = "automatic",
  style,
  surface = "background",
  ...scrollViewProps
}: PropsWithChildren<
  Omit<ScrollViewProps, "contentContainerStyle"> & {
    readonly bottomPadding?: number;
    readonly contentContainerStyle?: StyleProp<ViewStyle>;
    readonly contentGap?: number;
    readonly surface?: ScreenSurface;
  }
>) {
  const palette = usePalette();

  return (
    <ScrollView
      {...scrollViewProps}
      contentInsetAdjustmentBehavior={contentInsetAdjustmentBehavior}
      contentContainerStyle={[
        {
          gap: contentGap,
          paddingHorizontal: SCREEN_LAYOUT.horizontalPadding,
          paddingTop: SCREEN_LAYOUT.contentTopPadding,
          paddingBottom: bottomPadding,
        },
        contentContainerStyle,
      ]}
      style={[{ backgroundColor: palette[surface] }, style]}
    >
      {children}
    </ScrollView>
  );
}

export function TabScreenHeader({
  accessory,
  surface = "background",
  testID,
  title,
  titleEntering,
  titleKey,
  toolbar,
}: {
  readonly accessory?: ReactNode;
  readonly surface?: ScreenSurface;
  readonly testID?: string;
  readonly title: string;
  readonly titleEntering?: ComponentProps<typeof Animated.Text>["entering"];
  readonly titleKey?: Key;
  readonly toolbar?: ReactNode;
}) {
  const palette = usePalette();
  const topInset = useContext(SafeAreaInsetsContext)?.top ?? 0;
  const { fontScale } = useWindowDimensions();
  const stackAccessory =
    Boolean(accessory) && fontScale >= SCREEN_LAYOUT.headerAccessoryStackFontScale;
  const safeTop = process.env.EXPO_OS === "web" ? SCREEN_LAYOUT.contentTopPadding : topInset;
  const titleAreaMinHeight =
    SCREEN_LAYOUT.headerMinHeight -
    SCREEN_LAYOUT.headerTopPadding -
    SCREEN_LAYOUT.headerBottomPadding;

  return (
    <View
      testID={testID}
      style={{
        minHeight: safeTop + SCREEN_LAYOUT.headerMinHeight,
        backgroundColor: palette[surface],
        paddingTop: safeTop + SCREEN_LAYOUT.headerTopPadding,
        paddingHorizontal: SCREEN_LAYOUT.horizontalPadding,
        paddingBottom: SCREEN_LAYOUT.headerBottomPadding,
      }}
    >
      <View
        testID={testID ? `${testID}-title-area` : undefined}
        style={{
          minHeight: titleAreaMinHeight,
          justifyContent: "flex-end",
        }}
      >
        <View
          style={{
            flexDirection: stackAccessory ? "column" : "row",
            alignItems: stackAccessory ? "stretch" : "flex-end",
            gap: SPACING.md,
          }}
        >
          <Animated.Text
            key={titleKey}
            accessibilityRole="header"
            dynamicTypeRamp="largeTitle"
            entering={titleEntering}
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            style={{
              flex: stackAccessory ? undefined : 1,
              color: palette.text,
              ...TYPOGRAPHY.hero,
            }}
          >
            {title}
          </Animated.Text>
          {accessory ? (
            <View
              style={{
                alignSelf: stackAccessory ? "stretch" : "auto",
                alignItems: stackAccessory ? "flex-end" : undefined,
              }}
            >
              {accessory}
            </View>
          ) : null}
        </View>
      </View>
      {toolbar ? (
        <View
          testID={testID ? `${testID}-toolbar-area` : undefined}
          style={{ marginTop: SPACING.xs }}
        >
          {toolbar}
        </View>
      ) : null}
    </View>
  );
}
