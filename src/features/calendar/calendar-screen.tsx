import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

import { useMediShift } from "@/application/medishift-provider";
import { currentMonth } from "@/engine/calendar";
import { MonthCard } from "@/features/calendar/month-card";
import {
  appendMonths,
  createMonthWindow,
  prependMonths,
} from "@/features/calendar/month-window";
import {
  QuickEntryPopover,
  type QuickEntryAnchor,
} from "@/features/calendar/quick-entry-popover";
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
  const { ready, error, profile, entries } = useMediShift();
  const [months, setMonths] = useState(createInitialMonths);
  const [pageHeight, setPageHeight] = useState(0);
  const [quickEntry, setQuickEntry] = useState<QuickEntryAnchor | null>(null);
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

  function selectDate(date: string, anchor: Omit<QuickEntryAnchor, "date">) {
    if (process.env.EXPO_OS === "ios") {
      void Haptics.selectionAsync();
    }
    setQuickEntry({ date, ...anchor });
  }

  function openEditor(mode: "SHIFT" | "APPOINTMENT") {
    if (quickEntry === null) return;
    const date = quickEntry.date;
    setQuickEntry(null);
    router.push({ pathname: "/day-editor", params: { date, mode } });
  }

  function extendEnd() {
    const last = months.at(-1);
    if (!last || lastAppended.current === last) return;
    lastAppended.current = last;
    setMonths((current) => [...appendMonths(current, EXTENSION_SIZE)]);
  }

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (event.nativeEvent.contentOffset.y > pageHeight * 0.2) return;
    const first = months[0];
    if (!first || lastPrepended.current === first) return;
    lastPrepended.current = first;
    setMonths((current) => [...prependMonths(current, EXTENSION_SIZE)]);
  }

  function measurePager(event: LayoutChangeEvent) {
    const nextHeight = Math.round(event.nativeEvent.layout.height);
    if (nextHeight > 0 && nextHeight !== pageHeight) {
      setPageHeight(nextHeight);
    }
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
      <View style={{ flex: 1 }} onLayout={measurePager}>
        {pageHeight > 0 ? (
          <FlatList
            key={`month-pager-${pageHeight}`}
            contentInsetAdjustmentBehavior="automatic"
            data={months}
            decelerationRate="fast"
            disableIntervalMomentum
            getItemLayout={(_, index) => ({
              index,
              length: pageHeight,
              offset: pageHeight * index,
            })}
            initialNumToRender={3}
            initialScrollIndex={MONTHS_BEFORE}
            keyExtractor={(month) => month}
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            maxToRenderPerBatch={4}
            onEndReached={extendEnd}
            onEndReachedThreshold={0.6}
            onScroll={handleScroll}
            onScrollBeginDrag={() => setQuickEntry(null)}
            pagingEnabled
            renderItem={({ item }) => (
              <MonthCard
                entries={sortedEntries}
                month={item}
                onSelectDate={selectDate}
                pageHeight={pageHeight}
                profile={profile}
                selectedDate={quickEntry?.date ?? null}
              />
            )}
            scrollEventThrottle={100}
            showsVerticalScrollIndicator={false}
            snapToAlignment="start"
            snapToInterval={pageHeight}
            windowSize={5}
          />
        ) : null}
      </View>
      <QuickEntryPopover
        anchor={quickEntry}
        onClose={() => setQuickEntry(null)}
        onSelectAppointment={() => openEditor("APPOINTMENT")}
        onSelectShift={() => openEditor("SHIFT")}
      />
    </View>
  );
}
