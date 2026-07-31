import Ionicons from "@expo/vector-icons/Ionicons";
import { memo, useMemo } from "react";
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import Animated, { FadeInDown, FadeOut, ReduceMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { CalendarAnchorRect } from "@/features/calendar/calendar-layout";
import type { CalendarEntry } from "@/domain/types";
import { calculateCalendarPopupPlacement } from "@/features/calendar/calendar-layout";
import type { QuickEntryAction } from "@/features/calendar/quick-entry-actions";
import { QuickEntryActionTile } from "@/features/calendar/quick-entry-action-tile";
import { usePalette } from "@/theme/palette";

const BASE_POPUP_HEIGHT = 158;
const ENTRY_ROW_HEIGHT = 44;
const OVERFLOW_ROW_HEIGHT = 30;

function compactDate(date: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

export const QuickEntryPopup = memo(function QuickEntryPopup({
  actions,
  anchor,
  busy,
  date,
  entries,
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
  readonly onClose: () => void;
  readonly onOpenEntry: (entry: CalendarEntry) => void;
  readonly onOpenDetails: (date: string) => void;
  readonly onSelectAction: (action: QuickEntryAction, date: string) => void;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const popupWidth = Math.min(360, width - 24);
  const visibleEntries = entries.slice(0, 2);
  const overflowCount = Math.max(0, entries.length - visibleEntries.length);
  const popupHeight = BASE_POPUP_HEIGHT
    + visibleEntries.length * ENTRY_ROW_HEIGHT
    + (overflowCount > 0 ? OVERFLOW_ROW_HEIGHT : 0);
  const placement = useMemo(
    () => calculateCalendarPopupPlacement({
      anchor,
      viewportWidth: width,
      viewportHeight: height,
      popupWidth,
      popupHeight,
      topInset: insets.top,
      bottomInset: Math.max(insets.bottom + 56, 72),
    }),
    [anchor, height, insets.bottom, insets.top, popupHeight, popupWidth, width],
  );
  const arrowLeft = Math.max(
    18,
    Math.min(popupWidth - 26, anchor.x + anchor.width / 2 - placement.left - 5),
  );

  return (
    <Modal
      animationType="none"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible
    >
      <View
        style={{
          flex: 1,
          zIndex: 10_000,
          elevation: 24,
        }}
      >
        <Pressable
          accessibilityLabel="Schnellauswahl schließen"
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
          entering={FadeInDown.duration(170).reduceMotion(ReduceMotion.System)}
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
            paddingTop: 4,
            zIndex: 10_001,
            elevation: 25,
          }}
        >
          <View
            style={{
              position: "absolute",
              left: arrowLeft,
              top: placement.direction === "BELOW" ? -5 : undefined,
              bottom: placement.direction === "ABOVE" ? -5 : undefined,
              width: 10,
              height: 10,
              borderLeftWidth: 1,
              borderTopWidth: 1,
              borderColor: palette.border,
              backgroundColor: palette.surfaceRaised,
              transform: [{ rotate: placement.direction === "BELOW" ? "45deg" : "225deg" }],
            }}
          />
          <View
            style={{
              minHeight: 44,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingLeft: 14,
              paddingRight: 8,
            }}
          >
            <Text style={{ color: palette.text, fontSize: 13, fontWeight: "900" }}>
              {compactDate(date)}
            </Text>
            <Pressable
              accessibilityLabel="Schnellauswahl schließen"
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => ({
                width: 44,
                height: 44,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 22,
                opacity: pressed ? 0.58 : 1,
              })}
            >
              <Ionicons color={palette.text} name="close" size={19} />
            </Pressable>
          </View>
          {visibleEntries.map((entry) => (
            <Pressable
              key={`${entry.kind}-${entry.id}`}
              accessibilityLabel={`${entry.title} bearbeiten`}
              accessibilityRole="button"
              onPress={() => onOpenEntry(entry)}
              style={({ pressed }) => ({
                minHeight: ENTRY_ROW_HEIGHT,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                borderTopWidth: 1,
                borderTopColor: palette.separator,
                backgroundColor: pressed ? palette.surfaceMuted : "transparent",
                paddingHorizontal: 14,
              })}
            >
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: entry.color }} />
              <Text numberOfLines={1} style={{ flex: 1, color: palette.text, fontSize: 13, fontWeight: "800" }}>
                {entry.title}
              </Text>
              <Ionicons color={palette.textMuted} name="chevron-forward" size={16} />
            </Pressable>
          ))}
          {overflowCount > 0 ? (
            <Pressable
              accessibilityLabel={`${overflowCount} weitere Einträge in den Tagesdetails anzeigen`}
              accessibilityRole="button"
              onPress={() => onOpenDetails(date)}
              style={({ pressed }) => ({
                minHeight: OVERFLOW_ROW_HEIGHT,
                alignItems: "center",
                justifyContent: "center",
                borderTopWidth: 1,
                borderTopColor: palette.separator,
                opacity: pressed ? 0.58 : 1,
              })}
            >
              <Text style={{ color: palette.textMuted, fontSize: 11, fontWeight: "800" }}>
                +{overflowCount} weitere
              </Text>
            </Pressable>
          ) : null}
          <ScrollView
            horizontal
            contentContainerStyle={{ alignItems: "center", gap: 1, paddingHorizontal: 6 }}
            showsHorizontalScrollIndicator={false}
          >
            {actions.map((action) => (
              <QuickEntryActionTile
                key={action.key}
                action={action}
                disabled={busy}
                onPress={(selectedAction) => onSelectAction(selectedAction, date)}
              />
            ))}
          </ScrollView>
          <Pressable
            accessibilityLabel={`${compactDate(date)}, Tagesdetails öffnen`}
            accessibilityRole="button"
            onPress={() => onOpenDetails(date)}
            style={({ pressed }) => ({
              height: 44,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
              borderTopWidth: 1,
              borderTopColor: palette.separator,
              opacity: pressed ? 0.58 : 1,
            })}
          >
            <Ionicons color={palette.primary} name="list-outline" size={16} />
            <Text style={{ color: palette.primary, fontSize: 11, fontWeight: "900" }}>
              Tagesdetails
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
});
