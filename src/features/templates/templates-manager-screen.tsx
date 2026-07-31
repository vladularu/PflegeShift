import { router, Stack } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import {
  useMediShiftStatus,
  useMediShiftTemplates,
} from "@/application/medishift-provider";
import type { ShiftTemplate } from "@/domain/types";
import { usePalette } from "@/theme/palette";
import { CardSeparator, ColorBadge, EmptyState, RowButton, SectionHeader, SurfaceCard } from "@/ui/design-system";
import { confirmDestructiveAction } from "@/ui/confirm-action";
import { LoadingView } from "@/ui/loading-view";

export function TemplatesManagerScreen() {
  const palette = usePalette();
  const { ready } = useMediShiftStatus();
  const { templates, removeTemplate, moveTemplate } = useMediShiftTemplates();
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);

  if (!ready) return <LoadingView />;

  function confirmDelete(template: ShiftTemplate) {
    confirmDestructiveAction({
      title: "Vorlage löschen?",
      message: `„${template.name}“ wird aus der Schnellauswahl entfernt. Bestehende Dienste bleiben unverändert.`,
      onConfirm: () => void removeTemplate(template),
    });
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={{ gap: 14, padding: 16, paddingBottom: 36 }}
    >
      <Stack.Screen options={{ title: "Dienstvorlagen" }} />
      <SectionHeader title="Dienstvorlagen" caption="Reihenfolge und Inhalte der Schnellauswahl" />
      <SurfaceCard>
        {templates.length === 0 ? (
          <EmptyState title="Keine Vorlagen" message="Lege häufige Dienste einmal an und stemple sie danach direkt in den Kalender." />
        ) : templates.map((template, index) => (
          <View key={template.id}>
            {index > 0 ? <CardSeparator inset={70} /> : null}
            <RowButton
              leading={<ColorBadge color={template.color} label={template.symbol} />}
              subtitle={`${template.startTime}–${template.endTime} · ${template.breakMinutes} Min. Pause`}
              title={template.name}
              trailing={(
                <Pressable
                  accessibilityLabel={`${template.name} verwalten`}
                  accessibilityRole="button"
                  onPress={() => setActiveTemplateId((current) => current === template.id ? null : template.id)}
                  style={({ pressed }) => ({ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.55 : 1 })}
                >
                  <Text style={{ color: palette.textSecondary, fontSize: 20, fontWeight: "900" }}>•••</Text>
                </Pressable>
              )}
            />
            {activeTemplateId === template.id ? (
              <View style={{ flexDirection: "row", gap: 7, borderTopWidth: 1, borderTopColor: palette.separator, backgroundColor: palette.surfaceMuted, padding: 8 }}>
                <ManagerButton disabled={index === 0} label="↑" onPress={() => void moveTemplate(template, -1)} />
                <ManagerButton disabled={index === templates.length - 1} label="↓" onPress={() => void moveTemplate(template, 1)} />
                <ManagerButton label="Bearbeiten" onPress={() => router.push({ pathname: "/template-editor", params: { id: template.id } })} />
                <ManagerButton danger label="Löschen" onPress={() => confirmDelete(template)} />
              </View>
            ) : null}
          </View>
        ))}
      </SurfaceCard>
      <Pressable
        accessibilityLabel="Neue Dienstvorlage erstellen"
        accessibilityRole="button"
        onPress={() => router.push("/template-editor")}
        style={({ pressed }) => ({
          minHeight: 54,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 9,
          borderRadius: 18,
          borderCurve: "continuous",
          backgroundColor: palette.primary,
          opacity: pressed ? 0.68 : 1,
          paddingHorizontal: 18,
        })}
      >
        <Text style={{ color: palette.onPrimary, fontSize: 25, fontWeight: "700", lineHeight: 27 }}>
          +
        </Text>
        <Text style={{ color: palette.onPrimary, fontSize: 15, fontWeight: "900" }}>
          Vorlage hinzufügen
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function ManagerButton({
  label,
  disabled = false,
  danger = false,
  onPress,
}: {
  readonly label: string;
  readonly disabled?: boolean;
  readonly danger?: boolean;
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 12,
        backgroundColor: palette.surfaceRaised,
        opacity: disabled ? 0.3 : pressed ? 0.6 : 1,
        paddingHorizontal: 8,
      })}
    >
      <Text numberOfLines={1} style={{ color: danger ? palette.danger : palette.primary, fontSize: 12, fontWeight: "900" }}>
        {label}
      </Text>
    </Pressable>
  );
}
