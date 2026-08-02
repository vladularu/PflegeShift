import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useMediShiftTemplates } from "@/application/medishift-provider";
import {
  SHIFT_TYPE_LABELS,
  type ShiftType,
} from "@/domain/types";
import { usePalette } from "@/theme/palette";
import { confirmDestructiveAction } from "@/ui/confirm-action";
import { ColorPicker, Field, TimePickerField } from "@/ui/form-controls";
import {
  DestructiveFormAction,
  FormScreen,
  FormSection,
  FormStatus,
  HeaderSaveAction,
} from "@/ui/form-layout";

const TEMPLATE_TYPES: readonly ShiftType[] = [
  "EARLY",
  "LATE",
  "NIGHT",
  "DAY",
  "TRAINING",
  "VACATION",
  "SICK",
  "FREE",
  "CUSTOM",
];

function isAbsenceType(type: ShiftType): boolean {
  return type === "VACATION" || type === "SICK" || type === "FREE";
}

export function TemplateEditorScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const palette = usePalette();
  const { templates, upsertTemplate, removeTemplate } = useMediShiftTemplates();
  const existing = useMemo(() => templates.find((item) => item.id === id), [id, templates]);
  const [name, setName] = useState(existing?.name ?? "Neuer Dienst");
  const [type, setType] = useState<ShiftType>(existing?.type ?? "CUSTOM");
  const [startTime, setStartTime] = useState(existing?.startTime ?? "08:00");
  const [endTime, setEndTime] = useState(existing?.endTime ?? "16:00");
  const [breakMinutes, setBreakMinutes] = useState(String(existing?.breakMinutes ?? 30));
  const [color, setColor] = useState(existing?.color ?? "#21A0A0");
  const [symbol, setSymbol] = useState(existing?.symbol ?? "D");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const absence = isAbsenceType(type);
  const typeLocked = existing !== undefined && isAbsenceType(existing.type);

  async function submit() {
    try {
      setSaving(true);
      setError(null);
      await upsertTemplate({
        ...(existing
          ? { id: existing.id, expectedRevision: existing.revision }
          : {}),
        name,
        type,
        startTime: absence ? null : startTime,
        endTime: absence ? null : endTime,
        breakMinutes: absence ? 0 : Number(breakMinutes),
        color,
        symbol,
        sortOrder:
          existing?.sortOrder ??
          Math.max(0, ...templates.map((template) => template.sortOrder)) + 10,
      });
      router.back();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Vorlage konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  function confirmArchive() {
    if (!existing) return;
    confirmDestructiveAction({
      title: "Vorlage archivieren?",
      message: `„${existing.name}“ wird aus der Schnellwahl entfernt. Bereits eingetragene Dienste bleiben bestehen.`,
      onConfirm: () => void removeTemplate(existing)
        .then(() => router.back())
        .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Archivieren fehlgeschlagen.")),
    });
  }

  return (
    <FormScreen>
      <Stack.Screen
        options={{
          title: existing ? "Vorlage bearbeiten" : "Neue Vorlage",
          headerRight: () => <HeaderSaveAction busy={saving} onPress={() => void submit()} />,
        }}
      />

      <FormSection title="Darstellung">
        <Field label="Titel" maxLength={40} onChangeText={setName} value={name} />
        <Field
          autoCapitalize="characters"
          label="Symbol / Kürzel"
          maxLength={4}
          onChangeText={setSymbol}
          value={symbol}
        />
        <ColorPicker onChange={setColor} value={color} />
      </FormSection>

      <FormSection title="Dienstart">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {TEMPLATE_TYPES.map((candidate) => {
            const selected = candidate === type;
            return (
              <Pressable
                key={candidate}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                disabled={typeLocked && candidate !== type}
                onPress={() => setType(candidate)}
                style={({ pressed }) => ({
                  minHeight: 44,
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: selected ? palette.primary : palette.border,
                  borderRadius: 22,
                  backgroundColor: selected ? palette.primarySoft : palette.surface,
                  opacity: typeLocked && candidate !== type ? 0.32 : pressed ? 0.68 : 1,
                  paddingHorizontal: 14,
                })}
              >
                <Text maxFontSizeMultiplier={1.35} style={{ color: selected ? palette.primary : palette.text, fontWeight: "800" }}>
                  {SHIFT_TYPE_LABELS[candidate]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </FormSection>

      {absence ? (
        <FormSection title="Berechnung">
          <Text style={{ color: palette.textSecondary, fontSize: 14, lineHeight: 20 }}>
            {type === "FREE"
              ? "Frei wird mit 0 Stunden geführt."
              : "Die Abwesenheit ergänzt vorhandene Arbeits- oder Fortbildungszeit höchstens bis zum Tages-Soll."}
          </Text>
        </FormSection>
      ) : (
        <FormSection title="Standardwerte">
          <View style={{ flexDirection: "row", gap: 12 }}>
            <TimePickerField label="Start" onChange={setStartTime} value={startTime} />
            <TimePickerField label="Ende" onChange={setEndTime} value={endTime} />
          </View>
          <Field
            keyboardType="number-pad"
            label="Pause in Minuten"
            onChangeText={setBreakMinutes}
            value={breakMinutes}
          />
        </FormSection>
      )}

      <FormStatus error={error} />
      {existing ? (
        <DestructiveFormAction
          disabled={saving}
          label="Vorlage archivieren"
          onPress={confirmArchive}
        />
      ) : null}
    </FormScreen>
  );
}
