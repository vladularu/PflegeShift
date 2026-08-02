import * as Haptics from "expo-haptics";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Switch, Text, View } from "react-native";

import {
  useMediShiftEntries,
  useMediShiftProfile,
  useMediShiftTemplates,
} from "@/application/medishift-provider";
import { SHIFT_TYPE_LABELS, type CalendarEntry, type ShiftType } from "@/domain/types";
import { formatDateTitle, today } from "@/engine/calendar";
import { calculateMonthlyCompliance } from "@/engine/compliance";
import { calculateTimedShiftMinutes } from "@/engine/working-time";
import { shiftOverlapsHoliday } from "@/features/day-editor/holiday-premium";
import { resolveShiftTypePreset } from "@/features/day-editor/shift-type-preset";
import { SHIFT_TYPE_COLORS, usePalette } from "@/theme/palette";
import { SegmentedControl, SectionHeader, SurfaceCard } from "@/ui/design-system";
import { confirmDestructiveAction } from "@/ui/confirm-action";
import { ColorPicker, Field, TimePickerField } from "@/ui/form-controls";
import {
  DestructiveFormAction,
  FormScreen,
  FormStatus,
  HeaderSaveAction,
} from "@/ui/form-layout";

type EditorMode = "SHIFT" | "APPOINTMENT";
const SHIFT_FORM_TYPES: readonly ShiftType[] = ["CUSTOM", "EARLY", "LATE", "NIGHT", "DAY", "TRAINING", "VACATION", "SICK", "FREE"];

export function DayEditorScreen() {
  const params = useLocalSearchParams<{ date?: string; mode?: string; entryId?: string }>();
  const palette = usePalette();
  const { profile } = useMediShiftProfile();
  const { templates } = useMediShiftTemplates();
  const { entries, upsertShift, upsertAppointment, removeEntry } = useMediShiftEntries();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") ? params.date! : today();
  const existing = useMemo(
    () => entries.find((entry) => entry.id === params.entryId && entry.deletedAt === null) ?? null,
    [entries, params.entryId],
  );
  const initialMode: EditorMode = existing?.kind ?? (params.mode === "APPOINTMENT" ? "APPOINTMENT" : "SHIFT");
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
  const [overtimeMinutes, setOvertimeMinutes] = useState(String(initialShift?.overtimeMinutes ?? 0));
  const [holidayPremiumMode, setHolidayPremiumMode] = useState<"WITH_TIME_OFF" | "WITHOUT_TIME_OFF">(
    initialShift?.holidayPremiumMode ?? "WITH_TIME_OFF",
  );
  const [appointmentTitle, setAppointmentTitle] = useState(initialAppointment?.title ?? "");
  const [allDay, setAllDay] = useState(initialAppointment?.allDay ?? true);
  const [appointmentStart, setAppointmentStart] = useState(initialAppointment?.startTime ?? "10:00");
  const [appointmentEnd, setAppointmentEnd] = useState(initialAppointment?.endTime ?? "11:00");
  const [appointmentColor, setAppointmentColor] = useState(initialAppointment?.color ?? "#2F80ED");
  const [appointmentNote, setAppointmentNote] = useState(initialAppointment?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const shiftIsTimed = !["VACATION", "SICK", "FREE"].includes(shiftType);
  const hasHolidayOverlap = profile && shiftIsTimed
    ? shiftOverlapsHoliday(date, startTime, endTime, profile.federalState)
    : false;
  const editorTitle = existing
    ? existing.kind === "SHIFT" ? "Dienst bearbeiten" : "Termin bearbeiten"
    : mode === "SHIFT" ? "Neuer Dienst" : "Neuer Termin";
  const detailSummary = mode === "SHIFT"
    ? [
        shiftNote.trim() ? "Notiz" : null,
        shiftIsTimed && Number(overtimeMinutes) > 0 ? `${overtimeMinutes} Min. Überstunden` : null,
        `Kürzel ${shiftSymbol || "–"}`,
      ].filter(Boolean).join(" · ")
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
    if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
  }

  async function save() {
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
            throw new Error("Überstunden dürfen die Nettoarbeitszeit nicht überschreiten.");
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
          const shifts = entries.filter((entry): entry is Extract<CalendarEntry, { kind: "SHIFT" }> => entry.kind === "SHIFT" && entry.id !== saved.id).concat(saved);
          const critical = calculateMonthlyCompliance(date.slice(0, 7), shifts, profile.timeZone, {
            federalState: profile.federalState,
            weeklyMinutes: profile.weeklyMinutes,
          }).issues
            .find((issue) => issue.severity === "critical" && issue.relatedShiftIds.includes(saved.id));
          if (critical) Alert.alert("ArbZG-Hinweis", critical.title);
        }
      } else {
        await upsertAppointment({
          ...(initialAppointment ? { id: initialAppointment.id, expectedRevision: initialAppointment.revision } : {}),
          date,
          title: appointmentTitle,
          allDay,
          startTime: allDay ? null : appointmentStart,
          endTime: allDay ? null : appointmentEnd,
          color: appointmentColor,
          note: appointmentNote,
        });
      }
      if (process.env.EXPO_OS === "ios") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Eintrag konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(entry: CalendarEntry) {
    confirmDestructiveAction({
      title: "Eintrag löschen?",
      message: `„${entry.title}“ wird dauerhaft entfernt.`,
      onConfirm: () => void removeEntry(entry)
        .then(() => router.back())
        .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Löschen fehlgeschlagen.")),
    });
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
          <Text style={{ color: palette.primary, fontSize: 13, fontWeight: "900", fontVariant: ["tabular-nums"] }}>
            {date.slice(-2)}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            selectable
            style={{ color: palette.text, fontSize: 15, fontWeight: "800" }}
          >
            {formatDateTitle(date)}
          </Text>
          <Text style={{ color: palette.textMuted, fontSize: 12, fontWeight: "600" }}>
            {mode === "SHIFT" ? "Dienst" : "Termin"}
          </Text>
        </View>
      </View>
      {!existing ? (
        <SegmentedControl
          items={[{ value: "SHIFT", label: "Dienst" }, { value: "APPOINTMENT", label: "Termin" }]}
          onChange={(value) => setMode(value as EditorMode)}
          value={mode}
        />
      ) : null}

      {mode === "SHIFT" ? (
        <>
          <SectionHeader title="Dienstart" />
          <ScrollView
            horizontal
            contentContainerStyle={{ gap: 8, paddingRight: 16 }}
            showsHorizontalScrollIndicator={false}
          >
            {SHIFT_FORM_TYPES.map((type) => {
              const selected = type === shiftType;
              return (
                <Pressable
                  key={type}
                  accessibilityRole="button"
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
                  <Text style={{ color: selected ? palette.primary : palette.text, fontSize: 13, fontWeight: "800" }}>
                    {SHIFT_TYPE_LABELS[type]}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <SurfaceCard style={{ gap: 12, padding: 14 }}>
            <Field label="Bezeichnung" maxLength={60} onChangeText={setShiftTitle} value={shiftTitle} />
            {shiftIsTimed ? (
              <>
                <View
                  style={{
                    flexDirection: "row",
                    gap: 12,
                    borderTopWidth: 1,
                    borderTopColor: palette.separator,
                    paddingTop: 4,
                  }}
                >
                  <TimePickerField label="Beginn" onChange={setStartTime} value={startTime} />
                  <TimePickerField label="Ende" onChange={setEndTime} value={endTime} />
                </View>
                <Field keyboardType="number-pad" label="Pause (Min.)" onChangeText={setBreakMinutes} value={breakMinutes} />
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
                      <Text style={{ color: palette.text, fontSize: 15, fontWeight: "800" }}>
                        Ohne Freizeitausgleich
                      </Text>
                      <Text style={{ color: palette.textMuted, fontSize: 12, lineHeight: 17 }}>
                        135 % statt 35 % Feiertagszuschlag
                      </Text>
                    </View>
                    <Switch
                      accessibilityLabel="Feiertagsdienst ohne Freizeitausgleich"
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
              <View style={{ gap: 14 }}>
                {shiftIsTimed ? (
                  <Field
                    keyboardType="number-pad"
                    label="Überstunden (Min.)"
                    onChangeText={setOvertimeMinutes}
                    value={overtimeMinutes}
                  />
                ) : null}
                <Field label="Notiz (optional)" multiline onChangeText={setShiftNote} value={shiftNote} />
                <Field label="Kürzel" maxLength={4} onChangeText={setShiftSymbol} value={shiftSymbol} />
                <ColorPicker onChange={setShiftColor} value={shiftColor} />
              </View>
            ) : null}
          </SurfaceCard>
        </>
      ) : (
        <SurfaceCard style={{ gap: 12, padding: 14 }}>
          <Field label="Titel" maxLength={60} onChangeText={setAppointmentTitle} value={appointmentTitle} />
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
            <Text style={{ color: palette.text, fontSize: 15, fontWeight: "700" }}>Ganztägig</Text>
            <Switch onValueChange={setAllDay} value={allDay} />
          </View>
          {!allDay ? (
            <View style={{ flexDirection: "row", gap: 14 }}>
              <TimePickerField label="Beginn" onChange={setAppointmentStart} value={appointmentStart} />
              <TimePickerField label="Ende" onChange={setAppointmentEnd} value={appointmentEnd} />
            </View>
          ) : null}
          <AdvancedDisclosure
            color={appointmentColor}
            expanded={detailsExpanded}
            onPress={() => setDetailsExpanded((current) => !current)}
            summary={detailSummary}
          />
          {detailsExpanded ? (
            <View style={{ gap: 14 }}>
              <Field label="Notiz (optional)" multiline onChangeText={setAppointmentNote} value={appointmentNote} />
              <ColorPicker onChange={setAppointmentColor} value={appointmentColor} />
            </View>
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
        <Text style={{ color: palette.text, fontSize: 14, fontWeight: "800" }}>
          Weitere Angaben
        </Text>
        <Text numberOfLines={1} style={{ color: palette.textMuted, fontSize: 12, fontWeight: "600" }}>
          {summary}
        </Text>
      </View>
      <Text style={{ color: palette.primary, fontSize: 18, fontWeight: "900" }}>
        {expanded ? "−" : "+"}
      </Text>
    </Pressable>
  );
}
