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

import type { CalendarEntry, UserProfile } from "@/domain/types";
import { createMonthGrid, today } from "@/engine/calendar";
import { yearMonths } from "@/features/calendar/calendar-display";
import { usePalette } from "@/theme/palette";
import { COMPACT_TEXT_MAX_SCALE } from "@/theme/typography";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
];
const WEEKDAY_LABELS = ["M", "D", "M", "D", "F", "S", "S"];

interface MiniMonthProps {
  readonly month: string;
  readonly entriesByDate: ReadonlyMap<string, readonly CalendarEntry[]>;
  readonly currentDate: string;
  readonly selected: boolean;
  readonly onSelectMonth: (month: string) => void;
}

const MiniMonth = memo(function MiniMonth({
  month,
  entriesByDate,
  currentDate,
  selected,
  onSelectMonth,
}: MiniMonthProps) {
  const palette = usePalette();
  const monthIndex = Number(month.slice(5, 7)) - 1;
  const grid = useMemo(() => createMonthGrid(month), [month]);

  return (
    <Pressable
      accessibilityLabel={`${MONTH_LABELS[monthIndex]} ${month.slice(0, 4)} öffnen`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => onSelectMonth(month)}
      style={({ pressed }) => ({
        width: "100%",
        minWidth: 0,
        opacity: pressed ? 0.58 : 1,
        paddingHorizontal: 7,
        paddingVertical: 6,
      })}
    >
      <Text
        maxFontSizeMultiplier={COMPACT_TEXT_MAX_SCALE}
        style={{
          color: palette.text,
          fontSize: 18,
          fontWeight: "700",
          marginBottom: 4,
        }}
      >
        {MONTH_LABELS[monthIndex]}
      </Text>
      <View style={{ flexDirection: "row", marginBottom: 3 }}>
        {WEEKDAY_LABELS.map((label, index) => (
          <Text
            key={`${label}-${index}`}
            maxFontSizeMultiplier={COMPACT_TEXT_MAX_SCALE}
            style={{
              flex: 1,
              color: index >= 5 ? palette.textMuted : palette.textSecondary,
              fontSize: 9,
              fontWeight: "500",
              textAlign: "center",
            }}
          >
            {label}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {grid.map((cell) => {
          if (!cell.inMonth) {
            return <View key={cell.date} style={{ width: "14.285714%", height: 21 }} />;
          }
          const dayEntries = entriesByDate.get(cell.date) ?? [];
          const isToday = cell.date === currentDate;
          return (
            <View key={cell.date} style={{ width: "14.285714%", height: 21, alignItems: "center" }}>
              <View
                style={{
                  width: 17,
                  height: 17,
                  borderRadius: 9,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: isToday ? palette.primary : "transparent",
                }}
              >
                <Text
                  maxFontSizeMultiplier={COMPACT_TEXT_MAX_SCALE}
                  style={{
                    color: isToday ? palette.onPrimary : palette.text,
                    fontSize: 9,
                    fontWeight: "600",
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {cell.day}
                </Text>
              </View>
              <View style={{ height: 4, flexDirection: "row", gap: 1 }}>
                {dayEntries.slice(0, 2).map((entry) => (
                  <View
                    key={`${entry.kind}-${entry.id}`}
                    style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: entry.color }}
                  />
                ))}
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

interface YearRowProps extends YearRow {
  readonly currentDate: string;
  readonly entriesByDate: ReadonlyMap<string, readonly CalendarEntry[]>;
  readonly onSelectMonth: (month: string) => void;
  readonly selectedMonth: string;
}

const YearRowView = memo(function YearRowView({
  currentDate,
  entriesByDate,
  months,
  onSelectMonth,
  selectedMonth,
}: YearRowProps) {
  return (
    <View style={{ flexDirection: "row" }}>
      {months.map((month) => (
        <View key={month} style={{ width: "33.333333%", padding: 1 }}>
          <MiniMonth
            currentDate={currentDate}
            entriesByDate={entriesByDate}
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
  entries,
  profile,
  selectedMonth,
  onSelectMonth,
}: {
  readonly year: number;
  readonly entries: readonly CalendarEntry[];
  readonly profile: UserProfile;
  readonly selectedMonth: string;
  readonly onSelectMonth: (month: string) => void;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const entriesByDate = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const entry of entries) {
      if (entry.deletedAt !== null || !entry.date.startsWith(`${year}-`)) continue;
      const values = map.get(entry.date) ?? [];
      values.push(entry);
      map.set(entry.date, values);
    }
    return map;
  }, [entries, year]);
  const rows = useMemo<readonly YearRow[]>(() => {
    const months = yearMonths(year);
    return Array.from({ length: 4 }, (_, index) => ({
      key: `${year}-row-${index}`,
      months: months.slice(index * 3, index * 3 + 3),
    }));
  }, [year]);
  const currentDate = today(profile.timeZone);
  const contentWidth = Math.min(width - 12, 720);
  const renderRow = useCallback(
    ({ item }: ListRenderItemInfo<YearRow>) => (
      <View style={{ width: contentWidth }}>
        <YearRowView
          currentDate={currentDate}
          entriesByDate={entriesByDate}
          key={item.key}
          months={item.months}
          onSelectMonth={onSelectMonth}
          selectedMonth={selectedMonth}
        />
      </View>
    ),
    [contentWidth, currentDate, entriesByDate, onSelectMonth, selectedMonth],
  );

  return (
    <View
      style={{
        flex: 1,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: palette.separator,
        borderRadius: 22,
        borderCurve: "continuous",
        backgroundColor: palette.surface,
        marginHorizontal: 6,
        marginBottom: 6,
      }}
    >
      <FlatList
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          alignItems: "center",
          gap: 2,
          paddingTop: 8,
          paddingBottom:
            Platform.OS === "ios" ? insets.bottom + 57 : Math.max(8, insets.bottom + 8),
        }}
        data={rows}
        initialNumToRender={2}
        keyExtractor={(item) => item.key}
        maxToRenderPerBatch={2}
        removeClippedSubviews={process.env.EXPO_OS !== "web"}
        renderItem={renderRow}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        windowSize={3}
      />
    </View>
  );
}
