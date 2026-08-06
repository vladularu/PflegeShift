import Ionicons from "@expo/vector-icons/Ionicons";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { CalendarViewMode } from "@/domain/types";
import { formatMonthTitle } from "@/engine/calendar";
import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { CONTROL_HEIGHT, RADII, SPACING } from "@/theme/tokens";

export const CalendarHeader = memo(function CalendarHeader({
  month,
  viewMode,
  onOpenYear,
}: {
  readonly month: string;
  readonly viewMode: CalendarViewMode;
  readonly onOpenYear: () => void;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const year = month.slice(0, 4);
  const monthName = formatMonthTitle(month).replace(/\s+\d{4}$/, "");
  const title = viewMode === "YEAR" ? year : monthName;

  return (
    <View
      style={{
        minHeight: (process.env.EXPO_OS === "web" ? 12 : insets.top) + 76,
        justifyContent: "flex-end",
        backgroundColor: palette.background,
        paddingTop: (process.env.EXPO_OS === "web" ? 12 : insets.top) + SPACING.sm,
        paddingHorizontal: SPACING.lg,
        paddingBottom: SPACING.sm,
      }}
    >
      {viewMode === "MONTH" ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm }}>
          <Pressable
            accessibilityLabel={`${year}, Jahresansicht öffnen`}
            accessibilityRole="button"
            onPress={onOpenYear}
            style={({ pressed }) => ({
              minWidth: 64,
              minHeight: CONTROL_HEIGHT.compact,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: SPACING.xxs,
              borderRadius: RADII.pill,
              backgroundColor: pressed ? palette.surfaceMuted : palette.primarySoft,
              paddingHorizontal: SPACING.md,
            })}
          >
            <Text
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
              style={{
                color: palette.primary,
                ...TYPOGRAPHY.label,
                fontWeight: "600",
                fontVariant: ["tabular-nums"],
              }}
            >
              {year}
            </Text>
            <Ionicons color={palette.primary} name="chevron-up" size={14} />
          </Pressable>
          <Animated.Text
            key={`${viewMode}-${title}`}
            entering={FadeInDown.duration(110).reduceMotion(ReduceMotion.System)}
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            style={{
              minWidth: 0,
              flexShrink: 1,
              color: palette.text,
              ...TYPOGRAPHY.screenTitle,
              fontSize: 22,
              lineHeight: 28,
            }}
          >
            {title}
          </Animated.Text>
        </View>
      ) : (
        <View style={{ gap: SPACING.xxs }}>
          <Text
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            style={{ color: palette.textMuted, ...TYPOGRAPHY.overline }}
          >
            Jahresübersicht
          </Text>
          <Animated.Text
            key={`${viewMode}-${title}`}
            entering={FadeInDown.duration(110).reduceMotion(ReduceMotion.System)}
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            style={{
              color: palette.text,
              ...TYPOGRAPHY.screenTitle,
              fontSize: 22,
              lineHeight: 28,
              fontVariant: ["tabular-nums"],
            }}
          >
            {title}
          </Animated.Text>
        </View>
      )}
    </View>
  );
});
