import { memo, useMemo, useRef } from "react";
import {
  Pressable,
  findNodeHandle,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
} from "react-native";

import type { CalendarEntry, CalendarLabelMode, UserProfile } from "@/domain/types";
import { createVisibleMonthGrid, formatDateTitle, today } from "@/engine/calendar";
import {
  calendarShiftDetail,
  calendarEntryPreview,
  shouldUseCompactCalendarLabels,
} from "@/features/calendar/calendar-display";
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
import { accessibleChipBackgroundColor, chipTextColor } from "@/theme/color-contrast";
import { usePalette } from "@/theme/palette";
import { COMPACT_TEXT_MAX_SCALE } from "@/theme/typography";
import { RADII, SPACING } from "@/theme/tokens";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const EMPTY_ENTRIES: readonly CalendarEntry[] = Object.freeze([]);

type CalendarCell = ReturnType<typeof createVisibleMonthGrid>[number];

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
  readonly stampToolLabel: string | null;
  readonly compactLabels: boolean;
  readonly showShiftTimes: boolean;
  readonly showShiftDuration: boolean;
  readonly timeZone: string;
}

const EntryMark = memo(function EntryMark({
  compactLabels,
  entry,
  showShiftTimes,
  showShiftDuration,
  timeZone,
}: {
  readonly compactLabels: boolean;
  readonly entry: CalendarEntry;
  readonly showShiftTimes: boolean;
  readonly showShiftDuration: boolean;
  readonly timeZone: string;
}) {
  const palette = usePalette();
  if (entry.kind === "APPOINTMENT") {
    return (
      <View
        style={{
          height: 17,
          flexDirection: "row",
          alignItems: "center",
          gap: 3,
          paddingHorizontal: 2,
        }}
      >
        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: entry.color }} />
        <Text
          maxFontSizeMultiplier={COMPACT_TEXT_MAX_SCALE}
          numberOfLines={1}
          style={{ flex: 1, color: palette.textSecondary, fontSize: 10, fontWeight: "600" }}
        >
          {compactLabels ? entry.title.slice(0, 1) : entry.title}
        </Text>
      </View>
    );
  }

  const detail =
    entry.kind === "SHIFT"
      ? calendarShiftDetail(entry, { showShiftTimes, showShiftDuration, timeZone })
      : null;
  return (
    <View
      style={{
        minHeight: detail ? 29 : 18,
        justifyContent: "center",
        borderRadius: SPACING.xxs,
        backgroundColor: accessibleChipBackgroundColor(entry.color),
        paddingHorizontal: 4,
      }}
    >
      <Text
        maxFontSizeMultiplier={COMPACT_TEXT_MAX_SCALE}
        numberOfLines={1}
        style={{ color: chipTextColor, fontSize: 10, fontWeight: "700" }}
      >
        {compactLabels ? entry.symbol : entry.title}
      </Text>
      {detail ? (
        <Text
          maxFontSizeMultiplier={COMPACT_TEXT_MAX_SCALE}
          numberOfLines={1}
          style={{ color: chipTextColor, fontSize: 8, fontWeight: "600" }}
        >
          {detail}
        </Text>
      ) : null}
    </View>
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
    stampToolLabel,
    compactLabels,
    showShiftTimes,
    showShiftDuration,
    timeZone,
  }: DayCellProps) {
    const palette = usePalette();
    const cellRef = useRef<View>(null);
    const detailed = showShiftTimes || showShiftDuration;
    const preview = useMemo(
      () => calendarEntryPreview(entries, detailed ? 1 : 2),
      [detailed, entries],
    );
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
        onPress={handlePress}
        style={({ pressed }) => ({
          flex: 1,
          minWidth: 0,
          backgroundColor: pressed
            ? palette.primarySoft
            : isSelected && stampMode
              ? palette.primarySoft
              : !cell.inMonth
                ? palette.outsideMonth
                : cell.weekend
                  ? `${palette.weekend}B8`
                  : "transparent",
          paddingHorizontal: 2,
          paddingTop: 5,
        })}
      >
        <View
          style={{
            height: 32,
            alignItems: "center",
            justifyContent: "flex-start",
            pointerEvents: "none",
          }}
        >
          <View
            style={{
              width: 24,
              height: 24,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: isSelected && !isToday ? 2 : 0,
              borderColor: palette.primary,
              borderRadius: 12,
              backgroundColor: isToday ? palette.primary : "transparent",
            }}
          >
            <Text
              maxFontSizeMultiplier={COMPACT_TEXT_MAX_SCALE}
              style={{
                color: isToday
                  ? palette.onPrimary
                  : cell.inMonth
                    ? palette.text
                    : palette.textMuted,
                fontSize: 13,
                fontWeight: isToday || isSelected ? "700" : "600",
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
        <View style={{ gap: 1, pointerEvents: "box-none" }}>
          {preview.entries.map((entry) => (
            <EntryMark
              key={`${entry.kind}-${entry.id}`}
              compactLabels={compactLabels}
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
    );
  },
  (previous, next) =>
    previous.cell === next.cell &&
    previous.compactLabels === next.compactLabels &&
    calendarEntryListsEqual(previous.entries, next.entries) &&
    previous.holidayName === next.holidayName &&
    previous.isSelected === next.isSelected &&
    previous.isToday === next.isToday &&
    previous.onSelectDate === next.onSelectDate &&
    previous.showShiftDuration === next.showShiftDuration &&
    previous.showShiftTimes === next.showShiftTimes &&
    previous.stampMode === next.stampMode &&
    previous.stampToolLabel === next.stampToolLabel &&
    previous.timeZone === next.timeZone,
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
  stampToolLabel = null,
  showHolidays = true,
  testData = false,
  accessibilityVisible = true,
  labelMode = "FULL",
  showShiftTimes = false,
  showShiftDuration = false,
}: MonthCardProps) {
  const palette = usePalette();
  const { fontScale, width } = useWindowDimensions();
  const compactLabels = labelMode === "SYMBOL" || shouldUseCompactCalendarLabels(fontScale);
  const grid = useMemo(() => createVisibleMonthGrid(month), [month]);
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
          width: contentWidth - 12,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: palette.separator,
          borderRadius: RADII.large,
          borderCurve: "continuous",
          backgroundColor: palette.surface,
          boxShadow: palette.dark ? undefined : `0 1px 2px ${palette.shadow}`,
          marginHorizontal: 6,
          marginTop: 2,
        }}
      >
        {testData ? (
          <Text
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
            height: 40,
            flexDirection: "row",
            alignItems: "center",
            borderBottomWidth: 1,
            borderBottomColor: palette.separator,
          }}
        >
          {WEEKDAYS.map((weekday, index) => (
            <View key={weekday} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Text
                maxFontSizeMultiplier={COMPACT_TEXT_MAX_SCALE}
                style={{
                  color: index >= 5 ? palette.textMuted : palette.textSecondary,
                  fontSize: 12,
                  fontWeight: "600",
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
            style={{
              height: gridLayout.rowHeight,
              flexDirection: "row",
              borderTopWidth: weekIndex === 0 ? 0 : 1,
              borderTopColor: palette.separator,
            }}
          >
            {week.map((cell) => (
              <DayCell
                key={cell.date}
                cell={cell}
                compactLabels={compactLabels}
                entries={entriesByDate.get(cell.date) ?? EMPTY_ENTRIES}
                holidayName={holidays.get(cell.date)?.name}
                isSelected={selectedDate !== null && cell.date === selectedDate}
                isToday={cell.date === currentDate}
                onSelectDate={onSelectDate}
                showShiftDuration={showShiftDuration}
                showShiftTimes={showShiftTimes}
                stampMode={stampMode}
                stampToolLabel={stampToolLabel}
                timeZone={profile.timeZone}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}, monthCardPropsEqual);
