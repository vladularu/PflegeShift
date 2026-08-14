import Ionicons from "@expo/vector-icons/Ionicons";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { Children, useId, useRef, useState, type PropsWithChildren, type Ref } from "react";
import {
  ActionSheetIOS,
  findNodeHandle,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type StyleProp,
  type PressableStateCallbackType,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SHIFT_COLOR_PAIRS, usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { CONTROL_HEIGHT, RADII, SPACING } from "@/theme/tokens";
import { scheduleAccessibilityFocus } from "@/ui/accessibility-focus";
import { AnimatedPressable, usePressMotion } from "@/ui/press-motion";

export { SegmentedButton } from "@/ui/segmented-button";

export interface DropdownOption<T extends string | number> {
  readonly value: T;
  readonly label: string;
}

export function ResponsiveFieldRow({
  children,
  style,
}: PropsWithChildren<{ readonly style?: StyleProp<ViewStyle> }>) {
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= 1.6;

  return (
    <View style={[{ flexDirection: stacked ? "column" : "row", gap: SPACING.md }, style]}>
      {Children.map(children, (child) => (
        <View style={{ flex: stacked ? undefined : 1 }}>{child}</View>
      ))}
    </View>
  );
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
  const triggerRef = useRef<View>(null);
  const dialogHeadingRef = useRef<View>(null);
  const selected = options.find((option) => option.value === value);

  function closeSelection() {
    setOpen(false);
    scheduleAccessibilityFocus(findNodeHandle(triggerRef.current));
  }

  function openSelection() {
    if (Platform.OS === "ios") {
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
    <View style={{ gap: SPACING.xs }}>
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        selectable
        style={{ color: palette.textMuted, ...TYPOGRAPHY.label }}
      >
        {label}
      </Text>
      <Pressable
        ref={triggerRef}
        accessibilityHint="Öffnet eine Auswahlliste"
        accessibilityLabel={`${label}: ${selected?.label ?? String(value)}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={openSelection}
        style={({ pressed }) => ({
          minHeight: CONTROL_HEIGHT.regular,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderWidth: 1,
          borderColor: palette.border,
          borderRadius: RADII.control,
          borderCurve: "continuous",
          backgroundColor: palette.surfaceRaised,
          opacity: pressed ? 0.72 : 1,
          paddingHorizontal: SPACING.md,
        })}
      >
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{ flex: 1, color: palette.text, ...TYPOGRAPHY.bodyStrong }}
        >
          {selected?.label ?? String(value)}
        </Text>
        <Ionicons
          accessibilityElementsHidden
          color={palette.textMuted}
          name="chevron-down"
          size={18}
        />
      </Pressable>
      <Modal
        animationType="fade"
        onRequestClose={closeSelection}
        onShow={() => scheduleAccessibilityFocus(findNodeHandle(dialogHeadingRef.current))}
        presentationStyle="overFullScreen"
        statusBarTranslucent
        transparent
        visible={open}
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable
            accessible={false}
            accessibilityElementsHidden
            aria-hidden
            importantForAccessibility="no-hide-descendants"
            onPress={closeSelection}
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              backgroundColor: palette.overlay,
            }}
          />
          <View
            accessibilityViewIsModal
            testID="dropdown-modal-content"
            style={{
              maxHeight: Math.min(height * 0.72, 560),
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              borderCurve: "continuous",
              backgroundColor: palette.surfaceRaised,
              boxShadow: `0 -12px 32px ${palette.shadow}`,
              paddingBottom: Math.max(insets.bottom, SPACING.md),
            }}
          >
            <View
              ref={dialogHeadingRef}
              accessible
              accessibilityLabel={`${label}, Auswahldialog`}
              accessibilityRole="header"
              style={{
                minHeight: 58,
                justifyContent: "center",
                borderBottomWidth: 1,
                borderBottomColor: palette.separator,
                paddingHorizontal: SPACING.lg,
              }}
            >
              <Text
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                style={{ color: palette.text, ...TYPOGRAPHY.sectionTitle }}
              >
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
                      closeSelection();
                    }}
                    style={({ pressed }) => ({
                      minHeight: CONTROL_HEIGHT.large,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderTopColor: palette.separator,
                      backgroundColor: isSelected
                        ? palette.primarySoft
                        : pressed
                          ? palette.surfaceMuted
                          : "transparent",
                      paddingHorizontal: SPACING.lg,
                    })}
                  >
                    <Text
                      maxFontSizeMultiplier={TEXT_MAX_SCALE}
                      style={{
                        flex: 1,
                        color: isSelected ? palette.primary : palette.text,
                        ...(isSelected ? TYPOGRAPHY.bodyStrong : TYPOGRAPHY.body),
                      }}
                    >
                      {option.label}
                    </Text>
                    {isSelected ? (
                      <Ionicons
                        accessibilityElementsHidden
                        color={palette.primary}
                        name="checkmark"
                        size={20}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable
              accessibilityLabel="Auswahl abbrechen"
              accessibilityRole="button"
              onPress={closeSelection}
              style={({ pressed }) => ({
                minHeight: CONTROL_HEIGHT.large,
                alignItems: "center",
                justifyContent: "center",
                borderTopWidth: 1,
                borderTopColor: palette.separator,
                opacity: pressed ? 0.65 : 1,
              })}
            >
              <Text
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                style={{ color: palette.primary, ...TYPOGRAPHY.button }}
              >
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
    return (
      <Field
        autoCapitalize="none"
        label={label}
        maxLength={5}
        onChangeText={onChange}
        value={value}
      />
    );
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
          minHeight: CONTROL_HEIGHT.large,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: SPACING.sm,
          borderRadius: RADII.control,
          backgroundColor: pressed ? palette.surfaceMuted : "transparent",
          paddingHorizontal: SPACING.sm,
        })}
      >
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{ color: palette.textSecondary, ...TYPOGRAPHY.bodyStrong }}
        >
          {label}
        </Text>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{
            color: palette.primary,
            ...TYPOGRAPHY.bodyStrong,
            fontVariant: ["tabular-nums"],
          }}
        >
          {value}
        </Text>
      </Pressable>
    );
  }
  return (
    <View
      style={{
        minHeight: CONTROL_HEIGHT.large,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: SPACING.sm,
      }}
    >
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        style={{ color: palette.textSecondary, ...TYPOGRAPHY.bodyStrong }}
      >
        {label}
      </Text>
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
  error,
  inputRef,
  label,
  ...props
}: TextInputProps & {
  readonly error?: string | null;
  readonly inputRef?: Ref<TextInput>;
  readonly label: string;
}) {
  const palette = usePalette();
  const errorId = `${useId()}-error`;
  const { accessibilityHint, accessibilityLabel, accessibilityLiveRegion, style, ...inputProps } =
    props;
  return (
    <View style={{ gap: SPACING.xs }}>
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        selectable
        style={{ color: palette.textMuted, ...TYPOGRAPHY.label }}
      >
        {label}
      </Text>
      <TextInput
        ref={inputRef}
        accessibilityHint={error ? `Fehler: ${error}` : accessibilityHint}
        accessibilityLabel={accessibilityLabel ?? `${label}${error ? ", ungültig" : ""}`}
        accessibilityLiveRegion={error ? "polite" : accessibilityLiveRegion}
        aria-invalid={Boolean(error)}
        enablesReturnKeyAutomatically
        {...inputProps}
        placeholderTextColor={palette.textMuted}
        style={[
          {
            minHeight: inputProps.multiline ? 96 : CONTROL_HEIGHT.regular,
            borderWidth: 1,
            borderColor: error ? palette.danger : palette.border,
            borderRadius: RADII.control,
            borderCurve: "continuous",
            backgroundColor: palette.surfaceRaised,
            color: palette.text,
            paddingHorizontal: SPACING.md,
            paddingVertical: 10,
            ...TYPOGRAPHY.body,
          },
          style,
        ]}
      />
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          nativeID={errorId}
          selectable
          style={{ color: palette.danger, ...TYPOGRAPHY.footnote }}
        >
          {error}
        </Text>
      ) : null}
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
  const pressMotion = usePressMotion();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPressIn={pressMotion.onPressIn}
      onPressOut={pressMotion.onPressOut}
      onPress={onPress}
      style={({ pressed }: PressableStateCallbackType) => [
        {
          minHeight: CONTROL_HEIGHT.large,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: RADII.control,
          borderCurve: "continuous",
          backgroundColor: danger ? palette.danger : palette.primary,
          opacity: disabled ? 0.45 : pressed ? 0.82 : 1,
          paddingHorizontal: SPACING.lg,
        },
        pressMotion.animatedStyle,
      ]}
    >
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        style={{ color: danger ? palette.onDanger : palette.onPrimary, ...TYPOGRAPHY.button }}
      >
        {children}
      </Text>
    </AnimatedPressable>
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
    <View style={{ gap: SPACING.sm }}>
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        selectable
        style={{ color: palette.textMuted, ...TYPOGRAPHY.label }}
      >
        Farbe
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm }}>
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
              borderWidth: value === main ? 2 : 1,
              borderColor: value === main ? palette.primary : palette.border,
              borderRadius: RADII.control,
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
