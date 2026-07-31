import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { useMediShiftTemplates } from "@/application/medishift-provider";
import {
  SHIFT_TYPE_LABELS,
  type TimedShiftType,
} from "@/domain/types";
import { usePalette } from "@/theme/palette";
import { SectionHeader, SurfaceCard } from "@/ui/design-system";
import { confirmDestructiveAction } from "@/ui/confirm-action";
import { ColorPicker, Field, PrimaryButton, TimePickerField } from "@/ui/form-controls";

const TEMPLATE_TYPES: readonly TimedShiftType[] = [
  "EARLY",
  "LATE",
  "NIGHT",
  "DAY",
  "TRAINING",
  "CUSTOM",
];

export function TemplateEditorScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const palette = usePalette();
  const { templates, upsertTemplate, removeTemplate } = useMediShiftTemplates();
  const existing = useMemo(() => templates.find((item) => item.id === id), [id, templates]);
  const [name, setName] = useState(existing?.name ?? "Neuer Dienst");
  const [type, setType] = useState<TimedShiftType>(existing?.type ?? "CUSTOM");
  const [startTime, setStartTime] = useState(existing?.startTime ?? "08:00");
  const [endTime, setEndTime] = useState(existing?.endTime ?? "16:00");
  const [breakMinutes, setBreakMinutes] = useState(String(existing?.breakMinutes ?? 30));
  const [color, setColor] = useState(existing?.color ?? "#21A0A0");
  const [symbol, setSymbol] = useState(existing?.symbol ?? "D");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
        startTime,
        endTime,
        breakMinutes: Number(breakMinutes),
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
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={{ gap: 18, padding: 18, paddingBottom: 36 }}
    >
      <Stack.Screen options={{ title: existing ? "Vorlage bearbeiten" : "Neue Vorlage" }} />

      <SurfaceCard style={{ gap: 14, padding: 16 }}>
        <Field label="Titel" maxLength={40} onChangeText={setName} value={name} />
        <Field
          autoCapitalize="characters"
          label="Symbol / Kürzel"
          maxLength={4}
          onChangeText={setSymbol}
          value={symbol}
        />
        <ColorPicker onChange={setColor} value={color} />
      </SurfaceCard>

      <View style={{ gap: 10 }}>
        <SectionHeader title="Dienstart" />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {TEMPLATE_TYPES.map((candidate) => {
              const selected = candidate === type;
              return (
                <Pressable
                  key={candidate}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setType(candidate)}
                  style={{
                    minHeight: 44,
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: selected ? palette.primary : palette.border,
                    borderRadius: 22,
                    backgroundColor: selected ? palette.primarySoft : palette.surface,
                    paddingHorizontal: 14,
                  }}
                >
                  <Text style={{ color: selected ? palette.primary : palette.text, fontWeight: "800" }}>
                    {SHIFT_TYPE_LABELS[candidate]}
                  </Text>
                </Pressable>
              );
            })}
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <SectionHeader title="Standardwerte" />
        <SurfaceCard style={{ gap: 14, padding: 16 }}>
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
        </SurfaceCard>
      </View>

      {error ? (
        <Text accessibilityRole="alert" selectable style={{ color: palette.danger, fontWeight: "700" }}>
          {error}
        </Text>
      ) : null}

      <PrimaryButton disabled={saving} onPress={() => void submit()}>
        {saving ? "Wird gespeichert …" : "Vorlage speichern"}
      </PrimaryButton>
      {existing ? (
        <PrimaryButton danger disabled={saving} onPress={confirmArchive}>
          Vorlage archivieren
        </PrimaryButton>
      ) : null}
    </ScrollView>
  );
}
