import type { PropsWithChildren, ReactNode } from "react";
import { Pressable, Text, View, type ViewStyle } from "react-native";

import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import {
  accessibleChipBackgroundColor,
  chipTextColor,
} from "@/theme/color-contrast";

export function SurfaceCard({
  children,
  style,
  accessibilityLabel,
}: PropsWithChildren<{
  readonly style?: ViewStyle;
  readonly accessibilityLabel?: string;
}>) {
  const palette = usePalette();
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={{
        overflow: "hidden",
        borderWidth: palette.dark ? 0 : 1,
        borderColor: palette.separator,
        borderRadius: 18,
        borderCurve: "continuous",
        backgroundColor: palette.surface,
        ...style,
      }}
    >
      {children}
    </View>
  );
}

export function SectionHeader({
  title,
  caption,
  action,
}: {
  readonly title: string;
  readonly caption?: string;
  readonly action?: ReactNode;
}) {
  const palette = usePalette();
  return (
    <View style={{ minHeight: 26, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} selectable style={{ color: palette.textSecondary, ...TYPOGRAPHY.sectionTitle }}>
          {title}
        </Text>
        {caption ? (
          <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} selectable style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}>
            {caption}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

export function MetricCard({
  label,
  value,
  accent,
  compact = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly accent?: string;
  readonly compact?: boolean;
}) {
  const palette = usePalette();
  return (
    <View
      accessibilityLabel={`${label}: ${value}`}
      accessible
      style={{
        minHeight: compact ? 74 : 88,
        flex: 1,
        justifyContent: "space-between",
        gap: 8,
        borderWidth: palette.dark ? 0 : 1,
        borderColor: palette.separator,
        borderRadius: 16,
        borderCurve: "continuous",
        backgroundColor: palette.surface,
        padding: compact ? 12 : 14,
      }}
    >
      <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} selectable style={{ color: palette.textMuted, ...TYPOGRAPHY.label }}>
        {label}
      </Text>
      <Text
        selectable
        adjustsFontSizeToFit
        numberOfLines={1}
        style={{
          color: accent ?? palette.text,
          ...TYPOGRAPHY.value,
          fontSize: compact ? 19 : 22,
          fontVariant: ["tabular-nums"],
          letterSpacing: -0.4,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export function RowButton({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  destructive = false,
  disabled = false,
  onLongPress,
  delayLongPress,
  accessibilityHint,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  readonly onPress?: () => void;
  readonly destructive?: boolean;
  readonly disabled?: boolean;
  readonly onLongPress?: () => void;
  readonly delayLongPress?: number;
  readonly accessibilityHint?: string;
}) {
  const palette = usePalette();
  const content = (
    <>
      {leading}
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          selectable
          numberOfLines={1}
          style={{
            color: destructive ? palette.danger : palette.text,
            ...TYPOGRAPHY.bodyStrong,
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} selectable numberOfLines={2} style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ?? (onPress ? <Text style={{ color: palette.textMuted, fontSize: 22 }}>›</Text> : null)}
    </>
  );

  if (!onPress && !onLongPress) {
    return (
      <View style={{ minHeight: 58, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
      delayLongPress={delayLongPress}
      disabled={disabled}
      onLongPress={onLongPress}
      onPress={onPress ?? (() => undefined)}
      style={({ pressed }) => ({
        minHeight: 54,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: pressed ? palette.surfaceMuted : "transparent",
        opacity: disabled ? 0.45 : 1,
        paddingHorizontal: 16,
        paddingVertical: 8,
      })}
    >
      {content}
    </Pressable>
  );
}

export function CardSeparator({ inset = 16 }: { readonly inset?: number }) {
  const palette = usePalette();
  return <View style={{ height: 1, backgroundColor: palette.separator, marginLeft: inset }} />;
}

export function EmptyState({
  title,
  message,
  action,
}: {
  readonly title: string;
  readonly message: string;
  readonly action?: ReactNode;
}) {
  const palette = usePalette();
  return (
    <View accessibilityLabel={`${title}. ${message}`} accessible style={{ minHeight: 180, alignItems: "center", justifyContent: "center", gap: 8, padding: 24 }}>
      <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: palette.primarySoft }} />
      <Text accessibilityElementsHidden maxFontSizeMultiplier={TEXT_MAX_SCALE} selectable style={{ color: palette.text, textAlign: "center", ...TYPOGRAPHY.sectionTitle }}>
        {title}
      </Text>
      <Text accessibilityElementsHidden maxFontSizeMultiplier={TEXT_MAX_SCALE} selectable style={{ maxWidth: 290, color: palette.textMuted, textAlign: "center", ...TYPOGRAPHY.body }}>
        {message}
      </Text>
      {action}
    </View>
  );
}

export function InlineNotice({
  message,
  tone = "info",
}: {
  readonly message: string;
  readonly tone?: "info" | "error" | "warning";
}) {
  const palette = usePalette();
  const accent = tone === "error"
    ? palette.danger
    : tone === "warning"
      ? palette.warning
      : palette.primary;
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole={tone === "error" ? "alert" : undefined}
      style={{
        minHeight: 44,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        borderWidth: 1,
        borderColor: `${accent}52`,
        borderRadius: 14,
        borderCurve: "continuous",
        backgroundColor: `${accent}14`,
        paddingHorizontal: 13,
        paddingVertical: 9,
      }}
    >
      <View accessibilityElementsHidden style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: accent }} />
      <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} selectable style={{ minWidth: 0, flex: 1, color: accent, ...TYPOGRAPHY.label }}>
        {message}
      </Text>
    </View>
  );
}

export function SegmentedControl({
  items,
  value,
  onChange,
}: {
  readonly items: readonly { readonly value: string; readonly label: string }[];
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const palette = usePalette();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        gap: 4,
        borderRadius: 13,
        borderCurve: "continuous",
        backgroundColor: palette.surfaceMuted,
        padding: 4,
      }}
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <Pressable
            key={item.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(item.value)}
            style={({ pressed }) => ({
              minHeight: 44,
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 10,
              borderCurve: "continuous",
              backgroundColor: selected ? palette.surfaceRaised : "transparent",
              boxShadow: selected && !palette.dark ? `0 2px 8px ${palette.shadow}` : undefined,
              opacity: pressed ? 0.72 : 1,
            })}
          >
            <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} style={{ color: selected ? palette.primary : palette.textSecondary, ...TYPOGRAPHY.label, fontWeight: "800" }}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function HeaderAction({
  label,
  onPress,
  emphasis = false,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly emphasis?: boolean;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        minWidth: 44,
        minHeight: 44,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 22,
        backgroundColor: emphasis ? palette.primary : palette.surfaceMuted,
        opacity: pressed ? 0.68 : 1,
        paddingHorizontal: label.length > 2 ? 12 : 0,
      })}
    >
      <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} style={{ color: emphasis ? palette.onPrimary : palette.primary, ...TYPOGRAPHY.label, fontSize: label === "+" ? 26 : TYPOGRAPHY.label.fontSize, fontWeight: "800" }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ColorBadge({
  color,
  label,
  size = 42,
}: {
  readonly color: string;
  readonly label: string;
  readonly size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: size / 2,
        backgroundColor: accessibleChipBackgroundColor(color),
      }}
    >
      <Text adjustsFontSizeToFit maxFontSizeMultiplier={1.35} numberOfLines={1} style={{ maxWidth: size - 10, color: chipTextColor, fontSize: size * 0.34, fontWeight: "900" }}>
        {label}
      </Text>
    </View>
  );
}
