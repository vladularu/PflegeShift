import * as Haptics from "expo-haptics";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";

import {
  useMediShiftEntries,
  useMediShiftTemplates,
} from "@/application/medishift-provider";
import { SHIFT_TYPE_LABELS } from "@/domain/types";
import { formatDateTitle, today } from "@/engine/calendar";
import { SHIFT_TYPE_COLORS, usePalette } from "@/theme/palette";
import { CardSeparator, ColorBadge, RowButton, SectionHeader, SurfaceCard } from "@/ui/design-system";

const ABSENCES = ["VACATION", "SICK", "FREE"] as const;

export function QuickAddScreen() {
  const palette = usePalette();
  const params = useLocalSearchParams<{ date?: string }>();
  const { templates } = useMediShiftTemplates();
  const { upsertShift } = useMediShiftEntries();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") ? params.date! : today();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function saveAbsence(type: (typeof ABSENCES)[number]) {
    try {
      setSaving(true);
      setError(null);
      await upsertShift({
        date,
        title: SHIFT_TYPE_LABELS[type],
        type,
        color: SHIFT_TYPE_COLORS[type],
        symbol: type === "VACATION" ? "U" : type === "SICK" ? "K" : "–",
      });
      if (process.env.EXPO_OS === "ios") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Eintrag konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  async function saveTemplate(id: string) {
    const template = templates.find((item) => item.id === id);
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
      if (process.env.EXPO_OS === "ios") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Vorlage konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={{ gap: 12, padding: 16, paddingBottom: 32 }}
    >
      <Stack.Screen options={{ title: formatDateTitle(date) }} />
      <SectionHeader title="Eintrag" />
      <SurfaceCard>
        <RowButton
          leading={<ColorBadge color={palette.primary} label="D" />}
          onPress={() => router.replace({ pathname: "/day-editor", params: { date, mode: "SHIFT" } })}
          subtitle="Zeiten und Dienstart festlegen"
          title="Dienst"
        />
        <CardSeparator inset={70} />
        <RowButton
          leading={<ColorBadge color="#2F80ED" label="T" />}
          onPress={() => router.replace({ pathname: "/day-editor", params: { date, mode: "APPOINTMENT" } })}
          subtitle="Privater oder beruflicher Termin"
          title="Termin"
        />
      </SurfaceCard>

      <SectionHeader title="Schnellauswahl" caption="Mit einem Tipp direkt speichern" />
      <SurfaceCard>
        {templates.map((template, index) => (
          <View key={template.id}>
            {index > 0 ? <CardSeparator inset={70} /> : null}
            <RowButton
              disabled={saving}
              leading={<ColorBadge color={template.color} label={template.symbol} />}
              onPress={() => void saveTemplate(template.id)}
              subtitle={`${template.startTime}–${template.endTime} · ${template.breakMinutes} Min. Pause`}
              title={template.name}
            />
          </View>
        ))}
        {templates.length > 0 ? <CardSeparator inset={70} /> : null}
        {ABSENCES.map((type, index) => (
          <View key={type}>
            {index > 0 ? <CardSeparator inset={70} /> : null}
            <RowButton
              disabled={saving}
              leading={<ColorBadge color={SHIFT_TYPE_COLORS[type]} label={type === "VACATION" ? "U" : type === "SICK" ? "K" : "–"} />}
              onPress={() => void saveAbsence(type)}
              title={SHIFT_TYPE_LABELS[type]}
            />
          </View>
        ))}
      </SurfaceCard>
      {error ? <Text accessibilityRole="alert" style={{ color: palette.danger, fontWeight: "700" }}>{error}</Text> : null}
    </ScrollView>
  );
}
