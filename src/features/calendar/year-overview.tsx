import { memo, useCallback, useMemo } from "react";
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

  return (
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
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {grid.map((cell) => {
          if (!cell.inMonth)
            return <View key={cell.date} style={{ width: "14.285714%", height: 21 }} />;
          const isToday = cell.date === currentDate;
          return (
            <View key={cell.date} style={{ width: "14.285714%", height: 21, alignItems: "center" }}>
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
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
                    fontSize: 10,
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
  year,
  profile,
  selectedMonth,
  onSelectMonth,
}: {
  readonly year: number;
  readonly profile: UserProfile;
  readonly selectedMonth: string;
  readonly onSelectMonth: (month: string) => void;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
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
      <View style={{ width: contentWidth }}>
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

  return (
    <View style={{ flex: 1, overflow: "hidden", backgroundColor: palette.background }}>
      <FlatList
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
