import Ionicons from "@expo/vector-icons/Ionicons";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";

import { formatMonthTitle } from "@/engine/calendar";
import type { CalendarViewMode } from "@/features/calendar/calendar-display";
import { calculateMonthProgress } from "@/features/calendar/calendar-metrics";
import { usePalette } from "@/theme/palette";

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
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const accent = progress.displayPercent >= 100 ? palette.success : palette.primary;

  return (
    <Pressable
      accessibilityLabel={`Monatsfortschritt ${progress.displayPercent} Prozent, Auswertung öffnen`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        width: 72,
        height: 72,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 36,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.primarySoft,
        boxShadow: `0 5px 18px ${palette.shadow}`,
        opacity: pressed ? 0.58 : 1,
      })}
    >
      <Svg height={72} width={72} viewBox="0 0 72 72">
        <Circle cx={36} cy={36} fill="none" r={radius} stroke={palette.surfaceRaised} strokeWidth={6} />
        <Circle
          cx={36}
          cy={36}
          fill="none"
          r={radius}
          stroke={accent}
          strokeDasharray={`${circumference}`}
          strokeDashoffset={circumference * (1 - progress.fillPercent / 100)}
          strokeLinecap="round"
          strokeWidth={6}
          transform="rotate(-90 36 36)"
        />
      </Svg>
      <Text
        adjustsFontSizeToFit
        numberOfLines={1}
        style={{
          position: "absolute",
          maxWidth: 52,
          color: accent,
          fontSize: 14,
          fontWeight: "900",
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
        minHeight: (process.env.EXPO_OS === "web" ? 12 : insets.top) + 116,
        flexDirection: "row",
        alignItems: "center",
        gap: 16,
        backgroundColor: palette.background,
        paddingTop: (process.env.EXPO_OS === "web" ? 12 : insets.top) + 18,
        paddingHorizontal: 20,
        paddingBottom: 18,
      }}
    >
      <View style={{ flex: 1, minWidth: 0, justifyContent: "center" }}>
        {viewMode === "MONTH" ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Pressable
              accessibilityLabel={`${year}, Jahresansicht öffnen`}
              accessibilityRole="button"
              onPress={onOpenYear}
              style={({ pressed }) => ({
                minHeight: 44,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: palette.primary,
                backgroundColor: palette.primarySoft,
                paddingHorizontal: 12,
                opacity: pressed ? 0.58 : 1,
              })}
            >
              <Text style={{ color: palette.primary, fontSize: 14, fontWeight: "900", fontVariant: ["tabular-nums"] }}>
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
                fontSize: 32,
                fontWeight: "900",
                lineHeight: 38,
                letterSpacing: -0.7,
              }}
            >
              {title}
            </Animated.Text>
          </View>
        ) : (
          <View style={{ gap: 3 }}>
            <Text style={{ color: palette.textMuted, fontSize: 11, fontWeight: "800" }}>
              Jahresübersicht
            </Text>
            <Animated.Text
              key={`${viewMode}-${title}`}
              entering={FadeInDown.duration(110).reduceMotion(ReduceMotion.System)}
              numberOfLines={1}
              style={{
                color: palette.text,
                fontSize: 32,
                fontWeight: "900",
                lineHeight: 38,
                letterSpacing: -0.7,
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
