import { Image, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { usePalette } from "@/theme/palette";
import { calendarImageOverlayOpacity } from "@/theme/calendar-image";
import { useCalendarBackground } from "@/features/settings/calendar-background-context";

export function CalendarBackground({ uri: overrideUri }: { readonly uri?: string | null }) {
  const palette = usePalette();
  const background = useCalendarBackground();
  const uri = overrideUri === undefined ? background.uri : overrideUri;
  if (!uri) return null;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
      testID="calendar-custom-background"
    >
      <Image
        testID="calendar-custom-background-image"
        source={{ uri }}
        resizeMode="cover"
        style={StyleSheet.absoluteFill}
        accessible={false}
      />
      <View
        testID="calendar-custom-background-overlay"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: palette.calendarBackground,
            opacity: calendarImageOverlayOpacity(background.strength),
          },
        ]}
      />
    </View>
  );
}

/** One fixed photo layer; it fades with the existing month/year transition. */
export function CalendarMonthBackground({ progress }: { readonly progress: SharedValue<number> }) {
  const motion = useAnimatedStyle(() => ({ opacity: progress.value }));
  return (
    <Animated.View
      testID="calendar-month-custom-background"
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, motion]}
    >
      <CalendarBackground />
    </Animated.View>
  );
}
