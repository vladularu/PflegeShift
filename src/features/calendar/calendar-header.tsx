import Ionicons from "@expo/vector-icons/Ionicons";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";

import { formatMonthTitle } from "@/engine/calendar";
import type { CalendarViewMode } from "@/features/calendar/calendar-display";
import { calculateMonthProgress } from "@/features/calendar/calendar-metrics";
import { usePalette } from "@/theme/palette";

const HeaderIconAction = memo(function HeaderIconAction({
  icon,
  label,
  onPress,
}: {
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 60,
        height: 60,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 30,
        backgroundColor: palette.surfaceMuted,
        opacity: pressed ? 0.58 : 1,
      })}
    >
      <Ionicons color={palette.primary} name={icon} size={26} />
    </Pressable>
  );
});

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
  const radius = 23;
  const circumference = 2 * Math.PI * radius;
  const accent = progress.displayPercent >= 100 ? palette.success : palette.primary;

  return (
    <Pressable
      accessibilityLabel={`Monatsfortschritt ${progress.displayPercent} Prozent, Auswertung öffnen`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        width: 60,
        height: 60,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 30,
        backgroundColor: palette.surfaceRaised,
        boxShadow: `0 3px 12px ${palette.shadow}`,
        opacity: pressed ? 0.58 : 1,
      })}
    >
      <Svg height={60} width={60} viewBox="0 0 60 60">
        <Circle cx={30} cy={30} fill="none" r={radius} stroke={palette.surfaceMuted} strokeWidth={5} />
        <Circle
          cx={30}
          cy={30}
          fill="none"
          r={radius}
          stroke={accent}
          strokeDasharray={`${circumference}`}
          strokeDashoffset={circumference * (1 - progress.fillPercent / 100)}
          strokeLinecap="round"
          strokeWidth={5}
          transform="rotate(-90 30 30)"
        />
      </Svg>
      <Text
        adjustsFontSizeToFit
        numberOfLines={1}
        style={{
          position: "absolute",
          maxWidth: 44,
          color: palette.text,
          fontSize: 12,
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
  onOpenFilters,
  onOpenYear,
}: {
  readonly actualMinutes: number;
  readonly month: string;
  readonly targetMinutes: number;
  readonly viewMode: CalendarViewMode;
  readonly onOpenAnalysis: () => void;
  readonly onOpenFilters: () => void;
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
        minHeight: (process.env.EXPO_OS === "web" ? 12 : insets.top) + 104,
        flexDirection: "row",
        alignItems: "flex-end",
        gap: 16,
        backgroundColor: palette.background,
        paddingTop: (process.env.EXPO_OS === "web" ? 12 : insets.top) + 14,
        paddingHorizontal: 20,
        paddingBottom: 20,
      }}
    >
      <View style={{ flex: 1, minWidth: 0, justifyContent: "flex-end", gap: 4 }}>
        {viewMode === "MONTH" ? (
          <Pressable
            accessibilityLabel={`${year}, Jahresansicht öffnen`}
            accessibilityRole="button"
            hitSlop={6}
            onPress={onOpenYear}
            style={({ pressed }) => ({
              alignSelf: "flex-start",
              flexDirection: "row",
              alignItems: "center",
              gap: 2,
              opacity: pressed ? 0.55 : 1,
            })}
          >
            <Text style={{ color: palette.primary, fontSize: 13, fontWeight: "900", lineHeight: 18, fontVariant: ["tabular-nums"] }}>
              {year}
            </Text>
            <Ionicons color={palette.primary} name="chevron-up" size={13} />
          </Pressable>
        ) : (
          <Text style={{ color: palette.textMuted, fontSize: 11, fontWeight: "800" }}>
            Jahresübersicht
          </Text>
        )}
        <Animated.Text
          key={`${viewMode}-${title}`}
          entering={FadeInDown.duration(110)}
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

      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 2 }}>
        <HeaderIconAction icon="options-outline" label="Kalenderinhalte" onPress={onOpenFilters} />
        {viewMode === "MONTH" ? (
          <MonthProgress
            actualMinutes={actualMinutes}
            onPress={onOpenAnalysis}
            targetMinutes={targetMinutes}
          />
        ) : null}
      </View>
    </View>
  );
});
