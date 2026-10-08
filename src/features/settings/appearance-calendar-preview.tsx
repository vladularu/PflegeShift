import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import {
  usePflegeShiftEntries,
  usePflegeShiftProfile,
  usePflegeShiftTemplates,
} from "@/application/pflegeshift-provider";
import { createMonthGrid, today } from "@/engine/calendar";
import { useActiveMonth } from "@/navigation/active-month";
import { CalendarBackground } from "@/features/calendar/calendar-background";
import {
  PrototypeDates,
  PrototypeMonthContent,
} from "@/features/calendar/calendar-prototype-canvas";
import {
  calendarPrototypeLayout,
  PROTOTYPE_MONTH_NAMES,
} from "@/features/calendar/calendar-prototype-layout";
import { useCalendarPreferences } from "@/features/calendar/calendar-preferences";
import { calendarDesignPreviewData } from "./calendar-design-preview-data";
import { useMeasuredCalendarEntries } from "@/features/calendar/use-calendar-performance";
import { usePalette } from "@/theme/palette";
import { CALENDAR_METRICS, RADII, SPACING } from "@/theme/tokens";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";

/** Uses the live month renderer, including its date markers, colors and entry chips. */
export function AppearanceCalendarPreview() {
  const palette = usePalette();
  const month = useActiveMonth();
  const { entries } = usePflegeShiftEntries();
  const { profile } = usePflegeShiftProfile();
  const { templates } = usePflegeShiftTemplates();
  const examples = useMemo(
    () => calendarDesignPreviewData(month, templates, entries),
    [month, templates, entries],
  );
  const preferences = useCalendarPreferences();
  const progress = useSharedValue(1);
  const [width, setWidth] = useState(0);
  const months = useMemo(() => [month], [month]);
  const index = useMeasuredCalendarEntries(
    examples.entries,
    months,
    preferences.showAppointments,
    preferences.showShifts,
  );
  const holidays = useMemo(
    () => (preferences.showHolidays ? examples.holidays : new Map()),
    [examples.holidays, preferences.showHolidays],
  );
  const rows = preferences.showShiftTimes || preferences.showShiftDuration ? 3 : 2;
  const weekHeight =
    CALENDAR_METRICS.dayNumberHeight +
    rows * (CALENDAR_METRICS.entryRowHeight + CALENDAR_METRICS.chipGap) +
    SPACING.sm;
  const height = CALENDAR_METRICS.weekdayHeight + 2 * weekHeight;
  const layout = useMemo(() => {
    const monthHeight =
      CALENDAR_METRICS.weekdayHeight + (createMonthGrid(month).length / 7) * weekHeight;
    const full = calendarPrototypeLayout(month, width, monthHeight);
    return {
      ...full,
      days: full.days.filter((day) => day.toY < height),
      adjacentDays: full.adjacentDays.filter((day) => day.toY < height),
    };
  }, [month, width, height, weekHeight]);
  const timeZone = profile?.timeZone ?? "Europe/Berlin";
  const title = `${PROTOTYPE_MONTH_NAMES[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;
  return (
    <View
      testID="appearance-calendar-preview"
      style={{
        borderRadius: RADII.card,
        overflow: "hidden",
        backgroundColor: palette.calendarBackground,
      }}
    >
      <CalendarBackground />
      <View style={{ paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md }}>
        <Text
          accessibilityRole="header"
          accessibilityLabel={`Beispielvorschau, ${title}`}
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{ ...TYPOGRAPHY.screenTitle, color: palette.text }}
        >
          {title}
        </Text>
      </View>
      <View
        testID="appearance-preview-month"
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={{ height, marginHorizontal: SPACING.sm }}
      >
        {width > 0 ? (
          <>
            <PrototypeMonthContent
              layout={layout}
              progress={progress}
              entriesByDate={index.entriesByDate}
              holidays={holidays}
              display={preferences}
              timeZone={timeZone}
              visible
            />
            <PrototypeDates layout={layout} progress={progress} currentDate={today(timeZone)} />
          </>
        ) : null}
      </View>
    </View>
  );
}
