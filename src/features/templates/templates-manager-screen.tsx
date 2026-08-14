import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";

import { usePflegeShiftStatus, usePflegeShiftTemplates } from "@/application/pflegeshift-provider";
import type { ShiftTemplate } from "@/domain/types";
import { userFacingErrorMessage } from "@/domain/errors";
import { usePalette } from "@/theme/palette";
import { templateEditorRoute } from "@/navigation/routes";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { CONTROL_HEIGHT, RADII, SPACING } from "@/theme/tokens";
import {
  CardSeparator,
  ColorBadge,
  EmptyState,
  RowButton,
  SectionHeader,
  SurfaceCard,
} from "@/ui/design-system";
import { confirmDestructiveAction } from "@/ui/confirm-action";
import { useFeedback } from "@/ui/feedback";
import { FormStatus } from "@/ui/form-layout";
import { selectionFeedback, successFeedback, warningFeedback } from "@/ui/haptics";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { TabRootHeader } from "@/ui/tab-root-header";
import { useThemeStatusBar } from "@/ui/use-theme-status-bar";

function templateSubtitle(template: ShiftTemplate): string {
  if (template.type === "FREE") return "Keine Arbeitszeit";
  if (template.startTime === null || template.endTime === null) {
    return "Ergänzt bis zum Tages-Soll";
  }
  return `${template.startTime}–${template.endTime} · ${template.breakMinutes} Min. Pause`;
}

export function TemplatesManagerScreen() {
  const palette = usePalette();
  useThemeStatusBar();
  const { showFeedback } = useFeedback();
  const { fontScale } = useWindowDimensions();
  const stackActions = fontScale >= 1.6;
  const { error: loadError, ready, reload } = usePflegeShiftStatus();
  const { templates, removeTemplate, restoreTemplate, moveTemplate } = usePflegeShiftTemplates();
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [busyTemplateId, setBusyTemplateId] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);

  if (ready && loadError) {
    return <LoadFailureView message={loadError} onRetry={() => void reload()} />;
  }
  if (!ready) return <LoadingView />;

  async function runTemplateAction(
    template: ShiftTemplate,
    fallback: string,
    action: () => Promise<void>,
  ) {
    try {
      setBusyTemplateId(template.id);
      setOperationError(null);
      await action();
      setActiveTemplateId(null);
    } catch (error) {
      setOperationError(userFacingErrorMessage(error, fallback));
    } finally {
      setBusyTemplateId(null);
    }
  }

  function confirmDelete(template: ShiftTemplate) {
    confirmDestructiveAction({
      title: "Vorlage löschen?",
      message: `„${template.name}“ wird aus der Schnellauswahl entfernt. Bestehende Einträge behalten die zuletzt verknüpfte Darstellung.`,
      onConfirm: () =>
        void runTemplateAction(template, "Vorlage konnte nicht gelöscht werden.", async () => {
          await removeTemplate(template);
          selectionFeedback();
          showFeedback({
            message: "Vorlage gelöscht.",
            actionLabel: "Rückgängig",
            onAction: async () => {
              try {
                await restoreTemplate(template);
                successFeedback();
                showFeedback({ message: "Vorlage wiederhergestellt.", duration: 2200 });
              } catch (restoreError) {
                warningFeedback();
                showFeedback({
                  message: userFacingErrorMessage(
                    restoreError,
                    "Vorlage konnte nicht wiederhergestellt werden.",
                  ),
                });
              }
            },
          });
        }),
    });
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.groupedBackground }}>
      <TabRootHeader title="Schichten" />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ flex: 1, backgroundColor: palette.groupedBackground }}
        contentContainerStyle={{ gap: SPACING.lg, padding: SPACING.lg, paddingBottom: 36 }}
      >
        <FormStatus error={operationError} />
        <SectionHeader title="Meine Schichten" />
        <SurfaceCard>
          {templates.length === 0 ? (
            <EmptyState
              title="Keine Vorlagen"
              message="Lege häufige Dienste einmal an und stemple sie danach direkt in den Kalender."
            />
          ) : (
            templates.map((template, index) => (
              <View key={template.id}>
                {index > 0 ? <CardSeparator inset={70} /> : null}
                <RowButton
                  leading={<ColorBadge color={template.color} label={template.symbol} />}
                  onPress={() => router.push(templateEditorRoute(template.id))}
                  subtitle={templateSubtitle(template)}
                  title={template.name}
                  trailing={
                    <Pressable
                      accessibilityLabel={`${template.name} verwalten`}
                      accessibilityRole="button"
                      disabled={busyTemplateId !== null}
                      onPress={(event) => {
                        event.stopPropagation();
                        setActiveTemplateId((current) =>
                          current === template.id ? null : template.id,
                        );
                      }}
                      style={({ pressed }) => ({
                        minWidth: 44,
                        minHeight: 44,
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: pressed ? 0.55 : 1,
                      })}
                    >
                      <Ionicons
                        accessibilityElementsHidden
                        color={palette.textSecondary}
                        name="ellipsis-horizontal"
                        size={20}
                      />
                    </Pressable>
                  }
                />
                {activeTemplateId === template.id ? (
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: stackActions ? "wrap" : "nowrap",
                      gap: SPACING.xs,
                      borderTopWidth: 1,
                      borderTopColor: palette.separator,
                      backgroundColor: palette.surfaceMuted,
                      padding: SPACING.sm,
                    }}
                  >
                    <ManagerButton
                      disabled={busyTemplateId !== null || index === 0}
                      icon="arrow-up"
                      label="Nach oben"
                      onPress={() =>
                        void runTemplateAction(
                          template,
                          "Vorlage konnte nicht verschoben werden.",
                          () => moveTemplate(template, -1),
                        )
                      }
                    />
                    <ManagerButton
                      disabled={busyTemplateId !== null || index === templates.length - 1}
                      icon="arrow-down"
                      label="Nach unten"
                      onPress={() =>
                        void runTemplateAction(
                          template,
                          "Vorlage konnte nicht verschoben werden.",
                          () => moveTemplate(template, 1),
                        )
                      }
                    />
                    <ManagerButton
                      danger
                      disabled={busyTemplateId !== null}
                      label="Löschen"
                      onPress={() => confirmDelete(template)}
                    />
                  </View>
                ) : null}
              </View>
            ))
          )}
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
          <Text
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            style={{ color: palette.onPrimary, ...TYPOGRAPHY.button }}
          >
            Vorlage hinzufügen
          </Text>
        </Pressable>
      </ScrollView>
    </View>
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
  const { fontScale } = useWindowDimensions();
  const wrapped = fontScale >= 1.6;
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        flex: wrapped ? undefined : 1,
        flexBasis: wrapped ? "47%" : undefined,
        flexGrow: 1,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: RADII.control,
        backgroundColor: palette.surfaceRaised,
        opacity: disabled ? 0.3 : pressed ? 0.6 : 1,
        paddingHorizontal: 8,
      })}
    >
      {icon ? (
        <Ionicons accessibilityElementsHidden color={palette.primary} name={icon} size={17} />
      ) : (
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{
            color: danger ? palette.danger : palette.primary,
            ...TYPOGRAPHY.caption,
            fontWeight: "600",
            textAlign: "center",
          }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
