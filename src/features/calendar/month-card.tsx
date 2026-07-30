import { useMemo } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";

import type { CalendarEntry, UserProfile } from "@/domain/types";
import { createMonthGrid, formatMonthTitle, today } from "@/engine/calendar";
import { holidayMapForMonth } from "@/engine/holidays";
import { calculateMonthlySummary } from "@/engine/monthly-summary";
import { formatMinutes, formatSignedMinutes } from "@/engine/working-time";
import { usePalette } from "@/theme/palette";

export const MONTH_ITEM_HEIGHT = 518;
const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function EntryPill({ entry }: { readonly entry: CalendarEntry }) {
  return (
    <View
      style={{
        minHeight: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 2,
        overflow: "hidden",
        borderRadius: 4,
        backgroundColor: entry.color,
        paddingHorizontal: 3,
      }}
    >
      <Text
        numberOfLines={1}
        style={{ flex: 1, color: "#FFFFFF", fontSize: 8, fontWeight: "900" }}
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
  onSelectDate,
}: {
  readonly month: string;
  readonly entries: readonly CalendarEntry[];
  readonly profile: UserProfile;
  readonly onSelectDate: (date: string) => void;
}) {
  const palette = usePalette();
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width - 24, 720);
  const cellWidth = contentWidth / 7;
  const grid = useMemo(() => createMonthGrid(month), [month]);
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
        height: MONTH_ITEM_HEIGHT,
        alignItems: "center",
        backgroundColor: palette.background,
        paddingTop: 10,
      }}
    >
      <View
        style={{
          width: contentWidth,
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
            paddingHorizontal: 15,
            paddingTop: 13,
            paddingBottom: 11,
          }}
        >
          <Text selectable style={{ color: palette.text, fontSize: 21, fontWeight: "900", letterSpacing: -0.5 }}>
            {formatMonthTitle(month)}
          </Text>
          <View style={{ alignItems: "flex-end", gap: 2 }}>
            <Text selectable style={{ color: palette.textMuted, fontSize: 9, fontWeight: "800", letterSpacing: 0.7 }}>
              SOLL · IST · SALDO
            </Text>
            <Text selectable style={{ color: palette.text, fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
              {formatMinutes(summary.targetMinutes)} · {formatMinutes(summary.actualMinutes)} ·{" "}
              <Text style={{ color: summary.balanceMinutes >= 0 ? palette.primary : palette.danger }}>
                {formatSignedMinutes(summary.balanceMinutes)}
              </Text>
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", backgroundColor: palette.outsideMonth }}>
          {WEEKDAYS.map((weekday) => (
            <View key={weekday} style={{ width: cellWidth, alignItems: "center", paddingVertical: 7 }}>
              <Text style={{ color: palette.textMuted, fontSize: 10, fontWeight: "800" }}>{weekday}</Text>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
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
                  width: cellWidth,
                  height: 64,
                  gap: 2,
                  borderTopWidth: 1,
                  borderRightWidth: 1,
                  borderColor: palette.border,
                  backgroundColor: !cell.inMonth
                    ? palette.outsideMonth
                    : cell.weekend
                      ? palette.weekend
                      : palette.surface,
                  opacity: pressed ? 0.7 : 1,
                  paddingHorizontal: 2,
                  paddingTop: 3,
                })}
              >
                {cell.inMonth ? (
                  <>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 2 }}>
                      <View
                        style={{
                          minWidth: 21,
                          height: 21,
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: 11,
                          backgroundColor: isToday ? palette.primary : "transparent",
                        }}
                      >
                        <Text
                          style={{
                            color: isToday ? (palette.dark ? "#10221D" : "#FFFFFF") : palette.text,
                            fontSize: 10,
                            fontWeight: isToday ? "900" : "700",
                            fontVariant: ["tabular-nums"],
                          }}
                        >
                          {cell.day}
                        </Text>
                      </View>
                      {holiday ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: palette.danger }} /> : null}
                    </View>
                    {dayEntries.slice(0, 2).map((entry) => <EntryPill key={`${entry.kind}-${entry.id}`} entry={entry} />)}
                    {dayEntries.length > 2 ? (
                      <Text style={{ color: palette.textMuted, fontSize: 8, fontWeight: "800", textAlign: "center" }}>
                        +{dayEntries.length - 2}
                      </Text>
                    ) : holiday && dayEntries.length === 0 ? (
                      <Text numberOfLines={1} style={{ color: palette.danger, fontSize: 7, fontWeight: "700", paddingHorizontal: 2 }}>
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
