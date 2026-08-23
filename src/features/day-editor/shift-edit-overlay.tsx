/* eslint-disable react-hooks/immutability -- Reanimated SharedValue.value is intentionally mutable on the UI thread. */
import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Animated, {
  Extrapolation,
  FadeIn,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

import { SHIFT_TYPE_LABELS, type EntryNotification, type ShiftType } from "@/domain/types";
import { EntryEditOverlayFrame } from "@/features/day-editor/entry-edit-overlay-frame";
import { shouldDismissEntryEditOverlay } from "@/features/day-editor/entry-edit-overlay-pattern";
import { notificationLabel } from "@/features/day-editor/entry-options";
import { DAY_EDITOR_SHIFT_TYPES } from "@/features/day-editor/day-editor-layout";
import { ShiftNotificationOverlay } from "@/features/day-editor/shift-notification-overlay";
import { accessibleChipBackgroundColor, chipTextColor } from "@/theme/color-contrast";
import { MOTION } from "@/theme/motion";
import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE } from "@/theme/typography";
import { TimePickerField } from "@/ui/form-controls";
import { ShiftSymbol } from "@/ui/shift-symbol";

type Popup = "PAUSE" | "TYPE" | null;

const PAUSE_OPTIONS = [0, 15, 30, 45, 60] as const;
const PAUSE_WHEEL_ITEM_HEIGHT = 44;
const PAUSE_WHEEL_PADDING = PAUSE_WHEEL_ITEM_HEIGHT * 2;

function pauseIndexForOffset(offsetY: number): number {
  return Math.max(
    0,
    Math.min(PAUSE_OPTIONS.length - 1, Math.round(offsetY / PAUSE_WHEEL_ITEM_HEIGHT)),
  );
}

function pauseIndexForMinutes(minutes: number): number {
  const exactIndex = PAUSE_OPTIONS.findIndex((option) => option === minutes);
  if (exactIndex >= 0) return exactIndex;
  return PAUSE_OPTIONS.reduce<number>(
    (closestIndex, option, index) =>
      Math.abs(option - minutes) < Math.abs((PAUSE_OPTIONS[closestIndex] ?? 0) - minutes)
        ? index
        : closestIndex,
    0,
  );
}

export function shouldDismissShiftEditOverlay(translationY: number, velocityY: number): boolean {
  "worklet";
  return shouldDismissEntryEditOverlay(translationY, velocityY);
}

function ValueRow({
  label,
  onPress,
  value,
}: {
  readonly label: string;
  readonly onPress?: () => void;
  readonly value: string;
}) {
  const palette = usePalette();
  const content = (
    <>
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        style={[styles.rowLabel, { color: palette.text }]}
      >
        {label}
      </Text>
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        style={[styles.rowValue, { color: palette.text }]}
      >
        {value}
      </Text>
    </>
  );

  if (!onPress) {
    return (
      <View style={[styles.valueRow, { borderBottomColor: palette.separator }]}>{content}</View>
    );
  }
  return (
    <Pressable
      accessibilityLabel={`${label}: ${value}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.valueRow,
        {
          borderBottomColor: palette.separator,
          backgroundColor: pressed ? palette.surfaceMuted : "transparent",
        },
      ]}
    >
      {content}
    </Pressable>
  );
}

function TimeRow({
  label,
  onChange,
  value,
}: {
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly value: string;
}) {
  const palette = usePalette();
  return (
    <View style={[styles.timeRow, { borderBottomColor: palette.separator }]}>
      <TimePickerField label={label} onChange={onChange} value={value} />
    </View>
  );
}

function PauseRow({ onPress, value }: { readonly onPress: () => void; readonly value: string }) {
  const palette = usePalette();
  const minutes = Number(value) || 0;
  return (
    <Pressable
      accessibilityLabel={`Pause: ${minutes} Minuten`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.valueRow,
        {
          borderBottomColor: palette.separator,
          backgroundColor: pressed ? palette.surfaceMuted : "transparent",
        },
      ]}
    >
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        style={[styles.rowLabel, { color: palette.text }]}
      >
        Pause
      </Text>
      <View style={[styles.pauseValue, { backgroundColor: palette.surfaceMuted }]}>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={[styles.pauseValueText, { color: palette.text }]}
        >
          {minutes} Min.
        </Text>
      </View>
    </Pressable>
  );
}

function PauseWheelOption({
  index,
  minutes,
  onPress,
  scrollOffset,
  selected,
}: {
  readonly index: number;
  readonly minutes: number;
  readonly onPress: () => void;
  readonly scrollOffset: SharedValue<number>;
  readonly selected: boolean;
}) {
  const palette = usePalette();
  const motionStyle = useAnimatedStyle(() => {
    const distance = Math.abs(scrollOffset.value - index * PAUSE_WHEEL_ITEM_HEIGHT);
    return {
      opacity: interpolate(
        distance,
        [0, PAUSE_WHEEL_ITEM_HEIGHT, PAUSE_WHEEL_ITEM_HEIGHT * 2],
        [1, 0.56, 0.26],
        Extrapolation.CLAMP,
      ),
      transform: [
        {
          scale: interpolate(
            distance,
            [0, PAUSE_WHEEL_ITEM_HEIGHT, PAUSE_WHEEL_ITEM_HEIGHT * 2],
            [1, 0.96, 0.92],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  }, [index]);

  return (
    <Pressable
      accessibilityLabel={`${minutes} Minuten`}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={styles.pauseWheelItem}
    >
      <Animated.Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        style={[
          styles.pauseWheelText,
          { color: palette.text, fontWeight: selected ? "600" : "400" },
          motionStyle,
        ]}
      >
        {minutes} Min.
      </Animated.Text>
    </Pressable>
  );
}

export function ShiftEditOverlay({
  alarmEnabled,
  breakMinutes,
  busy,
  date,
  durationMinutes,
  error,
  locationName,
  note,
  notification,
  onAlarmPress,
  onBreakMinutesChange,
  onBreakPress,
  onDelete,
  onDismiss,
  onEndTimeChange,
  onLocationPress,
  onNoteChange,
  onNotificationChange,
  onNotificationPress,
  onRequestClose,
  onShiftTypeChange,
  onStartTimeChange,
  shiftColor,
  shiftIsTimed,
  shiftSymbol,
  shiftTitle,
  shiftType,
  startTime,
  endTime,
}: {
  readonly alarmEnabled: boolean;
  readonly breakMinutes: string;
  readonly busy: boolean;
  readonly date: string;
  readonly durationMinutes: number | null;
  readonly error: string | null;
  readonly locationName: string | null;
  readonly note: string;
  readonly notification: EntryNotification | null;
  readonly onAlarmPress: () => void;
  readonly onBreakMinutesChange: (value: number) => void;
  readonly onBreakPress: () => void;
  readonly onDelete?: (() => void) | undefined;
  readonly onDismiss: () => void;
  readonly onEndTimeChange: (value: string) => void;
  readonly onLocationPress: () => void;
  readonly onNoteChange: (value: string) => void;
  readonly onNotificationChange: (value: EntryNotification | null) => void;
  readonly onNotificationPress: () => void;
  readonly onRequestClose: () => Promise<boolean>;
  readonly onShiftTypeChange: (value: ShiftType) => void;
  readonly onStartTimeChange: (value: string) => void;
  readonly shiftColor: string;
  readonly shiftIsTimed: boolean;
  readonly shiftSymbol: string;
  readonly shiftTitle: string;
  readonly shiftType: ShiftType;
  readonly startTime: string;
  readonly endTime: string;
}) {
  const palette = usePalette();
  const [popup, setPopup] = useState<Popup>(null);
  const [notificationVisible, setNotificationVisible] = useState(false);
  const pauseMinutes = Number(breakMinutes) || 0;
  const initialPauseIndex = pauseIndexForMinutes(pauseMinutes);
  const [pausePreviewMinutes, setPausePreviewMinutes] = useState<number>(
    PAUSE_OPTIONS[initialPauseIndex],
  );
  const [pauseInitialOffset, setPauseInitialOffset] = useState(
    initialPauseIndex * PAUSE_WHEEL_ITEM_HEIGHT,
  );
  const headerColor = accessibleChipBackgroundColor(shiftColor);
  const serviceLabel = shiftType === "CUSTOM" ? shiftTitle : SHIFT_TYPE_LABELS[shiftType];
  const pauseScrollRef = useRef<ScrollView>(null);
  const pausePreviewIndexRef = useRef(initialPauseIndex);
  const pauseScrollOffset = useSharedValue(initialPauseIndex * PAUSE_WHEEL_ITEM_HEIGHT);

  const commitPauseAtOffset = useCallback(
    (offsetY: number, notifyUnchanged = true) => {
      const index = pauseIndexForOffset(offsetY);
      const changed = pausePreviewIndexRef.current !== index;
      if (changed) {
        pausePreviewIndexRef.current = index;
        setPausePreviewMinutes(PAUSE_OPTIONS[index]);
      }
      if (changed || notifyUnchanged) onBreakMinutesChange(PAUSE_OPTIONS[index]);
    },
    [onBreakMinutesChange],
  );

  const handlePauseScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      pauseScrollOffset.value = event.contentOffset.y;
    },
  });

  const handlePauseScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      commitPauseAtOffset(
        event.nativeEvent.targetContentOffset?.y ?? event.nativeEvent.contentOffset.y,
      );
    },
    [commitPauseAtOffset],
  );

  const handlePauseMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      commitPauseAtOffset(event.nativeEvent.contentOffset.y, false);
    },
    [commitPauseAtOffset],
  );

  const openPausePicker = useCallback(() => {
    if (Platform.OS !== "ios") {
      onBreakPress();
      return;
    }
    if (popup === "PAUSE") {
      setPopup(null);
      return;
    }
    const index = pauseIndexForMinutes(Number(breakMinutes) || 0);
    const offset = index * PAUSE_WHEEL_ITEM_HEIGHT;
    pausePreviewIndexRef.current = index;
    pauseScrollOffset.value = offset;
    setPausePreviewMinutes(PAUSE_OPTIONS[index]);
    setPauseInitialOffset(offset);
    setPopup("PAUSE");
  }, [breakMinutes, onBreakPress, pauseScrollOffset, popup]);

  const openNotificationPicker = useCallback(() => {
    if (Platform.OS !== "ios") {
      onNotificationPress();
      return;
    }
    setPopup(null);
    setNotificationVisible(true);
  }, [onNotificationPress]);

  return (
    <EntryEditOverlayFrame
      busy={busy}
      cardContent={
        <>
          <View style={styles.body}>
            <ValueRow label="Dienst" onPress={() => setPopup("TYPE")} value={serviceLabel} />
            {shiftIsTimed ? (
              <>
                <TimeRow label="Beginn" onChange={onStartTimeChange} value={startTime} />
                <TimeRow label="Ende" onChange={onEndTimeChange} value={endTime} />
                <PauseRow onPress={openPausePicker} value={breakMinutes} />
              </>
            ) : (
              <ValueRow label="Dauer" value="Ganztägig" />
            )}
            <ValueRow
              label="Benachrichtigung"
              onPress={openNotificationPicker}
              value={notificationLabel(notification)}
            />
            {shiftIsTimed ? (
              <ValueRow
                label="Wecker"
                onPress={() => {
                  setPopup(null);
                  onAlarmPress();
                }}
                value={alarmEnabled ? "Zum Beginn" : "Aus"}
              />
            ) : null}

            <View
              style={[
                styles.noteLocationGroup,
                { borderColor: palette.border, backgroundColor: palette.surfaceRaised },
              ]}
            >
              <TextInput
                accessibilityLabel="Notizen"
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                multiline
                onChangeText={onNoteChange}
                placeholder="Notizen"
                placeholderTextColor={palette.textMuted}
                style={[
                  styles.noteInput,
                  { color: palette.text, borderBottomColor: palette.separator },
                ]}
                value={note}
              />
              <View style={styles.locationActionsRow}>
                <Pressable
                  accessibilityLabel={`Ort: ${locationName ?? "Kein Ort"}`}
                  accessibilityRole="button"
                  onPress={onLocationPress}
                  style={({ pressed }) => [
                    styles.locationRow,
                    { backgroundColor: pressed ? palette.surfaceMuted : "transparent" },
                  ]}
                >
                  <Text
                    maxFontSizeMultiplier={TEXT_MAX_SCALE}
                    style={{
                      color: locationName ? palette.text : palette.textMuted,
                      fontSize: 16,
                    }}
                  >
                    {locationName ?? "Ort"}
                  </Text>
                </Pressable>
                {onDelete ? (
                  <>
                    <View
                      style={[styles.locationDivider, { backgroundColor: palette.separator }]}
                    />
                    <Pressable
                      accessibilityLabel="Dienst löschen"
                      accessibilityRole="button"
                      disabled={busy}
                      onPress={onDelete}
                      style={({ pressed }) => [
                        styles.deleteButton,
                        {
                          backgroundColor: pressed ? `${palette.danger}18` : "transparent",
                        },
                      ]}
                    >
                      <Ionicons color={palette.text} name="trash-outline" size={23} />
                    </Pressable>
                  </>
                ) : null}
              </View>
            </View>
          </View>

          {popup === "PAUSE" ? (
            <Pressable
              accessibilityLabel="Auswahl schließen"
              onPress={() => setPopup(null)}
              style={styles.popupDismissLayer}
              testID="shift-edit-popup-dismiss-layer"
            />
          ) : null}

          {popup === "PAUSE" ? (
            <Animated.View
              accessibilityLabel="Pausendauer auswählen"
              entering={FadeIn.duration(MOTION.duration.fast).reduceMotion(MOTION.reduceMotion)}
              style={[
                styles.pausePopup,
                {
                  backgroundColor: palette.surfaceRaised,
                  borderColor: palette.border,
                  shadowColor: palette.shadow,
                },
              ]}
              testID="shift-edit-pause-popover"
            >
              <View
                pointerEvents="none"
                style={[styles.pauseWheelSelection, { backgroundColor: palette.surfaceMuted }]}
                testID="shift-edit-pause-selection"
              />
              <Animated.ScrollView
                accessibilityLabel="Pausendauer in 15-Minuten-Schritten"
                accessibilityRole="radiogroup"
                contentContainerStyle={styles.pauseWheelContent}
                contentOffset={{
                  x: 0,
                  y: pauseInitialOffset,
                }}
                decelerationRate={0.97}
                onMomentumScrollEnd={handlePauseMomentumEnd}
                onScroll={handlePauseScroll}
                onScrollEndDrag={handlePauseScrollEndDrag}
                ref={pauseScrollRef}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={false}
                snapToAlignment="start"
                snapToInterval={PAUSE_WHEEL_ITEM_HEIGHT}
                style={styles.pauseWheel}
                testID="shift-edit-pause-wheel"
              >
                {PAUSE_OPTIONS.map((minutes, index) => (
                  <PauseWheelOption
                    key={minutes}
                    index={index}
                    minutes={minutes}
                    onPress={() => {
                      pausePreviewIndexRef.current = index;
                      setPausePreviewMinutes(minutes);
                      onBreakMinutesChange(minutes);
                      pauseScrollRef.current?.scrollTo?.({
                        animated: true,
                        y: index * PAUSE_WHEEL_ITEM_HEIGHT,
                      });
                    }}
                    scrollOffset={pauseScrollOffset}
                    selected={pausePreviewMinutes === minutes}
                  />
                ))}
              </Animated.ScrollView>
            </Animated.View>
          ) : null}

          {popup === "TYPE" ? (
            <View
              style={[
                styles.typePopup,
                {
                  backgroundColor: palette.surfaceRaised,
                  borderColor: palette.border,
                  shadowColor: palette.shadow,
                },
              ]}
            >
              <ScrollView style={styles.typeScroll}>
                {DAY_EDITOR_SHIFT_TYPES.map((type) => {
                  const selected = type === shiftType;
                  return (
                    <Pressable
                      key={type}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => {
                        onShiftTypeChange(type);
                        setPopup(null);
                      }}
                      style={({ pressed }) => [
                        styles.typeItem,
                        {
                          borderBottomColor: palette.separator,
                          backgroundColor: pressed ? palette.surfaceMuted : "transparent",
                        },
                      ]}
                    >
                      <Text style={[styles.typeLabel, { color: palette.text }]}>
                        {SHIFT_TYPE_LABELS[type]}
                      </Text>
                      {selected ? (
                        <Ionicons color={palette.primary} name="checkmark" size={21} />
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
        </>
      }
      date={date}
      durationMinutes={durationMinutes}
      error={error}
      headerColor={headerColor}
      headerForeground={chipTextColor}
      headerLeading={<ShiftSymbol color={chipTextColor} size={23} value={shiftSymbol} />}
      onBackdropPress={() => setPopup(null)}
      onClosingStart={() => {
        setPopup(null);
        setNotificationVisible(false);
      }}
      onDismiss={onDismiss}
      onRequestClose={onRequestClose}
      overlay={
        notificationVisible ? (
          <ShiftNotificationOverlay
            onChange={onNotificationChange}
            onClose={() => setNotificationVisible(false)}
            value={notification}
          />
        ) : null
      }
      testIDPrefix="shift-edit"
    />
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16 },
  valueRow: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { flexShrink: 0, fontSize: 16, lineHeight: 21, fontWeight: "500" },
  rowValue: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "500",
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  timeRow: {
    minHeight: 46,
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pauseValue: {
    minHeight: 36,
    minWidth: 92,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  pauseValueText: { fontSize: 16, fontWeight: "500", fontVariant: ["tabular-nums"] },
  noteLocationGroup: {
    overflow: "hidden",
    minHeight: 94,
    marginVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 13,
    borderCurve: "continuous",
  },
  noteInput: {
    minHeight: 50,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    textAlignVertical: "top",
  },
  locationActionsRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  locationRow: { minHeight: 44, flex: 1, justifyContent: "center", paddingHorizontal: 12 },
  locationDivider: { width: StyleSheet.hairlineWidth, marginVertical: 7 },
  deleteButton: { width: 48, alignItems: "center", justifyContent: "center" },
  popupDismissLayer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1,
  },
  pausePopup: {
    position: "absolute",
    top: 194,
    right: 16,
    zIndex: 2,
    width: 210,
    height: 220,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    borderCurve: "continuous",
    paddingHorizontal: 12,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 18,
  },
  pauseWheelSelection: {
    position: "absolute",
    top: PAUSE_WHEEL_PADDING,
    right: 12,
    left: 12,
    height: PAUSE_WHEEL_ITEM_HEIGHT,
    borderRadius: 13,
    borderCurve: "continuous",
  },
  pauseWheel: { flex: 1 },
  pauseWheelContent: { paddingVertical: PAUSE_WHEEL_PADDING },
  pauseWheelItem: {
    height: PAUSE_WHEEL_ITEM_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  pauseWheelText: { fontSize: 19, fontVariant: ["tabular-nums"] },
  typePopup: {
    position: "absolute",
    top: 60,
    left: 16,
    right: 16,
    maxHeight: 330,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    borderCurve: "continuous",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 18,
  },
  typeScroll: { maxHeight: 330 },
  typeItem: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 15,
  },
  typeLabel: { fontSize: 15, fontWeight: "500" },
});
