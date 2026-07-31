import Ionicons from "@expo/vector-icons/Ionicons";
import { memo, useCallback, useMemo } from "react";
import {
  FlatList,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type ListRenderItemInfo,
} from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";

import type { CalendarEntry, UserProfile } from "@/domain/types";
import { createMonthGrid, today } from "@/engine/calendar";
import { yearMonths } from "@/features/calendar/calendar-display";
import { usePalette } from "@/theme/palette";

const MONTH_LABELS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
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
        borderWidth: selected ? 1 : 0,
        borderColor: palette.primary,
        borderRadius: 16,
        borderCurve: "continuous",
        backgroundColor: selected ? palette.primarySoft : "transparent",
        opacity: pressed ? 0.58 : 1,
        padding: 8,
      })}
    >
      <Text style={{ color: selected ? palette.primary : palette.text, fontSize: 17, fontWeight: "900", marginBottom: 6 }}>
        {MONTH_LABELS[monthIndex]}
      </Text>
      <View style={{ flexDirection: "row", marginBottom: 3 }}>
        {WEEKDAY_LABELS.map((label, index) => (
          <Text
            key={`${label}-${index}`}
            style={{
              flex: 1,
              color: index >= 5 ? palette.textMuted : palette.textSecondary,
              fontSize: 7,
              fontWeight: "800",
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
            return <View key={cell.date} style={{ width: "14.285714%", height: 23 }} />;
          }
          const dayEntries = entriesByDate.get(cell.date) ?? [];
          const isToday = cell.date === currentDate;
          return (
            <View key={cell.date} style={{ width: "14.285714%", height: 23, alignItems: "center" }}>
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
                <Text style={{ color: isToday ? palette.onPrimary : palette.text, fontSize: 8, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                  {cell.day}
                </Text>
              </View>
              <View style={{ height: 4, flexDirection: "row", gap: 1 }}>
                {dayEntries.slice(0, 2).map((entry) => (
                  <View key={`${entry.kind}-${entry.id}`} style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: entry.color }} />
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
  readonly index: number;
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
  index,
  months,
  onSelectMonth,
  selectedMonth,
}: YearRowProps) {
  return (
    <Animated.View
      entering={FadeInUp.delay(index * 36).duration(180)}
      style={{ flexDirection: "row" }}
    >
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
    </Animated.View>
  );
});

export function YearOverview({
  year,
  entries,
  profile,
  selectedMonth,
  onSelectMonth,
  onMoveYear,
}: {
  readonly year: number;
  readonly entries: readonly CalendarEntry[];
  readonly profile: UserProfile;
  readonly selectedMonth: string;
  readonly onSelectMonth: (month: string) => void;
  readonly onMoveYear: (amount: number) => void;
}) {
  const palette = usePalette();
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
      index,
    }));
  }, [year]);
  const currentDate = today(profile.timeZone);
  const contentWidth = Math.min(width - 20, 720);
  const renderRow = useCallback(({ item }: ListRenderItemInfo<YearRow>) => (
    <View style={{ width: contentWidth }}>
      <YearRowView
        currentDate={currentDate}
        entriesByDate={entriesByDate}
        index={item.index}
        key={item.key}
        months={item.months}
        onSelectMonth={onSelectMonth}
        selectedMonth={selectedMonth}
      />
    </View>
  ), [contentWidth, currentDate, entriesByDate, onSelectMonth, selectedMonth]);

  return (
    <FlatList
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={{ alignItems: "center", gap: 8, paddingBottom: 24 }}
      data={rows}
      initialNumToRender={2}
      keyExtractor={(item) => item.key}
      ListHeaderComponent={(
        <View style={{ width: contentWidth, flexDirection: "row", justifyContent: "space-between" }}>
          <Pressable
            accessibilityLabel="Vorheriges Jahr"
            accessibilityRole="button"
            onPress={() => onMoveYear(-1)}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 22,
              backgroundColor: palette.surfaceMuted,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Ionicons color={palette.primary} name="chevron-back" size={20} />
          </Pressable>
          <Pressable
            accessibilityLabel="Nächstes Jahr"
            accessibilityRole="button"
            onPress={() => onMoveYear(1)}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 22,
              backgroundColor: palette.surfaceMuted,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Ionicons color={palette.primary} name="chevron-forward" size={20} />
          </Pressable>
        </View>
      )}
      maxToRenderPerBatch={2}
      removeClippedSubviews={process.env.EXPO_OS !== "web"}
      renderItem={renderRow}
      showsVerticalScrollIndicator={false}
      style={{ flex: 1, backgroundColor: palette.background }}
      windowSize={3}
    />
  );
}
