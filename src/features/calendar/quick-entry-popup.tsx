import Ionicons from "@expo/vector-icons/Ionicons";
import { memo, useMemo } from "react";
import { Modal, Pressable, Text, View, useWindowDimensions } from "react-native";
import Animated, { FadeInDown, FadeInUp, FadeOut, ReduceMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { CalendarEntry } from "@/domain/types";
import {
  calculateCalendarPopupPlacement,
  calculateQuickPlannerLayout,
  type CalendarAnchorRect,
} from "@/features/calendar/calendar-layout";
import { QuickEntryActionStrip } from "@/features/calendar/quick-entry-action-strip";
import type { QuickEntryAction } from "@/features/calendar/quick-entry-actions";
import {
  accessibleChipBackgroundColor,
  chipTextColor,
} from "@/theme/color-contrast";
import { usePalette } from "@/theme/palette";

const HEADER_HEIGHT = 42;
const HOLIDAY_HEADER_HEIGHT = 58;
const ENTRY_ROW_HEIGHT = 54;
const OVERFLOW_ROW_HEIGHT = 30;
const ACTION_STRIP_HEIGHT = 68;

function compactDate(date: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function entrySubtitle(entry: CalendarEntry): string {
  if (entry.kind === "APPOINTMENT") {
    return entry.allDay ? "Ganztägig" : `${entry.startTime}–${entry.endTime}`;
  }
  if (entry.startTime === null || entry.endTime === null) return "Ganztägig";
  return `${entry.startTime}–${entry.endTime}`;
}

export const QuickEntryPopup = memo(function QuickEntryPopup({
  actions,
  anchor,
  busy,
  date,
  entries,
  holidayName,
  onClose,
  onOpenEntry,
  onOpenDetails,
  onSelectAction,
}: {
  readonly actions: readonly QuickEntryAction[];
  readonly anchor: CalendarAnchorRect;
  readonly busy: boolean;
  readonly date: string;
  readonly entries: readonly CalendarEntry[];
  readonly holidayName?: string;
  readonly onClose: () => void;
  readonly onOpenEntry: (entry: CalendarEntry) => void;
  readonly onOpenDetails: (date: string) => void;
  readonly onSelectAction: (action: QuickEntryAction, date: string) => void;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const popupWidth = Math.min(400, width - 24);
  const visibleEntries = entries.slice(0, 2);
  const overflowCount = Math.max(0, entries.length - visibleEntries.length);
  const headerHeight = holidayName ? HOLIDAY_HEADER_HEIGHT : HEADER_HEIGHT;
  const popupHeight = headerHeight
    + visibleEntries.length * ENTRY_ROW_HEIGHT
    + (overflowCount > 0 ? OVERFLOW_ROW_HEIGHT : 0)
    + ACTION_STRIP_HEIGHT;
  const tileWidth = Math.min(66, calculateQuickPlannerLayout(popupWidth + 56).tileWidth);
  const placement = useMemo(
    () => calculateCalendarPopupPlacement({
      anchor,
      viewportWidth: width,
      viewportHeight: height,
      popupWidth,
      popupHeight,
      topInset: insets.top,
      bottomInset: Math.max(insets.bottom + 68, 82),
    }),
    [anchor, height, insets.bottom, insets.top, popupHeight, popupWidth, width],
  );
  const arrowLeft = Math.max(
    18,
    Math.min(popupWidth - 28, anchor.x + anchor.width / 2 - placement.left - 6),
  );
  const entering = placement.direction === "BELOW"
    ? FadeInDown.duration(170).reduceMotion(ReduceMotion.System)
    : FadeInUp.duration(170).reduceMotion(ReduceMotion.System);

  return (
    <Modal
      animationType="none"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible
    >
      <View style={{ flex: 1, zIndex: 10_000, elevation: 24 }}>
        <Pressable
          accessibilityLabel="Schnellauswahl schließen"
          accessibilityRole="button"
          onPress={onClose}
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: "rgba(0, 0, 0, 0.08)",
          }}
        />
        <Animated.View
          accessibilityLabel={`Schnellauswahl für ${compactDate(date)}`}
          entering={entering}
          exiting={FadeOut.duration(100).reduceMotion(ReduceMotion.System)}
          style={{
            position: "absolute",
            left: placement.left,
            top: placement.top,
            width: popupWidth,
            height: popupHeight,
            borderWidth: 1,
            borderColor: palette.border,
            borderRadius: 22,
            borderCurve: "continuous",
            backgroundColor: palette.surfaceRaised,
            boxShadow: `0 14px 34px ${palette.shadow}`,
            zIndex: 10_001,
            elevation: 25,
          }}
        >
          <View
            style={{
              position: "absolute",
              left: arrowLeft,
              top: placement.direction === "BELOW" ? -6 : undefined,
              bottom: placement.direction === "ABOVE" ? -6 : undefined,
              width: 12,
              height: 12,
              borderLeftWidth: 1,
              borderTopWidth: 1,
              borderColor: palette.border,
              backgroundColor: palette.surfaceRaised,
              transform: [{ rotate: placement.direction === "BELOW" ? "45deg" : "225deg" }],
            }}
          />

          <View
            style={{
              height: headerHeight,
              flexDirection: "row",
              alignItems: "center",
              borderBottomWidth: 1,
              borderBottomColor: palette.separator,
              paddingHorizontal: 16,
            }}
          >
            <View style={{ minWidth: 0, flex: 1, gap: 2 }}>
              <Text maxFontSizeMultiplier={1.4} numberOfLines={1} selectable style={{ color: palette.text, fontSize: 13, fontWeight: "900" }}>
                {compactDate(date)}
              </Text>
              {holidayName ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: palette.warning }} />
                  <Text maxFontSizeMultiplier={1.35} numberOfLines={1} selectable style={{ flex: 1, color: palette.warning, fontSize: 10, fontWeight: "800" }}>
                    {holidayName}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {visibleEntries.map((entry) => {
            return (
              <Pressable
                key={`${entry.kind}-${entry.id}`}
                accessibilityLabel={`${entry.title} bearbeiten`}
                accessibilityRole="button"
                onPress={() => onOpenEntry(entry)}
                style={({ pressed }) => ({
                  height: ENTRY_ROW_HEIGHT,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: palette.separator,
                  backgroundColor: pressed ? palette.surfaceMuted : "transparent",
                  paddingHorizontal: 14,
                })}
              >
                <View
                  style={{
                    width: 30,
                    height: 30,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 15,
                    backgroundColor: accessibleChipBackgroundColor(entry.color),
                  }}
                >
                  {entry.kind === "SHIFT" ? (
                    <Text maxFontSizeMultiplier={1.35} numberOfLines={1} style={{ maxWidth: 24, color: chipTextColor, fontSize: 10, fontWeight: "900" }}>
                      {entry.symbol}
                    </Text>
                  ) : (
                    <Ionicons color={chipTextColor} name="calendar-outline" size={15} />
                  )}
                </View>
                <View style={{ minWidth: 0, flex: 1, gap: 1 }}>
                  <Text maxFontSizeMultiplier={1.4} numberOfLines={1} style={{ color: palette.text, fontSize: 13, fontWeight: "900" }}>
                    {entry.title}
                  </Text>
                  <Text maxFontSizeMultiplier={1.4} numberOfLines={1} style={{ color: palette.textMuted, fontSize: 11 }}>
                    {entrySubtitle(entry)}
                  </Text>
                </View>
                <Ionicons color={palette.textMuted} name="chevron-forward" size={16} />
              </Pressable>
            );
          })}

          {overflowCount > 0 ? (
            <Pressable
              accessibilityLabel={`${overflowCount} weitere Einträge in den Tagesdetails anzeigen`}
              accessibilityRole="button"
              onPress={() => onOpenDetails(date)}
              style={({ pressed }) => ({
                height: OVERFLOW_ROW_HEIGHT,
                alignItems: "center",
                justifyContent: "center",
                borderBottomWidth: 1,
                borderBottomColor: palette.separator,
                opacity: pressed ? 0.58 : 1,
              })}
            >
              <Text maxFontSizeMultiplier={1.4} style={{ color: palette.textMuted, fontSize: 11, fontWeight: "800" }}>
                +{overflowCount} weitere
              </Text>
            </Pressable>
          ) : null}

          <View style={{ height: ACTION_STRIP_HEIGHT, paddingVertical: 4 }}>
            <QuickEntryActionStrip
              actions={actions}
              busy={busy}
              onSelectAction={(action) => onSelectAction(action, date)}
              tileWidth={tileWidth}
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
});
