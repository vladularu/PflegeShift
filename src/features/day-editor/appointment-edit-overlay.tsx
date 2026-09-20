import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import type { EntryLocation, EntryNotification, RecurrenceRule } from "@/domain/types";
import { LocationPreview } from "@/features/location/location-preview";
import { AppointmentRecurrenceOverlay } from "@/features/day-editor/appointment-recurrence-overlay";
import { EntryEditOverlayFrame } from "@/features/day-editor/entry-edit-overlay-frame";
import { notificationLabel, recurrenceLabel } from "@/features/day-editor/entry-options";
import { ShiftNotificationOverlay } from "@/features/day-editor/shift-notification-overlay";
import { accessibleChipBackgroundColor, chipTextColor } from "@/theme/color-contrast";
import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE } from "@/theme/typography";
import { TimePickerField } from "@/ui/form-controls";

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

export function AppointmentEditOverlay({
  allDay,
  appointmentColor,
  busy,
  date,
  durationMinutes,
  endTime,
  error,
  location,
  note,
  notification,
  onAllDayChange,
  onDelete,
  onDismiss,
  onEndTimeChange,
  onLocationPress,
  onNoteChange,
  onNotificationChange,
  onNotificationPress,
  onRecurrenceChange,
  onRequestClose,
  onStartTimeChange,
  onTitleChange,
  recurrence,
  startTime,
  title,
}: {
  readonly allDay: boolean;
  readonly appointmentColor: string;
  readonly busy: boolean;
  readonly date: string;
  readonly durationMinutes: number | null;
  readonly endTime: string;
  readonly error: string | null;
  readonly location: EntryLocation | null;
  readonly note: string;
  readonly notification: EntryNotification | null;
  readonly onAllDayChange: (value: boolean) => void;
  readonly onDelete?: (() => void) | undefined;
  readonly onDismiss: () => void;
  readonly onEndTimeChange: (value: string) => void;
  readonly onLocationPress: () => void;
  readonly onNoteChange: (value: string) => void;
  readonly onNotificationChange: (value: EntryNotification | null) => void;
  readonly onNotificationPress: () => void;
  readonly onRecurrenceChange: (value: RecurrenceRule | null) => void;
  readonly onRequestClose: () => Promise<boolean>;
  readonly onStartTimeChange: (value: string) => void;
  readonly onTitleChange: (value: string) => void;
  readonly recurrence: RecurrenceRule | null;
  readonly startTime: string;
  readonly title: string;
}) {
  const palette = usePalette();
  const [notificationVisible, setNotificationVisible] = useState(false);
  const locationName = location?.name ?? null;
  const [recurrenceVisible, setRecurrenceVisible] = useState(false);
  const openNotificationPicker = () => {
    if (Platform.OS !== "ios") {
      onNotificationPress();
      return;
    }
    setNotificationVisible(true);
  };

  return (
    <EntryEditOverlayFrame
      busy={busy}
      cardContent={
        <View style={styles.body}>
          <View style={[styles.valueRow, { borderBottomColor: palette.separator }]}>
            <Text
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
              style={[styles.rowLabel, { color: palette.text }]}
            >
              Titel
            </Text>
            <TextInput
              accessibilityLabel="Titel"
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
              maxLength={60}
              onChangeText={onTitleChange}
              selectTextOnFocus={title === "Ohne Titel"}
              style={[styles.titleInput, { color: palette.text }]}
              value={title}
            />
          </View>

          <View style={[styles.valueRow, { borderBottomColor: palette.separator }]}>
            <Text
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
              style={[styles.rowLabel, { color: palette.text }]}
            >
              Ganztägig
            </Text>
            <Switch
              accessibilityLabel="Termin ganztägig"
              onValueChange={onAllDayChange}
              thumbColor={chipTextColor}
              trackColor={{ false: palette.surfaceMuted, true: palette.primary }}
              value={allDay}
            />
          </View>

          {!allDay ? (
            <>
              <TimeRow label="Start" onChange={onStartTimeChange} value={startTime} />
              <TimeRow label="Ende" onChange={onEndTimeChange} value={endTime} />
            </>
          ) : null}

          <ValueRow
            label="Wiederholen"
            onPress={() => setRecurrenceVisible(true)}
            value={recurrence ? recurrenceLabel(recurrence) : "Niemals"}
          />

          <View style={[styles.valueRow, { borderBottomColor: palette.separator }]}>
            <Text
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
              style={[styles.rowLabel, { color: palette.text }]}
            >
              Kalender
            </Text>
            <View style={styles.calendarValue}>
              <View style={[styles.calendarDot, { backgroundColor: appointmentColor }]} />
              <Text
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                style={[styles.rowValue, styles.calendarLabel, { color: palette.text }]}
              >
                Termine
              </Text>
            </View>
          </View>

          <ValueRow
            label="Benachrichtigung"
            onPress={openNotificationPicker}
            value={notificationLabel(notification)}
          />

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
                { borderBottomColor: palette.separator, color: palette.text },
              ]}
              value={note}
            />
            <View style={styles.locationActionsRow}>
              <Pressable
                accessibilityLabel={`Ort: ${locationName ?? "Nicht festgelegt"}`}
                accessibilityRole="button"
                onPress={onLocationPress}
                style={({ pressed }) => [
                  styles.locationRow,
                  { backgroundColor: pressed ? palette.surfaceMuted : "transparent" },
                ]}
              >
                <Text
                  maxFontSizeMultiplier={TEXT_MAX_SCALE}
                  style={[styles.locationText, { color: palette.textMuted }]}
                >
                  {locationName ?? "Ort"}
                </Text>
              </Pressable>
            </View>
          </View>
          {location ? <LocationPreview location={location} /> : null}
          {onDelete ? (
            <Pressable
              accessibilityLabel="Termin löschen"
              accessibilityRole="button"
              disabled={busy}
              onPress={onDelete}
              style={({ pressed }) => [
                styles.deleteButton,
                { backgroundColor: pressed ? `${palette.danger}18` : "transparent" },
              ]}
            >
              <Ionicons color={palette.danger} name="trash-outline" size={20} />
              <Text
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                style={[styles.deleteLabel, { color: palette.danger }]}
              >
                Termin löschen
              </Text>
            </Pressable>
          ) : null}
        </View>
      }
      date={date}
      durationMinutes={durationMinutes}
      error={error}
      headerColor={accessibleChipBackgroundColor(appointmentColor)}
      headerForeground={chipTextColor}
      onClosingStart={() => {
        setNotificationVisible(false);
        setRecurrenceVisible(false);
      }}
      onDismiss={onDismiss}
      onRequestClose={onRequestClose}
      overlay={
        recurrenceVisible ? (
          <AppointmentRecurrenceOverlay
            onChange={onRecurrenceChange}
            onClose={() => setRecurrenceVisible(false)}
            value={recurrence}
          />
        ) : notificationVisible ? (
          <ShiftNotificationOverlay
            onChange={onNotificationChange}
            onClose={() => setNotificationVisible(false)}
            value={notification}
          />
        ) : null
      }
      testIDPrefix="appointment-edit"
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
  titleInput: {
    minWidth: 0,
    flex: 1,
    paddingVertical: 8,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "500",
    textAlign: "right",
  },
  timeRow: { minHeight: 46, justifyContent: "center", borderBottomWidth: StyleSheet.hairlineWidth },
  calendarValue: { minWidth: 0, flex: 1, flexDirection: "row", alignItems: "center", gap: 9 },
  calendarDot: { width: 9, height: 9, marginLeft: "auto", borderRadius: 5 },
  calendarLabel: { flex: 0 },
  noteLocationGroup: {
    overflow: "hidden",
    minHeight: 94,
    marginVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 13,
    borderCurve: "continuous",
  },
  noteInput: {
    minHeight: 88,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    textAlignVertical: "top",
  },
  locationActionsRow: { flexDirection: "row", alignItems: "stretch" },
  locationRow: { minHeight: 44, flex: 1, justifyContent: "center", paddingHorizontal: 12 },
  locationText: { fontSize: 15 },
  deleteButton: {
    minHeight: 44,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    padding: 10,
    borderRadius: 12,
  },
  deleteLabel: { fontSize: 15, fontWeight: "500" },
});
