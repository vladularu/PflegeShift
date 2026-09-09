import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { CalendarEntry, CalendarPreferencesData } from "@/domain/types";
import { calendarChipPalette } from "@/theme/color-contrast";
import { usePalette } from "@/theme/palette";
import { CALENDAR_METRICS, RADII } from "@/theme/tokens";
import { ShiftSymbol } from "@/ui/shift-symbol";
import { calendarShiftDetail } from "./calendar-display";

export type PrototypeDisplay = Pick<
  CalendarPreferencesData,
  "labelMode" | "showShiftTimes" | "showShiftDuration"
>;

export const PrototypeEntryContent = memo(function PrototypeEntryContent({
  entry,
  display,
  timeZone,
}: {
  entry: CalendarEntry;
  display: PrototypeDisplay;
  timeZone: string;
}) {
  const palette = usePalette();
  if (entry.kind === "APPOINTMENT")
    return (
      <Text
        numberOfLines={1}
        allowFontScaling={false}
        style={[styles.row, { color: palette.text }]}
      >
        {`• ${entry.title}`}
      </Text>
    );
  const colors = calendarChipPalette(entry.color, palette.dark);
  const detail = calendarShiftDetail(entry, { ...display, timeZone });
  return (
    <View style={styles.chip}>
      <View style={[styles.main, { backgroundColor: colors.main }]}>
        {display.labelMode === "SYMBOL" ? (
          <ShiftSymbol value={entry.symbol} color={colors.onMain} size={12} />
        ) : (
          <Text
            numberOfLines={1}
            allowFontScaling={false}
            style={[styles.row, styles.center, { color: colors.onMain }]}
          >
            {display.labelMode === "SHORT" ? entry.title.slice(0, 1) : entry.title}
          </Text>
        )}
      </View>
      {detail ? (
        <Text
          numberOfLines={1}
          allowFontScaling={false}
          style={[
            styles.row,
            styles.center,
            { backgroundColor: colors.detail, color: colors.onDetail },
          ]}
        >
          {detail}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  chip: { borderRadius: RADII.small, overflow: "hidden" },
  main: { height: CALENDAR_METRICS.entryRowHeight, justifyContent: "center", alignItems: "center" },
  row: {
    height: CALENDAR_METRICS.entryRowHeight,
    lineHeight: CALENDAR_METRICS.entryRowHeight,
    fontSize: CALENDAR_METRICS.entryFontSize,
  },
  center: { textAlign: "center", width: "100%" },
});
