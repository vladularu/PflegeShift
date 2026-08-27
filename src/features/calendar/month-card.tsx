import { memo, useEffect, useMemo, useRef } from "react";
import {
  findNodeHandle,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
  type PressableStateCallbackType,
} from "react-native";
import Animated, {
  Extrapolation,
  FadeIn,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import type { CalendarEntry, CalendarLabelMode, UserProfile } from "@/domain/types";
import { createMonthGrid, formatDateTitle, isoWeekNumber, today } from "@/engine/calendar";
import { calendarShiftDetail, calendarEntryPreview } from "@/features/calendar/calendar-display";
import {
  calculateCalendarGridLayout,
  type CalendarAnchorRect,
} from "@/features/calendar/calendar-layout";
import {
  calendarEntryListsEqual,
  calendarMonthEntriesEqual,
  calendarSelectionTouchesMonth,
} from "@/features/calendar/calendar-rendering";
import { holidayShortLabel } from "@/features/calendar/holiday-label";
import { stampDayAccessibilityHint } from "@/features/calendar/stamp-accessibility";
import { holidayMapForMonth } from "@/engine/holidays";
import { calendarChipPalette } from "@/theme/color-contrast";
import { MOTION } from "@/theme/motion";
import { usePalette } from "@/theme/palette";
import { COMPACT_TEXT_MAX_SCALE } from "@/theme/typography";
import { CALENDAR_METRICS, SPACING } from "@/theme/tokens";
import { usePressMotion } from "@/ui/press-motion";
import { ShiftSymbol } from "@/ui/shift-symbol";

const WEEKDAYS = ["M", "D", "M", "D", "F", "S", "S"];
const EMPTY_ENTRIES: readonly CalendarEntry[] = Object.freeze([]);

type CalendarCell = ReturnType<typeof createMonthGrid>[number];

interface DayCellProps {
  readonly cell: CalendarCell;
  readonly entries: readonly CalendarEntry[];
  readonly holidayName?: string;
  readonly isSelected: boolean;
  readonly isToday: boolean;
  readonly onSelectDate: (
    date: string,
    anchor: CalendarAnchorRect,
    accessibilityTarget?: number | null,
  ) => void;
  readonly stampMode: boolean;
  readonly stampTransitionProgress: SharedValue<number>;
  readonly stampToolLabel: string | null;
  readonly labelMode: CalendarLabelMode;
  readonly showShiftTimes: boolean;
  readonly showShiftDuration: boolean;
  readonly timeZone: string;
  readonly entryRowCapacity: number;
  readonly weekNumber?: number;
}

const EntryMark = memo(function EntryMark({
  labelMode,
  entry,
  showShiftTimes,
  showShiftDuration,
  timeZone,
}: {
  readonly labelMode: CalendarLabelMode;
  readonly entry: CalendarEntry;
  readonly showShiftTimes: boolean;
  readonly showShiftDuration: boolean;
  readonly timeZone: string;
}) {
  const palette = usePalette();
  if (entry.kind === "APPOINTMENT") {
    return (
      <Animated.View
        entering={FadeIn.duration(MOTION.duration.fast).reduceMotion(MOTION.reduceMotion)}
        exiting={FadeOut.duration(MOTION.duration.instant).reduceMotion(MOTION.reduceMotion)}
        style={{
          height: CALENDAR_METRICS.entryRowHeight,
          flexDirection: "row",
          alignItems: "center",
          gap: 2,
          paddingHorizontal: 0,
          backgroundColor: "transparent",
        }}
      >
        <View
          style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: palette.textMuted }}
        />
        <Text
          adjustsFontSizeToFit
          maxFontSizeMultiplier={COMPACT_TEXT_MAX_SCALE}
          minimumFontScale={0.88}
          numberOfLines={1}
          style={{
            flex: 1,
            color: palette.text,
            fontSize: CALENDAR_METRICS.entryFontSize,
            lineHeight: CALENDAR_METRICS.entryLineHeight,
            fontWeight: "400",
          }}
        >
          {labelMode === "FULL" ? entry.title : entry.title.slice(0, 1)}
        </Text>
      </Animated.View>
    );
  }

  const detail =
    entry.kind === "SHIFT"
      ? calendarShiftDetail(entry, { showShiftTimes, showShiftDuration, timeZone })
      : null;
  const colors = calendarChipPalette(entry.color, palette.dark);
  return (
    <Animated.View
      entering={FadeIn.duration(MOTION.duration.fast).reduceMotion(MOTION.reduceMotion)}
      exiting={FadeOut.duration(MOTION.duration.instant).reduceMotion(MOTION.reduceMotion)}
      style={{
        minHeight: detail ? CALENDAR_METRICS.entryRowHeight * 2 : CALENDAR_METRICS.entryRowHeight,
        overflow: "hidden",
        borderRadius: 4,
        borderCurve: "continuous",
      }}
    >
      <View
        style={{
          height: CALENDAR_METRICS.entryRowHeight,
          justifyContent: "center",
          backgroundColor: colors.main,
          paddingHorizontal: 3,
        }}
      >
        {labelMode === "SYMBOL" ? (
          <ShiftSymbol color={colors.onMain} size={12} value={entry.symbol} />
        ) : (
          <Text
            adjustsFontSizeToFit
            maxFontSizeMultiplier={COMPACT_TEXT_MAX_SCALE}
            minimumFontScale={0.72}
            numberOfLines={1}
            style={{
              color: colors.onMain,
              fontSize: CALENDAR_METRICS.entryFontSize,
              lineHeight: CALENDAR_METRICS.entryLineHeight,
              fontWeight: "500",
              textAlign: "center",
            }}
          >
            {labelMode === "SHORT" ? entry.title.slice(0, 1) : entry.title}
          </Text>
        )}
      </View>
      {detail ? (
        <View
          style={{
            height: CALENDAR_METRICS.entryRowHeight,
            justifyContent: "center",
            backgroundColor: colors.detail,
            paddingHorizontal: 3,
          }}
        >
          <Text
            maxFontSizeMultiplier={COMPACT_TEXT_MAX_SCALE}
            numberOfLines={1}
            style={{
              color: colors.onDetail,
              fontSize: CALENDAR_METRICS.entryFontSize,
              lineHeight: CALENDAR_METRICS.entryLineHeight,
              fontWeight: "500",
              textAlign: "center",
              fontVariant: ["tabular-nums"],
            }}
          >
            {detail}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
});

const EmptyStampSlot = memo(function EmptyStampSlot({
  backgroundColor,
  borderColor,
  date,
  minHeight,
  progress,
  targetOpacity,
}: {
  readonly backgroundColor: string;
  readonly borderColor: string;
  readonly date: string;
  readonly minHeight: number;
  readonly progress: SharedValue<number>;
  readonly targetOpacity: number;
}) {
  const fadeStyle = useAnimatedStyle(
    () => ({
      opacity: interpolate(
        progress.value,
        [0, 0.42, 1],
        [0, targetOpacity * 0.58, targetOpacity],
        Extrapolation.CLAMP,
      ),
    }),
    [targetOpacity],
  );

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.emptyStampSlot, { backgroundColor, borderColor, minHeight }, fadeStyle]}
      testID={`quick-stamp-slot-${date}`}
    />
  );
});

const DayCell = memo(
  function DayCell({
    cell,
    entries,
    holidayName,
    isSelected,
    isToday,
    onSelectDate,
    stampMode,
    stampTransitionProgress,
    stampToolLabel,
    labelMode,
    showShiftTimes,
    showShiftDuration,
    timeZone,
    entryRowCapacity,
    weekNumber,
  }: DayCellProps) {
    const palette = usePalette();
    const pressMotion = usePressMotion(1, 0.985);
    const cellRef = useRef<View>(null);
    const detailed = showShiftTimes || showShiftDuration;
    const preview = useMemo(
      () =>
        calendarEntryPreview(entries, { detailedShifts: detailed, rowCapacity: entryRowCapacity }),
      [detailed, entries, entryRowCapacity],
    );
    const showEmptyStampSlot =
      stampMode && preview.entries.length === 0 && preview.overflowCount === 0;
    const handlePress = (event: GestureResponderEvent) => {
      const fallbackAnchor = {
        x: event.nativeEvent.pageX - 24,
        y: event.nativeEvent.pageY - 24,
        width: 48,
        height: 48,
      };
      if (cellRef.current === null) {
        onSelectDate(cell.date, fallbackAnchor);
        return;
      }
      cellRef.current.measureInWindow((x, y, width, height) => {
        onSelectDate(cell.date, { x, y, width, height }, findNodeHandle(cellRef.current));
      });
    };

    return (
      <Animated.View style={[{ flex: 1, minWidth: 0 }, pressMotion.animatedStyle]}>
        <Pressable
          ref={cellRef}
          accessibilityLabel={`${formatDateTitle(cell.date)}, ${entries.length} Einträge${holidayName ? `, ${holidayName}` : ""}${isSelected ? ", ausgewählt" : ""}`}
          accessibilityHint={
            stampMode
              ? stampDayAccessibilityHint(stampToolLabel)
              : "Öffnet die Schnellauswahl für diesen Tag."
          }
          accessibilityRole="button"
          accessibilityState={{ selected: isSelected }}
          onPressIn={pressMotion.onPressIn}
          onPressOut={pressMotion.onPressOut}
          onPress={handlePress}
          testID={`calendar-day-${cell.inMonth ? "current" : "adjacent"}-${cell.date}`}
          style={({ pressed }: PressableStateCallbackType) => ({
            flex: 1,
            minWidth: 0,
            marginHorizontal: 0.25,
            marginVertical: 2,
            opacity: 1,
            overflow: "hidden",
            borderRadius: 4,
            borderCurve: "continuous",
            backgroundColor: pressed
              ? palette.primarySoft
              : !cell.inMonth
                ? palette.outsideMonth
                : cell.weekend
                  ? palette.weekend
                  : "transparent",
            paddingHorizontal: 1,
            paddingTop: 0,
          })}
        >
          <View
            style={{
              height: CALENDAR_METRICS.dayNumberHeight,
              alignItems: "center",
              justifyContent: "flex-start",
              pointerEvents: "none",
            }}
          >
            {weekNumber === undefined ? null : (
              <Text
                accessible={false}
                maxFontSizeMultiplier={COMPACT_TEXT_MAX_SCALE}
                style={{
                  position: "absolute",
                  top: 2,
                  left: CALENDAR_METRICS.weekNumberInset,
                  color: palette.textMuted,
                  fontSize: CALENDAR_METRICS.weekNumberFontSize,
                  fontWeight: "500",
                  fontVariant: ["tabular-nums"],
                }}
              >
                {weekNumber}
              </Text>
            )}
            <View
              style={{
                minWidth: 26,
                height: 20,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: isSelected && !isToday ? 1 : 0,
                borderColor: isSelected && !isToday ? palette.calendarSelection : "transparent",
                borderRadius: 10,
                backgroundColor: isToday
                  ? palette.calendarToday
                  : isSelected
                    ? palette.calendarSelection
                    : "transparent",
                paddingHorizontal: 4,
              }}
            >
              <Text
                maxFontSizeMultiplier={COMPACT_TEXT_MAX_SCALE}
                style={{
                  color: isToday
                    ? palette.onCalendarToday
                    : isSelected
                      ? palette.onCalendarSelection
                      : cell.inMonth
                        ? palette.text
                        : palette.textMuted,
                  fontSize: CALENDAR_METRICS.dayNumberFontSize,
                  fontWeight: isToday || isSelected ? "700" : "500",
                  fontVariant: ["tabular-nums"],
                }}
              >
                {cell.day}
              </Text>
            </View>
            {holidayName ? (
              <Text
                maxFontSizeMultiplier={COMPACT_TEXT_MAX_SCALE}
                numberOfLines={1}
                style={{
                  position: "absolute",
                  right: 1,
                  bottom: 0,
                  left: 1,
                  color: palette.warning,
                  fontSize: 9,
                  fontWeight: "700",
                  textAlign: "center",
                }}
              >
                {holidayShortLabel(holidayName)}
              </Text>
            ) : null}
          </View>
          <View
            testID={`calendar-entry-layer-${cell.date}`}
            style={{
              minHeight: stampMode
                ? CALENDAR_METRICS.entryRowHeight * (detailed ? 2 : 1)
                : undefined,
              opacity: !cell.inMonth && !isToday && !isSelected ? 0.2 : 1,
              gap: 1,
              overflow: "hidden",
              borderRadius: 4,
              borderCurve: "continuous",
              pointerEvents: "box-none",
            }}
          >
            {showEmptyStampSlot ? (
              <EmptyStampSlot
                backgroundColor={palette.overlaySubtle}
                borderColor={cell.inMonth ? palette.border : palette.separator}
                date={cell.date}
                minHeight={CALENDAR_METRICS.entryRowHeight * (detailed ? 2 : 1)}
                progress={stampTransitionProgress}
                targetOpacity={cell.inMonth ? 1 : 0.45}
              />
            ) : null}
            {preview.entries.map((entry) => (
              <EntryMark
                key={`${entry.kind}-${entry.id}`}
                labelMode={labelMode}
                entry={entry}
                showShiftDuration={showShiftDuration}
                showShiftTimes={showShiftTimes}
                timeZone={timeZone}
              />
            ))}
            {preview.overflowCount > 0 ? (
              <Text
                maxFontSizeMultiplier={COMPACT_TEXT_MAX_SCALE}
                style={{
                  color: palette.textMuted,
                  fontSize: 9,
                  fontWeight: "600",
                  textAlign: "center",
                }}
              >
                +{preview.overflowCount}
              </Text>
            ) : null}
          </View>
        </Pressable>
      </Animated.View>
    );
  },
  (previous, next) =>
    previous.cell === next.cell &&
    previous.labelMode === next.labelMode &&
    calendarEntryListsEqual(previous.entries, next.entries) &&
    previous.entryRowCapacity === next.entryRowCapacity &&
    previous.holidayName === next.holidayName &&
    previous.isSelected === next.isSelected &&
    previous.isToday === next.isToday &&
    previous.onSelectDate === next.onSelectDate &&
    previous.showShiftDuration === next.showShiftDuration &&
    previous.showShiftTimes === next.showShiftTimes &&
    previous.stampMode === next.stampMode &&
    previous.stampTransitionProgress === next.stampTransitionProgress &&
    previous.stampToolLabel === next.stampToolLabel &&
    previous.timeZone === next.timeZone &&
    previous.weekNumber === next.weekNumber,
);

interface MonthCardProps {
  readonly month: string;
  readonly entriesByDate: ReadonlyMap<string, readonly CalendarEntry[]>;
  readonly profile: UserProfile;
  readonly pageHeight: number;
  readonly bottomReserve: number;
  readonly onSelectDate: (
    date: string,
    anchor: CalendarAnchorRect,
    accessibilityTarget?: number | null,
  ) => void;
  readonly selectedDate: string | null;
  readonly stampMode?: boolean;
  readonly stampTransitionProgress?: SharedValue<number>;
  readonly stampToolLabel?: string | null;
  readonly showHolidays?: boolean;
  readonly testData?: boolean;
  readonly accessibilityVisible?: boolean;
  readonly labelMode?: CalendarLabelMode;
  readonly showShiftTimes?: boolean;
  readonly showShiftDuration?: boolean;
}

function monthCardPropsEqual(previous: MonthCardProps, next: MonthCardProps): boolean {
  if (
    previous.month !== next.month ||
    previous.profile !== next.profile ||
    previous.pageHeight !== next.pageHeight ||
    previous.bottomReserve !== next.bottomReserve ||
    previous.onSelectDate !== next.onSelectDate ||
    previous.stampMode !== next.stampMode ||
    previous.stampTransitionProgress !== next.stampTransitionProgress ||
    previous.stampToolLabel !== next.stampToolLabel ||
    previous.showHolidays !== next.showHolidays ||
    previous.testData !== next.testData ||
    previous.accessibilityVisible !== next.accessibilityVisible ||
    previous.labelMode !== next.labelMode ||
    previous.showShiftDuration !== next.showShiftDuration ||
    previous.showShiftTimes !== next.showShiftTimes
  ) {
    return false;
  }
  if (
    previous.selectedDate !== next.selectedDate &&
    calendarSelectionTouchesMonth(next.month, previous.selectedDate, next.selectedDate)
  ) {
    return false;
  }
  return calendarMonthEntriesEqual(next.month, previous.entriesByDate, next.entriesByDate);
}

export const MonthCard = memo(function MonthCard({
  month,
  entriesByDate,
  profile,
  pageHeight,
  bottomReserve,
  onSelectDate,
  selectedDate,
  stampMode = false,
  stampTransitionProgress,
  stampToolLabel = null,
  showHolidays = true,
  testData = false,
  accessibilityVisible = true,
  labelMode = "FULL",
  showShiftTimes = false,
  showShiftDuration = false,
}: MonthCardProps) {
  const palette = usePalette();
  const internalStampProgress = useSharedValue(stampMode ? 1 : 0);
  const stampProgress = stampTransitionProgress ?? internalStampProgress;
  const { width } = useWindowDimensions();
  useEffect(() => {
    if (stampTransitionProgress !== undefined) return;
    internalStampProgress.value = withTiming(stampMode ? 1 : 0, {
      duration: MOTION.duration.fast,
      easing: MOTION.easing.emphasized,
    });
  }, [internalStampProgress, stampMode, stampTransitionProgress]);
  const grid = useMemo(() => createMonthGrid(month), [month]);
  const holidays = useMemo(
    () => (showHolidays ? holidayMapForMonth(month, profile.federalState) : new Map()),
    [month, profile.federalState, showHolidays],
  );
  const currentDate = today(profile.timeZone);
  const weekCount = grid.length / 7;
  const contentWidth = Math.min(width, 760);
  const gridLayout = calculateCalendarGridLayout({
    pageHeight,
    weekCount,
    bottomReserve,
    testData,
  });
  const entryRowCapacity = Math.max(
    showShiftTimes || showShiftDuration ? 3 : 2,
    Math.floor(
      (gridLayout.rowHeight - CALENDAR_METRICS.dayNumberHeight) / CALENDAR_METRICS.entryRowHeight,
    ),
  );
  const weeks = Array.from({ length: weekCount }, (_, index) =>
    grid.slice(index * 7, index * 7 + 7),
  );

  return (
    <View
      accessibilityElementsHidden={!accessibilityVisible}
      aria-hidden={!accessibilityVisible}
      importantForAccessibility={accessibilityVisible ? "auto" : "no-hide-descendants"}
      style={{ height: pageHeight, alignItems: "center", backgroundColor: palette.background }}
    >
      <View
        style={{
          width: contentWidth - CALENDAR_METRICS.horizontalInset * 2,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: palette.separator,
          borderRadius: CALENDAR_METRICS.cardRadius,
          borderCurve: "continuous",
          backgroundColor: palette.surface,
          boxShadow: palette.dark ? undefined : `0 1px 2px ${palette.shadow}`,
          marginHorizontal: CALENDAR_METRICS.horizontalInset,
          marginTop: 2,
        }}
      >
        {testData ? (
          <Text
            maxFontSizeMultiplier={COMPACT_TEXT_MAX_SCALE}
            style={{
              color: palette.primary,
              fontSize: 11,
              fontWeight: "700",
              letterSpacing: 0.7,
              paddingHorizontal: SPACING.md,
              paddingTop: SPACING.sm,
            }}
          >
            TESTDATEN
          </Text>
        ) : null}
        <View
          style={{
            height: CALENDAR_METRICS.weekdayHeight,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          {WEEKDAYS.map((weekday, index) => (
            <View
              key={`${weekday}-${index}`}
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 4,
                backgroundColor: index >= 5 ? palette.weekend : "transparent",
              }}
            >
              <Text
                maxFontSizeMultiplier={COMPACT_TEXT_MAX_SCALE}
                style={{
                  color: index >= 5 ? palette.textMuted : palette.textSecondary,
                  fontSize: CALENDAR_METRICS.weekdayFontSize,
                  fontWeight: "400",
                }}
              >
                {weekday}
              </Text>
            </View>
          ))}
        </View>
        {weeks.map((week, weekIndex) => (
          <View
            key={week[0].date}
            testID={`calendar-week-${weekIndex + 1}`}
            style={{
              height: gridLayout.rowHeight,
              flexDirection: "row",
              borderTopWidth: weekIndex === 0 ? 0 : 1,
              borderTopColor: palette.separator,
            }}
          >
            {week.map((cell, dayIndex) => (
              <DayCell
                key={cell.date}
                cell={cell}
                labelMode={labelMode}
                entries={entriesByDate.get(cell.date) ?? EMPTY_ENTRIES}
                entryRowCapacity={entryRowCapacity}
                holidayName={holidays.get(cell.date)?.name}
                isSelected={selectedDate !== null && cell.date === selectedDate}
                isToday={cell.date === currentDate}
                onSelectDate={onSelectDate}
                showShiftDuration={showShiftDuration}
                showShiftTimes={showShiftTimes}
                stampMode={stampMode}
                stampTransitionProgress={stampProgress}
                stampToolLabel={stampToolLabel}
                timeZone={profile.timeZone}
                weekNumber={dayIndex === 0 ? isoWeekNumber(week[0].date) : undefined}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}, monthCardPropsEqual);

const styles = StyleSheet.create({
  emptyStampSlot: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderWidth: 1,
    borderRadius: 4,
    borderCurve: "continuous",
  },
});
