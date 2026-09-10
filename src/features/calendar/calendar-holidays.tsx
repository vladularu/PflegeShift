import { useMemo } from "react";
import { View } from "react-native";

import type { UserProfile } from "@/domain/types";
import { resolveHolidayMapForMonths, type HolidayMonthResolution } from "@/engine/holidays";
import type { RuleResolver } from "@/rules/rule-resolver";
import { SCREEN_LAYOUT, SPACING } from "@/theme/tokens";
import { InlineNotice } from "@/ui/design-system";

const HOLIDAYS_HIDDEN: HolidayMonthResolution = Object.freeze({
  status: "AVAILABLE",
  holidays: new Map(),
  failure: null,
});

export function useCalendarHolidayResolution(
  month: string,
  profile: UserProfile | null,
  ruleResolver: RuleResolver,
  showHolidays: boolean,
): HolidayMonthResolution {
  return useMemo(() => {
    if (profile === null || !showHolidays) return HOLIDAYS_HIDDEN;
    return resolveHolidayMapForMonths(
      [month],
      profile.federalState,
      ruleResolver,
      profile.holidayRegion,
    );
  }, [month, profile, ruleResolver, showHolidays]);
}

export function holidayNameForDate(
  date: string,
  profile: UserProfile,
  ruleResolver: RuleResolver,
): string | undefined {
  return resolveHolidayMapForMonths(
    [date.slice(0, 7)],
    profile.federalState,
    ruleResolver,
    profile.holidayRegion,
  ).holidays.get(date)?.name;
}

export function CalendarHolidayCoverageNotice({
  resolution,
}: {
  readonly resolution: HolidayMonthResolution;
}) {
  if (resolution.status === "AVAILABLE") return null;
  return (
    <View
      style={{
        paddingHorizontal: SCREEN_LAYOUT.horizontalPadding,
        paddingBottom: SPACING.sm,
      }}
    >
      <InlineNotice
        message="Feiertagsregeln für diesen Zeitraum noch nicht verfügbar."
        tone="warning"
      />
    </View>
  );
}
