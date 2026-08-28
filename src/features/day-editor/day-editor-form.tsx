import { router, Stack, useFocusEffect, useNavigation } from "expo-router";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { Alert, TextInput } from "react-native";

import {
  usePflegeShiftEntries,
  usePflegeShiftProfile,
  usePflegeShiftTemplates,
} from "@/application/pflegeshift-provider";
import { useRuleCatalogRuntime } from "@/application/rule-catalog-runtime-provider";
import {
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
import { resolveShiftTypePreset } from "@/features/day-editor/shift-type-preset";
import { ShiftEditOverlay } from "@/features/day-editor/shift-edit-overlay";
import { AlarmSheet, NotificationSheet, PauseSheet } from "@/features/day-editor/entry-options";
import {
  consumeLocationSelection,
  prepareLocationPicker,
} from "@/features/location/location-selection";
import { useStableEditorSession } from "@/features/editor-session";
import { APPOINTMENT_COLOR, SHIFT_TYPE_COLORS } from "@/theme/palette";
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
  const navigation = useNavigation();
  const { profile } = usePflegeShiftProfile();
  const { templates } = usePflegeShiftTemplates();
  const { entries, removeEntry, upsertShift, upsertAppointment } = usePflegeShiftEntries();
  const { resolver: ruleResolver } = useRuleCatalogRuntime();
  const { initialValue: existing } = useStableEditorSession(sessionKey, () => loadedExisting);
  const mode: EditorMode = existing?.kind ?? requestedMode;
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
  const overtimeMinutes = String(initialShift?.overtimeMinutes ?? 0);
  const holidayPremiumMode = initialShift?.holidayPremiumMode ?? "WITH_TIME_OFF";
  const [appointmentTitle, setAppointmentTitle] = useState(
    initialAppointment?.title ?? "Ohne Titel",
  );
  const [allDay, setAllDay] = useState(initialAppointment?.allDay ?? false);
  const [appointmentStart, setAppointmentStart] = useState(
    initialAppointment?.startTime ?? "12:00",
  );
  const [appointmentEnd, setAppointmentEnd] = useState(initialAppointment?.endTime ?? "13:00");
  const appointmentColor = initialAppointment?.color ?? APPOINTMENT_COLOR;
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
  const [breakError, setBreakError] = useState<string | null>(null);
  const [appointmentTitleError, setAppointmentTitleError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
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
  function openLocationPicker(current: EntryLocation | null) {
    prepareLocationPicker(current);
    router.push(locationPickerRoute() as never);
  }
  const shiftIsAbsence = ["VACATION", "SICK", "FREE"].includes(shiftType);
  const shiftIsTimed = !shiftIsAbsence && !shiftAllDay;

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
    setBreakError(nextBreakError);
    setAppointmentTitleError(nextAppointmentTitleError);
    const firstError =
      nextShiftTitleError ?? nextBreakError ?? nextOvertimeError ?? nextAppointmentTitleError;
    if (firstError) {
      setError(firstError);
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
            ruleResolver,
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
      if (closeAfterSave) {
        allowRemovalRef.current = true;
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
  }, [navigation]);

  if (mode === "SHIFT") {
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
          onDelete={
            initialShift
              ? () => {
                  Alert.alert("Dienst löschen?", "Dieser Dienst wird aus dem Kalender entfernt.", [
                    { text: "Abbrechen", style: "cancel" },
                    { text: "Löschen", style: "destructive", onPress: () => void deleteEntry() },
                  ]);
                }
              : undefined
          }
          onEndTimeChange={setEndTime}
          onLocationPress={() => openLocationPicker(shiftLocation)}
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
        onLocationPress={() => openLocationPicker(appointmentLocation)}
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
