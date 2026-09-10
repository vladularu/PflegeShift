import Ionicons from "@expo/vector-icons/Ionicons";
import { memo, useEffect, useRef } from "react";
import { findNodeHandle, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { SlideInDown, SlideOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type {
  QuickEntryAction,
  QuickEntryStampAction,
} from "@/features/calendar/quick-entry-actions";
import {
  ShiftTemplateAddRow,
  ShiftTemplateListCard,
  ShiftTemplateListRow,
  ShiftTemplateListSeparator,
  shiftTemplateSubtitle,
} from "@/features/templates/shift-template-list";
import { usePalette } from "@/theme/palette";
import { MOTION } from "@/theme/motion";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { SCREEN_LAYOUT, SPACING } from "@/theme/tokens";
import { scheduleAccessibilityFocus } from "@/ui/accessibility-focus";
import { InlineNotice } from "@/ui/design-system";

function longDate(date: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

export const ShiftSelectionPanel = memo(function ShiftSelectionPanel({
  actions,
  animateEntry = true,
  inNativeSheet = false,
  busy,
  date,
  onAddTemplate,
  onClose,
  onEditTemplate,
  onSelectAction,
}: {
  readonly actions: readonly QuickEntryAction[];
  readonly animateEntry?: boolean;
  readonly inNativeSheet?: boolean;
  readonly busy: boolean;
  readonly date: string;
  readonly onAddTemplate: () => void;
  readonly onClose: () => void;
  readonly onEditTemplate: (templateId: string) => void;
  readonly onSelectAction: (action: QuickEntryStampAction, date: string) => void;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const headingRef = useRef<View>(null);
  const templateActions = actions.filter(
    (action): action is QuickEntryStampAction => action.kind === "TEMPLATE",
  );

  useEffect(() => {
    scheduleAccessibilityFocus(findNodeHandle(headingRef.current));
  }, []);

  return (
    <Animated.View
      accessibilityLabel={`Schicht für ${longDate(date)} auswählen`}
      accessibilityViewIsModal
      entering={
        animateEntry
          ? SlideInDown.duration(MOTION.duration.deliberate).reduceMotion(MOTION.reduceMotion)
          : undefined
      }
      exiting={
        animateEntry
          ? SlideOutDown.duration(MOTION.duration.fast).reduceMotion(MOTION.reduceMotion)
          : undefined
      }
      style={[
        styles.screen,
        {
          backgroundColor: palette.background,
          paddingTop: inNativeSheet ? SPACING.lg : insets.top,
        },
      ]}
      testID="shift-selection-panel"
    >
      <View style={[styles.navigationBar, { backgroundColor: palette.background }]}>
        <Pressable
          accessibilityLabel="Schichtauswahl schließen"
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onClose}
          style={({ pressed }) => [
            styles.closeButton,
            { backgroundColor: palette.surface, opacity: pressed ? 0.58 : 1 },
          ]}
        >
          <Ionicons accessibilityElementsHidden color={palette.text} name="close" size={22} />
        </Pressable>
        <View
          ref={headingRef}
          accessible
          accessibilityLabel={`Schicht auswählen für ${longDate(date)}, Überschrift`}
          accessibilityRole="header"
          style={styles.navigationTitleWrap}
        >
          <Text
            dynamicTypeRamp="headline"
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            style={[styles.navigationTitle, { color: palette.text }]}
          >
            Schicht auswählen
          </Text>
          <Text
            dynamicTypeRamp="caption1"
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            style={[styles.navigationDate, { color: palette.textMuted }]}
          >
            {longDate(date)}
          </Text>
        </View>
        <View accessibilityElementsHidden style={styles.navigationPlaceholder} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, SPACING.xxl) + SPACING.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            style={[styles.sectionHeading, { color: palette.text }]}
          >
            Meine Dienste
          </Text>
          <ShiftTemplateListCard>
            {templateActions.length > 0 ? (
              templateActions.map((action, index) => (
                <View key={action.key}>
                  {index > 0 ? <ShiftTemplateListSeparator /> : null}
                  <ShiftTemplateListRow
                    accessibilityLabel={`${action.label} direkt eintragen`}
                    color={action.color}
                    disabled={busy}
                    moreAccessibilityLabel={`${action.label} Dienstvorlage bearbeiten`}
                    onMorePress={() => onEditTemplate(action.template.id)}
                    onPress={() => onSelectAction(action, date)}
                    subtitle={shiftTemplateSubtitle(action.template)}
                    symbol={action.symbol}
                    title={action.label}
                  />
                </View>
              ))
            ) : (
              <View style={styles.emptyTemplates}>
                <Text
                  maxFontSizeMultiplier={TEXT_MAX_SCALE}
                  style={[styles.emptyTemplatesText, { color: palette.textMuted }]}
                >
                  Noch keine Dienstvorlagen vorhanden.
                </Text>
              </View>
            )}
            {templateActions.length > 0 ? <ShiftTemplateListSeparator /> : null}
            <ShiftTemplateAddRow
              accessibilityLabel="Neue Schichtvorlage hinzufügen"
              disabled={busy}
              onPress={onAddTemplate}
            />
          </ShiftTemplateListCard>
        </View>
      </ScrollView>
    </Animated.View>
  );
});

export function ShiftSelectionErrorNotice({ message }: { readonly message: string }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.errorNotice,
        { bottom: Math.max(insets.bottom, SCREEN_LAYOUT.contentTopPadding) },
      ]}
    >
      <InlineNotice message={message} tone="error" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 10_002,
    elevation: 26,
  },
  navigationBar: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
  },
  navigationTitleWrap: {
    minWidth: 0,
    flex: 1,
    alignItems: "center",
    gap: SPACING.xxs,
    paddingHorizontal: SPACING.sm,
  },
  navigationTitle: {
    ...TYPOGRAPHY.screenTitle,
    textAlign: "center",
  },
  navigationDate: {
    ...TYPOGRAPHY.footnote,
    textAlign: "center",
  },
  navigationPlaceholder: {
    width: 44,
    height: 44,
  },
  content: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    paddingHorizontal: SCREEN_LAYOUT.horizontalPadding,
    paddingTop: SCREEN_LAYOUT.contentTopPadding,
  },
  section: {
    gap: SPACING.md,
  },
  sectionHeading: {
    ...TYPOGRAPHY.sectionTitle,
    paddingHorizontal: SPACING.sm,
  },
  emptyTemplates: {
    minHeight: 74,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
  },
  emptyTemplatesText: {
    ...TYPOGRAPHY.body,
    textAlign: "center",
  },
  errorNotice: {
    position: "absolute",
    right: SCREEN_LAYOUT.horizontalPadding,
    left: SCREEN_LAYOUT.horizontalPadding,
    zIndex: 10_003,
  },
});
