import Ionicons from "@expo/vector-icons/Ionicons";
import { memo, useMemo } from "react";
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import Animated, { FadeInDown, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { CalendarAnchorRect } from "@/features/calendar/calendar-layout";
import { calculateCalendarPopupPlacement } from "@/features/calendar/calendar-layout";
import type { QuickEntryAction } from "@/features/calendar/quick-entry-actions";
import { QuickEntryActionTile } from "@/features/calendar/quick-entry-action-tile";
import { usePalette } from "@/theme/palette";

const POPUP_HEIGHT = 158;

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
  onClose,
  onOpenDetails,
  onSelectAction,
}: {
  readonly actions: readonly QuickEntryAction[];
  readonly anchor: CalendarAnchorRect;
  readonly busy: boolean;
  readonly date: string;
  readonly onClose: () => void;
  readonly onOpenDetails: (date: string) => void;
  readonly onSelectAction: (action: QuickEntryAction, date: string) => void;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const popupWidth = Math.min(360, width - 24);
  const placement = useMemo(
    () => calculateCalendarPopupPlacement({
      anchor,
      viewportWidth: width,
      viewportHeight: height,
      popupWidth,
      popupHeight: POPUP_HEIGHT,
      topInset: insets.top,
      bottomInset: Math.max(insets.bottom + 56, 72),
    }),
    [anchor, height, insets.bottom, insets.top, popupWidth, width],
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
          entering={FadeInDown.duration(170)}
          exiting={FadeOut.duration(100)}
          style={{
            position: "absolute",
            left: placement.left,
            top: placement.top,
            width: popupWidth,
            height: POPUP_HEIGHT,
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
              minHeight: 34,
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
                width: 32,
                height: 32,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 16,
                opacity: pressed ? 0.58 : 1,
              })}
            >
              <Ionicons color={palette.text} name="close" size={19} />
            </Pressable>
          </View>
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
              height: 34,
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
