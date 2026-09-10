import Ionicons from "@expo/vector-icons/Ionicons";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  findNodeHandle,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, { FadeIn, FadeOut, Keyframe } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { CalendarEntry } from "@/domain/types";
import {
  calculateCalendarPopupPlacement,
  type CalendarAnchorRect,
} from "@/features/calendar/calendar-layout";
import type { QuickEntryAction } from "@/features/calendar/quick-entry-actions";
import { accessibleChipBackgroundColor, chipTextColor } from "@/theme/color-contrast";
import { usePalette } from "@/theme/palette";
import { DARK_PALETTE, LIGHT_PALETTE } from "@/theme/palette-values";
import { MOTION } from "@/theme/motion";
import { TEXT_MAX_SCALE } from "@/theme/typography";
import { scheduleAccessibilityFocus } from "@/ui/accessibility-focus";
import { ShiftSymbol } from "@/ui/shift-symbol";

const HEADER_HEIGHT = 42;
const HOLIDAY_HEADER_HEIGHT = 58;
const ENTRY_ROW_HEIGHT = 54;
const OVERFLOW_ROW_HEIGHT = 30;
const ACTION_ROW_HEIGHT = 64;

function compactDate(date: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function entrySubtitle(entry: CalendarEntry): string {
  const location = entry.location?.name;
  if (entry.kind === "APPOINTMENT") {
    const time = entry.allDay ? "Ganztägig" : `${entry.startTime}–${entry.endTime}`;
    return location ? `${time} · ${location}` : time;
  }
  const time =
    entry.allDay || entry.startTime === null || entry.endTime === null
      ? "Ganztägig"
      : `${entry.startTime}–${entry.endTime}`;
  return location ? `${time} · ${location}` : time;
}

export const QuickEntryPopup = memo(function QuickEntryPopup({
  actions,
  animateEntry = true,
  anchor,
  busy,
  date,
  entries,
  holidayName,
  onClose,
  onOpenEntry,
  onOpenDetails,
  onOpenShiftPicker,
  onSelectAction,
}: {
  readonly actions: readonly QuickEntryAction[];
  readonly animateEntry?: boolean;
  readonly anchor: CalendarAnchorRect;
  readonly busy: boolean;
  readonly date: string;
  readonly entries: readonly CalendarEntry[];
  readonly holidayName?: string;
  readonly onClose: () => void;
  readonly onOpenEntry: (entry: CalendarEntry) => void;
  readonly onOpenDetails: (date: string) => void;
  readonly onOpenShiftPicker: (date: string) => void;
  readonly onSelectAction: (action: QuickEntryAction, date: string) => void;
}) {
  const appPalette = usePalette();
  const palette = appPalette.dark ? LIGHT_PALETTE : DARK_PALETTE;
  const insets = useSafeAreaInsets();
  const { width, height, fontScale } = useWindowDimensions();
  const dialogHeadingRef = useRef<View>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [closing, setClosing] = useState(false);
  const layoutScale = Math.max(1, fontScale);
  const entryRowHeight = Math.ceil(ENTRY_ROW_HEIGHT * layoutScale);
  const overflowRowHeight = Math.ceil(OVERFLOW_ROW_HEIGHT * layoutScale);
  const actionRowHeight = Math.ceil(ACTION_ROW_HEIGHT * layoutScale);
  const popupWidth = Math.min(420, width - 12);
  const visibleEntries = entries.slice(0, 2);
  const overflowCount = Math.max(0, entries.length - visibleEntries.length);
  const headerHeight = Math.ceil(
    (holidayName ? HOLIDAY_HEADER_HEIGHT : HEADER_HEIGHT) * layoutScale,
  );
  const desiredPopupHeight =
    headerHeight +
    visibleEntries.length * entryRowHeight +
    (overflowCount > 0 ? overflowRowHeight : 0) +
    actionRowHeight;
  const maxPopupHeight = Math.max(240, height - insets.top - Math.max(insets.bottom + 68, 82) - 24);
  const popupHeight = Math.min(desiredPopupHeight, maxPopupHeight);
  const editorActions = actions.filter((action) => action.kind !== "TEMPLATE");
  const placement = useMemo(
    () =>
      calculateCalendarPopupPlacement({
        anchor,
        viewportWidth: width,
        viewportHeight: height,
        popupWidth,
        popupHeight,
        topInset: insets.top,
        bottomInset: Math.max(insets.bottom + 68, 82),
        edgeInset: 6,
      }),
    [anchor, height, insets.bottom, insets.top, popupHeight, popupWidth, width],
  );
  const arrowLeft = Math.max(
    18,
    Math.min(popupWidth - 28, anchor.x + anchor.width / 2 - placement.left - 6),
  );
  const popupMotion = useMemo(() => {
    const anchorOffset =
      placement.direction === "BELOW" ? -MOTION.distance.subtle : MOTION.distance.subtle;
    return {
      entering: new Keyframe({
        0: {
          opacity: 0,
          transform: [{ translateY: anchorOffset }, { scale: MOTION.scale.enter }],
        },
        100: {
          opacity: 1,
          transform: [{ translateY: 0 }, { scale: 1 }],
          easing: MOTION.easing.calm,
        },
      })
        .duration(MOTION.duration.normal)
        .reduceMotion(MOTION.reduceMotion),
      exiting: new Keyframe({
        0: {
          opacity: 1,
          transform: [{ translateY: 0 }, { scale: 1 }],
        },
        100: {
          opacity: 0,
          transform: [{ translateY: anchorOffset }, { scale: MOTION.scale.enter }],
          easing: MOTION.easing.calm,
        },
      })
        .duration(MOTION.duration.fast)
        .reduceMotion(MOTION.reduceMotion),
    };
  }, [placement.direction]);

  useEffect(() => {
    scheduleAccessibilityFocus(findNodeHandle(dialogHeadingRef.current));
    return () => {
      if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    };
  }, []);

  function closePopup() {
    if (closing) return;
    setClosing(true);
    closeTimer.current = setTimeout(() => {
      onClose();
      closeTimer.current = null;
    }, MOTION.duration.fast);
  }

  return (
    <View
      pointerEvents={closing ? "none" : "box-none"}
      testID="quick-entry-overlay"
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 10_000,
        elevation: 24,
      }}
    >
      {closing ? null : (
        <Animated.View
          entering={
            animateEntry
              ? FadeIn.duration(MOTION.duration.fast).reduceMotion(MOTION.reduceMotion)
              : undefined
          }
          exiting={FadeOut.duration(MOTION.duration.fast).reduceMotion(MOTION.reduceMotion)}
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
        >
          <Pressable
            accessible={false}
            accessibilityElementsHidden
            aria-hidden
            importantForAccessibility="no-hide-descendants"
            onPress={closePopup}
            style={{ flex: 1, backgroundColor: appPalette.overlaySubtle }}
          />
        </Animated.View>
      )}
      {closing ? null : (
        <Animated.View
          accessibilityLabel={`Schnellauswahl für ${compactDate(date)}`}
          accessibilityViewIsModal
          testID="quick-entry-popup"
          entering={animateEntry ? popupMotion.entering : undefined}
          exiting={popupMotion.exiting}
          pointerEvents={closing ? "none" : "auto"}
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
            overflow: "hidden",
            boxShadow: `0 14px 34px ${palette.shadow}`,
            zIndex: 10_001,
            elevation: 25,
          }}
        >
          <View
            ref={dialogHeadingRef}
            accessible
            accessibilityLabel={`Schnellauswahl für ${compactDate(date)}, Überschrift`}
            accessibilityRole="header"
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
              <Text
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                selectable
                style={{ color: palette.text, fontSize: 13, fontWeight: "700" }}
              >
                {compactDate(date)}
              </Text>
              {holidayName ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <View
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: palette.warning,
                    }}
                  />
                  <Text
                    maxFontSizeMultiplier={TEXT_MAX_SCALE}
                    selectable
                    style={{ flex: 1, color: palette.warning, fontSize: 11, fontWeight: "600" }}
                  >
                    {holidayName}
                  </Text>
                </View>
              ) : null}
            </View>
            <Pressable
              accessibilityLabel="Schnellauswahl schließen"
              accessibilityRole="button"
              hitSlop={8}
              onPress={closePopup}
              style={({ pressed }) => ({
                minWidth: 44,
                minHeight: 44,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.58 : 1,
              })}
            >
              <Ionicons
                accessibilityElementsHidden
                color={palette.textMuted}
                name="close"
                size={22}
              />
            </Pressable>
          </View>

          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={{ flexShrink: 1 }}>
            {visibleEntries.map((entry) => {
              return (
                <Pressable
                  key={`${entry.kind}-${entry.id}`}
                  accessibilityLabel={`${entry.title} bearbeiten`}
                  accessibilityRole="button"
                  onPress={() => onOpenEntry(entry)}
                  style={({ pressed }) => ({
                    minHeight: entryRowHeight,
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
                      <ShiftSymbol color={chipTextColor} size={15} value={entry.symbol} />
                    ) : (
                      <Ionicons color={chipTextColor} name="calendar-outline" size={15} />
                    )}
                  </View>
                  <View style={{ minWidth: 0, flex: 1, gap: 1 }}>
                    <Text
                      maxFontSizeMultiplier={TEXT_MAX_SCALE}
                      style={{ color: palette.text, fontSize: 13, fontWeight: "600" }}
                    >
                      {entry.title}
                    </Text>
                    <Text
                      maxFontSizeMultiplier={TEXT_MAX_SCALE}
                      style={{ color: palette.textMuted, fontSize: 12 }}
                    >
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
                  minHeight: overflowRowHeight,
                  alignItems: "center",
                  justifyContent: "center",
                  borderBottomWidth: 1,
                  borderBottomColor: palette.separator,
                  opacity: pressed ? 0.58 : 1,
                })}
              >
                <Text
                  maxFontSizeMultiplier={TEXT_MAX_SCALE}
                  style={{ color: palette.textMuted, fontSize: 12, fontWeight: "600" }}
                >
                  +{overflowCount} weitere
                </Text>
              </Pressable>
            ) : null}

            <View
              accessibilityRole="toolbar"
              style={{
                minHeight: actionRowHeight,
                flexDirection: "row",
                alignItems: "stretch",
              }}
            >
              {editorActions.map((action, index) => (
                <Pressable
                  key={action.key}
                  accessibilityLabel={`${action.kind === "APPOINTMENT" ? "Termin" : "Schicht"} hinzufügen`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busy }}
                  disabled={busy}
                  onPress={() => {
                    if (action.kind === "CUSTOM_SHIFT") {
                      onOpenShiftPicker(date);
                      return;
                    }
                    onSelectAction(action, date);
                  }}
                  style={({ pressed }) => ({
                    minHeight: actionRowHeight,
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    borderLeftWidth: index === 0 ? 0 : 1,
                    borderLeftColor: palette.separator,
                    backgroundColor: pressed ? palette.surfaceMuted : "transparent",
                    opacity: busy ? 0.38 : 1,
                  })}
                >
                  <Ionicons accessible={false} color={palette.text} name="add" size={21} />
                  <Text
                    maxFontSizeMultiplier={TEXT_MAX_SCALE}
                    style={{ color: palette.text, fontSize: 14, fontWeight: "500" }}
                  >
                    {action.kind === "APPOINTMENT" ? "Termin" : "Schicht"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </Animated.View>
      )}
    </View>
  );
});
