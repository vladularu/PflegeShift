import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { useState, type PropsWithChildren } from "react";
import {
  ActionSheetIOS,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type TextInputProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SHIFT_COLOR_PAIRS, usePalette } from "@/theme/palette";

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
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  function openSelection() {
    if (process.env.EXPO_OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          cancelButtonIndex: options.length,
          options: [...options.map((option) => option.label), "Abbrechen"],
          title: label,
          userInterfaceStyle: palette.dark ? "dark" : "light",
        },
        (index) => {
          const option = options[index];
          if (option) onChange(option.value);
        },
      );
      return;
    }
    setOpen(true);
  }

  return (
    <View style={{ gap: 7 }}>
      <Text selectable style={{ color: palette.textMuted, fontSize: 12, fontWeight: "700" }}>
        {label}
      </Text>
      <Pressable
        accessibilityHint="Öffnet eine Auswahlliste"
        accessibilityLabel={`${label}: ${selected?.label ?? String(value)}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={openSelection}
        style={({ pressed }) => ({
          minHeight: 50,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderWidth: 1,
          borderColor: palette.border,
          borderRadius: 13,
          borderCurve: "continuous",
          backgroundColor: palette.surfaceRaised,
          opacity: pressed ? 0.72 : 1,
          paddingHorizontal: 14,
        })}
      >
        <Text maxFontSizeMultiplier={1.4} numberOfLines={1} style={{ flex: 1, color: palette.text, fontSize: 15, fontWeight: "700" }}>
          {selected?.label ?? String(value)}
        </Text>
        <Text accessibilityElementsHidden style={{ color: palette.primary, fontSize: 21, fontWeight: "700" }}>
          ›
        </Text>
      </Pressable>
      <Modal
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        presentationStyle="overFullScreen"
        statusBarTranslucent
        transparent
        visible={open}
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable
            accessibilityLabel="Auswahl schließen"
            accessibilityRole="button"
            onPress={() => setOpen(false)}
            style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: palette.overlay }}
          />
          <View
            accessibilityViewIsModal
            style={{
              maxHeight: Math.min(height * 0.72, 560),
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderCurve: "continuous",
              backgroundColor: palette.surfaceRaised,
              boxShadow: `0 -10px 30px ${palette.shadow}`,
              paddingBottom: Math.max(insets.bottom, 12),
            }}
          >
            <View style={{ minHeight: 58, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: palette.separator, paddingHorizontal: 18 }}>
              <Text maxFontSizeMultiplier={1.4} style={{ color: palette.text, fontSize: 17, fontWeight: "900" }}>
                {label}
              </Text>
            </View>
            <ScrollView nestedScrollEnabled showsVerticalScrollIndicator>
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
                      minHeight: 52,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderTopColor: palette.separator,
                      backgroundColor: isSelected ? palette.primarySoft : pressed ? palette.surfaceMuted : "transparent",
                      paddingHorizontal: 18,
                    })}
                  >
                    <Text maxFontSizeMultiplier={1.4} style={{ flex: 1, color: isSelected ? palette.primary : palette.text, fontSize: 15, fontWeight: isSelected ? "800" : "600" }}>
                      {option.label}
                    </Text>
                    {isSelected ? <Text accessibilityElementsHidden style={{ color: palette.primary, fontSize: 18, fontWeight: "900" }}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              onPress={() => setOpen(false)}
              style={({ pressed }) => ({
                minHeight: 52,
                alignItems: "center",
                justifyContent: "center",
                borderTopWidth: 1,
                borderTopColor: palette.separator,
                opacity: pressed ? 0.65 : 1,
              })}
            >
              <Text maxFontSizeMultiplier={1.4} style={{ color: palette.primary, fontSize: 15, fontWeight: "800" }}>
                Abbrechen
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
        <Text maxFontSizeMultiplier={1.4} style={{ color: palette.textSecondary, fontSize: 14, fontWeight: "700" }}>
          {label}
        </Text>
        <Text
          maxFontSizeMultiplier={1.4}
          style={{ color: palette.primary, fontSize: 16, fontWeight: "800", fontVariant: ["tabular-nums"] }}
        >
          {value}
        </Text>
      </Pressable>
    );
  }
  return (
    <View style={{ minHeight: 52, flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <Text maxFontSizeMultiplier={1.4} style={{ color: palette.textSecondary, fontSize: 14, fontWeight: "700" }}>{label}</Text>
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
        accessibilityLabel={props.accessibilityLabel ?? label}
        enablesReturnKeyAutomatically
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
      <Text maxFontSizeMultiplier={1.35} style={{ color: palette.dark && !danger ? "#10221D" : "#FFFFFF", fontSize: 16, fontWeight: "800" }}>
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
      <Text maxFontSizeMultiplier={1.35} style={{ color: selected ? (palette.dark ? "#10221D" : "#FFFFFF") : palette.text, fontWeight: "800" }}>
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
        {SHIFT_COLOR_PAIRS.map(({ main, soft }) => (
          <Pressable
            key={main}
            accessibilityLabel={`Farbpaar ${main}`}
            accessibilityRole="button"
            accessibilityState={{ selected: value === main }}
            onPress={() => onChange(main)}
            style={{
              width: 58,
              height: 44,
              flexDirection: "row",
              overflow: "hidden",
              borderWidth: value === main ? 3 : 1,
              borderColor: value === main ? palette.text : palette.border,
              borderRadius: 14,
            }}
          >
            <View style={{ flex: 1, backgroundColor: main }} />
            <View style={{ flex: 1, backgroundColor: soft }} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}
