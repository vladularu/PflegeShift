import Ionicons from "@expo/vector-icons/Ionicons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import Animated, { FadeInDown, FadeOut } from "react-native-reanimated";

import {
  usePflegeShiftEntries,
  usePflegeShiftProfile,
  usePflegeShiftStatus,
  usePflegeShiftTemplates,
} from "@/application/pflegeshift-provider";
import { SHIFT_TYPE_LABELS, type CalendarEntry, type ShiftType } from "@/domain/types";
import { userFacingErrorMessage } from "@/domain/errors";
import { ValidationError } from "@/domain/validation";
import { formatDateTitle, today } from "@/engine/calendar";
import { calculateMonthlyCompliance } from "@/engine/compliance";
import { calculateTimedShiftMinutes } from "@/engine/working-time";
import { shiftOverlapsHoliday } from "@/features/day-editor/holiday-premium";
import {
  DAY_EDITOR_SHIFT_TYPES,
  SHIFT_TYPE_GRID_STYLE,
} from "@/features/day-editor/day-editor-layout";
import { resolveShiftTypePreset } from "@/features/day-editor/shift-type-preset";
import { useEntryDeletion } from "@/features/day-editor/use-entry-deletion";
import {
  resolveEditorSession,
  resolveEditorTarget,
  useStableEditorSession,
} from "@/features/editor-session";
import {
  parseEnumRouteParam,
  parseIdentifierRouteParam,
  parseLocalDateRouteParam,
  type RouteParam,
} from "@/navigation/route-params";
import { APPOINTMENT_COLOR, SHIFT_TYPE_COLORS, usePalette } from "@/theme/palette";
import { MOTION } from "@/theme/motion";
import { SegmentedControl, SectionHeader, SurfaceCard } from "@/ui/design-system";
import { ColorPicker, Field, ResponsiveFieldRow, TimePickerField } from "@/ui/form-controls";
import { DestructiveFormAction, FormScreen, FormStatus, HeaderSaveAction } from "@/ui/form-layout";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { LabeledSwitch } from "@/ui/labeled-switch";
import { selectionFeedback, successFeedback, warningFeedback } from "@/ui/haptics";
import {
  focusInvalidField,
  integerRangeFieldError,
  requiredFieldError,
} from "@/ui/form-validation";

type EditorMode = "SHIFT" | "APPOINTMENT";

export function DayEditorScreen() {
  const params = useLocalSearchParams<{
    date?: RouteParam;
    mode?: RouteParam;
    entryId?: RouteParam;
  }>();
  const { error, ready, reload } = usePflegeShiftStatus();
  const { entries } = usePflegeShiftEntries();
  const parsedDate = parseLocalDateRouteParam(params.date);
  const parsedMode = parseEnumRouteParam(params.mode, ["SHIFT", "APPOINTMENT"] as const);
  const parsedEntryId = parseIdentifierRouteParam(params.entryId);
  const routeInvalid =
    parsedDate.status !== "valid" ||
    parsedMode.status !== "valid" ||
    parsedEntryId.status === "invalid";
  const date = parsedDate.status === "valid" ? parsedDate.value : today();
  const entryId = parsedEntryId.status === "valid" ? parsedEntryId.value : undefined;
  const existing = useMemo(
    () => entries.find((entry) => entry.id === entryId && entry.deletedAt === null) ?? null,
    [entries, entryId],
  );
  const requestedMode: EditorMode = parsedMode.status === "valid" ? parsedMode.value : "SHIFT";
  if (routeInvalid) {
    return (
      <LoadFailureView
        actionLabel="Schließen"
        message="Der Link zum Eintrag enthält ungültige Parameter."
        onRetry={() => router.back()}
        title="Eintrag kann nicht geöffnet werden"
      />
    );
  }
  if (ready && error) {
    return <LoadFailureView message={error} onRetry={() => void reload()} />;
  }
  const target = resolveEditorTarget(entryId, existing);
  if (ready && target.kind === "MISSING") {
    return (
      <LoadFailureView
        actionLabel="Schließen"
        message="Der angeforderte Kalendereintrag existiert nicht mehr."
        onRetry={() => router.back()}
        title="Eintrag nicht verfügbar"
      />
    );
  }
  const session = resolveEditorSession(ready, `${date}:${entryId ?? "new"}:${requestedMode}`, () =>
    target.kind === "EDIT" ? target.value : null,
  );
  if (session === null) return <LoadingView />;
  return (
    <DayEditorForm
      key={session.key}
      date={date}
      existing={session.initialValue}
      requestedMode={requestedMode}
      sessionKey={session.key}
    />
  );
}

function DayEditorForm({
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
  const { profile } = usePflegeShiftProfile();
  const { templates } = usePflegeShiftTemplates();
  const { entries, upsertShift, upsertAppointment } = usePflegeShiftEntries();
  const { initialValue: existing } = useStableEditorSession(sessionKey, () => loadedExisting);
  const initialMode: EditorMode = existing?.kind ?? requestedMode;
  const [mode, setMode] = useState<EditorMode>(initialMode);
  const initialShift = existing?.kind === "SHIFT" ? existing : null;
  const initialAppointment = existing?.kind === "APPOINTMENT" ? existing : null;
  const [shiftType, setShiftType] = useState<ShiftType>(initialShift?.type ?? "CUSTOM");
  const [selectedTemplateId, setSelectedTemplateId] = useState(initialShift?.templateId ?? null);
  const [shiftTitle, setShiftTitle] = useState(initialShift?.title ?? "Dienst");
  const [startTime, setStartTime] = useState(initialShift?.startTime ?? "08:00");
  const [endTime, setEndTime] = useState(initialShift?.endTime ?? "16:00");
  const [breakMinutes, setBreakMinutes] = useState(String(initialShift?.breakMinutes ?? 30));
  const [shiftColor, setShiftColor] = useState(initialShift?.color ?? SHIFT_TYPE_COLORS.CUSTOM);
  const [shiftSymbol, setShiftSymbol] = useState(initialShift?.symbol ?? "D");
  const [shiftNote, setShiftNote] = useState(initialShift?.note ?? "");
  const [overtimeMinutes, setOvertimeMinutes] = useState(
    String(initialShift?.overtimeMinutes ?? 0),
  );
  const [holidayPremiumMode, setHolidayPremiumMode] = useState<
    "WITH_TIME_OFF" | "WITHOUT_TIME_OFF"
  >(initialShift?.holidayPremiumMode ?? "WITH_TIME_OFF");
  const [appointmentTitle, setAppointmentTitle] = useState(initialAppointment?.title ?? "");
  const [allDay, setAllDay] = useState(initialAppointment?.allDay ?? true);
  const [appointmentStart, setAppointmentStart] = useState(
    initialAppointment?.startTime ?? "10:00",
  );
  const [appointmentEnd, setAppointmentEnd] = useState(initialAppointment?.endTime ?? "11:00");
  const [appointmentColor, setAppointmentColor] = useState(
    initialAppointment?.color ?? APPOINTMENT_COLOR,
  );
  const [appointmentNote, setAppointmentNote] = useState(initialAppointment?.note ?? "");
  const [shiftTitleError, setShiftTitleError] = useState<string | null>(null);
  const [breakError, setBreakError] = useState<string | null>(null);
  const [overtimeError, setOvertimeError] = useState<string | null>(null);
  const [appointmentTitleError, setAppointmentTitleError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const confirmDelete = useEntryDeletion({
    onDeleted: () => router.back(),
    onError: setError,
  });
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const shiftTitleRef = useRef<TextInput>(null);
  const breakRef = useRef<TextInput>(null);
  const overtimeRef = useRef<TextInput>(null);
  const appointmentTitleRef = useRef<TextInput>(null);
  const shiftIsTimed = !["VACATION", "SICK", "FREE"].includes(shiftType);
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
    setSelectedTemplateId(preset.templateId);
    setShiftTitle(preset.title);
    setStartTime(preset.startTime ?? "08:00");
    setEndTime(preset.endTime ?? "16:00");
    setBreakMinutes(String(preset.breakMinutes));
    setShiftColor(preset.color);
    setShiftSymbol(preset.symbol);
    selectionFeedback();
  }

  async function save() {
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
      return;
    }
    try {
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
          startTime: shiftIsTimed ? startTime : null,
          endTime: shiftIsTimed ? endTime : null,
          breakMinutes: breakValue,
          color: shiftColor,
          symbol: shiftSymbol,
          note: shiftNote,
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
          date,
          title: appointmentTitle,
          allDay,
          startTime: allDay ? null : appointmentStart,
          endTime: allDay ? null : appointmentEnd,
          color: appointmentColor,
          note: appointmentNote,
        });
      }
      successFeedback();
      router.back();
    } catch (saveError) {
      warningFeedback();
      setError(userFacingErrorMessage(saveError, "Eintrag konnte nicht gespeichert werden."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormScreen bottomPadding={32}>
      <Stack.Screen
        options={{
          title: editorTitle,
          headerRight: () => <HeaderSaveAction busy={saving} onPress={() => void save()} />,
        }}
      />
      <View
        accessibilityLabel={`Datum: ${formatDateTitle(date)}`}
        style={{
          minHeight: 44,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingHorizontal: 2,
        }}
      >
        <View
          style={{
            width: 34,
            height: 34,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 10,
            borderCurve: "continuous",
            backgroundColor: palette.primarySoft,
          }}
        >
          <Text
            style={{
              color: palette.primary,
              fontSize: 13,
              fontWeight: "600",
              fontVariant: ["tabular-nums"],
            }}
          >
            {date.slice(-2)}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text selectable style={{ color: palette.text, fontSize: 15, fontWeight: "600" }}>
            {formatDateTitle(date)}
          </Text>
          <Text style={{ color: palette.textMuted, fontSize: 12, fontWeight: "600" }}>
            {mode === "SHIFT" ? "Dienst" : "Termin"}
          </Text>
        </View>
      </View>
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
        <DestructiveFormAction
          disabled={saving}
          label="Eintrag löschen"
          onPress={() => confirmDelete(existing)}
        />
      ) : null}
    </FormScreen>
  );
}

function AdvancedDisclosure({
  color,
  expanded,
  onPress,
  summary,
}: {
  readonly color: string;
  readonly expanded: boolean;
  readonly onPress: () => void;
  readonly summary: string;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 50,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        borderTopWidth: 1,
        borderTopColor: palette.separator,
        backgroundColor: pressed ? palette.surfaceMuted : "transparent",
        opacity: pressed ? 0.78 : 1,
        paddingTop: 6,
      })}
    >
      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: palette.text, fontSize: 14, fontWeight: "600" }}>
          Weitere Angaben
        </Text>
        <Text style={{ color: palette.textMuted, fontSize: 12, fontWeight: "600" }}>{summary}</Text>
      </View>
      <Ionicons
        accessibilityElementsHidden
        color={palette.primary}
        name={expanded ? "remove" : "add"}
        size={19}
      />
    </Pressable>
  );
}
