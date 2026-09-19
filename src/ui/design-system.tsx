import Ionicons from "@expo/vector-icons/Ionicons";
import type { PropsWithChildren, ReactNode } from "react";
import {
  Pressable,
  Text,
  View,
  type PressableStateCallbackType,
  type ViewStyle,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { usePalette } from "@/theme/palette";
import { MOTION } from "@/theme/motion";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { CONTROL_HEIGHT, RADII, SPACING } from "@/theme/tokens";
import { accessibleChipBackgroundColor, chipTextColor } from "@/theme/color-contrast";
import { AnimatedPressable, usePressMotion } from "@/ui/press-motion";
import { ShiftSymbol } from "@/ui/shift-symbol";

export function SurfaceCard({
  children,
  style,
  accessibilityLabel,
  testID,
}: PropsWithChildren<{
  readonly style?: ViewStyle;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}>) {
  const palette = usePalette();
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={{
        overflow: "hidden",
        borderWidth: 1,
        borderColor: palette.separator,
        borderRadius: RADII.card,
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
    <View
      style={{
        minHeight: 26,
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: SPACING.md,
      }}
    >
      <View style={{ flex: 1, gap: SPACING.xxs }}>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          selectable
          style={{ color: palette.textSecondary, ...TYPOGRAPHY.sectionTitle }}
        >
          {title}
        </Text>
        {caption ? (
          <Text
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            selectable
            style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
          >
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
        minHeight: compact ? 72 : 82,
        flex: 1,
        justifyContent: "space-between",
        gap: SPACING.sm,
        borderWidth: 1,
        borderColor: palette.separator,
        borderRadius: RADII.card,
        borderCurve: "continuous",
        backgroundColor: palette.surface,
        padding: compact ? SPACING.md : SPACING.lg,
      }}
    >
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        selectable
        style={{ color: palette.textMuted, ...TYPOGRAPHY.label }}
      >
        {label}
      </Text>
      <Text
        selectable
        style={{
          color: accent ?? palette.text,
          ...TYPOGRAPHY.value,
          fontSize: compact ? 18 : TYPOGRAPHY.value.fontSize,
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
  const pressMotion = usePressMotion();
  const content = (
    <>
      {leading}
      <View style={{ flex: 1, gap: SPACING.xxs }}>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          selectable
          style={{
            color: destructive ? palette.danger : palette.text,
            ...TYPOGRAPHY.bodyStrong,
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            selectable
            style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ??
        (onPress ? (
          <Ionicons
            accessibilityElementsHidden
            color={palette.textMuted}
            name="chevron-forward"
            size={18}
          />
        ) : null)}
    </>
  );

  if (!onPress && !onLongPress) {
    return (
      <View
        style={{
          minHeight: 56,
          flexDirection: "row",
          alignItems: "center",
          gap: SPACING.md,
          paddingHorizontal: SPACING.lg,
          paddingVertical: SPACING.sm,
        }}
      >
        {content}
      </View>
    );
  }

  return (
    <Animated.View style={[{ minHeight: 56 }, pressMotion.animatedStyle]}>
      <Pressable
        accessibilityHint={accessibilityHint}
        accessibilityRole="button"
        delayLongPress={delayLongPress}
        disabled={disabled}
        onPressIn={pressMotion.onPressIn}
        onPressOut={pressMotion.onPressOut}
        onLongPress={onLongPress}
        onPress={onPress ?? (() => undefined)}
        style={({ pressed }) => ({
          minHeight: 56,
          flexDirection: "row",
          alignItems: "center",
          gap: SPACING.md,
          backgroundColor: pressed ? palette.surfaceMuted : "transparent",
          opacity: disabled ? 0.45 : 1,
          paddingHorizontal: SPACING.lg,
          paddingVertical: SPACING.sm,
        })}
      >
        {content}
      </Pressable>
    </Animated.View>
  );
}

export function CardSeparator({ inset = SPACING.lg }: { readonly inset?: number }) {
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
    <View
      accessibilityLabel={`${title}. ${message}`}
      accessible
      style={{
        minHeight: 180,
        alignItems: "center",
        justifyContent: "center",
        gap: SPACING.sm,
        padding: SPACING.xxl,
      }}
    >
      <View
        accessibilityElementsHidden
        style={{
          width: 44,
          height: 44,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: RADII.control,
          backgroundColor: palette.primarySoft,
        }}
      >
        <Ionicons color={palette.primary} name="calendar-clear-outline" size={21} />
      </View>
      <Text
        accessibilityElementsHidden
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        selectable
        style={{ color: palette.text, textAlign: "center", ...TYPOGRAPHY.sectionTitle }}
      >
        {title}
      </Text>
      <Text
        accessibilityElementsHidden
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        selectable
        style={{ maxWidth: 290, color: palette.textMuted, textAlign: "center", ...TYPOGRAPHY.body }}
      >
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
  const accent =
    tone === "error" ? palette.danger : tone === "warning" ? palette.warning : palette.info;
  return (
    <View
      accessible
      accessibilityLiveRegion="polite"
      accessibilityRole={tone === "error" ? "alert" : undefined}
      style={{
        minHeight: 44,
        flexDirection: "row",
        alignItems: "center",
        gap: SPACING.sm,
        borderWidth: 1,
        borderColor: `${accent}52`,
        borderRadius: RADII.control,
        borderCurve: "continuous",
        backgroundColor: `${accent}14`,
        paddingHorizontal: SPACING.md,
        paddingVertical: 10,
      }}
    >
      <Ionicons
        accessibilityElementsHidden
        color={accent}
        name={
          tone === "error"
            ? "alert-circle-outline"
            : tone === "warning"
              ? "warning-outline"
              : "information-circle-outline"
        }
        size={18}
      />
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        selectable
        style={{ minWidth: 0, flex: 1, color: accent, ...TYPOGRAPHY.label }}
      >
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
        gap: SPACING.xxs,
        borderRadius: RADII.control,
        borderCurve: "continuous",
        backgroundColor: palette.surfaceMuted,
        padding: SPACING.xxs,
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
              minHeight: CONTROL_HEIGHT.compact,
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: selected ? 1 : 0,
              borderColor: palette.border,
              borderRadius: RADII.small,
              borderCurve: "continuous",
              backgroundColor: "transparent",
              opacity: pressed ? 0.72 : 1,
            })}
          >
            {selected ? (
              <Animated.View
                entering={FadeIn.duration(MOTION.duration.fast).reduceMotion(MOTION.reduceMotion)}
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  bottom: 0,
                  left: 0,
                  borderRadius: RADII.small,
                  backgroundColor: palette.surfaceRaised,
                }}
              />
            ) : null}
            <Text
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
              style={{
                color: selected ? palette.primary : palette.textSecondary,
                ...TYPOGRAPHY.label,
                zIndex: 1,
              }}
            >
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
  const pressMotion = usePressMotion();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={8}
      onPressIn={pressMotion.onPressIn}
      onPressOut={pressMotion.onPressOut}
      style={({ pressed }: PressableStateCallbackType) => [
        {
          minWidth: 44,
          minHeight: 44,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: label === "+" ? RADII.pill : RADII.control,
          backgroundColor: emphasis ? palette.accent : palette.surfaceMuted,
          opacity: pressed ? 0.72 : 1,
          paddingHorizontal: label.length > 2 ? 12 : 0,
        },
        pressMotion.animatedStyle,
      ]}
    >
      {label === "+" ? (
        <Ionicons
          accessibilityElementsHidden
          color={emphasis ? palette.onAccent : palette.primary}
          name="add"
          size={22}
        />
      ) : (
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{ color: emphasis ? palette.onAccent : palette.primary, ...TYPOGRAPHY.label }}
        >
          {label}
        </Text>
      )}
    </AnimatedPressable>
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
      <ShiftSymbol color={chipTextColor} size={size * 0.48} value={label} />
    </View>
  );
}
