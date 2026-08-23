import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";

import { usePflegeShiftStatus, usePflegeShiftTemplates } from "@/application/pflegeshift-provider";
import type { ShiftTemplate } from "@/domain/types";
import { userFacingErrorMessage } from "@/domain/errors";
import {
  ShiftTemplateAddRow,
  ShiftTemplateListCard,
  ShiftTemplateListRow,
  ShiftTemplateListSeparator,
  shiftTemplateSubtitle,
} from "@/features/templates/shift-template-list";
import { usePalette } from "@/theme/palette";
import { templateEditorRoute } from "@/navigation/routes";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { RADII, SPACING } from "@/theme/tokens";
import { EmptyState } from "@/ui/design-system";
import { confirmDestructiveAction } from "@/ui/confirm-action";
import { FormStatus } from "@/ui/form-layout";
import { selectionFeedback } from "@/ui/haptics";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { ScreenScrollView } from "@/ui/screen-layout";
import { TabRootHeader } from "@/ui/tab-root-header";
import { useThemeStatusBar } from "@/ui/use-theme-status-bar";

export function TemplatesManagerScreen() {
  const palette = usePalette();
  useThemeStatusBar();
  const { fontScale } = useWindowDimensions();
  const stackActions = fontScale >= 1.6;
  const { error: loadError, ready, reload } = usePflegeShiftStatus();
  const { templates, removeTemplate, moveTemplate } = usePflegeShiftTemplates();
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
        }),
    });
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.groupedBackground }}>
      <TabRootHeader surface="groupedBackground" title="Schichten" />
      <ScreenScrollView
        contentContainerStyle={{ width: "100%", maxWidth: 560, alignSelf: "center" }}
        surface="groupedBackground"
        testID="templates-manager-scroll"
      >
        <FormStatus error={operationError} />
        <View style={{ gap: SPACING.md }}>
          <Text
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            style={{
              color: palette.text,
              ...TYPOGRAPHY.sectionTitle,
              paddingHorizontal: SPACING.sm,
            }}
          >
            Meine Dienste
          </Text>
          <ShiftTemplateListCard testID="template-manager-list">
            {templates.length === 0 ? (
              <EmptyState
                title="Keine Vorlagen"
                message="Lege häufige Dienste einmal an und stemple sie danach direkt in den Kalender."
              />
            ) : (
              templates.map((template, index) => {
                const subtitle = shiftTemplateSubtitle(template);
                return (
                  <View key={template.id}>
                    {index > 0 ? <ShiftTemplateListSeparator /> : null}
                    <ShiftTemplateListRow
                      accessibilityLabel={`${template.name}, ${subtitle}, Vorlage bearbeiten`}
                      color={template.color}
                      disabled={busyTemplateId !== null}
                      moreAccessibilityLabel={`${template.name} verwalten`}
                      onMorePress={() =>
                        setActiveTemplateId((current) =>
                          current === template.id ? null : template.id,
                        )
                      }
                      onPress={() => router.push(templateEditorRoute(template.id))}
                      subtitle={subtitle}
                      symbol={template.symbol}
                      testID={`template-manager-row-${template.id}`}
                      title={template.name}
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
                );
              })
            )}
            {templates.length > 0 ? <ShiftTemplateListSeparator /> : null}
            <ShiftTemplateAddRow
              accessibilityLabel="Neue Dienstvorlage erstellen"
              onPress={() => router.push("/template-editor")}
              testID="template-manager-add-row"
            />
          </ShiftTemplateListCard>
        </View>
      </ScreenScrollView>
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
