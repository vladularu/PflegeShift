import Ionicons from "@expo/vector-icons/Ionicons";
import { memo, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import Animated, { FadeInDown, FadeInUp, FadeOut, ReduceMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { CalendarEntry } from "@/domain/types";
import {
  calculateCalendarPopupPlacement,
  type CalendarAnchorRect,
} from "@/features/calendar/calendar-layout";
import {
  quickEntryServiceActions,
  type QuickEntryAction,
} from "@/features/calendar/quick-entry-actions";
import { usePalette } from "@/theme/palette";

const HEADER_HEIGHT = 42;
const ENTRY_ROW_HEIGHT = 54;
const OVERFLOW_ROW_HEIGHT = 30;
const ACTION_ROW_HEIGHT = 58;

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
  const [servicePickerOpen, setServicePickerOpen] = useState(false);
  const popupWidth = Math.min(400, width - 24);
  const visibleEntries = entries.slice(0, 2);
  const overflowCount = Math.max(0, entries.length - visibleEntries.length);
  const editorActions = actions.filter(
    (action) => action.kind === "CUSTOM_SHIFT" || action.kind === "APPOINTMENT",
  );
  const serviceActions = quickEntryServiceActions(actions);
  const customShiftAction = editorActions.find((action) => action.kind === "CUSTOM_SHIFT");
  const headerHeight = holidayName || servicePickerOpen ? 58 : HEADER_HEIGHT;
  const serviceListHeight = serviceActions.length === 0
    ? 42
    : Math.min(5, serviceActions.length) * 50;
  const popupHeight = servicePickerOpen
    ? headerHeight + serviceListHeight + 50
    : headerHeight
      + visibleEntries.length * ENTRY_ROW_HEIGHT
      + (overflowCount > 0 ? OVERFLOW_ROW_HEIGHT : 0)
      + ACTION_ROW_HEIGHT;
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
              paddingLeft: servicePickerOpen ? 6 : 16,
              paddingRight: 16,
            }}
          >
            {servicePickerOpen ? (
              <Pressable
                accessibilityLabel="Zurück zur Tagesauswahl"
                accessibilityRole="button"
                onPress={() => setServicePickerOpen(false)}
                style={({ pressed }) => ({
                  width: 42,
                  height: 42,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 21,
                  opacity: pressed ? 0.58 : 1,
                })}
              >
                <Ionicons color={palette.text} name="chevron-back" size={20} />
              </Pressable>
            ) : null}
            <View style={{ minWidth: 0, flex: 1, gap: 2 }}>
              <Text selectable numberOfLines={1} style={{ color: palette.text, fontSize: 13, fontWeight: "900" }}>
                {servicePickerOpen ? "Schnellauswahl" : compactDate(date)}
              </Text>
              {holidayName ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: palette.warning }} />
                  <Text selectable numberOfLines={1} style={{ flex: 1, color: palette.warning, fontSize: 10, fontWeight: "800" }}>
                    {holidayName}
                  </Text>
                </View>
              ) : servicePickerOpen ? (
                <Text selectable style={{ color: palette.textMuted, fontSize: 10 }}>
                  {compactDate(date)}
                </Text>
              ) : null}
            </View>
          </View>

          {servicePickerOpen ? (
            <>
              <ScrollView
                nestedScrollEnabled
                showsVerticalScrollIndicator={serviceActions.length > 5}
                style={{ height: serviceListHeight }}
              >
                {serviceActions.length === 0 ? (
                  <View style={{ height: serviceListHeight, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 }}>
                    <Text selectable style={{ color: palette.textMuted, fontSize: 12 }}>
                      Keine Schnelleinträge verfügbar
                    </Text>
                  </View>
                ) : serviceActions.map((action) => (
                  <Pressable
                    key={action.key}
                    accessibilityLabel={`${action.label} eintragen`}
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => onSelectAction(action, date)}
                    style={({ pressed }) => ({
                      height: 50,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      borderBottomWidth: 1,
                      borderBottomColor: palette.separator,
                      backgroundColor: pressed ? palette.surfaceMuted : "transparent",
                      opacity: busy ? 0.38 : 1,
                      paddingHorizontal: 14,
                    })}
                  >
                    <View style={{ width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: action.color }}>
                      <Text numberOfLines={1} style={{ maxWidth: 24, color: "#FFFFFF", fontSize: 10, fontWeight: "900" }}>
                        {action.symbol}
                      </Text>
                    </View>
                    <View style={{ minWidth: 0, flex: 1, gap: 1 }}>
                      <Text numberOfLines={1} style={{ color: palette.text, fontSize: 13, fontWeight: "900" }}>
                        {action.label}
                      </Text>
                      <Text numberOfLines={1} style={{ color: palette.textMuted, fontSize: 10 }}>
                        {action.kind === "TEMPLATE"
                          ? `${action.template.startTime}–${action.template.endTime} · ${action.template.breakMinutes} Min. Pause`
                          : "Ganztägig · fest vorgegeben"}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
              {customShiftAction ? (
                <Pressable
                  accessibilityLabel="Eigenen Dienst hinzufügen"
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => onSelectAction(customShiftAction, date)}
                  style={({ pressed }) => ({
                    height: 50,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 7,
                    backgroundColor: pressed ? palette.surfaceMuted : "transparent",
                    opacity: busy ? 0.38 : 1,
                  })}
                >
                  <Ionicons color={palette.primary} name="add" size={19} />
                  <Text style={{ color: palette.primary, fontSize: 12, fontWeight: "900" }}>
                    Eigener Dienst
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : visibleEntries.map((entry) => (
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
                  backgroundColor: entry.color,
                }}
              >
                {entry.kind === "SHIFT" ? (
                  <Text numberOfLines={1} style={{ maxWidth: 24, color: "#FFFFFF", fontSize: 10, fontWeight: "900" }}>
                    {entry.symbol}
                  </Text>
                ) : (
                  <Ionicons color="#FFFFFF" name="calendar-outline" size={15} />
                )}
              </View>
              <View style={{ minWidth: 0, flex: 1, gap: 1 }}>
                <Text numberOfLines={1} style={{ color: palette.text, fontSize: 13, fontWeight: "900" }}>
                  {entry.title}
                </Text>
                <Text numberOfLines={1} style={{ color: palette.textMuted, fontSize: 11 }}>
                  {entrySubtitle(entry)}
                </Text>
              </View>
              <Ionicons color={palette.textMuted} name="chevron-forward" size={16} />
            </Pressable>
          ))}

          {!servicePickerOpen && overflowCount > 0 ? (
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
              <Text style={{ color: palette.textMuted, fontSize: 11, fontWeight: "800" }}>
                +{overflowCount} weitere
              </Text>
            </Pressable>
          ) : null}

          {!servicePickerOpen ? (
          <View style={{ height: ACTION_ROW_HEIGHT, flexDirection: "row", alignItems: "center", padding: 6 }}>
            {editorActions.map((action, index) => {
              const appointment = action.kind === "APPOINTMENT";
              return (
                <Pressable
                  key={action.key}
                  accessibilityLabel={`${action.label} hinzufügen`}
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => {
                    if (action.kind === "CUSTOM_SHIFT") {
                      setServicePickerOpen(true);
                      return;
                    }
                    onSelectAction(action, date);
                  }}
                  style={({ pressed }) => ({
                    minWidth: 0,
                    height: 46,
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 7,
                    borderLeftWidth: index > 0 ? 1 : 0,
                    borderLeftColor: palette.separator,
                    borderRadius: 14,
                    borderCurve: "continuous",
                    backgroundColor: pressed ? palette.surfaceMuted : "transparent",
                    opacity: busy ? 0.38 : 1,
                    paddingHorizontal: 8,
                  })}
                >
                  <Ionicons
                    color={appointment ? "#2F80ED" : palette.primary}
                    name={appointment ? "calendar-outline" : "add"}
                    size={19}
                  />
                  <Text numberOfLines={1} style={{ color: palette.text, fontSize: 13, fontWeight: "800" }}>
                    {action.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
});
