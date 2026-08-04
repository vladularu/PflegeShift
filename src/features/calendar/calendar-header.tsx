import Ionicons from "@expo/vector-icons/Ionicons";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";

import { formatMonthTitle } from "@/engine/calendar";
import type { CalendarViewMode } from "@/domain/types";
import { calculateMonthProgress } from "@/features/calendar/calendar-metrics";
import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { CONTROL_HEIGHT, RADII, SPACING } from "@/theme/tokens";

const MonthProgress = memo(function MonthProgress({
  actualMinutes,
  targetMinutes,
  onPress,
}: {
  readonly actualMinutes: number;
  readonly targetMinutes: number;
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  const progress = calculateMonthProgress(actualMinutes, targetMinutes);
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const accent = progress.displayPercent >= 100 ? palette.success : palette.primary;

  return (
    <Pressable
      accessibilityLabel={`Monatsfortschritt ${progress.displayPercent} Prozent, Auswertung öffnen`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        width: 64,
        height: 64,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: RADII.pill,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.surface,
        opacity: pressed ? 0.58 : 1,
      })}
    >
      <Svg height={64} width={64} viewBox="0 0 64 64">
        <Circle cx={32} cy={32} fill="none" r={radius} stroke={palette.surfaceMuted} strokeWidth={5} />
        <Circle
          cx={32}
          cy={32}
          fill="none"
          r={radius}
          stroke={accent}
          strokeDasharray={`${circumference}`}
          strokeDashoffset={circumference * (1 - progress.fillPercent / 100)}
          strokeLinecap="round"
          strokeWidth={5}
          transform="rotate(-90 32 32)"
        />
      </Svg>
      <Text
        adjustsFontSizeToFit
        numberOfLines={1}
        style={{
          position: "absolute",
          maxWidth: 46,
          color: accent,
          fontSize: 13,
          fontWeight: "700",
          fontVariant: ["tabular-nums"],
        }}
      >
        {progress.displayPercent}%
      </Text>
    </Pressable>
  );
});

export const CalendarHeader = memo(function CalendarHeader({
  actualMinutes,
  month,
  targetMinutes,
  viewMode,
  onOpenAnalysis,
  onOpenYear,
}: {
  readonly actualMinutes: number;
  readonly month: string;
  readonly targetMinutes: number;
  readonly viewMode: CalendarViewMode;
  readonly onOpenAnalysis: () => void;
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
        minHeight: (process.env.EXPO_OS === "web" ? 12 : insets.top) + 108,
        flexDirection: "row",
        alignItems: "center",
        gap: SPACING.lg,
        backgroundColor: palette.background,
        paddingTop: (process.env.EXPO_OS === "web" ? 12 : insets.top) + SPACING.lg,
        paddingHorizontal: SPACING.xl,
        paddingBottom: SPACING.lg,
      }}
    >
      <View style={{ flex: 1, minWidth: 0, justifyContent: "center" }}>
        {viewMode === "MONTH" ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm }}>
            <Pressable
              accessibilityLabel={`${year}, Jahresansicht öffnen`}
              accessibilityRole="button"
              onPress={onOpenYear}
              style={({ pressed }) => ({
                minHeight: CONTROL_HEIGHT.compact,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: SPACING.xxs,
                borderRadius: RADII.pill,
                backgroundColor: palette.primarySoft,
                paddingHorizontal: SPACING.md,
                opacity: pressed ? 0.58 : 1,
              })}
            >
              <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} style={{ color: palette.primary, ...TYPOGRAPHY.label, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                {year}
              </Text>
              <Ionicons color={palette.primary} name="chevron-up" size={14} />
            </Pressable>
            <Animated.Text
              key={`${viewMode}-${title}`}
              adjustsFontSizeToFit
              entering={FadeInDown.duration(110).reduceMotion(ReduceMotion.System)}
              minimumFontScale={0.72}
              numberOfLines={1}
              style={{
                minWidth: 0,
                flexShrink: 1,
                color: palette.text,
                ...TYPOGRAPHY.hero,
                fontSize: 30,
                lineHeight: 36,
              }}
            >
              {title}
            </Animated.Text>
          </View>
        ) : (
          <View style={{ gap: SPACING.xxs }}>
            <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} style={{ color: palette.textMuted, ...TYPOGRAPHY.overline }}>
              Jahresübersicht
            </Text>
            <Animated.Text
              key={`${viewMode}-${title}`}
              entering={FadeInDown.duration(110).reduceMotion(ReduceMotion.System)}
              numberOfLines={1}
              style={{
                color: palette.text,
                ...TYPOGRAPHY.hero,
                fontSize: 30,
                lineHeight: 36,
                fontVariant: ["tabular-nums"],
              }}
            >
              {title}
            </Animated.Text>
          </View>
        )}
      </View>

      {viewMode === "MONTH" ? (
        <MonthProgress
          actualMinutes={actualMinutes}
          onPress={onOpenAnalysis}
          targetMinutes={targetMinutes}
        />
      ) : null}
    </View>
  );
});
