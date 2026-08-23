import Ionicons from "@expo/vector-icons/Ionicons";
import type { PropsWithChildren } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { ShiftTemplate } from "@/domain/types";
import { accessibleChipBackgroundColor, chipTextColor } from "@/theme/color-contrast";
import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { RADII, SPACING } from "@/theme/tokens";
import { ShiftSymbol } from "@/ui/shift-symbol";

export function shiftTemplateSubtitle(template: ShiftTemplate): string {
  const parts = [
    template.allDay
      ? "Ganztägig"
      : template.type === "FREE"
        ? "Keine Arbeitszeit"
        : template.startTime === null || template.endTime === null
          ? "Ergänzt bis zum Tages-Soll"
          : `${template.startTime}–${template.endTime}`,
  ];
  if (!template.allDay && template.breakMinutes > 0) {
    parts.push(`${template.breakMinutes} Min. Pause`);
  }
  if (template.location?.name) parts.push(template.location.name);
  return parts.join(" · ");
}

export function ShiftTemplateListCard({
  children,
  testID,
}: PropsWithChildren<{ readonly testID?: string }>) {
  const palette = usePalette();
  return (
    <View
      style={[styles.card, { borderColor: palette.separator, backgroundColor: palette.surface }]}
      testID={testID}
    >
      {children}
    </View>
  );
}

export function ShiftTemplateListRow({
  accessibilityLabel,
  color,
  disabled = false,
  moreAccessibilityLabel,
  onMorePress,
  onPress,
  subtitle,
  symbol,
  testID,
  title,
}: {
  readonly accessibilityLabel: string;
  readonly color: string;
  readonly disabled?: boolean;
  readonly moreAccessibilityLabel: string;
  readonly onMorePress: () => void;
  readonly onPress: () => void;
  readonly subtitle: string;
  readonly symbol: string;
  readonly testID?: string;
  readonly title: string;
}) {
  const palette = usePalette();
  return (
    <View style={[styles.row, { opacity: disabled ? 0.45 : 1 }]} testID={testID}>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.select,
          { backgroundColor: pressed ? palette.surfaceMuted : "transparent" },
        ]}
      >
        <View
          style={[styles.badge, { backgroundColor: accessibleChipBackgroundColor(color) }]}
          testID={testID ? `${testID}-badge` : undefined}
        >
          <ShiftSymbol color={chipTextColor} size={18} value={symbol} />
        </View>
        <View style={styles.copy}>
          <Text
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            numberOfLines={1}
            style={[styles.title, { color: palette.text }]}
          >
            {title}
          </Text>
          <Text
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            numberOfLines={1}
            style={[styles.subtitle, { color: palette.textMuted }]}
          >
            {subtitle}
          </Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityLabel={moreAccessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        hitSlop={4}
        onPress={onMorePress}
        style={({ pressed }) => [styles.moreButton, { opacity: pressed ? 0.58 : 1 }]}
      >
        <View
          style={[styles.moreCircle, { borderColor: palette.textMuted }]}
          testID={testID ? `${testID}-more-circle` : undefined}
        >
          <Ionicons
            accessibilityElementsHidden
            color={palette.textMuted}
            name="ellipsis-horizontal"
            size={13}
          />
        </View>
      </Pressable>
    </View>
  );
}

export function ShiftTemplateListSeparator() {
  const palette = usePalette();
  return <View style={[styles.separator, { backgroundColor: palette.separator }]} />;
}

export function ShiftTemplateAddRow({
  accessibilityLabel,
  disabled = false,
  label = "Schicht hinzufügen",
  onPress,
  testID,
}: {
  readonly accessibilityLabel: string;
  readonly disabled?: boolean;
  readonly label?: string;
  readonly onPress: () => void;
  readonly testID?: string;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.addRow,
        {
          backgroundColor: pressed ? palette.surfaceMuted : "transparent",
          opacity: disabled ? 0.45 : 1,
        },
      ]}
      testID={testID}
    >
      <View style={[styles.addBadge, { backgroundColor: palette.textSecondary }]}>
        <Ionicons accessibilityElementsHidden color={palette.background} name="add" size={22} />
      </View>
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        style={[styles.addText, { color: palette.textSecondary }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADII.large,
    borderCurve: "continuous",
  },
  row: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: SPACING.lg,
    paddingRight: SPACING.sm,
  },
  select: {
    minWidth: 0,
    minHeight: 72,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    borderRadius: RADII.control,
    paddingVertical: SPACING.sm,
  },
  badge: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADII.pill,
  },
  copy: {
    minWidth: 0,
    flex: 1,
    gap: 2,
  },
  title: {
    ...TYPOGRAPHY.body,
    fontWeight: "600",
  },
  subtitle: {
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
    borderRadius: RADII.pill,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 66,
  },
  addRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  addBadge: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADII.pill,
  },
  addText: {
    ...TYPOGRAPHY.body,
    fontWeight: "500",
  },
});
