import { router, Stack, useFocusEffect, useNavigation } from "expo-router";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import Animated, { FadeInDown, FadeOut } from "react-native-reanimated";

import {
  usePflegeShiftEntries,
  usePflegeShiftProfile,
  usePflegeShiftTemplates,
} from "@/application/pflegeshift-provider";
import {
  SHIFT_TYPE_LABELS,
  type CalendarEntry,
  type EntryLocation,
  type EntryNotification,
  type RecurrenceRule,
  type ShiftType,
} from "@/domain/types";
import { userFacingErrorMessage } from "@/domain/errors";
import { ValidationError } from "@/domain/validation";
import { calculateMonthlyCompliance } from "@/engine/compliance";
import { calculateTimedShiftMinutes } from "@/engine/working-time";
import { AppointmentEditOverlay } from "@/features/day-editor/appointment-edit-overlay";
import { shiftOverlapsHoliday } from "@/features/day-editor/holiday-premium";
import {
  DAY_EDITOR_SHIFT_TYPES,
  SHIFT_TYPE_GRID_STYLE,
} from "@/features/day-editor/day-editor-layout";
import { resolveShiftTypePreset } from "@/features/day-editor/shift-type-preset";
import { ShiftEditOverlay } from "@/features/day-editor/shift-edit-overlay";
import {
  AlarmSheet,
  NotificationSheet,
  PauseSheet,
  notificationLabel,
  OptionRow,
  RecurrenceSheet,
  recurrenceLabel,
} from "@/features/day-editor/entry-options";
import {
  AdvancedDisclosure,
  EditorCloseButton,
  EditorDateHeader,
  InlineDeleteConfirmation,
} from "@/features/day-editor/day-editor-components";
import { consumeLocationSelection } from "@/features/location/location-selection";
import { LocationPreview } from "@/features/location/location-preview";
import { useStableEditorSession } from "@/features/editor-session";
import { APPOINTMENT_COLOR, SHIFT_TYPE_COLORS, usePalette } from "@/theme/palette";
import { MOTION } from "@/theme/motion";
import { SegmentedControl, SectionHeader, SurfaceCard } from "@/ui/design-system";
import { ColorPicker, Field, ResponsiveFieldRow, TimePickerField } from "@/ui/form-controls";
import { DestructiveFormAction, FormScreen, FormStatus } from "@/ui/form-layout";
import { LabeledSwitch } from "@/ui/labeled-switch";
import { selectionFeedback, successFeedback, warningFeedback } from "@/ui/haptics";
import {
  focusInvalidField,
  integerRangeFieldError,
  requiredFieldError,
} from "@/ui/form-validation";
import { locationPickerRoute } from "@/navigation/routes";

type EditorMode = "SHIFT" | "APPOINTMENT";

export function DayEditorForm({
  date,
  existing: loadedExisting,
  requestedMode,
  sessionKey,
}: {
  readonly date: string;
  readonly existing: CalendarEntry | null;
  readonly requestedMode: EditorMode;
  readonly sessionKey: string;
}) {
  const palette = usePalette();
  const navigation = useNavigation();
  const { profile } = usePflegeShiftProfile();
  const { templates } = usePflegeShiftTemplates();
  const { entries, removeEntry, upsertShift, upsertAppointment } = usePflegeShiftEntries();
  const { initialValue: existing } = useStableEditorSession(sessionKey, () => loadedExisting);
  const initialMode: EditorMode = existing?.kind ?? requestedMode;
  const [mode, setMode] = useState<EditorMode>(initialMode);
  const initialShift = existing?.kind === "SHIFT" ? existing : null;
  const initialAppointment = existing?.kind === "APPOINTMENT" ? existing : null;
  const [shiftType, setShiftType] = useState<ShiftType>(initialShift?.type ?? "CUSTOM");
  const [shiftAllDay, setShiftAllDay] = useState(initialShift?.allDay ?? false);
  const [selectedTemplateId, setSelectedTemplateId] = useState(initialShift?.templateId ?? null);
  const [shiftTitle, setShiftTitle] = useState(initialShift?.title ?? "Dienst");
  const [startTime, setStartTime] = useState(initialShift?.startTime ?? "08:00");
  const [endTime, setEndTime] = useState(initialShift?.endTime ?? "16:00");
  const [breakMinutes, setBreakMinutes] = useState(String(initialShift?.breakMinutes ?? 30));
  const [shiftColor, setShiftColor] = useState(initialShift?.color ?? SHIFT_TYPE_COLORS.CUSTOM);
  const [shiftSymbol, setShiftSymbol] = useState(initialShift?.symbol ?? "D");
  const [shiftNote, setShiftNote] = useState(initialShift?.note ?? "");
  const [shiftNotification, setShiftNotification] = useState<EntryNotification | null>(
    initialShift?.notification ?? null,
  );
  const [shiftAlarmEnabled, setShiftAlarmEnabled] = useState(initialShift?.alarmEnabled ?? false);
  const [shiftLocation, setShiftLocation] = useState<EntryLocation | null>(
    initialShift?.location ?? null,
  );
  const [overtimeMinutes, setOvertimeMinutes] = useState(
    String(initialShift?.overtimeMinutes ?? 0),
  );
  const [holidayPremiumMode, setHolidayPremiumMode] = useState<
    "WITH_TIME_OFF" | "WITHOUT_TIME_OFF"
  >(initialShift?.holidayPremiumMode ?? "WITH_TIME_OFF");
  const [appointmentTitle, setAppointmentTitle] = useState(
    initialAppointment?.title ?? "Ohne Titel",
  );
  const [allDay, setAllDay] = useState(initialAppointment?.allDay ?? false);
  const [appointmentStart, setAppointmentStart] = useState(
    initialAppointment?.startTime ?? "12:00",
  );
  const [appointmentEnd, setAppointmentEnd] = useState(initialAppointment?.endTime ?? "13:00");
  const [appointmentColor, setAppointmentColor] = useState(
    initialAppointment?.color ?? APPOINTMENT_COLOR,
  );
  const [appointmentNote, setAppointmentNote] = useState(initialAppointment?.note ?? "");
  const [appointmentRecurrence, setAppointmentRecurrence] = useState<RecurrenceRule | null>(
    initialAppointment?.recurrence ?? null,
  );
  const [appointmentNotification, setAppointmentNotification] = useState<EntryNotification | null>(
    initialAppointment?.notification ?? null,
  );
  const [appointmentLocation, setAppointmentLocation] = useState<EntryLocation | null>(
    initialAppointment?.location ?? null,
  );
  const [optionSheet, setOptionSheet] = useState<
    "ALARM" | "PAUSE" | "RECURRENCE" | "NOTIFICATION" | null
  >(null);
  const [shiftTitleError, setShiftTitleError] = useState<string | null>(null);
  const [breakError, setBreakError] = useState<string | null>(null);
  const [overtimeError, setOvertimeError] = useState<string | null>(null);
  const [appointmentTitleError, setAppointmentTitleError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const shiftTitleRef = useRef<TextInput>(null);
  const breakRef = useRef<TextInput>(null);
  const overtimeRef = useRef<TextInput>(null);
  const appointmentTitleRef = useRef<TextInput>(null);
  const savingRef = useRef(false);
  const allowRemovalRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      const selected = consumeLocationSelection();
      if (selected === undefined) return;
      if (mode === "SHIFT") setShiftLocation(selected);
      else setAppointmentLocation(selected);
    }, [mode]),
  );
  const shiftIsAbsence = ["VACATION", "SICK", "FREE"].includes(shiftType);
  const shiftIsTimed = !shiftIsAbsence && !shiftAllDay;
  const compactShiftEditor = existing?.kind === "SHIFT" && mode === "SHIFT";
  const compactAppointmentEditor =
    requestedMode === "APPOINTMENT" &&
    mode === "APPOINTMENT" &&
    (existing === null || existing.kind === "APPOINTMENT");
  const compactOverlayEditor = compactShiftEditor || compactAppointmentEditor;
  const hasHolidayOverlap =
    profile && shiftIsTimed
      ? shiftOverlapsHoliday(date, startTime, endTime, profile.federalState)
      : false;
  const editorTitle = existing
    ? existing.kind === "SHIFT"
      ? "Dienst bearbeiten"
      : "Termin bearbeiten"
    : mode === "SHIFT"
      ? "Neuer Dienst"
      : "Neuer Termin";
  const detailSummary =
    mode === "SHIFT"
      ? [
          shiftNote.trim() ? "Notiz" : null,
          shiftIsTimed && Number(overtimeMinutes) > 0
            ? `${overtimeMinutes} Min. Überstunden`
            : null,
          `Kürzel ${shiftSymbol || "–"}`,
        ]
          .filter(Boolean)
          .join(" · ")
      : [appointmentNote.trim() ? "Notiz" : null, "Farbe"].filter(Boolean).join(" · ");

  function chooseType(type: ShiftType) {
    const preset = resolveShiftTypePreset(type, templates);
    setShiftType(type);
    setShiftAllDay(preset.allDay ?? ["VACATION", "SICK", "FREE"].includes(type));
    setSelectedTemplateId(preset.templateId);
    setShiftTitle(preset.title);
    setStartTime(preset.startTime ?? "08:00");
    setEndTime(preset.endTime ?? "16:00");
    setBreakMinutes(String(preset.breakMinutes));
    setShiftColor(preset.color);
    setShiftSymbol(preset.symbol);
    selectionFeedback();
  }

  async function save(closeAfterSave = true): Promise<boolean> {
    const nextShiftTitleError =
      mode === "SHIFT" ? requiredFieldError(shiftTitle, "Bezeichnung") : null;
    const nextBreakError =
      mode === "SHIFT" && shiftIsTimed
        ? integerRangeFieldError(breakMinutes, "Pause", 0, 1_440)
        : null;
    let nextOvertimeError =
      mode === "SHIFT" && shiftIsTimed
        ? integerRangeFieldError(overtimeMinutes, "Überstunden", 0, 1_440)
        : null;
    const nextAppointmentTitleError =
      mode === "APPOINTMENT" ? requiredFieldError(appointmentTitle, "Titel") : null;
    if (
      nextOvertimeError === null &&
      mode === "SHIFT" &&
      shiftIsTimed &&
      profile &&
      nextBreakError === null
    ) {
      const netMinutes = calculateTimedShiftMinutes(
        { date, startTime, endTime, breakMinutes: Number(breakMinutes) },
        profile.timeZone,
      );
      if (Number(overtimeMinutes) > netMinutes) {
        nextOvertimeError = "Überstunden dürfen die Nettoarbeitszeit nicht überschreiten.";
      }
    }
    setShiftTitleError(nextShiftTitleError);
    setBreakError(nextBreakError);
    setOvertimeError(nextOvertimeError);
    setAppointmentTitleError(nextAppointmentTitleError);
    const firstError =
      nextShiftTitleError ?? nextBreakError ?? nextOvertimeError ?? nextAppointmentTitleError;
    if (firstError) {
      setError(firstError);
      if (nextOvertimeError) setDetailsExpanded(true);
      focusInvalidField(
        nextShiftTitleError
          ? shiftTitleRef
          : nextBreakError
            ? breakRef
            : nextOvertimeError
              ? overtimeRef
              : appointmentTitleRef,
        firstError,
      );
      return false;
    }
    try {
      savingRef.current = true;
      setSaving(true);
      setError(null);
      if (mode === "SHIFT") {
        const overtime = shiftIsTimed ? Number(overtimeMinutes) : 0;
        const breakValue = shiftIsTimed ? Number(breakMinutes) : 0;
        if (profile && shiftIsTimed) {
          const netMinutes = calculateTimedShiftMinutes(
            { date, startTime, endTime, breakMinutes: breakValue },
            profile.timeZone,
          );
          if (overtime > netMinutes) {
            throw new ValidationError(
              "Überstunden dürfen die Nettoarbeitszeit nicht überschreiten.",
            );
          }
        }
        const saved = await upsertShift({
          ...(initialShift ? { id: initialShift.id, expectedRevision: initialShift.revision } : {}),
          date,
          templateId: shiftIsTimed ? selectedTemplateId : null,
          title: shiftTitle,
          type: shiftType,
          allDay: shiftIsAbsence || shiftAllDay,
          startTime: shiftIsAbsence ? null : startTime,
          endTime: shiftIsAbsence ? null : endTime,
          breakMinutes: breakValue,
          color: shiftColor,
          symbol: shiftSymbol,
          note: shiftNote,
          notification: shiftNotification,
          alarmEnabled: shiftIsTimed ? shiftAlarmEnabled : false,
          location: shiftLocation,
          overtimeMinutes: overtime,
          holidayPremiumMode,
        });
        if (profile && shiftIsTimed) {
          const shifts = entries
            .filter(
              (entry): entry is Extract<CalendarEntry, { kind: "SHIFT" }> =>
                entry.kind === "SHIFT" && entry.id !== saved.id,
            )
            .concat(saved);
          const critical = calculateMonthlyCompliance(date.slice(0, 7), shifts, profile.timeZone, {
            federalState: profile.federalState,
            weeklyMinutes: profile.weeklyMinutes,
          }).issues.find(
            (issue) => issue.severity === "critical" && issue.relatedShiftIds.includes(saved.id),
          );
          if (critical) Alert.alert("ArbZG-Hinweis", critical.title);
        }
      } else {
        await upsertAppointment({
          ...(initialAppointment
            ? { id: initialAppointment.id, expectedRevision: initialAppointment.revision }
            : {}),
          date: initialAppointment?.date ?? date,
          title: appointmentTitle,
          allDay,
          startTime: allDay ? null : appointmentStart,
          endTime: allDay ? null : appointmentEnd,
          color: appointmentColor,
          note: appointmentNote,
          recurrence: appointmentRecurrence,
          notification: appointmentNotification,
          location: appointmentLocation,
        });
      }
      if (!compactOverlayEditor) successFeedback();
      if (closeAfterSave) {
        if (compactOverlayEditor) allowRemovalRef.current = true;
        router.back();
      }
      return true;
    } catch (saveError) {
      warningFeedback();
      setError(userFacingErrorMessage(saveError, "Eintrag konnte nicht gespeichert werden."));
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function deleteEntry() {
    if (!existing) return;
    try {
      savingRef.current = true;
      setSaving(true);
      setError(null);
      await removeEntry(existing);
      successFeedback();
      allowRemovalRef.current = true;
      router.back();
    } catch (deleteError) {
      warningFeedback();
      setError(userFacingErrorMessage(deleteError, "Eintrag konnte nicht gelöscht werden."));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const saveFromDismiss = useEffectEvent(() => save(false));
  useEffect(() => {
    if (!compactOverlayEditor) return;
    return navigation.addListener("beforeRemove", (event) => {
      if (allowRemovalRef.current) {
        allowRemovalRef.current = false;
        return;
      }
      event.preventDefault();
      if (savingRef.current) return;
      void saveFromDismiss().then((saved) => {
        if (!saved) return;
        allowRemovalRef.current = true;
        navigation.dispatch(event.data.action);
      });
    });
  }, [compactOverlayEditor, navigation]);

  if (compactShiftEditor) {
    const durationMinutes = shiftIsTimed
      ? calculateTimedShiftMinutes(
          {
            date,
            startTime,
            endTime,
            breakMinutes: Number(breakMinutes) || 0,
            allDay: false,
          },
          profile?.timeZone ?? "Europe/Berlin",
        )
      : null;
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <ShiftEditOverlay
          alarmEnabled={shiftAlarmEnabled}
          breakMinutes={breakMinutes}
          busy={saving}
          date={date}
          durationMinutes={durationMinutes}
          endTime={endTime}
          error={error}
          locationName={shiftLocation?.name ?? null}
          note={shiftNote}
          notification={shiftNotification}
          onAlarmPress={() => setOptionSheet("ALARM")}
          onBreakMinutesChange={(value) => {
            setBreakMinutes(String(value));
            if (breakError) setBreakError(null);
          }}
          onBreakPress={() => setOptionSheet("PAUSE")}
          onDismiss={() => {
            allowRemovalRef.current = true;
            router.back();
          }}
          onDelete={() => {
            Alert.alert("Dienst löschen?", "Dieser Dienst wird aus dem Kalender entfernt.", [
              { text: "Abbrechen", style: "cancel" },
              { text: "Löschen", style: "destructive", onPress: () => void deleteEntry() },
            ]);
          }}
          onEndTimeChange={setEndTime}
          onLocationPress={() => router.push(locationPickerRoute(shiftLocation?.name) as never)}
          onNoteChange={setShiftNote}
          onNotificationChange={setShiftNotification}
          onNotificationPress={() => setOptionSheet("NOTIFICATION")}
          onRequestClose={() => save(false)}
          onShiftTypeChange={chooseType}
          onStartTimeChange={setStartTime}
          shiftColor={shiftColor}
          shiftIsTimed={shiftIsTimed}
          shiftSymbol={shiftSymbol}
          shiftTitle={shiftTitle}
          shiftType={shiftType}
          startTime={startTime}
        />
        {optionSheet === "NOTIFICATION" ? (
          <NotificationSheet
            deferredSelection
            onChange={setShiftNotification}
            onClose={() => setOptionSheet(null)}
            value={shiftNotification}
          />
        ) : null}
        {optionSheet === "PAUSE" ? (
          <PauseSheet
            onChange={(value) => {
              setBreakMinutes(String(value));
              if (breakError) setBreakError(null);
            }}
            onClose={() => setOptionSheet(null)}
            value={Number(breakMinutes) || 0}
          />
        ) : null}
        {optionSheet === "ALARM" ? (
          <AlarmSheet
            onChange={setShiftAlarmEnabled}
            onClose={() => setOptionSheet(null)}
            value={shiftAlarmEnabled}
          />
        ) : null}
      </>
    );
  }

  if (compactAppointmentEditor) {
    const durationMinutes = allDay
      ? null
      : calculateTimedShiftMinutes(
          {
            date,
            startTime: appointmentStart,
            endTime: appointmentEnd,
            breakMinutes: 0,
            allDay: false,
          },
          profile?.timeZone ?? "Europe/Berlin",
        );
    const isSeries = Boolean(initialAppointment?.recurrence);
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <AppointmentEditOverlay
          allDay={allDay}
          appointmentColor={appointmentColor}
          busy={saving}
          date={date}
          durationMinutes={durationMinutes}
          endTime={appointmentEnd}
          error={error}
          locationName={appointmentLocation?.name ?? null}
          note={appointmentNote}
          notification={appointmentNotification}
          onAllDayChange={setAllDay}
          onDelete={
            initialAppointment
              ? () => {
                  Alert.alert(
                    isSeries ? "Terminserie löschen?" : "Termin löschen?",
                    isSeries
                      ? "Alle Termine dieser Serie werden gelöscht."
                      : "Dieser Termin wird aus dem Kalender entfernt.",
                    [
                      { text: "Abbrechen", style: "cancel" },
                      {
                        text: "Löschen",
                        style: "destructive",
                        onPress: () => void deleteEntry(),
                      },
                    ],
                  );
                }
              : undefined
          }
          onDismiss={() => {
            allowRemovalRef.current = true;
            router.back();
          }}
          onEndTimeChange={setAppointmentEnd}
          onLocationPress={() =>
            router.push(locationPickerRoute(appointmentLocation?.name) as never)
          }
          onNoteChange={setAppointmentNote}
          onNotificationChange={setAppointmentNotification}
          onNotificationPress={() => setOptionSheet("NOTIFICATION")}
          onRecurrenceChange={setAppointmentRecurrence}
          onRequestClose={() => save(false)}
          onStartTimeChange={setAppointmentStart}
          onTitleChange={(value) => {
            setAppointmentTitle(value);
            if (appointmentTitleError) setAppointmentTitleError(null);
          }}
          recurrence={appointmentRecurrence}
          startTime={appointmentStart}
          title={appointmentTitle}
        />
        {optionSheet === "NOTIFICATION" ? (
          <NotificationSheet
            onChange={setAppointmentNotification}
            onClose={() => setOptionSheet(null)}
            value={appointmentNotification}
          />
        ) : null}
      </>
    );
  }

  return (
    <FormScreen bottomPadding={32}>
      <Stack.Screen
        options={{
          title: editorTitle,
          gestureEnabled: false,
          headerLeft: () => <EditorCloseButton busy={saving} onPress={() => void save()} />,
          headerRight: () => null,
        }}
      />
      <EditorDateHeader date={date} label={mode === "SHIFT" ? "Dienst" : "Termin"} />
      {!existing ? (
        <SegmentedControl
          items={[
            { value: "SHIFT", label: "Dienst" },
            { value: "APPOINTMENT", label: "Termin" },
          ]}
          onChange={(value) => setMode(value as EditorMode)}
          value={mode}
        />
      ) : null}

      {mode === "SHIFT" ? (
        <>
          <SectionHeader title="Dienstart" />
          <View
            accessibilityLabel="Dienstart auswählen"
            accessibilityRole="radiogroup"
            style={SHIFT_TYPE_GRID_STYLE}
          >
            {DAY_EDITOR_SHIFT_TYPES.map((type) => {
              const selected = type === shiftType;
              return (
                <Pressable
                  key={type}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => chooseType(type)}
                  style={({ pressed }) => ({
                    minHeight: 42,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 7,
                    borderWidth: 1,
                    borderColor: selected ? palette.primary : palette.border,
                    borderRadius: 21,
                    backgroundColor: selected ? palette.primarySoft : palette.surface,
                    opacity: pressed ? 0.68 : 1,
                    paddingHorizontal: 13,
                  })}
                >
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: SHIFT_TYPE_COLORS[type],
                    }}
                  />
                  <Text
                    style={{
                      color: selected ? palette.primary : palette.text,
                      fontSize: 13,
                      fontWeight: "600",
                    }}
                  >
                    {SHIFT_TYPE_LABELS[type]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <SurfaceCard style={{ gap: 12, padding: 14 }}>
            <Field
              error={shiftTitleError}
              inputRef={shiftTitleRef}
              label="Bezeichnung"
              maxLength={60}
              onChangeText={(value) => {
                setShiftTitle(value);
                if (shiftTitleError) setShiftTitleError(null);
              }}
              value={shiftTitle}
            />
            {!shiftIsAbsence ? (
              <View
                style={{
                  minHeight: 50,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderTopWidth: 1,
                  borderTopColor: palette.separator,
                }}
              >
                <Text style={{ color: palette.text, fontSize: 15, fontWeight: "600" }}>
                  Ganztägig
                </Text>
                <LabeledSwitch
                  label="Dienst ganztägig"
                  onValueChange={setShiftAllDay}
                  value={shiftAllDay}
                />
              </View>
            ) : null}
            {shiftIsTimed ? (
              <>
                <ResponsiveFieldRow
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: palette.separator,
                    paddingTop: 4,
                  }}
                >
                  <TimePickerField label="Beginn" onChange={setStartTime} value={startTime} />
                  <TimePickerField label="Ende" onChange={setEndTime} value={endTime} />
                </ResponsiveFieldRow>
                <Field
                  error={breakError}
                  inputRef={breakRef}
                  keyboardType="number-pad"
                  label="Pause (Min.)"
                  onChangeText={(value) => {
                    setBreakMinutes(value);
                    if (breakError) setBreakError(null);
                  }}
                  value={breakMinutes}
                />
                {hasHolidayOverlap ? (
                  <View
                    style={{
                      minHeight: 54,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 14,
                      borderTopWidth: 1,
                      borderTopColor: palette.separator,
                      paddingTop: 12,
                    }}
                  >
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={{ color: palette.text, fontSize: 15, fontWeight: "600" }}>
                        Ohne Freizeitausgleich
                      </Text>
                      <Text style={{ color: palette.textMuted, fontSize: 12, lineHeight: 17 }}>
                        135 % statt 35 % Feiertagszuschlag
                      </Text>
                    </View>
                    <LabeledSwitch
                      label="Feiertagsdienst ohne Freizeitausgleich"
                      onValueChange={(enabled) =>
                        setHolidayPremiumMode(enabled ? "WITHOUT_TIME_OFF" : "WITH_TIME_OFF")
                      }
                      value={holidayPremiumMode === "WITHOUT_TIME_OFF"}
                    />
                  </View>
                ) : null}
              </>
            ) : null}
            <OptionRow
              icon="notifications-outline"
              label="Benachrichtigung"
              onPress={() => setOptionSheet("NOTIFICATION")}
              value={notificationLabel(shiftNotification)}
            />
            <OptionRow
              icon="location-outline"
              label="Ort"
              onPress={() => router.push(locationPickerRoute(shiftLocation?.name) as never)}
              value={shiftLocation?.name ?? "Kein Ort"}
            />
            {shiftLocation ? <LocationPreview location={shiftLocation} /> : null}
            <AdvancedDisclosure
              color={shiftColor}
              expanded={detailsExpanded}
              onPress={() => setDetailsExpanded((current) => !current)}
              summary={detailSummary}
            />
            {detailsExpanded ? (
              <Animated.View
                entering={FadeInDown.duration(MOTION.duration.fast).reduceMotion(
                  MOTION.reduceMotion,
                )}
                exiting={FadeOut.duration(MOTION.duration.instant).reduceMotion(
                  MOTION.reduceMotion,
                )}
                style={{ gap: 14 }}
              >
                {shiftIsTimed ? (
                  <Field
                    error={overtimeError}
                    inputRef={overtimeRef}
                    keyboardType="number-pad"
                    label="Überstunden (Min.)"
                    onChangeText={(value) => {
                      setOvertimeMinutes(value);
                      if (overtimeError) setOvertimeError(null);
                    }}
                    value={overtimeMinutes}
                  />
                ) : null}
                <Field
                  label="Notiz (optional)"
                  multiline
                  onChangeText={setShiftNote}
                  value={shiftNote}
                />
                <Field
                  label="Kürzel"
                  maxLength={4}
                  onChangeText={setShiftSymbol}
                  value={shiftSymbol}
                />
                <ColorPicker onChange={setShiftColor} value={shiftColor} />
              </Animated.View>
            ) : null}
          </SurfaceCard>
        </>
      ) : (
        <SurfaceCard style={{ gap: 12, padding: 14 }}>
          <Field
            error={appointmentTitleError}
            inputRef={appointmentTitleRef}
            label="Titel"
            maxLength={60}
            onChangeText={(value) => {
              setAppointmentTitle(value);
              if (appointmentTitleError) setAppointmentTitleError(null);
            }}
            value={appointmentTitle}
          />
          <View
            style={{
              minHeight: 50,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              borderTopWidth: 1,
              borderTopColor: palette.separator,
              paddingTop: 4,
            }}
          >
            <Text style={{ color: palette.text, fontSize: 15, fontWeight: "600" }}>Ganztägig</Text>
            <LabeledSwitch label="Termin ganztägig" onValueChange={setAllDay} value={allDay} />
          </View>
          {!allDay ? (
            <ResponsiveFieldRow>
              <TimePickerField
                label="Beginn"
                onChange={setAppointmentStart}
                value={appointmentStart}
              />
              <TimePickerField label="Ende" onChange={setAppointmentEnd} value={appointmentEnd} />
            </ResponsiveFieldRow>
          ) : null}
          <OptionRow
            icon="repeat"
            label="Wiederholen"
            onPress={() => setOptionSheet("RECURRENCE")}
            value={recurrenceLabel(appointmentRecurrence)}
          />
          <OptionRow
            icon="notifications-outline"
            label="Benachrichtigung"
            onPress={() => setOptionSheet("NOTIFICATION")}
            value={notificationLabel(appointmentNotification)}
          />
          <OptionRow
            icon="location-outline"
            label="Ort"
            onPress={() => router.push(locationPickerRoute(appointmentLocation?.name) as never)}
            value={appointmentLocation?.name ?? "Kein Ort"}
          />
          {appointmentLocation ? <LocationPreview location={appointmentLocation} /> : null}
          <AdvancedDisclosure
            color={appointmentColor}
            expanded={detailsExpanded}
            onPress={() => setDetailsExpanded((current) => !current)}
            summary={detailSummary}
          />
          {detailsExpanded ? (
            <Animated.View
              entering={FadeInDown.duration(MOTION.duration.fast).reduceMotion(MOTION.reduceMotion)}
              exiting={FadeOut.duration(MOTION.duration.instant).reduceMotion(MOTION.reduceMotion)}
              style={{ gap: 14 }}
            >
              <Field
                label="Notiz (optional)"
                multiline
                onChangeText={setAppointmentNote}
                value={appointmentNote}
              />
              <ColorPicker onChange={setAppointmentColor} value={appointmentColor} />
            </Animated.View>
          ) : null}
        </SurfaceCard>
      )}

      <FormStatus error={error} />
      {existing ? (
        deleteConfirm ? (
          <InlineDeleteConfirmation
            onCancel={() => setDeleteConfirm(false)}
            onDelete={() => void deleteEntry()}
            series={existing.kind === "APPOINTMENT" && Boolean(existing.recurrence)}
          />
        ) : (
          <DestructiveFormAction
            disabled={saving}
            label={
              existing.kind === "APPOINTMENT" && existing.recurrence
                ? "Serie löschen"
                : "Eintrag löschen"
            }
            onPress={() => setDeleteConfirm(true)}
          />
        )
      ) : null}
      {optionSheet === "RECURRENCE" ? (
        <RecurrenceSheet
          onChange={setAppointmentRecurrence}
          onClose={() => setOptionSheet(null)}
          value={appointmentRecurrence}
        />
      ) : null}
      {optionSheet === "NOTIFICATION" ? (
        <NotificationSheet
          onChange={mode === "SHIFT" ? setShiftNotification : setAppointmentNotification}
          onClose={() => setOptionSheet(null)}
          value={mode === "SHIFT" ? shiftNotification : appointmentNotification}
        />
      ) : null}
    </FormScreen>
  );
}
