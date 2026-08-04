import type { PropsWithChildren, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
  type ScrollViewProps,
} from "react-native";

import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { CONTROL_HEIGHT, RADII, SPACING } from "@/theme/tokens";
import { SectionHeader, SurfaceCard } from "@/ui/design-system";

export function FormScreen({
  children,
  bottomPadding = 40,
  testID,
}: PropsWithChildren<{
  readonly bottomPadding?: number;
  readonly testID?: string;
}>) {
  const palette = usePalette();
  const keyboardDismissMode: ScrollViewProps["keyboardDismissMode"] =
    process.env.EXPO_OS === "ios" ? "interactive" : "on-drag";

  return (
    <ScrollView
      automaticallyAdjustKeyboardInsets
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        gap: SPACING.xl,
        paddingHorizontal: SPACING.lg,
        paddingTop: SPACING.md,
        paddingBottom: bottomPadding,
      }}
      keyboardDismissMode={keyboardDismissMode}
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: palette.background }}
      testID={testID}
    >
      {children}
    </ScrollView>
  );
}

export function FormSection({
  title,
  caption,
  children,
  action,
}: PropsWithChildren<{
  readonly title?: string;
  readonly caption?: string;
  readonly action?: ReactNode;
}>) {
  return (
    <View style={{ gap: SPACING.sm }}>
      {title ? <SectionHeader action={action} caption={caption} title={title} /> : null}
      <SurfaceCard style={{ gap: SPACING.md, padding: SPACING.lg }}>{children}</SurfaceCard>
    </View>
  );
}

export function HeaderSaveAction({
  busy,
  onPress,
  label = "Sichern",
  closes = true,
}: {
  readonly busy: boolean;
  readonly onPress: () => void;
  readonly label?: string;
  readonly closes?: boolean;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityLabel={
        busy ? "Änderungen werden gespeichert" : closes ? `${label} und schließen` : label
      }
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => ({
        minWidth: 58,
        minHeight: 44,
        alignItems: "flex-end",
        justifyContent: "center",
        opacity: busy ? 0.55 : pressed ? 0.65 : 1,
        paddingHorizontal: 4,
      })}
    >
      {busy ? (
        <ActivityIndicator accessibilityElementsHidden color={palette.primary} size="small" />
      ) : (
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{ color: palette.primary, ...TYPOGRAPHY.button }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function FormStatus({
  error,
  message,
}: {
  readonly error?: string | null;
  readonly message?: string | null;
}) {
  const palette = usePalette();
  const content = error ?? message;
  if (!content) return null;
  return (
    <View
      accessible
      accessibilityLiveRegion="polite"
      accessibilityRole={error ? "alert" : undefined}
      style={{
        minHeight: CONTROL_HEIGHT.regular,
        justifyContent: "center",
        borderWidth: 1,
        borderColor: error ? palette.danger : palette.success,
        borderRadius: RADII.control,
        borderCurve: "continuous",
        backgroundColor: error ? `${palette.danger}14` : `${palette.success}14`,
        paddingHorizontal: SPACING.md,
        paddingVertical: 10,
      }}
    >
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        selectable
        style={{ color: error ? palette.danger : palette.success, ...TYPOGRAPHY.label }}
      >
        {content}
      </Text>
    </View>
  );
}

export function DestructiveFormAction({
  label,
  disabled = false,
  onPress,
}: {
  readonly label: string;
  readonly disabled?: boolean;
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: CONTROL_HEIGHT.regular,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: `${palette.danger}70`,
        borderRadius: RADII.control,
        borderCurve: "continuous",
        backgroundColor: pressed ? `${palette.danger}16` : "transparent",
        opacity: disabled ? 0.45 : 1,
      })}
    >
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        style={{ color: palette.danger, ...TYPOGRAPHY.button }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
