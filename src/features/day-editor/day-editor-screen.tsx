import * as Haptics from "expo-haptics";
import { Temporal } from "@js-temporal/polyfill";
import { Stack, router, useLocalSearchParams } from "expo-router";
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
  type FederalState,
  type ShiftType,
} from "@/domain/types";
import { requireLocalDate } from "@/domain/validation";
import { formatDateTitle, today } from "@/engine/calendar";
import { calculateMonthlyCompliance } from "@/engine/compliance";
import { getPublicHolidays } from "@/engine/holidays";
import { calculateTimedShiftMinutes } from "@/engine/working-time";
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

function shiftOverlapsHoliday(
  dateValue: string,
  startValue: string,
  endValue: string,
  federalState: FederalState,
): boolean {
  try {
    const date = Temporal.PlainDate.from(dateValue);
    const start = Temporal.PlainTime.from(startValue);
    const end = Temporal.PlainTime.from(endValue);
    const coveredDates = [date.toString()];
    if (Temporal.PlainTime.compare(end, start) <= 0 && endValue !== "00:00") {
      coveredDates.push(date.add({ days: 1 }).toString());
    }
    const holidayDates = new Set(
      [date.year, date.add({ days: 1 }).year].flatMap((year) =>
        getPublicHolidays(year, federalState).map((holiday) => holiday.date)),
    );
    return coveredDates.some((coveredDate) => holidayDates.has(coveredDate));
  } catch {
    return false;
  }
}

function entryTimeLabel(entry: CalendarEntry): string {
  if (entry.kind === "APPOINTMENT") {
    return entry.allDay ? "Ganztägig" : `${entry.startTime}–${entry.endTime}`;
  }
  if (entry.startTime === null) return SHIFT_TYPE_LABELS[entry.type];
  return `${entry.startTime}–${entry.endTime} · ${entry.breakMinutes} Min. Pause`;
}

function SecondaryAction({
  label,
  onPress,
}: {
  readonly label: string;
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 46,
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: palette.primary,
        borderRadius: 14,
        borderCurve: "continuous",
        backgroundColor: pressed ? palette.primarySoft : palette.surface,
        paddingHorizontal: 10,
      })}
    >
      <Text style={{ color: palette.primary, fontSize: 13, fontWeight: "900" }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function DayEditorScreen() {
  const params = useLocalSearchParams<{ date?: string; mode?: string }>();
  const { profile, templates, entries, upsertShift, upsertAppointment, removeEntry } = useMediShift();
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

  const initialMode: EditorMode =
    params.mode === "APPOINTMENT" ? "APPOINTMENT" : "SHIFT";
  const [mode, setMode] = useState<EditorMode>(initialMode);
  const [formVisible, setFormVisible] = useState(
    initialMode === "APPOINTMENT",
  );
  const [editing, setEditing] = useState<CalendarEntry | null>(null);
  const [shiftType, setShiftType] = useState<ShiftType>("CUSTOM");
  const [shiftTitle, setShiftTitle] = useState("Dienst");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("16:00");
  const [breakMinutes, setBreakMinutes] = useState("30");
  const [shiftColor, setShiftColor] = useState("#21A0A0");
  const [shiftSymbol, setShiftSymbol] = useState("D");
  const [shiftNote, setShiftNote] = useState("");
  const [overtimeMinutes, setOvertimeMinutes] = useState("0");
  const [holidayPremiumMode, setHolidayPremiumMode] = useState<"WITH_TIME_OFF" | "WITHOUT_TIME_OFF">("WITH_TIME_OFF");
  const [appointmentTitle, setAppointmentTitle] = useState("");
  const [allDay, setAllDay] = useState(true);
  const [appointmentStart, setAppointmentStart] = useState("10:00");
  const [appointmentEnd, setAppointmentEnd] = useState("11:00");
  const [appointmentColor, setAppointmentColor] = useState("#F2A93B");
  const [appointmentNote, setAppointmentNote] = useState("");
  const [showShiftOptions, setShowShiftOptions] = useState(false);
  const [showAppointmentOptions, setShowAppointmentOptions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const hasHolidayOverlap = useMemo(
    () => profile
      ? shiftOverlapsHoliday(date, startTime, endTime, profile.federalState)
      : false,
    [date, endTime, profile, startTime],
  );

  function haptic() {
    if (process.env.EXPO_OS === "ios") {
      void Haptics.selectionAsync();
    }
  }

  function resetEditor(nextMode: EditorMode = mode, revealForm = false) {
    setEditing(null);
    setMode(nextMode);
    setFormVisible(revealForm);
    setError(null);
    setShiftType("CUSTOM");
    setShiftTitle("Dienst");
    setStartTime("08:00");
    setEndTime("16:00");
    setBreakMinutes("30");
    setShiftColor("#21A0A0");
    setShiftSymbol("D");
    setShiftNote("");
    setOvertimeMinutes("0");
    setHolidayPremiumMode("WITH_TIME_OFF");
    setAppointmentTitle("");
    setAllDay(true);
    setAppointmentStart("10:00");
    setAppointmentEnd("11:00");
    setAppointmentColor("#F2A93B");
    setAppointmentNote("");
    setShowShiftOptions(false);
    setShowAppointmentOptions(false);
  }

  function editEntry(entry: CalendarEntry) {
    setEditing(entry);
    setFormVisible(true);
    setError(null);
    haptic();
    if (entry.kind === "SHIFT") {
      setShowShiftOptions(true);
      setMode("SHIFT");
      setShiftType(entry.type);
      setShiftTitle(entry.title);
      setStartTime(entry.startTime ?? "08:00");
      setEndTime(entry.endTime ?? "16:00");
      setBreakMinutes(String(entry.breakMinutes));
      setShiftColor(entry.color);
      setShiftSymbol(entry.symbol);
      setShiftNote(entry.note ?? "");
      setOvertimeMinutes(String(entry.overtimeMinutes));
      setHolidayPremiumMode(entry.holidayPremiumMode);
    } else {
      setShowAppointmentOptions(true);
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
      const candidate = {
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
        overtimeMinutes: Number(overtimeMinutes),
        holidayPremiumMode,
      } as const;
      const netMinutes = profile ? calculateTimedShiftMinutes(
        {
          date,
          startTime: candidate.startTime,
          endTime: candidate.endTime,
          breakMinutes: candidate.breakMinutes,
        },
        profile.timeZone,
      ) : 0;
      if (candidate.overtimeMinutes > netMinutes) {
        throw new Error("Überstunden dürfen die Nettoarbeitszeit des Dienstes nicht überschreiten.");
      }
      const saved = await upsertShift(candidate);
      if (profile) {
        const nextShifts = entries
          .filter((entry): entry is Extract<CalendarEntry, { kind: "SHIFT" }> => entry.kind === "SHIFT" && entry.id !== saved.id)
          .concat(saved);
        const result = calculateMonthlyCompliance(date.slice(0, 7), nextShifts, profile.timeZone);
        const critical = result.issues.find(
          (issue) => issue.severity === "critical" && issue.relatedShiftIds.includes(saved.id),
        );
        if (critical) {
          Alert.alert("ArbZG-Hinweis", critical.title, [
            { text: "Verstanden" },
            { text: "Zur Auswertung", onPress: () => router.push("/analysis") },
          ]);
        }
      }
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
      contentContainerStyle={{ gap: 20, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 48 }}
    >
      <Stack.Screen options={{ title: formatDateTitle(date) }} />

      {dayEntries.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text selectable style={{ color: palette.textMuted, fontSize: 12, fontWeight: "900", letterSpacing: 0.8 }}>
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
                boxShadow: palette.dark ? undefined : "0 2px 8px rgba(24,32,30,0.05)",
                padding: 10,
              }}
            >
              <View style={{ width: 8, alignSelf: "stretch", borderRadius: 4, backgroundColor: entry.color }} />
              <Pressable
                accessibilityLabel={`${entry.title} bearbeiten`}
                accessibilityRole="button"
                onPress={() => editEntry(entry)}
                style={{ minHeight: 44, flex: 1, justifyContent: "center", gap: 3 }}
              >
                <Text selectable style={{ color: palette.text, fontSize: 15, fontWeight: "800" }}>{entry.title}</Text>
                <Text selectable style={{ color: palette.textMuted, fontSize: 13, fontVariant: ["tabular-nums"] }}>
                  {entryTimeLabel(entry)}
                </Text>
              </Pressable>
              <Pressable
                accessibilityLabel={`${entry.title} löschen`}
                accessibilityRole="button"
                hitSlop={4}
                onPress={() => confirmDelete(entry)}
                style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ color: palette.danger, fontSize: 18, fontWeight: "900" }}>×</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {editing === null ? (
        <View style={{ gap: 12 }}>
          <Text selectable style={{ color: palette.textMuted, fontSize: 12, fontWeight: "900", letterSpacing: 0.8 }}>
            DIENST EINTRAGEN
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {templates.map((template) => (
              <Pressable
                key={template.id}
                accessibilityRole="button"
                disabled={saving}
                onPress={() => void quickAddTemplate(template.id)}
                style={({ pressed }) => ({
                  minHeight: 64,
                  minWidth: "47%",
                  flexGrow: 1,
                  flexBasis: 0,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  borderWidth: 1,
                  borderColor: palette.border,
                  borderRadius: 15,
                  borderCurve: "continuous",
                  backgroundColor: palette.surface,
                  opacity: pressed ? 0.75 : 1,
                  paddingHorizontal: 10,
                })}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 18,
                    backgroundColor: template.color,
                  }}
                >
                  <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "900" }}>
                    {template.symbol}
                  </Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text numberOfLines={1} style={{ color: palette.text, fontSize: 13, fontWeight: "900" }}>
                    {template.name}
                  </Text>
                  <Text
                    style={{
                      color: palette.textMuted,
                      fontSize: 10,
                      fontWeight: "700",
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {template.startTime}–{template.endTime}
                  </Text>
                </View>
              </Pressable>
            ))}
            {(["VACATION", "SICK", "FREE"] as const).map((type) => (
              <Pressable
                key={type}
                accessibilityRole="button"
                disabled={saving}
                onPress={() => void quickAddAbsence(type)}
                style={({ pressed }) => ({
                  minHeight: 44,
                  flexGrow: 1,
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

          {!formVisible ? (
            <View style={{ flexDirection: "row", gap: 8, paddingTop: 2 }}>
              <SecondaryAction
                label="+ Eigener Dienst"
                onPress={() => resetEditor("SHIFT", true)}
              />
              <SecondaryAction
                label="+ Termin"
                onPress={() => resetEditor("APPOINTMENT", true)}
              />
            </View>
          ) : null}
        </View>
      ) : (
        <Pressable accessibilityRole="button" onPress={() => resetEditor()} style={{ alignSelf: "flex-start", paddingVertical: 4 }}>
          <Text style={{ color: palette.primary, fontWeight: "800" }}>Bearbeitung abbrechen</Text>
        </Pressable>
      )}

      {formVisible ? (
        <View
          style={{
            flexDirection: "row",
            gap: 4,
            borderRadius: 14,
            borderCurve: "continuous",
            backgroundColor: palette.outsideMonth,
            boxShadow: palette.dark ? undefined : "inset 0 1px 2px rgba(24,32,30,0.06)",
            padding: 4,
          }}
        >
          <SegmentedButton
            label="Dienst"
            onPress={() => resetEditor("SHIFT", true)}
            selected={mode === "SHIFT"}
          />
          <SegmentedButton
            label="Termin"
            onPress={() => resetEditor("APPOINTMENT", true)}
            selected={mode === "APPOINTMENT"}
          />
        </View>
      ) : null}

      {formVisible && mode === "SHIFT" ? (
        <View
          style={{
            gap: 16,
            borderRadius: 22,
            borderCurve: "continuous",
            backgroundColor: palette.surface,
            boxShadow: palette.dark ? undefined : "0 4px 18px rgba(28,48,42,0.06)",
            padding: 18,
          }}
        >
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
          <AdvancedToggle
            expanded={showShiftOptions}
            onPress={() => setShowShiftOptions((value) => !value)}
          />
          {showShiftOptions ? (
            <>
              <Field label="Notiz (optional)" multiline onChangeText={setShiftNote} value={shiftNote} />
              {shiftIsTimed ? (
                <Field
                  keyboardType="number-pad"
                  label="Bestätigte Überstunden (Min.)"
                  onChangeText={setOvertimeMinutes}
                  value={overtimeMinutes}
                />
              ) : null}
              {shiftIsTimed && hasHolidayOverlap ? (
                <View
                  style={{
                    minHeight: 54,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderWidth: 1,
                    borderColor: palette.border,
                    borderRadius: 13,
                    paddingHorizontal: 14,
                  }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text selectable style={{ color: palette.text, fontWeight: "800" }}>Ohne Freizeitausgleich</Text>
                    <Text selectable style={{ color: palette.textMuted, fontSize: 11 }}>135 % statt 35 % Feiertagszuschlag</Text>
                  </View>
                  <Switch
                    value={holidayPremiumMode === "WITHOUT_TIME_OFF"}
                    onValueChange={(value) => setHolidayPremiumMode(value ? "WITHOUT_TIME_OFF" : "WITH_TIME_OFF")}
                  />
                </View>
              ) : null}
              <ColorPicker onChange={setShiftColor} value={shiftColor} />
            </>
          ) : null}
          <PrimaryButton disabled={saving} onPress={() => void saveShiftForm()}>
            {saving ? "Wird gespeichert …" : editing ? "Dienst aktualisieren" : "Dienst speichern"}
          </PrimaryButton>
        </View>
      ) : formVisible ? (
        <View
          style={{
            gap: 16,
            borderRadius: 22,
            borderCurve: "continuous",
            backgroundColor: palette.surface,
            boxShadow: palette.dark ? undefined : "0 4px 18px rgba(28,48,42,0.06)",
            padding: 18,
          }}
        >
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
          <AdvancedToggle
            expanded={showAppointmentOptions}
            onPress={() => setShowAppointmentOptions((value) => !value)}
          />
          {showAppointmentOptions ? (
            <>
              <Field label="Notiz (optional)" multiline onChangeText={setAppointmentNote} value={appointmentNote} />
              <ColorPicker onChange={setAppointmentColor} value={appointmentColor} />
            </>
          ) : null}
          <PrimaryButton disabled={saving} onPress={() => void saveAppointmentForm()}>
            {saving ? "Wird gespeichert …" : editing ? "Termin aktualisieren" : "Termin speichern"}
          </PrimaryButton>
        </View>
      ) : null}

      {error ? (
        <Text accessibilityRole="alert" selectable style={{ color: palette.danger, fontWeight: "700" }}>
          {error}
        </Text>
      ) : null}
    </ScrollView>
  );
}

function AdvancedToggle({
  expanded,
  onPress,
}: {
  readonly expanded: boolean;
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 42,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderTopWidth: 1,
        borderTopColor: palette.border,
        opacity: pressed ? 0.65 : 1,
        paddingTop: 10,
      })}
    >
      <Text style={{ color: palette.textMuted, fontSize: 13, fontWeight: "800" }}>
        Weitere Angaben
      </Text>
      <Text style={{ color: palette.textMuted, fontSize: 20 }}>
        {expanded ? "−" : "+"}
      </Text>
    </Pressable>
  );
}
