import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { useMediShift } from "@/application/medishift-provider";
import {
  SHIFT_TYPE_LABELS,
  type TimedShiftType,
} from "@/domain/types";
import { usePalette } from "@/theme/palette";
import { ColorPicker, Field, PrimaryButton } from "@/ui/form-controls";

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
  const { templates, upsertTemplate } = useMediShift();
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

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={{ gap: 18, padding: 18, paddingBottom: 36 }}
    >
      <Stack.Screen options={{ title: existing ? "Vorlage bearbeiten" : "Neue Vorlage" }} />

      <Field label="Name" maxLength={40} onChangeText={setName} value={name} />

      <View style={{ gap: 8 }}>
        <Text selectable style={{ color: palette.textMuted, fontSize: 12, fontWeight: "700" }}>
          Dienstart
        </Text>
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
                  borderWidth: 1,
                  borderColor: selected ? palette.primary : palette.border,
                  borderRadius: 999,
                  backgroundColor: selected ? palette.primarySoft : palette.surface,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                }}
              >
                <Text style={{ color: selected ? palette.primary : palette.text, fontWeight: "700" }}>
                  {SHIFT_TYPE_LABELS[candidate]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Field
            autoCapitalize="none"
            label="Beginn (HH:MM)"
            maxLength={5}
            onChangeText={setStartTime}
            value={startTime}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            autoCapitalize="none"
            label="Ende (HH:MM)"
            maxLength={5}
            onChangeText={setEndTime}
            value={endTime}
          />
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Field
            keyboardType="number-pad"
            label="Pause in Minuten"
            onChangeText={setBreakMinutes}
            value={breakMinutes}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            autoCapitalize="characters"
            label="Kürzel"
            maxLength={4}
            onChangeText={setSymbol}
            value={symbol}
          />
        </View>
      </View>

      <ColorPicker onChange={setColor} value={color} />

      {error ? (
        <Text accessibilityRole="alert" selectable style={{ color: palette.danger, fontWeight: "700" }}>
          {error}
        </Text>
      ) : null}

      <PrimaryButton disabled={saving} onPress={() => void submit()}>
        {saving ? "Wird gespeichert …" : "Vorlage speichern"}
      </PrimaryButton>
    </ScrollView>
  );
}
