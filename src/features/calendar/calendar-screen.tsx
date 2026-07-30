import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  RefreshControl,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

import { useMediShift } from "@/application/medishift-provider";
import { currentMonth } from "@/engine/calendar";
import { MonthCard, MONTH_ITEM_HEIGHT } from "@/features/calendar/month-card";
import {
  appendMonths,
  createMonthWindow,
  prependMonths,
} from "@/features/calendar/month-window";
import { usePalette } from "@/theme/palette";
import { LoadingView } from "@/ui/loading-view";

const MONTHS_BEFORE = 12;
const MONTHS_AFTER = 24;
const EXTENSION_SIZE = 12;

function createInitialMonths(): string[] {
  return [...createMonthWindow(currentMonth(), MONTHS_BEFORE, MONTHS_AFTER)];
}

export function CalendarScreen() {
  const palette = usePalette();
  const { ready, error, profile, entries, reload } = useMediShift();
  const [months, setMonths] = useState(createInitialMonths);
  const [refreshing, setRefreshing] = useState(false);
  const lastPrepended = useRef<string | null>(null);
  const lastAppended = useRef<string | null>(null);

  useEffect(() => {
    if (ready && profile === null) {
      router.replace("/onboarding");
    }
  }, [profile, ready]);

  const sortedEntries = useMemo(
    () => [...entries].sort((left, right) => left.date.localeCompare(right.date)),
    [entries],
  );

  if (!ready || profile === null) return <LoadingView />;

  async function refresh() {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }

  function selectDate(date: string) {
    if (process.env.EXPO_OS === "ios") {
      void Haptics.selectionAsync();
    }
    router.push({ pathname: "/day-editor", params: { date } });
  }

  function extendEnd() {
    const last = months.at(-1);
    if (!last || lastAppended.current === last) return;
    lastAppended.current = last;
    setMonths((current) => [...appendMonths(current, EXTENSION_SIZE)]);
  }

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (event.nativeEvent.contentOffset.y > 100) return;
    const first = months[0];
    if (!first || lastPrepended.current === first) return;
    lastPrepended.current = first;
    setMonths((current) => [...prependMonths(current, EXTENSION_SIZE)]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      {error ? (
        <View style={{ backgroundColor: palette.danger, paddingHorizontal: 14, paddingVertical: 7 }}>
          <Text accessibilityRole="alert" selectable style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "800" }}>
            {error}
          </Text>
        </View>
      ) : null}
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        data={months}
        getItemLayout={(_, index) => ({
          index,
          length: MONTH_ITEM_HEIGHT,
          offset: MONTH_ITEM_HEIGHT * index,
        })}
        initialNumToRender={3}
        initialScrollIndex={MONTHS_BEFORE}
        keyExtractor={(month) => month}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        maxToRenderPerBatch={4}
        onEndReached={extendEnd}
        onEndReachedThreshold={0.6}
        onScroll={handleScroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={palette.primary}
            onRefresh={() => void refresh()}
          />
        }
        renderItem={({ item }) => (
          <MonthCard
            entries={sortedEntries}
            month={item}
            onSelectDate={selectDate}
            profile={profile}
          />
        )}
        scrollEventThrottle={250}
        showsVerticalScrollIndicator={false}
        windowSize={7}
      />
    </View>
  );
}
