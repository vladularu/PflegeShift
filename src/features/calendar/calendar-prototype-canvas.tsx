import { memo } from "react";
import { today } from "@/engine/calendar";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { usePalette } from "@/theme/palette";
import { CALENDAR_METRICS, RADII } from "@/theme/tokens";
import { TYPOGRAPHY } from "@/theme/typography";
import type { CalendarEntry } from "@/domain/types";
import { prototypeEntryPreview } from "./prototype-entry-preview";
import { PrototypeEntryContent, type PrototypeDisplay } from "./prototype-entry-content";
import {
  PROTOTYPE_MONTH_NAMES,
  type PrototypeDay,
  type PrototypeMonth,
} from "./calendar-prototype-layout";

const MovingDay = memo(function MovingDay({
  day,
  progress,
  currentDate,
  selectedDate,
}: {
  day: PrototypeDay;
  progress: SharedValue<number>;
  currentDate: string;
  selectedDate?: string | null;
}) {
  const palette = usePalette();
  const isToday = currentDate === day.date;
  const isSelected = selectedDate === day.date;
  const motion = useAnimatedStyle(() => ({
    transform: [
      { translateX: day.fromX + (day.toX - day.fromX) * progress.value - 15 },
      { translateY: day.fromY + (day.toY - day.fromY) * progress.value - 15 },
      { scale: 0.6 + 0.4 * progress.value },
    ],
  }));
  // This very same glyph survives both endpoints: there is no overlay handoff.
  return (
    <Animated.View
      testID={`calendar-date-marker-${day.date}`}
      style={[
        styles.day,
        {
          backgroundColor: isToday
            ? palette.primary
            : isSelected
              ? palette.calendarSelection
              : "transparent",
        },
        motion,
      ]}
    >
      <Text
        allowFontScaling={false}
        style={{
          fontSize: CALENDAR_METRICS.dayNumberFontSize,
          fontWeight: isToday ? "700" : "500",
          color: isToday
            ? palette.onPrimary
            : isSelected
              ? palette.onCalendarSelection
              : day.weekend
                ? palette.textMuted
                : palette.text,
        }}
      >
        {day.day}
      </Text>
    </Animated.View>
  );
});

export const PrototypeYear = memo(function PrototypeYear({
  layouts,
  selectedMonth,
  onSelect,
  progress,
  referenceMonth = today("Europe/Berlin").slice(0, 7),
  entriesByDate,
}: {
  layouts: readonly PrototypeMonth[];
  selectedMonth: string;
  onSelect: (month: string) => void;
  progress: SharedValue<number>;
  referenceMonth?: string;
  entriesByDate?: ReadonlyMap<string, readonly CalendarEntry[]>;
}) {
  const palette = usePalette();
  const motion = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, motion]}>
      {layouts.map((layout, index) => (
        <View key={layout.month} pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${PROTOTYPE_MONTH_NAMES[index]} ${layout.month.slice(0, 4)} öffnen`}
            onPress={() => onSelect(layout.month)}
            style={{
              position: "absolute",
              left: layout.tile.x,
              top: layout.tile.y,
              width: layout.tile.width,
              height: layout.tile.height,
            }}
          />
          <Text
            pointerEvents="none"
            accessible={false}
            style={[
              styles.title,
              {
                left: layout.title.x,
                top: layout.title.y,
                color: layout.month === referenceMonth ? palette.calendarYearAccent : palette.text,
              },
            ]}
          >
            {PROTOTYPE_MONTH_NAMES[index]}
          </Text>
          {layout.days.map((day) => {
            const shifts = (entriesByDate?.get(day.date) ?? [])
              .filter((entry) => entry.kind === "SHIFT" && !entry.deletedAt)
              .slice(0, 2);
            return shifts.length ? (
              <View
                key={`marks-${day.date}`}
                pointerEvents="none"
                accessible={false}
                testID={`calendar-mini-shifts-${day.date}`}
                style={{
                  position: "absolute",
                  left: day.fromX - (shifts.length * 4 - 1) / 2,
                  top: day.fromY + 8,
                  flexDirection: "row",
                  gap: CALENDAR_METRICS.chipGap,
                }}
              >
                {shifts.map((entry) => (
                  <View
                    key={entry.id}
                    style={{
                      width: 3,
                      height: 3,
                      borderRadius: RADII.pill,
                      backgroundColor: entry.color,
                    }}
                  />
                ))}
              </View>
            ) : null;
          })}
          {layout.month !== selectedMonth
            ? layout.days.map((day) => (
                <Text
                  key={day.date}
                  pointerEvents="none"
                  accessible={false}
                  allowFontScaling={false}
                  style={[
                    styles.miniDay,
                    {
                      left: day.fromX - 9,
                      top: day.fromY - 9,
                      color: day.weekend ? palette.textMuted : palette.text,
                    },
                  ]}
                >
                  {day.day}
                </Text>
              ))
            : null}
        </View>
      ))}
    </Animated.View>
  );
});

export function PrototypeMonthContent({
  layout,
  progress,
  entriesByDate,
  holidays,
  display,
  timeZone,
  visible,
}: {
  layout: PrototypeMonth;
  progress: SharedValue<number>;
  entriesByDate: ReadonlyMap<string, readonly CalendarEntry[]>;
  holidays: ReadonlyMap<string, { readonly name: string }>;
  display: PrototypeDisplay;
  timeZone: string;
  visible: boolean;
}) {
  const palette = usePalette();
  const motion = useAnimatedStyle(() => ({ opacity: Math.max(0, (progress.value - 0.4) / 0.6) }));
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
      style={[StyleSheet.absoluteFill, motion]}
    >
      <View style={styles.weekdays}>
        {["M", "D", "M", "D", "F", "S", "S"].map((label, i) => (
          <Text
            key={i}
            style={{ width: layout.cellWidth, textAlign: "center", color: palette.textMuted }}
          >
            {label}
          </Text>
        ))}
      </View>
      {layout.adjacentDays.map((day) => (
        <Text
          key={day.date}
          testID={`calendar-adjacent-${day.date}`}
          accessible={visible}
          accessibilityLabel={`${day.date}, Nachbarmonat`}
          allowFontScaling={false}
          style={{
            position: "absolute",
            left: day.toX - 15,
            top: day.toY - 15,
            width: 30,
            height: 30,
            textAlign: "center",
            textAlignVertical: "center",
            lineHeight: TYPOGRAPHY.screenTitle.lineHeight,
            fontSize: CALENDAR_METRICS.dayNumberFontSize,
            color: palette.textMuted,
            opacity: 0.5,
          }}
        >
          {day.day}
        </Text>
      ))}
      {layout.days.map((day) => {
        const entries = entriesByDate.get(day.date) ?? [];
        const holiday = holidays.get(day.date)?.name;
        // Reserve overflow space before choosing entries so dense days never
        // overlap the next week (including very short six-week viewports).
        const rows = Math.max(
          0,
          Math.floor(
            (layout.weekHeight - CALENDAR_METRICS.dayNumberHeight - 2) /
              (CALENDAR_METRICS.entryRowHeight + CALENDAR_METRICS.chipGap),
          ),
        );
        const preview = prototypeEntryPreview(
          entries,
          rows - (holiday && rows > 1 ? 1 : 0),
          display.showShiftTimes || display.showShiftDuration,
        );
        return (
          <View
            key={day.date}
            accessible={visible}
            accessibilityLabel={`${day.date}${holiday ? `, ${holiday}` : ""}, ${entries.length ? entries.map((entry) => entry.title).join(", ") : "Keine Einträge"}`}
            style={{
              position: "absolute",
              left: day.toX - layout.cellWidth / 2,
              top: day.toY - 20,
              width: layout.cellWidth,
              height: layout.weekHeight,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderColor: palette.separator,
            }}
          >
            {rows > 0 ? (
              <View
                style={{
                  marginTop: CALENDAR_METRICS.dayNumberHeight,
                  marginHorizontal: CALENDAR_METRICS.chipHorizontalInset,
                  gap: CALENDAR_METRICS.chipGap,
                  overflow: "hidden",
                }}
              >
                {preview.entries.map((entry) => (
                  <PrototypeEntryContent
                    key={`${entry.kind}:${entry.id}:${entry.date}`}
                    entry={entry}
                    display={display}
                    timeZone={timeZone}
                  />
                ))}
                {preview.overflowCount > 0 ? (
                  <Text
                    numberOfLines={1}
                    allowFontScaling={false}
                    style={{
                      height: CALENDAR_METRICS.entryRowHeight,
                      color: palette.textMuted,
                      fontSize: CALENDAR_METRICS.entryFontSize,
                    }}
                  >{`+${preview.overflowCount}`}</Text>
                ) : null}
                {/* Keep the first entry aligned with neighboring days. */}
                {holiday && rows > 1 ? (
                  <Text
                    numberOfLines={1}
                    allowFontScaling={false}
                    style={{
                      height: CALENDAR_METRICS.entryRowHeight,
                      color: palette.textMuted,
                      fontSize: CALENDAR_METRICS.entryFontSize,
                    }}
                  >
                    {holiday}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </Animated.View>
  );
}

export function PrototypeDates({
  layout,
  progress,
  currentDate,
  selectedDate,
}: {
  layout: PrototypeMonth;
  progress: SharedValue<number>;
  currentDate: string;
  selectedDate?: string | null;
}) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      {layout.days.map((day) => (
        <MovingDay
          key={day.day}
          day={day}
          progress={progress}
          currentDate={currentDate}
          selectedDate={selectedDate}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  day: {
    position: "absolute",
    width: 30,
    height: 30,
    borderRadius: RADII.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    position: "absolute",
    minHeight: 44,
    minWidth: 44,
    fontSize: TYPOGRAPHY.sectionTitle.fontSize,
    fontWeight: "700",
  },
  miniDay: {
    position: "absolute",
    width: 18,
    height: 18,
    fontSize: CALENDAR_METRICS.dayNumberFontSize * 0.6,
    textAlign: "center",
    lineHeight: TYPOGRAPHY.label.lineHeight,
  },
  weekdays: { flexDirection: "row", height: 32, alignItems: "center" },
});
