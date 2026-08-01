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
      contentContainerStyle={{ gap: 16, paddingHorizontal: 16, paddingTop: 12, paddingBottom: bottomPadding }}
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
    <View style={{ gap: 8 }}>
      {title ? <SectionHeader action={action} caption={caption} title={title} /> : null}
      <SurfaceCard style={{ gap: 12, padding: 14 }}>
        {children}
      </SurfaceCard>
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
      accessibilityLabel={busy ? "Änderungen werden gespeichert" : closes ? `${label} und schließen` : label}
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
        <Text maxFontSizeMultiplier={1.35} style={{ color: palette.primary, fontSize: 15, fontWeight: "800" }}>
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
      accessibilityLiveRegion="polite"
      accessibilityRole={error ? "alert" : undefined}
      style={{
        minHeight: 46,
        justifyContent: "center",
        borderWidth: 1,
        borderColor: error ? palette.danger : palette.success,
        borderRadius: 14,
        borderCurve: "continuous",
        backgroundColor: error ? `${palette.danger}14` : `${palette.success}14`,
        paddingHorizontal: 14,
        paddingVertical: 10,
      }}
    >
      <Text selectable style={{ color: error ? palette.danger : palette.success, fontSize: 13, fontWeight: "700", lineHeight: 18 }}>
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
        minHeight: 50,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: `${palette.danger}70`,
        borderRadius: 14,
        borderCurve: "continuous",
        backgroundColor: pressed ? `${palette.danger}16` : "transparent",
        opacity: disabled ? 0.45 : 1,
      })}
    >
      <Text maxFontSizeMultiplier={1.35} style={{ color: palette.danger, fontSize: 14, fontWeight: "800" }}>
        {label}
      </Text>
    </Pressable>
  );
}
