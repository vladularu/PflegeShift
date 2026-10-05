import Ionicons from "@expo/vector-icons/Ionicons";
import { Fragment, useRef, useState } from "react";
import {
  ActionSheetIOS,
  findNodeHandle,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { CONTROL_HEIGHT, RADII, SPACING } from "@/theme/tokens";
import { scheduleAccessibilityFocus } from "@/ui/accessibility-focus";

export interface DropdownOption<T extends string | number> {
  readonly value: T;
  readonly label: string;
  readonly group?: string;
  readonly subtitle?: string;
  readonly selectionLabel?: string;
}

export function DropdownField<T extends string | number>({
  label,
  value,
  options,
  onChange,
  modalTitle,
}: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly DropdownOption<T>[];
  readonly onChange: (value: T) => void;
  readonly modalTitle?: string;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<View>(null);
  const dialogHeadingRef = useRef<View>(null);
  const selected = options.find((option) => option.value === value);
  const selectedLabel = selected?.selectionLabel ?? selected?.label ?? String(value);
  const hasGroups = options.some((option) => option.group !== undefined);
  const visibleOptions = hasGroups
    ? options.filter((option) => option.group !== undefined)
    : options;
  const dialogTitle = modalTitle ?? label;

  function closeSelection() {
    setOpen(false);
    scheduleAccessibilityFocus(findNodeHandle(triggerRef.current));
  }

  function openSelection() {
    if (Platform.OS === "ios" && !hasGroups) {
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
    if (hasGroups) Keyboard.dismiss();
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
        accessibilityLabel={`${label}: ${selectedLabel}`}
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
          {selectedLabel}
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
              maxHeight: hasGroups ? Math.min(height * 0.85, 740) : Math.min(height * 0.72, 560),
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
              accessibilityLabel={`${dialogTitle}, Auswahldialog`}
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
                {dialogTitle}
              </Text>
            </View>
            <ScrollView
              nestedScrollEnabled
              showsVerticalScrollIndicator
              style={hasGroups ? { flexShrink: 1 } : undefined}
            >
              {visibleOptions.map((option, index) => {
                const isSelected = option.value === value;
                const startsGroup =
                  option.group !== undefined && option.group !== visibleOptions[index - 1]?.group;
                return (
                  <Fragment key={String(option.value)}>
                    {startsGroup ? (
                      <Text
                        accessibilityRole="header"
                        maxFontSizeMultiplier={TEXT_MAX_SCALE}
                        style={{
                          color: palette.textMuted,
                          backgroundColor: palette.surfaceMuted,
                          paddingHorizontal: SPACING.lg,
                          paddingTop: SPACING.md,
                          paddingBottom: SPACING.sm,
                          ...TYPOGRAPHY.label,
                        }}
                      >
                        {option.group}
                      </Text>
                    ) : null}
                    <Pressable
                      accessibilityLabel={
                        option.selectionLabel ??
                        (option.subtitle ? `${option.label} · ${option.subtitle}` : option.label)
                      }
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => {
                        onChange(option.value);
                        closeSelection();
                      }}
                      style={({ pressed }) => ({
                        minHeight: hasGroups ? CONTROL_HEIGHT.regular : CONTROL_HEIGHT.large,
                        paddingVertical: hasGroups ? SPACING.sm : 0,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        borderTopWidth: index === 0 || startsGroup ? 0 : 1,
                        borderTopColor: palette.separator,
                        backgroundColor: isSelected
                          ? palette.primarySoft
                          : pressed
                            ? palette.surfaceMuted
                            : "transparent",
                        paddingHorizontal: SPACING.lg,
                      })}
                    >
                      <View
                        style={{
                          flex: 1,
                          gap: SPACING.xs,
                          paddingRight: hasGroups ? SPACING.md : 0,
                        }}
                      >
                        <Text
                          maxFontSizeMultiplier={TEXT_MAX_SCALE}
                          style={{
                            color: isSelected ? palette.primary : palette.text,
                            ...(isSelected ? TYPOGRAPHY.bodyStrong : TYPOGRAPHY.body),
                          }}
                        >
                          {option.label}
                        </Text>
                        {option.subtitle ? (
                          <Text
                            maxFontSizeMultiplier={TEXT_MAX_SCALE}
                            style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
                          >
                            {option.subtitle}
                          </Text>
                        ) : null}
                      </View>
                      {isSelected ? (
                        <Ionicons
                          accessibilityElementsHidden
                          color={palette.primary}
                          name="checkmark"
                          size={20}
                        />
                      ) : null}
                    </Pressable>
                  </Fragment>
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
