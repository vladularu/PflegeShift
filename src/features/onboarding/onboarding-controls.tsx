import { ONBOARDING_TYPOGRAPHY, useOnboardingPalette } from "@/theme/onboarding";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { RADII, SPACING, CONTROL_HEIGHT } from "@/theme/tokens";
import { TYPOGRAPHY } from "@/theme/typography";
import { useState, type RefObject } from "react";
import {
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type BlueprintIconName =
  | "heart-pulse"
  | "ambulance"
  | "account-group-outline"
  | "briefcase-outline"
  | "cash-multiple"
  | "database"
  | "file-document-outline"
  | "clock-outline"
  | "map-marker-outline"
  | "shield-outline";
export function BlueprintIcon({
  name,
  size = 24,
}: {
  readonly name: BlueprintIconName;
  readonly size?: number;
}) {
  const p = useOnboardingPalette();
  return (
    <MaterialCommunityIcons
      name={name}
      size={size}
      color={p.text}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

export function FieldError({ message }: { readonly message?: string }) {
  const p = useOnboardingPalette();
  return message ? (
    <Text accessibilityRole="alert" style={[s.error, { color: p.error }]}>
      {message}
    </Text>
  ) : null;
}
export function Choice({
  title,
  selected,
  onPress,
  icon,
}: {
  readonly title: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly icon?: BlueprintIconName;
}) {
  const p = useOnboardingPalette();
  return (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        s.choice,
        {
          backgroundColor: selected ? p.rose : p.surface,
          borderColor: selected ? p.selectionBorder : p.control,
          borderWidth: 1,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      {icon ? <BlueprintIcon name={icon} /> : null}
      <Text style={[s.body, { flex: 1, color: p.text }]}>{title}</Text>
      <View
        accessibilityElementsHidden
        style={[
          s.radio,
          {
            borderColor: selected ? p.selectionBorder : p.control,
            backgroundColor: selected ? p.accent : "transparent",
          },
        ]}
      >
        {selected ? <View style={[s.dot, { backgroundColor: p.onAccent }]} /> : null}
      </View>
    </Pressable>
  );
}
export function SelectField<T extends string | number>({
  label,
  value,
  options,
  onChange,
  error,
  icon,
  compact = false,
}: {
  readonly label: string;
  readonly value: T | null;
  readonly options: readonly {
    readonly value: T;
    readonly label: string;
    readonly icon?: BlueprintIconName;
  }[];
  readonly onChange: (value: T) => void;
  readonly error?: string;
  readonly icon?: BlueprintIconName;
  readonly compact?: boolean;
}) {
  const p = useOnboardingPalette();
  const [open, setOpen] = useState(false);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const maxHeight = Math.max(0, height - insets.top - insets.bottom) * 0.7;
  const selectedLabel = options.find((option) => option.value === value)?.label;
  return (
    <View style={s.field}>
      {!compact ? <Text style={[s.label, { color: p.text }]}>{label}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selectedLabel ?? "Bitte auswählen"}`}
        accessibilityHint={error ?? "Auswahl öffnen"}
        accessibilityState={{ expanded: open }}
        aria-invalid={Boolean(error)}
        onPress={() => {
          Keyboard.dismiss();
          setOpen(true);
        }}
        style={[
          s.select,
          { backgroundColor: p.surface, borderColor: error ? p.error : p.control },
          compact && s.compactSelect,
        ]}
      >
        {icon ? <BlueprintIcon name={icon} /> : null}
        {compact ? <Text style={[s.label, { flex: 1, color: p.muted }]}>{label}</Text> : null}
        <Text
          style={[
            s.body,
            { flex: compact ? undefined : 1, color: selectedLabel ? p.text : p.muted },
          ]}
        >
          {selectedLabel ?? "Bitte auswählen"}
        </Text>
        <Text accessibilityElementsHidden style={{ color: p.muted }}>
          ⌄
        </Text>
      </Pressable>
      <FieldError message={error} />
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View
          style={[
            s.modal,
            { paddingTop: insets.top + SPACING.xl, paddingBottom: insets.bottom + SPACING.xl },
          ]}
        >
          <Pressable
            testID="onboarding-select-backdrop"
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            onPress={() => setOpen(false)}
            style={[StyleSheet.absoluteFill, { backgroundColor: p.overlay }]}
          />
          <View
            accessibilityViewIsModal
            onAccessibilityEscape={() => setOpen(false)}
            style={[s.modalCard, { backgroundColor: p.canvas, maxHeight }]}
          >
            <View style={s.modalHeader}>
              <Text accessibilityRole="header" style={[s.modalTitle, { color: p.text }]}>
                {label}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${label} schließen`}
                onPress={() => setOpen(false)}
                style={s.close}
              >
                <Text style={[s.label, { color: p.accentText }]}>Schließen</Text>
              </Pressable>
            </View>
            <ScrollView
              style={s.optionScroll}
              contentContainerStyle={s.options}
              keyboardShouldPersistTaps="handled"
            >
              {options.map((option) => (
                <Choice
                  key={option.value}
                  title={option.label}
                  icon={option.icon}
                  selected={option.value === value}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                />
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
export function NumberField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  inputRef,
  testID,
  large = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  readonly placeholder: string;
  readonly error?: string;
  readonly inputRef: RefObject<TextInput | null>;
  readonly testID: string;
  readonly large?: boolean;
}) {
  const p = useOnboardingPalette();
  return (
    <View style={s.field}>
      {!large ? <Text style={[s.label, { color: p.text }]}>{label}</Text> : null}
      <View
        style={
          large
            ? [
                s.numericCard,
                { backgroundColor: p.surface, borderColor: error ? p.error : p.control },
              ]
            : undefined
        }
      >
        <TextInput
          ref={inputRef}
          accessibilityLabel={label}
          accessibilityHint={error}
          aria-invalid={Boolean(error)}
          keyboardType="decimal-pad"
          returnKeyType="done"
          placeholder={placeholder}
          placeholderTextColor={p.muted}
          value={value}
          onChangeText={onChangeText}
          testID={testID}
          style={[
            s.input,
            large && s.largeInput,
            { color: p.text, backgroundColor: p.surface, borderColor: error ? p.error : p.control },
          ]}
        />
        {large ? (
          <Text style={[s.numericSubtitle, { color: p.muted }]}>Stunden pro Woche</Text>
        ) : null}
      </View>
      <FieldError message={error} />
    </View>
  );
}
const s = StyleSheet.create({
  body: ONBOARDING_TYPOGRAPHY.body,
  label: ONBOARDING_TYPOGRAPHY.label,
  field: { gap: SPACING.sm },
  error: ONBOARDING_TYPOGRAPHY.caption,
  choice: {
    minHeight: 64,
    padding: SPACING.lg,
    borderRadius: RADII.control,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: RADII.small,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: { width: 10, height: 10, borderRadius: RADII.pill },
  select: {
    minHeight: CONTROL_HEIGHT.large,
    padding: SPACING.md,
    borderWidth: 1,
    borderRadius: RADII.control,
    flexDirection: "row",
    gap: SPACING.md,
    alignItems: "center",
  },
  compactSelect: { minHeight: CONTROL_HEIGHT.compact, padding: 0, borderWidth: 0 },
  numericCard: {
    borderWidth: 1,
    borderRadius: RADII.control,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
  },
  numericSubtitle: {
    ...ONBOARDING_TYPOGRAPHY.caption,
    textAlign: "center",
    paddingBottom: SPACING.sm,
  },
  input: {
    minHeight: CONTROL_HEIGHT.large,
    padding: SPACING.md,
    borderWidth: 1,
    borderRadius: RADII.control,
    ...ONBOARDING_TYPOGRAPHY.body,
  },
  largeInput: {
    ...ONBOARDING_TYPOGRAPHY.numericInput,
    minHeight: 64,
    padding: 0,
    borderWidth: 0,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  modal: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: SPACING.xl },
  modalCard: { width: "100%", maxWidth: 420, borderRadius: RADII.card, overflow: "hidden" },
  optionScroll: { flexGrow: 0, flexShrink: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", padding: SPACING.xl, gap: SPACING.md },
  modalTitle: { ...TYPOGRAPHY.screenTitle, flex: 1 },
  close: {
    minHeight: CONTROL_HEIGHT.compact,
    minWidth: CONTROL_HEIGHT.compact,
    justifyContent: "center",
  },
  options: { padding: SPACING.xl, gap: SPACING.md },
});
