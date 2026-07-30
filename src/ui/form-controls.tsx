import type { PropsWithChildren } from "react";
import {
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";

import { SHIFT_COLORS, usePalette } from "@/theme/palette";

export function Field({
  label,
  ...props
}: TextInputProps & { readonly label: string }) {
  const palette = usePalette();
  return (
    <View style={{ gap: 7 }}>
      <Text selectable style={{ color: palette.textMuted, fontSize: 12, fontWeight: "700" }}>
        {label}
      </Text>
      <TextInput
        {...props}
        placeholderTextColor={palette.textMuted}
        style={[
          {
            minHeight: props.multiline ? 88 : 46,
            borderWidth: 1,
            borderColor: palette.border,
            borderRadius: 13,
            borderCurve: "continuous",
            backgroundColor: palette.surfaceRaised,
            color: palette.text,
            paddingHorizontal: 14,
            paddingVertical: 11,
            fontSize: 16,
          },
          props.style,
        ]}
      />
    </View>
  );
}

export function PrimaryButton({
  children,
  onPress,
  disabled = false,
  danger = false,
}: PropsWithChildren<{
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly danger?: boolean;
}>) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 14,
        borderCurve: "continuous",
        backgroundColor: danger ? palette.danger : palette.primary,
        opacity: disabled ? 0.45 : pressed ? 0.78 : 1,
        paddingHorizontal: 16,
      })}
    >
      <Text style={{ color: palette.dark && !danger ? "#10221D" : "#FFFFFF", fontSize: 15, fontWeight: "800" }}>
        {children}
      </Text>
    </Pressable>
  );
}

export function SegmentedButton({
  label,
  selected,
  onPress,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 42,
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 12,
        borderCurve: "continuous",
        backgroundColor: selected ? palette.primary : "transparent",
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <Text style={{ color: selected ? (palette.dark ? "#10221D" : "#FFFFFF") : palette.text, fontWeight: "800" }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ColorPicker({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const palette = usePalette();
  return (
    <View style={{ gap: 8 }}>
      <Text selectable style={{ color: palette.textMuted, fontSize: 12, fontWeight: "700" }}>
        Farbe
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {SHIFT_COLORS.map((color) => (
          <Pressable
            key={color}
            accessibilityLabel={`Farbe ${color}`}
            accessibilityRole="button"
            accessibilityState={{ selected: value === color }}
            onPress={() => onChange(color)}
            style={{
              width: 34,
              height: 34,
              borderWidth: value === color ? 3 : 1,
              borderColor: value === color ? palette.text : palette.border,
              borderRadius: 17,
              backgroundColor: color,
            }}
          />
        ))}
      </View>
    </View>
  );
}
