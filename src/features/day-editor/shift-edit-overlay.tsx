import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { SHIFT_TYPE_LABELS } from "@/domain/types";
import { EntryEditOverlayFrame } from "@/features/day-editor/entry-edit-overlay-frame";
import { shouldDismissEntryEditOverlay } from "@/features/day-editor/entry-edit-overlay-pattern";
import { notificationLabel } from "@/features/day-editor/entry-options";
import { DAY_EDITOR_SHIFT_TYPES } from "@/features/day-editor/day-editor-layout";
import { ShiftNotificationOverlay } from "@/features/day-editor/shift-notification-overlay";
import type { ShiftEditOverlayProps } from "@/features/day-editor/shift-edit-overlay.types";
import { ShiftOvertimeFields } from "@/features/day-editor/shift-overtime-fields";
import { accessibleChipBackgroundColor, chipTextColor } from "@/theme/color-contrast";
import { MOTION } from "@/theme/motion";
import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE } from "@/theme/typography";
import { TimePickerField } from "@/ui/form-controls";
import { PauseWheel } from "@/ui/pause-wheel";
import { ShiftSymbol } from "@/ui/shift-symbol";

type Popup = "PAUSE" | "TYPE" | null;

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
  onOvertimeMinutesChange,
  onRequestClose,
  onShiftTypeChange,
  onStartTimeChange,
  onTariffOvertimeConfirmedChange,
  overtimeInputRef,
  overtimeMinutes,
  shiftColor,
  shiftIsTimed,
  shiftSymbol,
  shiftTitle,
  shiftType,
  startTime,
  tariffOvertimeConfirmed,
  endTime,
}: ShiftEditOverlayProps) {
  const palette = usePalette();
  const [popup, setPopup] = useState<Popup>(null);
  const [notificationVisible, setNotificationVisible] = useState(false);
  const headerColor = accessibleChipBackgroundColor(shiftColor);
  const serviceLabel = shiftType === "CUSTOM" ? shiftTitle : SHIFT_TYPE_LABELS[shiftType];

  const openPausePicker = useCallback(() => {
    if (Platform.OS !== "ios") {
      onBreakPress();
      return;
    }
    if (popup === "PAUSE") {
      setPopup(null);
      return;
    }
    setPopup("PAUSE");
  }, [onBreakPress, popup]);

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
                <ShiftOvertimeFields
                  confirmed={tariffOvertimeConfirmed}
                  inputRef={overtimeInputRef}
                  onConfirmedChange={onTariffOvertimeConfirmedChange}
                  onMinutesChange={onOvertimeMinutesChange}
                  overtimeMinutes={overtimeMinutes}
                />
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
              <PauseWheel
                animatedOptions
                onChange={onBreakMinutesChange}
                selectionStyle={styles.pauseWheelSelection}
                selectionTestID="shift-edit-pause-selection"
                testID="shift-edit-pause-wheel"
                value={Number(breakMinutes) || 0}
              />
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
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 18,
  },
  pauseWheelSelection: {
    borderRadius: 13,
    borderCurve: "continuous",
  },
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
