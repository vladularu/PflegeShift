import Ionicons from "@expo/vector-icons/Ionicons";
import { memo, useEffect, useRef } from "react";
import { findNodeHandle, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { SlideInDown, SlideOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type {
  QuickEntryAction,
  QuickEntryStampAction,
} from "@/features/calendar/quick-entry-actions";
import { accessibleChipBackgroundColor, chipTextColor } from "@/theme/color-contrast";
import { usePalette } from "@/theme/palette";
import { MOTION } from "@/theme/motion";
import { COMPACT_TEXT_MAX_SCALE, TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { RADII, SPACING } from "@/theme/tokens";
import { scheduleAccessibilityFocus } from "@/ui/accessibility-focus";

function longDate(date: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function templateSubtitle(action: QuickEntryStampAction): string {
  const { template } = action;
  const parts = [
    template.allDay || template.startTime === null || template.endTime === null
      ? "Ganztägig"
      : `${template.startTime}–${template.endTime}`,
  ];
  if (template.breakMinutes > 0) parts.push(`${template.breakMinutes} Min. Pause`);
  if (template.location?.name) parts.push(template.location.name);
  return parts.join(" · ");
}

export const ShiftSelectionPanel = memo(function ShiftSelectionPanel({
  actions,
  animateEntry = true,
  busy,
  date,
  onAddTemplate,
  onClose,
  onEditTemplate,
  onSelectAction,
}: {
  readonly actions: readonly QuickEntryAction[];
  readonly animateEntry?: boolean;
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
      exiting={SlideOutDown.duration(MOTION.duration.fast).reduceMotion(MOTION.reduceMotion)}
      style={[
        styles.screen,
        {
          backgroundColor: palette.background,
          paddingTop: insets.top,
        },
      ]}
      testID="shift-selection-panel"
    >
      <View style={[styles.navigationBar, { backgroundColor: palette.background }]}>
        <Pressable
          accessibilityLabel="Schichtauswahl schließen"
          accessibilityRole="button"
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
          accessibilityLabel="Schicht auswählen, Überschrift"
          accessibilityRole="header"
          style={styles.navigationTitleWrap}
        >
          <Text
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            numberOfLines={1}
            style={[styles.navigationTitle, { color: palette.text }]}
          >
            Schicht
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
          <View
            style={[
              styles.card,
              { borderColor: palette.separator, backgroundColor: palette.surface },
            ]}
          >
            {templateActions.length > 0 ? (
              templateActions.map((action) => (
                <View key={action.key}>
                  <View style={[styles.serviceRow, { opacity: busy ? 0.45 : 1 }]}>
                    <Pressable
                      accessibilityLabel={`${action.label} direkt eintragen`}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: busy }}
                      disabled={busy}
                      onPress={() => onSelectAction(action, date)}
                      style={({ pressed }) => [
                        styles.serviceSelect,
                        { backgroundColor: pressed ? palette.surfaceMuted : "transparent" },
                      ]}
                    >
                      <View
                        style={[
                          styles.serviceBadge,
                          { backgroundColor: accessibleChipBackgroundColor(action.color) },
                        ]}
                      >
                        <Text
                          maxFontSizeMultiplier={COMPACT_TEXT_MAX_SCALE}
                          numberOfLines={1}
                          style={styles.serviceBadgeText}
                        >
                          {action.symbol}
                        </Text>
                      </View>
                      <View style={styles.rowCopy}>
                        <Text
                          maxFontSizeMultiplier={TEXT_MAX_SCALE}
                          numberOfLines={1}
                          style={[styles.serviceTitle, { color: palette.text }]}
                        >
                          {action.label}
                        </Text>
                        <Text
                          maxFontSizeMultiplier={TEXT_MAX_SCALE}
                          numberOfLines={1}
                          style={[styles.serviceSubtitle, { color: palette.textMuted }]}
                        >
                          {templateSubtitle(action)}
                        </Text>
                      </View>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={`${action.label} Dienstvorlage bearbeiten`}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: busy }}
                      disabled={busy}
                      hitSlop={4}
                      onPress={() => onEditTemplate(action.template.id)}
                      style={({ pressed }) => [styles.moreButton, { opacity: pressed ? 0.58 : 1 }]}
                    >
                      <View style={[styles.moreCircle, { borderColor: palette.textMuted }]}>
                        <Ionicons
                          accessibilityElementsHidden
                          color={palette.textMuted}
                          name="ellipsis-horizontal"
                          size={13}
                        />
                      </View>
                    </Pressable>
                  </View>
                  <View style={[styles.serviceSeparator, { backgroundColor: palette.separator }]} />
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
            <Pressable
              accessibilityLabel="Neue Schichtvorlage hinzufügen"
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={onAddTemplate}
              style={({ pressed }) => [
                styles.addTemplateRow,
                {
                  backgroundColor: pressed ? palette.surfaceMuted : "transparent",
                  opacity: busy ? 0.45 : 1,
                },
              ]}
            >
              <View style={[styles.addTemplateBadge, { backgroundColor: palette.textSecondary }]}>
                <Ionicons
                  accessibilityElementsHidden
                  color={palette.background}
                  name="add"
                  size={22}
                />
              </View>
              <Text
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                style={[styles.addTemplateText, { color: palette.textSecondary }]}
              >
                Schicht hinzufügen
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </Animated.View>
  );
});

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
    minHeight: 60,
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
    paddingHorizontal: SPACING.sm,
  },
  navigationTitle: {
    ...TYPOGRAPHY.sectionTitle,
    fontSize: 21,
    lineHeight: 27,
    letterSpacing: -0.3,
  },
  navigationPlaceholder: {
    width: 44,
    height: 44,
  },
  content: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  section: {
    gap: SPACING.md,
  },
  sectionHeading: {
    ...TYPOGRAPHY.sectionTitle,
    paddingHorizontal: SPACING.sm,
    fontSize: 17,
    lineHeight: 22,
  },
  card: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADII.large,
    borderCurve: "continuous",
  },
  serviceRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: SPACING.lg,
    paddingRight: SPACING.sm,
  },
  serviceSelect: {
    minWidth: 0,
    minHeight: 72,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    borderRadius: RADII.control,
    paddingVertical: SPACING.sm,
  },
  serviceBadge: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
  },
  serviceBadgeText: {
    maxWidth: 28,
    color: chipTextColor,
    fontSize: 14,
    fontWeight: "700",
  },
  rowCopy: {
    minWidth: 0,
    flex: 1,
    gap: 2,
  },
  serviceTitle: {
    ...TYPOGRAPHY.body,
    fontWeight: "600",
  },
  serviceSubtitle: {
    ...TYPOGRAPHY.caption,
    fontVariant: ["tabular-nums"],
  },
  moreButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  moreCircle: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderRadius: 11,
  },
  serviceSeparator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 66,
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
  addTemplateRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  addTemplateBadge: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
  },
  addTemplateText: {
    ...TYPOGRAPHY.body,
    fontWeight: "500",
  },
});
