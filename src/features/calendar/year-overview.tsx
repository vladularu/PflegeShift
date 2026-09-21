import { memo, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import {
  FlatList,
  Platform,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type ListRenderItemInfo,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { UserProfile } from "@/domain/types";
import { createMonthGrid, today } from "@/engine/calendar";
import { yearMonths } from "@/features/calendar/calendar-display";
import { usePalette } from "@/theme/palette";
import { COMPACT_TEXT_MAX_SCALE } from "@/theme/typography";
import { CalendarMorphMotion, useCalendarMorphMeasurement } from "./calendar-morph-measurement";
import { MINI_MONTH_MOTION_METRICS } from "./calendar-morph-geometry";

const MONTH_LABELS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

interface MiniMonthProps {
  readonly month: string;
  readonly currentDate: string;
  readonly selected: boolean;
  readonly onSelectMonth: (month: string) => void;
}

const MiniMonth = memo(function MiniMonth({
  month,
  currentDate,
  selected,
  onSelectMonth,
}: MiniMonthProps) {
  const palette = usePalette();
  const monthIndex = Number(month.slice(5, 7)) - 1;
  const grid = useMemo(() => createMonthGrid(month), [month]);
  const currentMonth = currentDate.startsWith(month);
  const motion = useContext(CalendarMorphMotion);
  const neighbor = motion?.plan.neighbors.find((node) => node.month === month);
  const motionStyle = useAnimatedStyle(() => {
    if (!motion)
      return { opacity: 1, transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }] };
    const p = motion.progress.value;
    if (!neighbor)
      return { opacity: 1 - p, transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }] };
    const anchor = motion.plan.anchor;
    const destination = motion.plan.destination;
    const anchorX = anchor.x + anchor.width / 2;
    const anchorY = anchor.y + anchor.height / 2;
    return {
      opacity: 1 - p,
      transform: [
        {
          translateX:
            (neighbor.rect.x + neighbor.rect.width / 2 - anchorX) * 2 * p +
            (destination.x + destination.width / 2 - anchorX) * p,
        },
        {
          translateY:
            (neighbor.rect.y + neighbor.rect.height / 2 - anchorY) * 2 * p +
            (destination.y + destination.height / 2 - anchorY) * p,
        },
        { scale: 1 + 2 * p },
      ],
    };
  });
  const { fontScale } = useWindowDimensions();
  const gridRef = useCalendarMorphMeasurement({
    kind: "MINI",
    month,
    fontSize: MINI_MONTH_MOTION_METRICS.fontSize * Math.min(fontScale, COMPACT_TEXT_MAX_SCALE),
    color: palette.text,
    mutedColor: palette.textMuted,
    today: currentDate,
    todayColor: palette.onPrimary,
    todayBackground: palette.primary,
  });

  return (
    <Animated.View style={motionStyle}>
      <Pressable
        accessibilityLabel={`${MONTH_LABELS[monthIndex]} ${month.slice(0, 4)} öffnen`}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={() => onSelectMonth(month)}
        style={({ pressed }) => ({
          width: "100%",
          minWidth: 0,
          opacity: pressed ? 0.55 : 1,
          paddingHorizontal: 8,
          paddingVertical: 10,
        })}
      >
        <Text
          maxFontSizeMultiplier={COMPACT_TEXT_MAX_SCALE}
          numberOfLines={1}
          style={{
            color: currentMonth ? palette.primary : palette.text,
            fontSize: 19,
            fontWeight: "700",
            marginBottom: 5,
          }}
        >
          {MONTH_LABELS[monthIndex]}
        </Text>
        <View
          ref={gridRef}
          collapsable={false}
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            opacity: motion?.month === month ? 0 : 1,
          }}
        >
          {grid.map((cell) => {
            if (!cell.inMonth)
              return (
                <View
                  key={cell.date}
                  style={{ width: "14.285714%", height: MINI_MONTH_MOTION_METRICS.rowHeight }}
                />
              );
            const isToday = cell.date === currentDate;
            return (
              <View
                key={cell.date}
                style={{
                  width: "14.285714%",
                  height: MINI_MONTH_MOTION_METRICS.rowHeight,
                  alignItems: "center",
                }}
              >
                <View
                  style={{
                    width: MINI_MONTH_MOTION_METRICS.daySize,
                    height: MINI_MONTH_MOTION_METRICS.daySize,
                    borderRadius: MINI_MONTH_MOTION_METRICS.daySize / 2,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: isToday ? palette.primary : "transparent",
                  }}
                >
                  <Text
                    maxFontSizeMultiplier={COMPACT_TEXT_MAX_SCALE}
                    style={{
                      color: isToday
                        ? palette.onPrimary
                        : cell.weekend
                          ? palette.textMuted
                          : palette.text,
                      fontSize: MINI_MONTH_MOTION_METRICS.fontSize,
                      fontWeight: isToday ? "700" : "500",
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {cell.day}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </Pressable>
    </Animated.View>
  );
});

interface YearRow {
  readonly key: string;
  readonly months: readonly string[];
}

const YearRowView = memo(function YearRowView({
  currentDate,
  months,
  onSelectMonth,
  selectedMonth,
}: YearRow & {
  readonly currentDate: string;
  readonly onSelectMonth: (month: string) => void;
  readonly selectedMonth: string;
}) {
  return (
    <View style={{ flexDirection: "row" }}>
      {months.map((month) => (
        <View key={month} style={{ width: "33.333333%" }}>
          <MiniMonth
            currentDate={currentDate}
            month={month}
            onSelectMonth={onSelectMonth}
            selected={selectedMonth === month}
          />
        </View>
      ))}
    </View>
  );
});

export function YearOverview({
  active = true,
  year,
  profile,
  selectedMonth,
  onSelectMonth,
}: {
  readonly active?: boolean;
  readonly year: number;
  readonly profile: UserProfile;
  readonly selectedMonth: string;
  readonly onSelectMonth: (month: string) => void;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<YearRow>>(null);
  const viewportHeight = useRef(0);
  const scrollOffset = useRef(0);
  const rowLayouts = useRef(new Map<string, { y: number; height: number }>());
  const rows = useMemo<readonly YearRow[]>(() => {
    const months = yearMonths(year);
    return Array.from({ length: 4 }, (_, index) => ({
      key: `${year}-row-${index}`,
      months: months.slice(index * 3, index * 3 + 3),
    }));
  }, [year]);
  const currentDate = today(profile.timeZone);
  const contentWidth = Math.min(width, 720);
  const renderRow = useCallback(
    ({ item }: ListRenderItemInfo<YearRow>) => (
      <View
        style={{ width: contentWidth }}
        onLayout={(event) => {
          rowLayouts.current.set(item.key, event.nativeEvent.layout);
        }}
      >
        <YearRowView
          currentDate={currentDate}
          key={item.key}
          months={item.months}
          onSelectMonth={onSelectMonth}
          selectedMonth={selectedMonth}
        />
      </View>
    ),
    [contentWidth, currentDate, onSelectMonth, selectedMonth],
  );

  useEffect(() => {
    if (active || viewportHeight.current <= 0) return;
    const row = Math.floor((Number(selectedMonth.slice(5, 7)) - 1) / 3);
    const layout = rowLayouts.current.get(`${year}-row-${row}`);
    if (!layout) return;
    // Keep the original position when the selected row is still visible.
    // Month paging can otherwise leave the return target outside the year viewport.
    const rowTop = row * (layout.height + 6) + 6;
    if (
      rowTop + layout.height <= scrollOffset.current ||
      rowTop >= scrollOffset.current + viewportHeight.current
    ) {
      listRef.current?.scrollToOffset({
        offset: Math.max(0, rowTop - viewportHeight.current / 3),
        animated: false,
      });
    }
  }, [active, selectedMonth, year]);

  return (
    <View style={{ flex: 1, overflow: "hidden", backgroundColor: palette.calendarBackground }}>
      <FlatList
        ref={listRef}
        onLayout={(event) => {
          viewportHeight.current = event.nativeEvent.layout.height;
        }}
        onScroll={(event) => {
          scrollOffset.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          alignItems: "center",
          gap: 6,
          paddingTop: 6,
          paddingBottom:
            Platform.OS === "ios" ? insets.bottom + 57 : Math.max(8, insets.bottom + 8),
        }}
        data={rows}
        initialNumToRender={4}
        keyExtractor={(item) => item.key}
        removeClippedSubviews={false}
        renderItem={renderRow}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
      />
    </View>
  );
}
