import { useMemo } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";

import type { CalendarEntry, UserProfile } from "@/domain/types";
import {
  createVisibleMonthGrid,
  formatMonthTitle,
  today,
} from "@/engine/calendar";
import { holidayMapForMonth } from "@/engine/holidays";
import { calculateMonthlySummary } from "@/engine/monthly-summary";
import { formatMinutes, formatSignedMinutes } from "@/engine/working-time";
import { usePalette } from "@/theme/palette";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function EntryPill({ entry }: { readonly entry: CalendarEntry }) {
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
}: {
  readonly month: string;
  readonly entries: readonly CalendarEntry[];
  readonly profile: UserProfile;
  readonly pageHeight: number;
  readonly onSelectDate: (date: string) => void;
}) {
  const palette = usePalette();
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width - 12, 820);
  const grid = useMemo(() => createVisibleMonthGrid(month), [month]);
  const weekCount = grid.length / 7;
  const gridHeight = Math.max(360, pageHeight - 126);
  const cellHeight = gridHeight / weekCount;
  const visibleEntryCount = cellHeight >= 104 ? 3 : cellHeight >= 78 ? 2 : 1;
  const monthEntries = useMemo(
    () => entries.filter((entry) => entry.date.startsWith(`${month}-`)),
    [entries, month],
  );
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const entry of monthEntries) {
      const existing = map.get(entry.date) ?? [];
      existing.push(entry);
      map.set(entry.date, existing);
    }
    return map;
  }, [monthEntries]);
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
            minHeight: 76,
            paddingHorizontal: 16,
            paddingTop: 14,
            paddingBottom: 12,
          }}
        >
          <Text selectable style={{ color: palette.text, fontSize: 25, fontWeight: "900", letterSpacing: -0.7 }}>
            {formatMonthTitle(month)}
          </Text>
          <View style={{ alignItems: "flex-end", gap: 2 }}>
            <Text selectable style={{ color: palette.textMuted, fontSize: 10, fontWeight: "800", letterSpacing: 0.7 }}>
              SOLL · IST · SALDO
            </Text>
            <Text selectable style={{ color: palette.text, fontSize: 13, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
              {formatMinutes(summary.targetMinutes)} · {formatMinutes(summary.actualMinutes)} ·{" "}
              <Text style={{ color: summary.balanceMinutes >= 0 ? palette.primary : palette.danger }}>
                {formatSignedMinutes(summary.balanceMinutes)}
              </Text>
            </Text>
          </View>
        </View>

        <View style={{ minHeight: 36, flexDirection: "row", backgroundColor: palette.outsideMonth }}>
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
            return (
              <Pressable
                key={cell.date}
                accessibilityLabel={
                  cell.inMonth
                    ? `${cell.day}. ${formatMonthTitle(month)}, ${dayEntries.length} Einträge${holiday ? `, ${holiday.name}` : ""}`
                    : "Außerhalb des Monats"
                }
                accessibilityRole={cell.inMonth ? "button" : undefined}
                disabled={!cell.inMonth}
                onPress={() => onSelectDate(cell.date)}
                style={({ pressed }) => ({
                  width: "14.285714%",
                  height: cellHeight,
                  gap: 3,
                  borderTopWidth: 1,
                  borderRightWidth: 1,
                  borderColor: palette.border,
                  backgroundColor: !cell.inMonth
                    ? palette.outsideMonth
                    : cell.weekend
                      ? palette.weekend
                      : palette.surface,
                  opacity: pressed ? 0.7 : 1,
                  paddingHorizontal: 3,
                  paddingTop: 5,
                })}
              >
                {cell.inMonth ? (
                  <>
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
                            color: isToday ? (palette.dark ? "#10221D" : "#FFFFFF") : palette.text,
                            fontSize: 13,
                            fontWeight: isToday ? "900" : "700",
                            fontVariant: ["tabular-nums"],
                          }}
                        >
                          {cell.day}
                        </Text>
                      </View>
                      {holiday ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: palette.danger }} /> : null}
                    </View>
                    {dayEntries.slice(0, visibleEntryCount).map((entry) => (
                      <EntryPill key={`${entry.kind}-${entry.id}`} entry={entry} />
                    ))}
                    {dayEntries.length > visibleEntryCount ? (
                      <Text style={{ color: palette.textMuted, fontSize: 10, fontWeight: "800", textAlign: "center" }}>
                        +{dayEntries.length - visibleEntryCount} weitere
                      </Text>
                    ) : holiday && dayEntries.length === 0 ? (
                      <Text numberOfLines={1} style={{ color: palette.danger, fontSize: 9, fontWeight: "700", paddingHorizontal: 2 }}>
                        {holiday.name}
                      </Text>
                    ) : null}
                  </>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}
