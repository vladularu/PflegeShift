import { useMemo } from "react";
import {
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
} from "react-native";

import type { CalendarEntry, UserProfile } from "@/domain/types";
import {
  createVisibleMonthGrid,
  formatDateTitle,
  formatMonthTitle,
  today,
} from "@/engine/calendar";
import { holidayMapForMonth } from "@/engine/holidays";
import { calculateMonthlyCompliance } from "@/engine/compliance";
import { calculateMonthlySummary } from "@/engine/monthly-summary";
import { MonthProgress } from "@/features/calendar/month-progress";
import { usePalette } from "@/theme/palette";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const HEADER_HEIGHT = 96;
const WEEKDAY_HEIGHT = 34;

function EntryPill({
  entry,
  dimmed = false,
}: {
  readonly entry: CalendarEntry;
  readonly dimmed?: boolean;
}) {
  return (
    <View
      accessibilityLabel={entry.title}
      accessible
      style={{
        minHeight: 20,
        flexDirection: "row",
        alignItems: "center",
        gap: 2,
        overflow: "hidden",
        borderRadius: 4,
        backgroundColor: entry.color,
        opacity: dimmed ? 0.62 : 1,
        paddingHorizontal: 4,
      }}
    >
      <Text
        numberOfLines={1}
        style={{ flex: 1, color: "#FFFFFF", fontSize: 10, fontWeight: "900" }}
      >
        {entry.kind === "SHIFT" ? `${entry.symbol} ${entry.title}` : `• ${entry.title}`}
      </Text>
    </View>
  );
}

export function MonthCard({
  month,
  entries,
  profile,
  pageHeight,
  onSelectDate,
  selectedDate,
}: {
  readonly month: string;
  readonly entries: readonly CalendarEntry[];
  readonly profile: UserProfile;
  readonly pageHeight: number;
  readonly onSelectDate: (
    date: string,
    anchor: { readonly x: number; readonly y: number },
  ) => void;
  readonly selectedDate: string | null;
}) {
  const palette = usePalette();
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width - 12, 820);
  const grid = useMemo(() => createVisibleMonthGrid(month), [month]);
  const weekCount = grid.length / 7;
  const gridHeight = Math.max(360, pageHeight - 12 - 2 - HEADER_HEIGHT - WEEKDAY_HEIGHT);
  const cellHeight = gridHeight / weekCount;
  const visibleEntryCount = cellHeight >= 104 ? 3 : cellHeight >= 78 ? 2 : 1;
  const visibleStart = grid[0]?.date ?? `${month}-01`;
  const visibleEnd = grid.at(-1)?.date ?? `${month}-31`;
  const visibleEntries = useMemo(
    () =>
      entries.filter(
        (entry) => entry.date >= visibleStart && entry.date <= visibleEnd,
      ),
    [entries, visibleEnd, visibleStart],
  );
  const monthEntries = useMemo(
    () => entries.filter((entry) => entry.date.startsWith(`${month}-`)),
    [entries, month],
  );
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const entry of visibleEntries) {
      const existing = map.get(entry.date) ?? [];
      existing.push(entry);
      map.set(entry.date, existing);
    }
    return map;
  }, [visibleEntries]);
  const holidays = useMemo(
    () => holidayMapForMonth(month, profile.federalState),
    [month, profile.federalState],
  );
  const summary = useMemo(
    () =>
      calculateMonthlySummary(
        month,
        monthEntries.filter((entry): entry is Extract<CalendarEntry, { kind: "SHIFT" }> => entry.kind === "SHIFT"),
        profile,
      ),
    [month, monthEntries, profile],
  );
  const compliance = useMemo(
    () =>
      calculateMonthlyCompliance(
        month,
        entries.filter((entry): entry is Extract<CalendarEntry, { kind: "SHIFT" }> => entry.kind === "SHIFT"),
        profile.timeZone,
      ),
    [entries, month, profile.timeZone],
  );
  const complianceDates = useMemo(
    () => new Set(compliance.affectedDates),
    [compliance.affectedDates],
  );
  const currentDate = today(profile.timeZone);

  return (
    <View
      style={{
        height: pageHeight,
        alignItems: "center",
        backgroundColor: palette.background,
        paddingVertical: 6,
      }}
    >
      <View
        style={{
          width: contentWidth,
          height: pageHeight - 12,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: palette.border,
          borderRadius: 20,
          borderCurve: "continuous",
          backgroundColor: palette.surface,
          boxShadow: palette.dark ? undefined : "0 4px 18px rgba(24,32,30,0.06)",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 12,
            height: HEADER_HEIGHT,
            paddingHorizontal: 16,
            paddingVertical: 12,
          }}
        >
          <Text
            selectable
            style={{
              flexShrink: 1,
              color: palette.text,
              fontSize: 25,
              fontWeight: "900",
              letterSpacing: -0.7,
              paddingBottom: 4,
            }}
          >
            {formatMonthTitle(month)}
          </Text>
          <MonthProgress summary={summary} />
        </View>

        <View style={{ height: WEEKDAY_HEIGHT, flexDirection: "row", backgroundColor: palette.outsideMonth }}>
          {WEEKDAYS.map((weekday) => (
            <View key={weekday} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: palette.textMuted, fontSize: 12, fontWeight: "800" }}>{weekday}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: gridHeight, flexDirection: "row", flexWrap: "wrap" }}>
          {grid.map((cell) => {
            const dayEntries = byDate.get(cell.date) ?? [];
            const holiday = holidays.get(cell.date);
            const isToday = cell.date === currentDate;
            const isSelected = cell.date === selectedDate;
            const hasComplianceIssue = complianceDates.has(cell.date);
            return (
              <Pressable
                key={cell.date}
                accessibilityLabel={
                  `${formatDateTitle(cell.date)}, ${dayEntries.length} Einträge${holiday ? `, ${holiday.name}` : ""}`
                }
                accessibilityRole="button"
                onPress={(event: GestureResponderEvent) =>
                  onSelectDate(cell.date, {
                    x: event.nativeEvent.pageX,
                    y: event.nativeEvent.pageY,
                  })
                }
                style={({ pressed }) => ({
                  width: "14.285714%",
                  height: cellHeight,
                  gap: 3,
                  borderTopWidth: 1,
                  borderRightWidth: 1,
                  borderColor: palette.border,
                  backgroundColor: isSelected
                    ? palette.primarySoft
                    : !cell.inMonth
                      ? palette.outsideMonth
                      : cell.weekend
                        ? palette.weekend
                        : palette.surface,
                  opacity: pressed ? 0.7 : cell.inMonth ? 1 : 0.82,
                  paddingHorizontal: 3,
                  paddingTop: 5,
                })}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 2 }}>
                  <View
                    style={{
                      minWidth: 28,
                      height: 28,
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 14,
                      backgroundColor: isToday ? palette.primary : "transparent",
                    }}
                  >
                    <Text
                      style={{
                        color: isToday
                          ? palette.dark
                            ? "#10221D"
                            : "#FFFFFF"
                          : cell.inMonth
                            ? palette.text
                            : palette.textMuted,
                        fontSize: 13,
                        fontWeight: isToday ? "900" : cell.inMonth ? "700" : "600",
                        fontVariant: ["tabular-nums"],
                      }}
                    >
                      {cell.day}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 3 }}>
                    {hasComplianceIssue ? (
                      <View
                        accessibilityLabel="ArbZG-Hinweis"
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: 4,
                          backgroundColor: "#F2A93B",
                        }}
                      />
                    ) : null}
                    {holiday ? (
                      <View
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: 4,
                          backgroundColor: palette.danger,
                        }}
                      />
                    ) : null}
                  </View>
                </View>
                {dayEntries.slice(0, visibleEntryCount).map((entry) => (
                  <EntryPill
                    key={`${entry.kind}-${entry.id}`}
                    dimmed={!cell.inMonth}
                    entry={entry}
                  />
                ))}
                {dayEntries.length > visibleEntryCount ? (
                  <Text
                    style={{
                      color: palette.textMuted,
                      fontSize: 9,
                      fontWeight: "800",
                      textAlign: "center",
                    }}
                  >
                    +{dayEntries.length - visibleEntryCount}
                  </Text>
                ) : holiday && dayEntries.length === 0 && cell.inMonth ? (
                  <Text
                    numberOfLines={1}
                    style={{
                      color: palette.danger,
                      fontSize: 9,
                      fontWeight: "700",
                      paddingHorizontal: 2,
                    }}
                  >
                    {holiday.name}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}
