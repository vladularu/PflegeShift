import * as Haptics from "expo-haptics";
import { Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";

import { useMediShift } from "@/application/medishift-provider";
import {
  SHIFT_TYPE_LABELS,
  type CalendarEntry,
  type ShiftType,
} from "@/domain/types";
import { requireLocalDate } from "@/domain/validation";
import { formatDateTitle, today } from "@/engine/calendar";
import { usePalette } from "@/theme/palette";
import {
  ColorPicker,
  Field,
  PrimaryButton,
  SegmentedButton,
} from "@/ui/form-controls";

type EditorMode = "SHIFT" | "APPOINTMENT";

const SHIFT_FORM_TYPES: readonly ShiftType[] = [
  "CUSTOM",
  "EARLY",
  "LATE",
  "NIGHT",
  "DAY",
  "TRAINING",
  "VACATION",
  "SICK",
  "FREE",
];

function entryTimeLabel(entry: CalendarEntry): string {
  if (entry.kind === "APPOINTMENT") {
    return entry.allDay ? "Ganztägig" : `${entry.startTime}–${entry.endTime}`;
  }
  if (entry.startTime === null) return SHIFT_TYPE_LABELS[entry.type];
  return `${entry.startTime}–${entry.endTime} · ${entry.breakMinutes} Min. Pause`;
}

export function DayEditorScreen() {
  const params = useLocalSearchParams<{ date?: string }>();
  const { templates, entries, upsertShift, upsertAppointment, removeEntry } = useMediShift();
  const palette = usePalette();
  const date = useMemo(() => {
    try {
      return requireLocalDate(params.date ?? today());
    } catch {
      return today();
    }
  }, [params.date]);
  const dayEntries = useMemo(
    () => entries.filter((entry) => entry.date === date),
    [date, entries],
  );

  const [mode, setMode] = useState<EditorMode>("SHIFT");
  const [editing, setEditing] = useState<CalendarEntry | null>(null);
  const [shiftType, setShiftType] = useState<ShiftType>("CUSTOM");
  const [shiftTitle, setShiftTitle] = useState("Dienst");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("16:00");
  const [breakMinutes, setBreakMinutes] = useState("30");
  const [shiftColor, setShiftColor] = useState("#21A0A0");
  const [shiftSymbol, setShiftSymbol] = useState("D");
  const [shiftNote, setShiftNote] = useState("");
  const [appointmentTitle, setAppointmentTitle] = useState("");
  const [allDay, setAllDay] = useState(true);
  const [appointmentStart, setAppointmentStart] = useState("10:00");
  const [appointmentEnd, setAppointmentEnd] = useState("11:00");
  const [appointmentColor, setAppointmentColor] = useState("#F2A93B");
  const [appointmentNote, setAppointmentNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function haptic() {
    if (process.env.EXPO_OS === "ios") {
      void Haptics.selectionAsync();
    }
  }

  function resetEditor(nextMode: EditorMode = mode) {
    setEditing(null);
    setMode(nextMode);
    setError(null);
    setShiftType("CUSTOM");
    setShiftTitle("Dienst");
    setStartTime("08:00");
    setEndTime("16:00");
    setBreakMinutes("30");
    setShiftColor("#21A0A0");
    setShiftSymbol("D");
    setShiftNote("");
    setAppointmentTitle("");
    setAllDay(true);
    setAppointmentStart("10:00");
    setAppointmentEnd("11:00");
    setAppointmentColor("#F2A93B");
    setAppointmentNote("");
  }

  function editEntry(entry: CalendarEntry) {
    setEditing(entry);
    setError(null);
    haptic();
    if (entry.kind === "SHIFT") {
      setMode("SHIFT");
      setShiftType(entry.type);
      setShiftTitle(entry.title);
      setStartTime(entry.startTime ?? "08:00");
      setEndTime(entry.endTime ?? "16:00");
      setBreakMinutes(String(entry.breakMinutes));
      setShiftColor(entry.color);
      setShiftSymbol(entry.symbol);
      setShiftNote(entry.note ?? "");
    } else {
      setMode("APPOINTMENT");
      setAppointmentTitle(entry.title);
      setAllDay(entry.allDay);
      setAppointmentStart(entry.startTime ?? "10:00");
      setAppointmentEnd(entry.endTime ?? "11:00");
      setAppointmentColor(entry.color);
      setAppointmentNote(entry.note ?? "");
    }
  }

  function confirmDelete(entry: CalendarEntry) {
    Alert.alert("Eintrag löschen?", `„${entry.title}“ wird aus diesem Tag entfernt.`, [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "Löschen",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await removeEntry(entry);
              if (editing?.id === entry.id) resetEditor();
            } catch (deleteError) {
              setError(deleteError instanceof Error ? deleteError.message : "Löschen fehlgeschlagen.");
            }
          })();
        },
      },
    ]);
  }

  async function quickAddTemplate(templateId: string) {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    try {
      setSaving(true);
      setError(null);
      await upsertShift({
        date,
        templateId: template.id,
        title: template.name,
        type: template.type,
        startTime: template.startTime,
        endTime: template.endTime,
        breakMinutes: template.breakMinutes,
        color: template.color,
        symbol: template.symbol,
      });
      haptic();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Dienst konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  async function quickAddAbsence(type: "VACATION" | "SICK" | "FREE") {
    const presentation = {
      VACATION: { color: "#D95F9A", symbol: "U" },
      SICK: { color: "#F2A93B", symbol: "K" },
      FREE: { color: "#7A8793", symbol: "–" },
    }[type];
    try {
      setSaving(true);
      setError(null);
      await upsertShift({
        date,
        title: SHIFT_TYPE_LABELS[type],
        type,
        color: presentation.color,
        symbol: presentation.symbol,
      });
      haptic();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Eintrag konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  async function saveShiftForm() {
    try {
      setSaving(true);
      setError(null);
      const existing = editing?.kind === "SHIFT" ? editing : null;
      await upsertShift({
        ...(existing ? { id: existing.id, expectedRevision: existing.revision } : {}),
        date,
        templateId: null,
        title: shiftTitle,
        type: shiftType,
        startTime,
        endTime,
        breakMinutes: Number(breakMinutes),
        color: shiftColor,
        symbol: shiftSymbol,
        note: shiftNote,
      });
      resetEditor("SHIFT");
      haptic();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Dienst konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  async function saveAppointmentForm() {
    try {
      setSaving(true);
      setError(null);
      const existing = editing?.kind === "APPOINTMENT" ? editing : null;
      await upsertAppointment({
        ...(existing ? { id: existing.id, expectedRevision: existing.revision } : {}),
        date,
        title: appointmentTitle,
        allDay,
        startTime: appointmentStart,
        endTime: appointmentEnd,
        color: appointmentColor,
        note: appointmentNote,
      });
      resetEditor("APPOINTMENT");
      haptic();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Termin konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  const shiftIsTimed = !["VACATION", "SICK", "FREE"].includes(shiftType);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={{ gap: 18, padding: 16, paddingBottom: 36 }}
    >
      <Stack.Screen options={{ title: formatDateTitle(date) }} />

      {dayEntries.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text selectable style={{ color: palette.textMuted, fontSize: 11, fontWeight: "900", letterSpacing: 0.8 }}>
            BEREITS EINGETRAGEN
          </Text>
          {dayEntries.map((entry) => (
            <View
              key={`${entry.kind}-${entry.id}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                borderWidth: 1,
                borderColor: editing?.id === entry.id ? palette.primary : palette.border,
                borderRadius: 15,
                borderCurve: "continuous",
                backgroundColor: palette.surface,
                padding: 10,
              }}
            >
              <View style={{ width: 8, alignSelf: "stretch", borderRadius: 4, backgroundColor: entry.color }} />
              <Pressable accessibilityRole="button" onPress={() => editEntry(entry)} style={{ flex: 1, gap: 2 }}>
                <Text selectable style={{ color: palette.text, fontSize: 14, fontWeight: "800" }}>{entry.title}</Text>
                <Text selectable style={{ color: palette.textMuted, fontSize: 12, fontVariant: ["tabular-nums"] }}>
                  {entryTimeLabel(entry)}
                </Text>
              </Pressable>
              <Pressable accessibilityLabel={`${entry.title} löschen`} onPress={() => confirmDelete(entry)} style={{ padding: 8 }}>
                <Text style={{ color: palette.danger, fontSize: 18, fontWeight: "900" }}>×</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {editing === null ? (
        <View style={{ gap: 10 }}>
          <Text selectable style={{ color: palette.textMuted, fontSize: 11, fontWeight: "900", letterSpacing: 0.8 }}>
            SCHNELL HINZUFÜGEN
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {templates.map((template) => (
              <Pressable
                key={template.id}
                accessibilityRole="button"
                disabled={saving}
                onPress={() => void quickAddTemplate(template.id)}
                style={({ pressed }) => ({
                  minHeight: 42,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 7,
                  borderRadius: 13,
                  borderCurve: "continuous",
                  backgroundColor: template.color,
                  opacity: pressed ? 0.75 : 1,
                  paddingHorizontal: 12,
                })}
              >
                <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>{template.symbol}</Text>
                <Text style={{ color: "#FFFFFF", fontWeight: "800" }}>{template.name}</Text>
              </Pressable>
            ))}
            {(["VACATION", "SICK", "FREE"] as const).map((type) => (
              <Pressable
                key={type}
                accessibilityRole="button"
                disabled={saving}
                onPress={() => void quickAddAbsence(type)}
                style={({ pressed }) => ({
                  minHeight: 42,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: palette.border,
                  borderRadius: 13,
                  backgroundColor: palette.surface,
                  opacity: pressed ? 0.72 : 1,
                  paddingHorizontal: 12,
                })}
              >
                <Text style={{ color: palette.text, fontWeight: "800" }}>{SHIFT_TYPE_LABELS[type]}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <Pressable accessibilityRole="button" onPress={() => resetEditor()} style={{ alignSelf: "flex-start", paddingVertical: 4 }}>
          <Text style={{ color: palette.primary, fontWeight: "800" }}>Bearbeitung abbrechen</Text>
        </Pressable>
      )}

      <View
        style={{
          flexDirection: "row",
          gap: 4,
          borderRadius: 14,
          backgroundColor: palette.outsideMonth,
          padding: 4,
        }}
      >
        <SegmentedButton label="Dienst" onPress={() => resetEditor("SHIFT")} selected={mode === "SHIFT"} />
        <SegmentedButton label="Termin" onPress={() => resetEditor("APPOINTMENT")} selected={mode === "APPOINTMENT"} />
      </View>

      {mode === "SHIFT" ? (
        <View style={{ gap: 16 }}>
          <View style={{ gap: 8 }}>
            <Text selectable style={{ color: palette.textMuted, fontSize: 12, fontWeight: "700" }}>Dienstart</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
              {SHIFT_FORM_TYPES.map((type) => {
                const selected = type === shiftType;
                return (
                  <Pressable
                    key={type}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setShiftType(type);
                      setShiftTitle(SHIFT_TYPE_LABELS[type]);
                      setShiftSymbol(SHIFT_TYPE_LABELS[type].slice(0, 1));
                    }}
                    style={{
                      borderWidth: 1,
                      borderColor: selected ? palette.primary : palette.border,
                      borderRadius: 999,
                      backgroundColor: selected ? palette.primarySoft : palette.surface,
                      paddingHorizontal: 11,
                      paddingVertical: 8,
                    }}
                  >
                    <Text style={{ color: selected ? palette.primary : palette.text, fontSize: 12, fontWeight: "700" }}>
                      {SHIFT_TYPE_LABELS[type]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <Field label="Bezeichnung" maxLength={40} onChangeText={setShiftTitle} value={shiftTitle} />
          {shiftIsTimed ? (
            <>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Field label="Beginn" maxLength={5} onChangeText={setStartTime} value={startTime} />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Ende" maxLength={5} onChangeText={setEndTime} value={endTime} />
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Field keyboardType="number-pad" label="Pause (Min.)" onChangeText={setBreakMinutes} value={breakMinutes} />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Kürzel" maxLength={4} onChangeText={setShiftSymbol} value={shiftSymbol} />
                </View>
              </View>
            </>
          ) : null}
          <Field label="Notiz (optional)" multiline onChangeText={setShiftNote} value={shiftNote} />
          <ColorPicker onChange={setShiftColor} value={shiftColor} />
          <PrimaryButton disabled={saving} onPress={() => void saveShiftForm()}>
            {saving ? "Wird gespeichert …" : editing ? "Dienst aktualisieren" : "Dienst speichern"}
          </PrimaryButton>
        </View>
      ) : (
        <View style={{ gap: 16 }}>
          <Field label="Titel" maxLength={60} onChangeText={setAppointmentTitle} value={appointmentTitle} />
          <View
            style={{
              minHeight: 50,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              borderWidth: 1,
              borderColor: palette.border,
              borderRadius: 13,
              backgroundColor: palette.surface,
              paddingHorizontal: 14,
            }}
          >
            <Text selectable style={{ color: palette.text, fontWeight: "700" }}>Ganztägig</Text>
            <Switch value={allDay} onValueChange={setAllDay} />
          </View>
          {!allDay ? (
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Field label="Beginn" maxLength={5} onChangeText={setAppointmentStart} value={appointmentStart} />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Ende" maxLength={5} onChangeText={setAppointmentEnd} value={appointmentEnd} />
              </View>
            </View>
          ) : null}
          <Field label="Notiz (optional)" multiline onChangeText={setAppointmentNote} value={appointmentNote} />
          <ColorPicker onChange={setAppointmentColor} value={appointmentColor} />
          <PrimaryButton disabled={saving} onPress={() => void saveAppointmentForm()}>
            {saving ? "Wird gespeichert …" : editing ? "Termin aktualisieren" : "Termin speichern"}
          </PrimaryButton>
        </View>
      )}

      {error ? (
        <Text accessibilityRole="alert" selectable style={{ color: palette.danger, fontWeight: "700" }}>
          {error}
        </Text>
      ) : null}
    </ScrollView>
  );
}
