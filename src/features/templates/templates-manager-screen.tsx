import Ionicons from "@expo/vector-icons/Ionicons";
import { router, Stack } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import {
  useMediShiftStatus,
  useMediShiftTemplates,
} from "@/application/medishift-provider";
import type { ShiftTemplate } from "@/domain/types";
import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { CONTROL_HEIGHT, RADII, SPACING } from "@/theme/tokens";
import { CardSeparator, ColorBadge, EmptyState, RowButton, SectionHeader, SurfaceCard } from "@/ui/design-system";
import { confirmDestructiveAction } from "@/ui/confirm-action";
import { LoadingView } from "@/ui/loading-view";

function templateSubtitle(template: ShiftTemplate): string {
  if (template.type === "FREE") return "Keine Arbeitszeit";
  if (template.startTime === null || template.endTime === null) {
    return "Ergänzt bis zum Tages-Soll";
  }
  return `${template.startTime}–${template.endTime} · ${template.breakMinutes} Min. Pause`;
}

export function TemplatesManagerScreen() {
  const palette = usePalette();
  const { ready } = useMediShiftStatus();
  const { templates, removeTemplate, moveTemplate } = useMediShiftTemplates();
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);

  if (!ready) return <LoadingView />;

  function confirmDelete(template: ShiftTemplate) {
    confirmDestructiveAction({
      title: "Vorlage löschen?",
      message: `„${template.name}“ wird aus der Schnellauswahl entfernt. Bestehende Einträge behalten die zuletzt verknüpfte Darstellung.`,
      onConfirm: () => void removeTemplate(template),
    });
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: palette.groupedBackground }}
      contentContainerStyle={{ gap: SPACING.lg, padding: SPACING.lg, paddingBottom: 36 }}
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
              subtitle={templateSubtitle(template)}
              title={template.name}
              trailing={(
                <Pressable
                  accessibilityLabel={`${template.name} verwalten`}
                  accessibilityRole="button"
                  onPress={() => setActiveTemplateId((current) => current === template.id ? null : template.id)}
                  style={({ pressed }) => ({ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.55 : 1 })}
                >
                  <Ionicons accessibilityElementsHidden color={palette.textSecondary} name="ellipsis-horizontal" size={20} />
                </Pressable>
              )}
            />
            {activeTemplateId === template.id ? (
              <View style={{ flexDirection: "row", gap: SPACING.xs, borderTopWidth: 1, borderTopColor: palette.separator, backgroundColor: palette.surfaceMuted, padding: SPACING.sm }}>
                <ManagerButton disabled={index === 0} icon="arrow-up" label="Nach oben" onPress={() => void moveTemplate(template, -1)} />
                <ManagerButton disabled={index === templates.length - 1} icon="arrow-down" label="Nach unten" onPress={() => void moveTemplate(template, 1)} />
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
          minHeight: CONTROL_HEIGHT.large,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: SPACING.sm,
          borderRadius: RADII.control,
          borderCurve: "continuous",
          backgroundColor: palette.primary,
          opacity: pressed ? 0.68 : 1,
          paddingHorizontal: SPACING.lg,
        })}
      >
        <Ionicons accessibilityElementsHidden color={palette.onPrimary} name="add" size={20} />
        <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} style={{ color: palette.onPrimary, ...TYPOGRAPHY.button }}>
          Vorlage hinzufügen
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function ManagerButton({
  label,
  icon,
  disabled = false,
  danger = false,
  onPress,
}: {
  readonly label: string;
  readonly icon?: "arrow-up" | "arrow-down";
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
        borderRadius: RADII.control,
        backgroundColor: palette.surfaceRaised,
        opacity: disabled ? 0.3 : pressed ? 0.6 : 1,
        paddingHorizontal: 8,
      })}
    >
      {icon ? (
        <Ionicons accessibilityLabel={label} color={palette.primary} name={icon} size={17} />
      ) : (
        <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} numberOfLines={1} style={{ color: danger ? palette.danger : palette.primary, ...TYPOGRAPHY.caption, fontWeight: "600" }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}
