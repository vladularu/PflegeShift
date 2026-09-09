import { memo } from "react";
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
}: {
  day: PrototypeDay;
  progress: SharedValue<number>;
  currentDate: string;
}) {
  const palette = usePalette();
  const isToday = currentDate === day.date;
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
      style={[styles.day, { backgroundColor: isToday ? palette.primary : "transparent" }, motion]}
    >
      <Text
        allowFontScaling={false}
        style={{
          fontSize: CALENDAR_METRICS.dayNumberFontSize,
          fontWeight: isToday ? "700" : "500",
          color: isToday ? palette.onPrimary : day.weekend ? palette.textMuted : palette.text,
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
}: {
  layouts: readonly PrototypeMonth[];
  selectedMonth: string;
  onSelect: (month: string) => void;
  progress: SharedValue<number>;
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
              { left: layout.title.x, top: layout.title.y, color: palette.text },
            ]}
          >
            {PROTOTYPE_MONTH_NAMES[index]}
          </Text>
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
      {layout.days.map((day) => {
        const entries = entriesByDate.get(day.date) ?? [];
        const holiday = holidays.get(day.date)?.name;
        // Reserve overflow space before choosing entries so dense days never
        // overlap the next week (including very short six-week viewports).
        const rows = Math.max(
          0,
          Math.floor((layout.weekHeight - 43) / CALENDAR_METRICS.entryRowHeight),
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
                  marginTop: 41,
                  marginHorizontal: 2,
                  overflow: "hidden",
                }}
              >
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
}: {
  layout: PrototypeMonth;
  progress: SharedValue<number>;
  currentDate: string;
}) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      {layout.days.map((day) => (
        <MovingDay key={day.day} day={day} progress={progress} currentDate={currentDate} />
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
