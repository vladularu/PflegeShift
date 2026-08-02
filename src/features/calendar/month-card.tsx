import { memo, useMemo, useRef } from "react";
import {
  Pressable,
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
import { holidayMapForMonth } from "@/engine/holidays";
import {
  accessibleChipBackgroundColor,
  chipTextColor,
} from "@/theme/color-contrast";
import { usePalette } from "@/theme/palette";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const EMPTY_ENTRIES: readonly CalendarEntry[] = Object.freeze([]);

type CalendarCell = ReturnType<typeof createVisibleMonthGrid>[number];

interface DayCellProps {
  readonly cell: CalendarCell;
  readonly entries: readonly CalendarEntry[];
  readonly holidayName?: string;
  readonly isSelected: boolean;
  readonly isToday: boolean;
  readonly onSelectDate: (date: string, anchor: CalendarAnchorRect) => void;
  readonly stampMode: boolean;
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
        <Text maxFontSizeMultiplier={1.5} numberOfLines={1} style={{ flex: 1, color: palette.textSecondary, fontSize: 10, fontWeight: "800" }}>
          {compactLabels ? entry.title.slice(0, 1) : entry.title}
        </Text>
      </View>
    );
  }

  const detail = entry.kind === "SHIFT"
    ? calendarShiftDetail(entry, { showShiftTimes, showShiftDuration, timeZone })
    : null;
  return (
    <View
      style={{
        minHeight: detail ? 29 : 18,
        justifyContent: "center",
        borderRadius: 4,
        backgroundColor: accessibleChipBackgroundColor(entry.color),
        paddingHorizontal: 4,
      }}
    >
      <Text maxFontSizeMultiplier={1.5} numberOfLines={1} style={{ color: chipTextColor, fontSize: 10, fontWeight: "900" }}>
        {compactLabels ? entry.symbol : entry.title}
      </Text>
      {detail ? (
        <Text maxFontSizeMultiplier={1.35} numberOfLines={1} style={{ color: chipTextColor, fontSize: 8, fontWeight: "700" }}>
          {detail}
        </Text>
      ) : null}
    </View>
  );
});

const DayCell = memo(function DayCell({
  cell,
  entries,
  holidayName,
  isSelected,
  isToday,
  onSelectDate,
  stampMode,
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
      onSelectDate(cell.date, { x, y, width, height });
    });
  };

  return (
    <Pressable
      ref={cellRef}
      accessibilityLabel={`${formatDateTitle(cell.date)}, ${entries.length} Einträge${holidayName ? `, ${holidayName}` : ""}${isSelected ? ", ausgewählt" : ""}`}
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
            : cell.weekend
              ? `${palette.weekend}B8`
              : "transparent",
        opacity: cell.inMonth ? 1 : 0.3,
        paddingHorizontal: 2,
        paddingTop: 5,
      })}
    >
      <View
        pointerEvents="none"
        style={{ height: 32, alignItems: "center", justifyContent: "flex-start" }}
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
            maxFontSizeMultiplier={1.5}
            style={{
              color: isToday ? palette.onPrimary : cell.inMonth ? palette.text : palette.textMuted,
              fontSize: 13,
              fontWeight: isToday || isSelected ? "900" : "700",
              fontVariant: ["tabular-nums"],
            }}
        >
            {cell.day}
          </Text>
        </View>
        {holidayName ? (
          <Text
            maxFontSizeMultiplier={1.45}
            numberOfLines={1}
            style={{
              position: "absolute",
              right: 1,
              bottom: 0,
              left: 1,
              color: palette.warning,
              fontSize: 9,
              fontWeight: "900",
              textAlign: "center",
            }}
          >
            {holidayShortLabel(holidayName)}
          </Text>
        ) : null}
      </View>
      <View pointerEvents="box-none" style={{ gap: 1 }}>
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
          <Text maxFontSizeMultiplier={1.45} style={{ color: palette.textMuted, fontSize: 9, fontWeight: "800", textAlign: "center" }}>
            +{preview.overflowCount}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}, (previous, next) => (
  previous.cell === next.cell &&
  previous.compactLabels === next.compactLabels &&
  calendarEntryListsEqual(previous.entries, next.entries) &&
  previous.holidayName === next.holidayName &&
  previous.isSelected === next.isSelected &&
  previous.isToday === next.isToday &&
  previous.onSelectDate === next.onSelectDate &&
  previous.showShiftDuration === next.showShiftDuration &&
  previous.showShiftTimes === next.showShiftTimes &&
  previous.stampMode === next.stampMode
  && previous.timeZone === next.timeZone
));

interface MonthCardProps {
  readonly month: string;
  readonly entriesByDate: ReadonlyMap<string, readonly CalendarEntry[]>;
  readonly profile: UserProfile;
  readonly pageHeight: number;
  readonly bottomReserve: number;
  readonly onSelectDate: (date: string, anchor: CalendarAnchorRect) => void;
  readonly selectedDate: string | null;
  readonly stampMode?: boolean;
  readonly showHolidays?: boolean;
  readonly testData?: boolean;
  readonly accessibilityVisible?: boolean;
  readonly labelMode?: CalendarLabelMode;
  readonly showShiftTimes?: boolean;
  readonly showShiftDuration?: boolean;
}

function monthCardPropsEqual(
  previous: MonthCardProps,
  next: MonthCardProps,
): boolean {
  if (
    previous.month !== next.month ||
    previous.profile !== next.profile ||
    previous.pageHeight !== next.pageHeight ||
    previous.bottomReserve !== next.bottomReserve ||
    previous.onSelectDate !== next.onSelectDate ||
    previous.stampMode !== next.stampMode ||
    previous.showHolidays !== next.showHolidays ||
    previous.testData !== next.testData ||
    previous.accessibilityVisible !== next.accessibilityVisible
    || previous.labelMode !== next.labelMode
    || previous.showShiftDuration !== next.showShiftDuration
    || previous.showShiftTimes !== next.showShiftTimes
  ) {
    return false;
  }
  if (
    previous.selectedDate !== next.selectedDate &&
    calendarSelectionTouchesMonth(
      next.month,
      previous.selectedDate,
      next.selectedDate,
    )
  ) {
    return false;
  }
  return calendarMonthEntriesEqual(
    next.month,
    previous.entriesByDate,
    next.entriesByDate,
  );
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
    () => showHolidays ? holidayMapForMonth(month, profile.federalState) : new Map(),
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
  const weeks = Array.from(
    { length: weekCount },
    (_, index) => grid.slice(index * 7, index * 7 + 7),
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
          borderRadius: 22,
          borderCurve: "continuous",
          backgroundColor: palette.surface,
          boxShadow: `0 3px 16px ${palette.shadow}`,
          marginHorizontal: 6,
          marginTop: 2,
        }}
      >
        {testData ? (
          <Text style={{ color: palette.primary, fontSize: 11, fontWeight: "900", letterSpacing: 0.7, paddingHorizontal: 12, paddingTop: 8 }}>
            TESTDATEN
          </Text>
        ) : null}
        <View style={{ height: 40, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: palette.separator }}>
          {WEEKDAYS.map((weekday, index) => (
            <View key={weekday} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Text maxFontSizeMultiplier={1.4} style={{ color: index >= 5 ? palette.textMuted : palette.textSecondary, fontSize: 12, fontWeight: "800" }}>
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
                timeZone={profile.timeZone}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}, monthCardPropsEqual);
