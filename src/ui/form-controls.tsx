import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { useState, type PropsWithChildren } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";

import { SHIFT_COLORS, usePalette } from "@/theme/palette";

export interface DropdownOption<T extends string | number> {
  readonly value: T;
  readonly label: string;
}

export function DropdownField<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly DropdownOption<T>[];
  readonly onChange: (value: T) => void;
}) {
  const palette = usePalette();
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <View style={{ gap: 7 }}>
      <Text style={{ color: palette.textMuted, fontSize: 12, fontWeight: "700" }}>
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        style={({ pressed }) => ({
          minHeight: 50,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderWidth: 1,
          borderColor: open ? palette.primary : palette.border,
          borderRadius: 13,
          borderCurve: "continuous",
          backgroundColor: palette.surfaceRaised,
          opacity: pressed ? 0.72 : 1,
          paddingHorizontal: 14,
        })}
      >
        <Text style={{ flex: 1, color: palette.text, fontSize: 15, fontWeight: "700" }}>
          {selected?.label ?? String(value)}
        </Text>
        <Text style={{ color: palette.primary, fontSize: 17, fontWeight: "900" }}>
          {open ? "⌃" : "⌄"}
        </Text>
      </Pressable>
      {open ? (
        <ScrollView
          nestedScrollEnabled
          style={{
            maxHeight: 244,
            borderWidth: 1,
            borderColor: palette.border,
            borderRadius: 13,
            backgroundColor: palette.surfaceRaised,
          }}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <Pressable
                key={String(option.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                style={({ pressed }) => ({
                  minHeight: 48,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: palette.separator,
                  backgroundColor: isSelected ? palette.primarySoft : "transparent",
                  opacity: pressed ? 0.68 : 1,
                  paddingHorizontal: 14,
                })}
              >
                <Text style={{ color: isSelected ? palette.primary : palette.text, fontSize: 14, fontWeight: isSelected ? "800" : "600" }}>
                  {option.label}
                </Text>
                {isSelected ? <Text style={{ color: palette.primary, fontWeight: "900" }}>✓</Text> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

function asTimeDate(value: string): Date {
  const [hour, minute] = value.split(":").map(Number);
  return new Date(2000, 0, 1, hour, minute, 0, 0);
}

function asTimeString(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function TimePickerField({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const palette = usePalette();
  if (process.env.EXPO_OS === "web") {
    return <Field autoCapitalize="none" label={label} maxLength={5} onChangeText={onChange} value={value} />;
  }
  if (process.env.EXPO_OS === "android") {
    return (
      <Pressable
        accessibilityLabel={`${label}, ${value}. Uhrzeit wählen`}
        accessibilityRole="button"
        onPress={() => {
          DateTimePickerAndroid.open({
            display: "default",
            is24Hour: true,
            mode: "time",
            value: asTimeDate(value),
            onChange: (event, date) => {
              if (event.type === "set" && date) onChange(asTimeString(date));
            },
          });
        }}
        style={({ pressed }) => ({
          minHeight: 52,
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          borderRadius: 12,
          backgroundColor: pressed ? palette.surfaceMuted : "transparent",
          paddingHorizontal: 10,
        })}
      >
        <Text style={{ color: palette.textSecondary, fontSize: 14, fontWeight: "700" }}>
          {label}
        </Text>
        <Text
          style={{
            color: palette.primary,
            fontSize: 16,
            fontWeight: "800",
            fontVariant: ["tabular-nums"],
          }}
        >
          {value}
        </Text>
      </Pressable>
    );
  }
  return (
    <View style={{ minHeight: 52, flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <Text style={{ color: palette.textSecondary, fontSize: 14, fontWeight: "700" }}>{label}</Text>
      <DateTimePicker
        accessibilityLabel={`${label} wählen`}
        display="compact"
        mode="time"
        onChange={(_, date) => {
          if (date) onChange(asTimeString(date));
        }}
        value={asTimeDate(value)}
      />
    </View>
  );
}

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
            minHeight: props.multiline ? 96 : 50,
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
        minHeight: 52,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 14,
        borderCurve: "continuous",
        backgroundColor: danger ? palette.danger : palette.primary,
        opacity: disabled ? 0.45 : pressed ? 0.78 : 1,
        paddingHorizontal: 18,
      })}
    >
      <Text style={{ color: palette.dark && !danger ? "#10221D" : "#FFFFFF", fontSize: 16, fontWeight: "800" }}>
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
        minHeight: 44,
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
              width: 38,
              height: 38,
              borderWidth: value === color ? 3 : 1,
              borderColor: value === color ? palette.text : palette.border,
              borderRadius: 19,
              backgroundColor: color,
            }}
          />
        ))}
      </View>
    </View>
  );
}
