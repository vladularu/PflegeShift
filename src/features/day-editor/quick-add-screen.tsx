import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";

import {
  usePflegeShiftEntries,
  usePflegeShiftStatus,
  usePflegeShiftTemplates,
} from "@/application/pflegeshift-provider";
import type { ShiftTemplate } from "@/domain/types";
import { userFacingErrorMessage } from "@/domain/errors";
import { formatDateTitle, today } from "@/engine/calendar";
import { parseLocalDateRouteParam, type RouteParam } from "@/navigation/route-params";
import { dayEditorRoute } from "@/navigation/routes";
import { APPOINTMENT_COLOR, usePalette } from "@/theme/palette";
import {
  CardSeparator,
  ColorBadge,
  RowButton,
  SectionHeader,
  SurfaceCard,
} from "@/ui/design-system";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { successFeedback, warningFeedback } from "@/ui/haptics";

function templateSubtitle(template: ShiftTemplate): string {
  if (template.type === "FREE") return "Keine Arbeitszeit";
  if (template.startTime === null || template.endTime === null) {
    return "Wird bis zum Tages-Soll angerechnet";
  }
  return `${template.startTime}–${template.endTime} · ${template.breakMinutes} Min. Pause`;
}

export function QuickAddScreen() {
  const palette = usePalette();
  const params = useLocalSearchParams<{ date?: RouteParam }>();
  const { templates } = usePflegeShiftTemplates();
  const { upsertShift } = usePflegeShiftEntries();
  const { error: loadError, ready, reload } = usePflegeShiftStatus();
  const parsedDate = parseLocalDateRouteParam(params.date);
  const date = parsedDate.status === "valid" ? parsedDate.value : today();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (parsedDate.status !== "valid") {
    return (
      <LoadFailureView
        actionLabel="Schließen"
        message="Der Link zur Schnellauswahl enthält kein gültiges Datum."
        onRetry={() => router.back()}
        title="Schnellauswahl kann nicht geöffnet werden"
      />
    );
  }
  if (ready && loadError) {
    return <LoadFailureView message={loadError} onRetry={() => void reload()} />;
  }
  if (!ready) return <LoadingView />;

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
      successFeedback();
      router.back();
    } catch (saveError) {
      warningFeedback();
      setError(userFacingErrorMessage(saveError, "Vorlage konnte nicht gespeichert werden."));
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
          onPress={() => router.replace(dayEditorRoute(date, "SHIFT"))}
          subtitle="Zeiten und Dienstart festlegen"
          title="Dienst"
        />
        <CardSeparator inset={70} />
        <RowButton
          leading={<ColorBadge color={APPOINTMENT_COLOR} label="T" />}
          onPress={() => router.replace(dayEditorRoute(date, "APPOINTMENT"))}
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
              subtitle={templateSubtitle(template)}
              title={template.name}
            />
          </View>
        ))}
      </SurfaceCard>
      {error ? (
        <Text accessibilityRole="alert" style={{ color: palette.danger, fontWeight: "700" }}>
          {error}
        </Text>
      ) : null}
    </ScrollView>
  );
}
